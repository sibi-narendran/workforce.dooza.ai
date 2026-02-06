# Agent Development Guide

How to create, modify, and deploy AI Employees on the Workforce Platform.

---

## Architecture Overview

An AI Employee has **three layers** that must stay in sync:

```
1. Template Definition    → platform/src/employees/templates.ts
2. Template Files         → platform/src/employees/agents/{slug}/
3. Gateway Plugin Config  → ~/.openclaw/openclaw.json (global)
```

The **platform** manages layers 1 and 2. The **gateway** (clawdbot) reads layer 3 at startup to decide which plugins to load. Per-tenant configs (`~/data/tenants/{id}/clawdbot.json`) handle per-agent tool access at runtime.

### How it flows

```
templates.ts              → Defines agent metadata, skills, requiredTools
agents/{slug}/            → Template files copied to tenant on install
~/.openclaw/openclaw.json → Global gateway config (plugins loaded at startup)
~/data/tenants/{id}/      → Per-tenant runtime config (agent tools, plugin entries)
```

### Communication chain

```
Frontend (React)
  ↓ HTTP POST (send message)
  ↓ SSE (receive streaming response)
Platform API (Hono)
  ↓ WebSocket (persistent per-tenant, X-Tenant-ID header)
Gateway (Clawdbot)
  ↓ LLM API call (OpenRouter/OpenAI)
  ↓ Tool execution (sandbox)
  ↑ WebSocket events back to Platform API
Platform API
  ↑ SSE delivery to Frontend
```

The platform connects to the gateway via WebSocket with the `X-Tenant-ID` header. The gateway resolves the agent from the `X-OpenClaw-Agent-ID` header (not `X-Agent-ID`).

---

## Three-Layer Tool Policy System

**This is the most critical concept for agent development.** When a request reaches the gateway, the LLM's available tools are filtered through three independent, cascading policy layers. A tool must pass ALL three layers to be available.

```
Layer 1: Agent Policy (pi-tools)     → tools.alsoAllow / tools.allow
Layer 2: Global Policy               → tools.deny
Layer 3: Sandbox Policy              → sandbox.tools.allow (DEFAULT_TOOL_ALLOW)
```

### Layer 1: Agent Policy (`pi-tools.policy.ts`)

Controls which tools an agent is allowed to use. Set via `agents.list[].tools` in tenant config.

- `tools.alsoAllow: ["generate_image"]` — Additive. Merges with the default set. Internally creates `["*", "generate_image"]` via `unionAllow()`.
- `tools.allow: ["read", "write"]` — Restrictive. Only these tools allowed. Do NOT use `["*"]` — it gets flagged as "unknown" and stripped.
- If neither is set, agent gets the default tool profile (coding profile).

**Source files:** `clawdbot/src/agents/pi-tools.policy.ts` (resolveEffectiveToolPolicy, pickToolPolicy, unionAllow, filterToolsByPolicy)

### Layer 2: Global Policy (`tools.deny`)

Top-level deny list in tenant config. Tools listed here are blocked for ALL agents.

```json
"tools": {
  "deny": ["exec", "process"]
}
```

This runs AFTER the agent policy. Even if an agent's `alsoAllow` includes `exec`, the global deny removes it.

### Layer 3: Sandbox Policy (`sandbox/tool-policy.ts`)

**This is the layer that catches most people off guard.**

When sandbox mode is enabled (`sandbox.mode = "paths-only"`), the gateway applies a SEPARATE tool allowlist. The default is `DEFAULT_TOOL_ALLOW` in `clawdbot/src/agents/sandbox/constants.ts`:

```
exec, process, read, write, edit, apply_patch, image,
sessions_list, sessions_history, sessions_send, sessions_spawn, session_status
```

**Plugin tools like `generate_image` are NOT in this list.** If you only set `tools.alsoAllow` without also setting `tools.sandbox.tools.allow`, the sandbox layer strips the plugin tool even though the agent policy allows it.

The sandbox policy resolution (`resolveSandboxToolPolicyForAgent`) checks in order:
1. Per-agent: `agents.list[].tools.sandbox.tools.allow` — if set, replaces defaults entirely
2. Global: `tools.sandbox.tools.allow` — if set, replaces defaults entirely
3. Fallback: `DEFAULT_TOOL_ALLOW` (the 12 core tools above)

There is no additive mechanism (no `sandbox.tools.alsoAllow`). You must provide the FULL list.

### How `buildAgentToolsConfig()` solves this

The platform helper `buildAgentToolsConfig()` in `templates.ts` automatically builds the correct config for both layers:

```typescript
// For a template with requiredTools.alsoAllow: ["generate_image"], it produces:
{
  alsoAllow: ["generate_image"],          // Layer 1: agent policy
  sandbox: {
    tools: {
      allow: [                             // Layer 3: sandbox policy
        "exec", "process", "read", "write", "edit", "apply_patch",
        "image", "sessions_list", "sessions_history", "sessions_send",
        "sessions_spawn", "session_status",
        "generate_image"                   // <-- added from alsoAllow
      ]
    }
  }
}
```

This is used by both the installer (`installAgentForTenant`) and the sync system (`syncAgentConfigForAllTenants`). The constant `SANDBOX_DEFAULT_TOOL_ALLOW` in `templates.ts` must stay in sync with `clawdbot/src/agents/sandbox/constants.ts`.

### Plugin tool `optional` flag

Plugin tools can be registered with `optional: true` (e.g., `generate_image`). Optional tools require explicit inclusion in the agent's allowlist via `isOptionalToolAllowed()` in `clawdbot/src/plugins/tools.ts`. The check looks for the tool name, plugin ID, or `"group:plugins"` in the collected allowlist.

### Visual: how a tool gets through all three layers

```
generate_image registered by image-gen plugin (optional: true)
  ↓
Layer 1 (Agent Policy): alsoAllow includes "generate_image" → PASS
  ↓
Layer 2 (Global Policy): tools.deny is ["exec", "process"] → PASS (not denied)
  ↓
Layer 3 (Sandbox Policy): sandbox.tools.allow includes "generate_image" → PASS
  ↓
Tool available to LLM
```

If ANY layer rejects, the tool is stripped silently (no error, just missing from the tool list).

---

## Skills vs Plugin Tools

Agents can use capabilities via two mechanisms. Choose the right one.

### Skills (markdown-based)

Skills are markdown files in `agents/{slug}/skills/{skill-name}/SKILL.md`. They are injected into the LLM prompt as documentation. To execute, the LLM must call a tool (usually `exec`) to run a shell command.

```
agents/somi/skills/generate-image/SKILL.md
```

**Pros:** Easy to create (just markdown). No TypeScript needed.
**Cons:** Requires `exec` tool access. If `exec` is denied (common in sandboxed tenants), the skill cannot execute. Shell commands are harder to control and audit.

### Plugin Tools (TypeScript-based)

Plugin tools are executable TypeScript registered via the plugin system. They appear as native tools in the LLM's tool list and execute directly without shell access.

```
clawdbot/extensions/image-gen/index.ts → registers generate_image tool
```

**Pros:** Direct API access. No shell needed. Works in sandboxed environments. Type-safe. Better error handling.
**Cons:** Requires TypeScript code in the clawdbot extensions directory. More setup.

### When to use which

| Scenario | Use |
|----------|-----|
| Agent needs to call an external API | Plugin tool |
| Agent needs to run in sandboxed tenant (exec denied) | Plugin tool |
| Simple file manipulation or formatting | Skill (uses read/write tools) |
| Proof of concept or quick experiment | Skill |
| Production capability that multiple agents share | Plugin tool |

### Skills that reference plugin tools

A skill can reference a plugin tool instead of using `exec`. The skill's SKILL.md becomes documentation that teaches the LLM how to use the native tool. Example (Somi's generate-image skill):

```yaml
---
name: generate-image
metadata: {"openclaw":{"command-dispatch":"tool","command-tool":"generate_image"}}
---
# generate-image
Call the `generate_image` tool directly with a detailed prompt.
No exec or shell commands needed.
```

The `command-dispatch: tool` + `command-tool: generate_image` metadata tells the system this skill dispatches to a native tool rather than exec.

---

## Creating a New Agent

### Step 1: Add template definition

Edit `platform/src/employees/templates.ts`. Add an entry to `EMPLOYEE_TEMPLATES`:

```typescript
{
  type: 'my-agent',          // Slug — used everywhere as ID
  name: 'My Agent',          // Display name
  description: 'What it does',
  skills: ['skill-a', 'skill-b'],
  model: 'anthropic/claude-sonnet-4',
  requiredTools: {            // Optional — only if agent needs extra tools/plugins
    alsoAllow: ['tool_name'], // Tool IDs the agent can call
    plugins: ['plugin-id'],   // Bundled plugin IDs to enable
  },
  soul: `# SOUL.md content...`,
  agents: `# AGENTS.md content...`,
  identity: `# IDENTITY.md content...`,
}
```

**Fields explained:**

| Field | Purpose |
|-------|---------|
| `type` | Unique slug. Used as directory name, agent ID in configs, DB lookups |
| `name` | Human-readable name shown in UI |
| `skills` | Skill IDs the agent advertises (for UI/discovery) |
| `model` | Default LLM model (OpenRouter format) |
| `requiredTools.alsoAllow` | Tool names from plugins that this agent needs access to |
| `requiredTools.plugins` | Plugin IDs that must be enabled for this agent's tools to work |
| `soul` | Inline SOUL.md — agent personality and core identity |
| `agents` | Inline AGENTS.md — operational instructions |
| `identity` | Inline IDENTITY.md — name, emoji, creature type |

**Important:** When you set `requiredTools.alsoAllow`, the `buildAgentToolsConfig()` helper automatically generates both the agent policy (`alsoAllow`) AND the sandbox policy (`sandbox.tools.allow`). You do NOT need to manually configure the sandbox — the installer and sync system handle it.

### Step 2: Create template files directory

```
platform/src/employees/agents/{slug}/
├── AGENTS.md       # Operating instructions (required)
├── SOUL.md         # Personality and identity (required)
├── IDENTITY.md     # Name, emoji, metadata (required)
├── TOOLS.md        # Tool-specific notes (optional)
├── BOOT.md         # Boot sequence (optional)
├── BOOTSTRAP.md    # First-run setup (optional)
├── HEARTBEAT.md    # Periodic check tasks (optional)
├── MEMORY.md       # Long-term memory seed (optional)
├── USER.md         # User-facing instructions (optional)
├── canvas/         # Output directory for generated files (optional)
├── memory/         # Memory directory — preserved across updates (optional)
└── skills/         # Skill definitions (optional)
    └── {skill-name}/
        └── SKILL.md  # Skill definition with metadata frontmatter
```

These files are copied to `~/data/tenants/{tenantId}/agents/{slug}/` when a user installs the agent. On template updates, files are re-copied but `memory/` is preserved via backup/restore.

### Step 3: Register in agent library (database)

The agent must exist in the `agentLibrary` database table for users to discover and install it. Insert via Supabase dashboard or a seed script:

```sql
INSERT INTO agent_library (slug, name, description, emoji, category, default_model, skills, is_public)
VALUES ('my-agent', 'My Agent', 'What it does', '?', 'general', 'anthropic/claude-sonnet-4', '["skill-a"]', true);
```

### Step 4: Enable required plugins in global gateway config

**This is the step most often missed.**

If the agent uses tools from a bundled plugin (e.g., `image-gen`, `voice-call`), the plugin must be enabled in the **global** gateway config. Bundled plugins are disabled by default.

Edit `~/.openclaw/openclaw.json`:

```json
{
  "plugins": {
    "enabled": true,
    "slots": {
      "memory": "memory-core"
    },
    "entries": {
      "image-gen": { "enabled": true },
      "voice-call": { "enabled": true }
    }
  }
}
```

Then restart the gateway: `pm2 restart gateway`

**Why?** The gateway loads plugins once at startup from the global config. Per-tenant configs only control which agents can *use* already-loaded plugins. If a plugin isn't loaded globally, no tenant can use it.

---

## Modifying an Existing Agent

### Changing template files (AGENTS.md, SOUL.md, etc.)

1. Edit files in `platform/src/employees/agents/{slug}/`
2. Restart the platform server — `syncAllAgentTemplates()` runs on startup and re-copies files to all tenants that have the agent installed
3. Tenant memory is preserved (backup/restore pattern)

### Changing requiredTools (alsoAllow, plugins)

1. Edit the template in `platform/src/employees/templates.ts`
2. Restart the platform server — sync updates `clawdbot.json` per-agent tools (including sandbox allow), and plugin entries for all tenants
3. If adding a NEW plugin, also add it to `~/.openclaw/openclaw.json` `plugins.entries` and restart the gateway

### Changing inline content (soul, agents, identity in templates.ts)

These are only used for agents that don't have a filesystem template directory. If the agent has files in `agents/{slug}/`, the files take precedence.

---

## Config Locations Reference

### Global gateway config (`~/.openclaw/openclaw.json`)

Controls what the gateway loads at startup. All tenants share this.

```
plugins.entries     → Which bundled plugins are loaded
plugins.slots       → Memory plugin selection
agents.defaults     → Default model, compaction, etc.
gateway             → Port, auth, HTTP endpoints
```

**When to edit:** Adding/removing a plugin for the entire platform.

### Per-tenant config (`~/data/tenants/{tenantId}/clawdbot.json`)

Controls per-tenant runtime behavior. Auto-managed by sync system.

```
agents.list[].tools.alsoAllow             → Which plugin tools this agent can call (Layer 1)
agents.list[].tools.sandbox.tools.allow   → Sandbox tool allowlist for this agent (Layer 3)
plugins.entries                            → Per-tenant plugin overrides (runtime only, not startup)
tools.deny                                 → Blocked tools for this tenant (Layer 2)
agents.defaults.sandbox.mode               → Sandbox mode (e.g., "paths-only")
env                                        → Tenant-specific API keys
```

**When to edit:** Rarely — auto-managed by `syncAgentConfigForAllTenants()`. Manual edits for debugging only.

### Template definition (`platform/src/employees/templates.ts`)

Source of truth for agent metadata. Changes here propagate to all tenants via sync.

```
requiredTools.alsoAllow  → Propagated to per-tenant agents.list[].tools.alsoAllow
                           AND agents.list[].tools.sandbox.tools.allow (via buildAgentToolsConfig)
requiredTools.plugins    → Propagated to per-tenant plugins.entries
```

**When to edit:** Changing what tools/plugins an agent needs. This is the ONLY place you should change tool requirements.

---

## Plugin System

### How plugins are discovered

The gateway scans four locations in order:

1. **Config paths** — `plugins.load.paths` in config (custom directories)
2. **Workspace extensions** — `{workspaceDir}/.openclaw/extensions/`
3. **Global extensions** — `~/.openclaw/extensions/` or `~/.config/openclaw/extensions/`
4. **Bundled extensions** — `clawdbot/extensions/` (auto-resolved by walking up from dist)

### How plugins are enabled

After discovery, each plugin's enable state is resolved (`config-state.ts:resolveEnableState`):

1. `plugins.enabled === false` → all disabled
2. Plugin ID in `plugins.deny` → disabled
3. `plugins.allow` set and plugin not in it → disabled
4. Plugin is the memory slot (`plugins.slots.memory`) → enabled
5. `plugins.entries[id].enabled === true` → enabled
6. `plugins.entries[id].enabled === false` → disabled
7. Plugin is bundled and in `BUNDLED_ENABLED_BY_DEFAULT` set → enabled
8. Plugin is bundled → **disabled by default**
9. Non-bundled (workspace/global/config) → enabled by default

**Key rule:** Bundled plugins (in `clawdbot/extensions/`) are disabled unless explicitly enabled via `plugins.entries`.

### Available bundled plugins

Located in `clawdbot/extensions/`:

| Plugin ID | Kind | What it provides |
|-----------|------|------------------|
| `memory-core` | memory | File-backed memory search |
| `memory-lancedb` | memory | LanceDB vector memory |
| `image-gen` | tools | `generate_image` tool (OpenRouter Gemini) |
| `api-tools` | tools | Generic API tools from YAML definitions |
| `voice-call` | channel | Voice call channel |
| `composio-direct` | tools | Composio tool integrations |
| `slack` | channel | Slack messaging |
| `telegram` | channel | Telegram messaging |
| `discord` | channel | Discord messaging |
| `whatsapp` | channel | WhatsApp messaging |

### Creating a new plugin

See `clawdbot/extensions/image-gen/` as a reference. A plugin needs:

```
extensions/{plugin-id}/
├── index.ts                  # Plugin code (exports register function or object)
├── openclaw.plugin.json      # Manifest (id, kind, configSchema)
└── package.json              # npm metadata with openclaw.extensions entry
```

---

## YAML API Tools (api-tools plugin)

The `api-tools` plugin lets you add API capabilities to agents without writing TypeScript. Drop a YAML file in the agent's `api-tools/` directory — it becomes a native tool the LLM can call.

### Quick start

1. Create a YAML file in `agents/{slug}/api-tools/my_tool.yaml`
2. Add the tool name to `requiredTools.alsoAllow` in `templates.ts`
3. Add `api-tools` to `requiredTools.plugins` in `templates.ts`
4. Enable `api-tools` in `~/.openclaw/openclaw.json` → `plugins.entries`
5. Restart gateway and platform

### YAML tool definition schema

```yaml
name: publish_linkedin                    # Tool name (must match [a-z][a-z0-9_]*)
description: Publish a text post to LinkedIn

parameters:                               # LLM sees these as typed tool params
  text:
    type: string                          # string, number, integer, boolean
    description: Post content
    required: true
  visibility:
    type: string
    description: Post visibility
    enum: ["PUBLIC", "CONNECTIONS"]       # Optional enum constraint
    default: "PUBLIC"                     # Optional default value

request:
  method: POST                            # GET, POST, PUT, PATCH, DELETE
  url: "https://api.linkedin.com/rest/posts"
  headers:
    Authorization: "Bearer {{env.LINKEDIN_ACCESS_TOKEN}}"
    Content-Type: "application/json"
  body:
    type: json                            # json, form, or text
    content:
      author: "urn:li:person:{{env.LINKEDIN_PERSON_URN}}"
      commentary: "{{params.text}}"
      visibility: "{{params.visibility}}"
  timeout_ms: 15000                       # Max 60000, default 30000

response:
  summary: "Post published. ID: {{response.id}}"
  error_template: "LinkedIn error ({{response.status}}): {{response.message}}"

requires_env:                             # Checked before request
  - LINKEDIN_ACCESS_TOKEN
  - LINKEDIN_PERSON_URN

allowed_hosts:                            # URL must match one of these (required)
  - api.linkedin.com
```

### Template variables

| Pattern | Source | Example |
|---------|--------|---------|
| `{{env.VAR}}` | Environment variable (from tenant's `clawdbot.json` → `env`) | `{{env.LINKEDIN_ACCESS_TOKEN}}` |
| `{{params.KEY}}` | Tool parameter passed by LLM | `{{params.text}}` |
| `{{response.KEY}}` | Response JSON field (for summary/error templates) | `{{response.id}}` |

Variables are interpolated recursively in strings, headers, body content, and response templates.

### Security constraints

- **Private IP blocking**: localhost, 10.x, 172.16-31.x, 192.168.x, 169.254.169.254, .internal, .local
- **allowed_hosts enforcement**: URL hostname must match an entry in `allowed_hosts` (supports wildcard `*.example.com`)
- **No code execution**: Template engine is single-pass regex replacement, no eval/Function
- **Env var strictness**: Missing required env vars throw errors (don't silently empty-string)
- **Timeout cap**: Maximum 60 seconds

### File location

```
platform/src/employees/agents/{slug}/api-tools/
└── my_tool.yaml    # One file per tool
```

The `api-tools` plugin scans this directory per-session and registers each YAML file as a native tool.

### Example: Somi's LinkedIn tool

`platform/src/employees/agents/somi/api-tools/publish_linkedin.yaml` — see the file for a complete working example.

---

## Auto-Sync System

On platform server startup, `syncAllAgentTemplates()` runs automatically:

1. Iterates all templates in `EMPLOYEE_TEMPLATES`
2. For each template with active installations:
   - **File sync**: Re-copies template files to each tenant (memory preserved)
   - **Config sync**: Updates per-tenant `clawdbot.json` — sets `tools.alsoAllow`, `tools.sandbox.tools.allow`, and `plugins.entries`
3. Logs results

Manual sync endpoint: `POST /api/library/sync/:slug`

This ensures template updates propagate to all tenants on deploy. It does NOT modify the global gateway config — that must be managed separately.

### Key files

| File | Role |
|------|------|
| `platform/src/employees/templates.ts` | Template definitions + `buildAgentToolsConfig()` helper |
| `platform/src/employees/sync.ts` | Sync logic (`syncAllAgentTemplates`, `syncAgentConfigForAllTenants`, `syncAgentFilesForAllTenants`) |
| `platform/src/employees/installer.ts` | Install/uninstall/update agent for a tenant |
| `platform/src/index.ts` | Calls `syncAllAgentTemplates()` on startup |
| `platform/src/server/routes/library.ts` | Manual sync endpoint |

### Keeping sandbox defaults in sync

`SANDBOX_DEFAULT_TOOL_ALLOW` in `platform/src/employees/templates.ts` is a copy of `DEFAULT_TOOL_ALLOW` from `clawdbot/src/agents/sandbox/constants.ts`. If clawdbot adds or removes tools from the default sandbox allowlist, you must update the platform copy too. Look for the comment: "Must stay in sync with clawdbot/src/agents/sandbox/constants.ts".

---

## Debugging & Troubleshooting

### Tool not appearing in agent's tool list

This is the most common issue. Check all three layers:

1. **Is the plugin loaded?** Check gateway logs for `{plugin-id}: plugin registered`. If missing, the plugin isn't enabled in `~/.openclaw/openclaw.json`.

2. **Is the agent policy correct?** Check tenant config `agents.list[].tools.alsoAllow` includes the tool name. If missing, update the template's `requiredTools.alsoAllow` and re-sync.

3. **Is the sandbox policy correct?** Check tenant config `agents.list[].tools.sandbox.tools.allow` includes the tool name. If missing, the `buildAgentToolsConfig()` helper should be generating this. Re-sync or manually add.

### Quick verification curl

```bash
curl -s "http://127.0.0.1:18789/v1/chat/completions" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {gateway-token}" \
  -H "X-Tenant-ID: {tenant-id}" \
  -H "X-OpenClaw-Agent-ID: {agent-slug}" \
  -d '{"model":"openrouter/google/gemini-3-flash-preview","messages":[{"role":"user","content":"List all your available tools. Just the tool names."}],"max_tokens":500}'
```

**Important headers:**
- `X-Tenant-ID` — tenant UUID (not optional for multi-tenant)
- `X-OpenClaw-Agent-ID` — agent slug (e.g., `somi`). NOT `X-Agent-ID`.
- `Authorization: Bearer {token}` — from tenant's `clawdbot.json` → `gateway.auth.token`

### Gateway log warnings

| Warning | Meaning | Fix |
|---------|---------|-----|
| `allowlist contains unknown entries (*)` | Agent has `tools.allow: ["*"]` or `unionAllow` created `["*", ...]` | Cosmetic warning. Use `tools.alsoAllow` instead of `tools.allow`. The `*` gets stripped but other entries still work. |
| `config change requires gateway restart (plugins)` | Plugin config changed but gateway needs restart | Restart gateway: `pm2 restart gateway` |
| `Sandboxed image tool does not allow remote URLs` | Built-in `image` tool can't fetch remote URLs in sandbox | This is the `image` tool (screenshot/view), not `generate_image`. Use local file paths. |

### Session key format

Internal session keys follow the format `agent:{agentId}:{mainKey}` (e.g., `agent:somi:openai:abc-123`). If the agent ID isn't correctly parsed from the session key, it falls back to the `main` agent which may not have the right tool permissions.

The agent ID is resolved by `resolveAgentIdForRequest()` in `clawdbot/src/gateway/http-utils.ts`:
1. `X-OpenClaw-Agent-ID` header (preferred)
2. Model name parsing
3. Fallback to `"main"`

### Node.js debugging (manual tool resolution test)

```javascript
// Test if a tool resolves correctly for an agent
const { loadConfig } = await import('./clawdbot/src/config/config.js')
const { createOpenClawCodingTools } = await import('./clawdbot/src/agents/pi-tools.js')

const config = loadConfig({ configDir: '/path/to/tenant/dir' })
const tools = await createOpenClawCodingTools({
  config,
  sessionKey: 'agent:somi:openai:test-123',  // Must start with agent:{slug}:
  workspaceDir: '/path/to/tenant/agents/somi',
  agentDir: '/path/to/tenant/agents/somi',
  sandbox: { enabled: true, mode: 'paths-only', workspaceRoot: '...' },
})
console.log(tools.map(t => t.name))  // Should include your plugin tool
```

**Gotcha:** If you pass a simplified sandbox object without the `tools` property, the sandbox tool filtering is skipped and you get a false positive. The real gateway creates a full sandbox context via `resolveSandboxContext()` which includes `tools: { allow: [...], deny: [...] }`.

---

## Key Source Files Reference

### Platform

| File | What it does |
|------|-------------|
| `platform/src/employees/templates.ts` | Template definitions, `buildAgentToolsConfig()`, `SANDBOX_DEFAULT_TOOL_ALLOW` |
| `platform/src/employees/installer.ts` | `installAgentForTenant()`, `updateAgentForTenant()` (memory-preserving copy) |
| `platform/src/employees/sync.ts` | `syncAllAgentTemplates()`, `syncAgentConfigForAllTenants()`, `syncAgentFilesForAllTenants()` |
| `platform/src/tenant/manager.ts` | `addAgentToClawdbotConfig()`, `enablePlugins()`, `loadClawdbotConfig()` |
| `platform/src/server/routes/library.ts` | API endpoints for install/sync |

### Gateway (clawdbot)

| File | What it does |
|------|-------------|
| `src/agents/pi-tools.ts` | `createOpenClawCodingTools()` — main tool creation, applies all policy layers |
| `src/agents/pi-tools.policy.ts` | `resolveEffectiveToolPolicy()`, `pickToolPolicy()`, `unionAllow()`, `filterToolsByPolicy()` |
| `src/agents/sandbox/tool-policy.ts` | `resolveSandboxToolPolicyForAgent()` — sandbox layer filtering |
| `src/agents/sandbox/constants.ts` | `DEFAULT_TOOL_ALLOW`, `DEFAULT_TOOL_DENY` — sandbox defaults |
| `src/agents/tool-policy.ts` | `stripPluginOnlyAllowlist()`, `collectExplicitAllowlist()`, `TOOL_PROFILES` |
| `src/plugins/tools.ts` | `resolvePluginTools()`, `isOptionalToolAllowed()` — plugin tool resolution |
| `src/plugins/loader.ts` | `loadOpenClawPlugins()` — discovers and caches plugin registries |
| `src/gateway/openai-http.ts` | HTTP `/v1/chat/completions` handler |
| `src/gateway/http-utils.ts` | `resolveAgentIdForRequest()`, header parsing |
| `src/agents/pi-embedded-runner/run/attempt.ts` | Where tools are actually created for real requests |
| `src/config/tenant-context.ts` | `AsyncLocalStorage` for thread-safe tenant isolation |

---

## Checklists

### Adding an Agent with Plugin Tools

- [ ] Add template to `EMPLOYEE_TEMPLATES` in `templates.ts` with `requiredTools`
- [ ] Create template files in `platform/src/employees/agents/{slug}/`
- [ ] Insert into `agent_library` database table
- [ ] Add plugin to `~/.openclaw/openclaw.json` → `plugins.entries` (if using bundled plugin)
- [ ] Restart gateway (`pm2 restart gateway`) to load new plugin
- [ ] Restart platform (`pm2 restart platform`) to trigger auto-sync
- [ ] Verify: check gateway logs for `{plugin-id}: plugin registered`
- [ ] Verify: check tenant config has `tools.alsoAllow` AND `tools.sandbox.tools.allow` on the agent entry
- [ ] Verify: curl test confirms tool appears in agent's tool list

### Updating Agent Template Files

- [ ] Edit files in `platform/src/employees/agents/{slug}/`
- [ ] Restart platform — auto-sync copies files to all tenants
- [ ] Verify: check a tenant's agent directory has the updated content

### Adding a New Required Plugin to Existing Agent

- [ ] Add plugin ID to `requiredTools.plugins` in `templates.ts`
- [ ] Add tool name to `requiredTools.alsoAllow` in `templates.ts`
- [ ] Add plugin to `~/.openclaw/openclaw.json` → `plugins.entries`
- [ ] Restart gateway to load plugin
- [ ] Restart platform to sync tenant configs (updates both alsoAllow and sandbox allow)
- [ ] Verify with curl test

### Adding an Agent WITHOUT Plugin Tools (basic agent)

- [ ] Add template to `EMPLOYEE_TEMPLATES` in `templates.ts` (no `requiredTools` needed)
- [ ] Create template files in `platform/src/employees/agents/{slug}/`
- [ ] Insert into `agent_library` database table
- [ ] Restart platform to trigger sync
- [ ] Agent gets default tools: read, write, edit, image, sessions_*, session_status
