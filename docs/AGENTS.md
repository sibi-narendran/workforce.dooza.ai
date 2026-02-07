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
| `image-gen` | tools | `generate_image` tool (OpenRouter Gemini) — uploads to Supabase Storage |
| `api-tools` | tools | Generic API tools from YAML definitions |
| `brand-assets` | tools | Brand profile + asset access from Supabase Brain storage |
| `voice-call` | channel | Voice call channel |
| `composio-direct` | tools | Composio tool integrations |
| `slack` | channel | Slack messaging |
| `telegram` | channel | Telegram messaging |
| `discord` | channel | Discord messaging |
| `whatsapp` | channel | WhatsApp messaging |

### Image Generation & Media Storage

The `image-gen` plugin (`clawdbot/extensions/image-gen/index.ts`) generates images via OpenRouter and uploads them to **Supabase Storage** (public `media` bucket). It does NOT save to local disk.

**How it works:**
1. Plugin calls OpenRouter (Gemini 3 Pro Image Preview) to generate an image
2. Extracts base64 image data from the response
3. Uploads to Supabase Storage at path: `media/{tenantId}/{agentId}/{filename}`
4. Returns a public CDN-backed URL: `https://{project}.supabase.co/storage/v1/object/public/media/{tenantId}/{agentId}/{filename}`

**Environment variables required** (passed to gateway via `ecosystem.config.cjs`):
- `SUPABASE_URL` — Supabase project URL
- `SUPABASE_SERVICE_KEY` — Service role key (for upload auth)
- `OPENROUTER_API_KEY` — OpenRouter API key (for image generation)

**Supabase Storage setup:**
- Bucket: `media` (public, 10MB limit, image MIME types only)
- Setup script: `npx tsx platform/scripts/setup-media-bucket.ts`
- RLS: service role has full access; public read for anonymous

**Frontend rendering** (`platform/web/src/pages/Chat.tsx`):
- `renderMessageContent()` detects Supabase Storage URLs via regex
- Pattern: `https://{project}.supabase.co/storage/v1/object/public/media/....(png|jpg|jpeg|webp|gif)`
- Renders matched URLs as `<img>` tags with `loading="lazy"`
- No local file serving — images load directly from Supabase CDN

**Tenant isolation:** Each tenant's images are namespaced under `media/{tenantId}/`. The bucket is public (read-only for CDN), but only the gateway (with service key) can upload.

### Brand Assets (brand-assets plugin)

The `brand-assets` plugin (`clawdbot/extensions/brand-assets/index.ts`) provides read access
to brand profile and uploaded assets from Supabase Brain storage.

**Tools:**
- `get_brand_profile` — reads `brain_brand` table (one row per tenant)
- `list_brand_assets` — reads `brain_items` table, filterable by type
- `fetch_brand_image` — downloads image from brain storage bucket, returns:
  - `type: "image"` content block (LLM sees the image inline)
  - `signedUrl` in text block (pass to `generate_image`'s `reference_image_url`)

**Why a TypeScript plugin (not YAML)?**
YAML api-tools hardcode `type: "text"` in tool results. To return image content blocks
that the LLM can see, a TypeScript plugin is required.

**Integration with image-gen:**
`generate_image` accepts an optional `reference_image_url` parameter. When provided,
the reference image is fetched, base64-encoded, and sent as a multimodal message to
OpenRouter (Gemini). This enables brand-consistent image generation.

**Workflow:**
1. `get_brand_profile` — get brand name, colors, tagline
2. `list_brand_assets` — find asset IDs (filter by `type: "image"`)
3. `fetch_brand_image(asset_id)` — LLM sees the image + gets signedUrl
4. `generate_image(prompt, reference_image_url: signedUrl)` — brand-consistent output

**Environment variables** (same as image-gen): `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`

**Database tables** (in `platform/src/db/schema.ts`):
- `brain_brand` — business_name, tagline, primary_color, secondary_color, industry, target_audience, description, value_proposition, logo_url, website, social_links
- `brain_items` — id, tenant_id, type, title, file_name, file_path, mime_type, file_size

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
name: save_post                           # Tool name (must match [a-z][a-z0-9_]*)
description: Save a post to the content calendar

parameters:                               # LLM sees these as typed tool params
  platform:
    type: string                          # string, number, integer, boolean
    description: Target platform
    required: true
    enum: ["youtube", "instagram", "facebook", "linkedin", "tiktok"]
  content:
    type: string
    description: Post body text
    required: true
  title:
    type: string
    description: Short title for calendar display
  scheduled_date:
    type: string
    description: ISO 8601 datetime
    required: true
  status:
    type: string
    description: Post status
    enum: ["draft", "scheduled"]          # Optional enum constraint
    default: "draft"                      # Optional default value

request:
  method: POST                            # GET, POST, PUT, PATCH, DELETE
  url: "{{env.SUPABASE_URL}}/rest/v1/posts"
  headers:
    Authorization: "Bearer {{env.SUPABASE_SERVICE_KEY}}"
    apikey: "{{env.SUPABASE_SERVICE_KEY}}"
    Content-Type: "application/json"
  body:
    type: json                            # json, form, or text
    content:
      tenant_id: "{{env.TENANT_ID}}"
      agent_slug: "somi"
      platform: "{{params.platform}}"
      content: "{{params.content}}"
      title: "{{params.title}}"
      scheduled_date: "{{params.scheduled_date}}"
      status: "{{params.status}}"
  timeout_ms: 15000                       # Max 60000, default 30000

response:
  summary: "Post saved to calendar."
  error_template: "Save error ({{response.status}}): {{response.message}}"

requires_env:                             # Checked before request
  - SUPABASE_URL
  - SUPABASE_SERVICE_KEY

allowed_hosts:                            # URL must match one of these (required)
  - "*.supabase.co"
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

### How `{{env.VAR}}` resolves (three sources)

YAML tools reference environment variables with `{{env.VAR}}`. These are resolved from **three sources**, merged in priority order:

```
1. process.env               ← Gateway-level env vars (set in ecosystem.config.cjs)
2. clawdbot.json → env       ← Per-tenant env vars (set by sync or manually)
3. Automatic injection       ← TENANT_ID, AGENT_ID (extracted at runtime)
```

**Source 1: Gateway env vars** — Set in `ecosystem.config.cjs`. Available to ALL tenants/tools. Used for global keys like `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `OPENROUTER_API_KEY`.

**Source 2: Tenant env vars** — Set in `~/data/tenants/{id}/clawdbot.json` under `"env": {}`. Per-tenant. The sync system can auto-populate these (see "Employee ID injection" below). Useful for per-tenant API keys like `LINKEDIN_ACCESS_TOKEN`.

**Source 3: Auto-injected** — The `api-tools` plugin extracts `TENANT_ID` from the agent directory path and `AGENT_ID` from the session context. These are always available without configuration.

The merge happens in `clawdbot/extensions/api-tools/index.ts`:
```typescript
extraEnv: {
  ...tenantEnv,           // clawdbot.json → env (loaded via loadTenantEnv)
  TENANT_ID: "...",       // extracted from agentDir path
  AGENT_ID: "...",        // from session context
}
```

This `extraEnv` is merged with `process.env` in the executor. Tenant env vars override process.env vars with the same name.

### Agent slug in YAML tools

YAML tools that write to the platform DB use a hardcoded `agent_slug` field (e.g., `"somi"`) to identify which agent created the record. This avoids needing a foreign key to the `employees` table — data is isolated by `tenant_id` and optionally filtered by `agent_slug` in the UI.

```yaml
body:
  content:
    tenant_id: "{{env.TENANT_ID}}"
    agent_slug: "somi"           # Hardcoded — each agent's YAML knows its own slug
```

### Connecting YAML tools to Supabase (internal data pattern)

For tools that need to read/write platform data (like the content calendar), use Supabase's PostgREST API directly. This avoids creating a new plugin — the existing `api-tools` plugin + YAML handles it.

**Pattern:**
```yaml
request:
  method: POST
  url: "{{env.SUPABASE_URL}}/rest/v1/your_table"
  headers:
    apikey: "{{env.SUPABASE_SERVICE_KEY}}"
    Authorization: "Bearer {{env.SUPABASE_SERVICE_KEY}}"
    Content-Type: "application/json"
    Prefer: "return=representation"       # Returns the created/updated row
  body:
    type: json
    content:
      tenant_id: "{{env.TENANT_ID}}"      # Auto-injected
      agent_slug: "somi"                  # Hardcoded per-agent
      ...

allowed_hosts:
  - "*.supabase.co"
```

**Why this works:**
- `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` are in the gateway's `process.env` (set in `ecosystem.config.cjs`)
- `TENANT_ID` is auto-injected by the api-tools plugin
- `agent_slug` is hardcoded in each agent's YAML tool (no DB lookup needed)
- The service key has full PostgREST access (bypasses RLS)
- `allowed_hosts: ["*.supabase.co"]` permits the request

**Security note:** The service key gives full DB access. The YAML tool should only write to its own table. RLS policies on the Supabase side provide an additional safety layer for other consumers.

**Example:** `platform/src/employees/agents/somi/api-tools/save_post.yaml` — writes to the `posts` table.

### Example: Somi's tools

| Tool | YAML file | What it does |
|------|-----------|-------------|
| `save_post` | `agents/somi/api-tools/save_post.yaml` | Save a post to the content calendar (Supabase `posts` table) |

---

## Auto-Sync System

On platform server startup, `syncAllAgentTemplates()` runs automatically:

1. Iterates all templates in `EMPLOYEE_TEMPLATES`
2. For each template with active installations:
   - **File sync**: Re-copies template files to each tenant (memory preserved)
   - **Config sync**: Updates per-tenant `clawdbot.json` — sets `tools.alsoAllow`, `tools.sandbox.tools.allow`, `plugins.entries`
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

## Content Calendar (reference architecture)

The content calendar is a reference implementation for the pattern: **agent writes to platform DB via YAML tool, frontend reads via API**.

### Data flow

```
LLM calls save_post tool
  ↓
api-tools plugin executes YAML definition
  ↓
HTTP POST to Supabase PostgREST → posts table
  ↓
Frontend calls GET /api/posts?month=2026-02 → reads from same table via Drizzle
  ↓
Calendar UI renders posts
```

### Components

| Layer | File | Purpose |
|-------|------|---------|
| DB | `platform/src/db/schema.ts` → `posts` | Table definition (Drizzle) |
| API | `platform/src/server/routes/posts.ts` | CRUD for frontend (list, create, update, delete) |
| Tool | `agents/somi/api-tools/save_post.yaml` | YAML tool for LLM to write posts |
| Skill | `agents/somi/skills/schedule-post/SKILL.md` | Teaches LLM when/how to call save_post |
| Frontend | `platform/web/src/components/workspace/somi/` | Calendar UI components |

### Reusing this pattern for new features

To add a new agent→DB feature (e.g., task tracking, lead management):

1. Add a table to `platform/src/db/schema.ts`
2. Run the migration (see LOCAL.md "Database migrations")
3. Create API routes in `platform/src/server/routes/`
4. Create a YAML tool in `agents/{slug}/api-tools/` using the Supabase pattern
5. Add the tool to `requiredTools.alsoAllow` in `templates.ts`
6. Create a skill to teach the LLM how to use the tool
7. Wire the frontend to the API

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

### YAML tool loaded by plugin but agent says it doesn't have it

**Symptom:** Gateway logs show `api-tools: loaded 1 tool(s)` but your new YAML tool is missing. The agent responds as if the tool doesn't exist.

**Root cause: `agentDir` path mismatch.** The `agentDir` in tenant `clawdbot.json` can become stale if `TENANT_DATA_DIR` changed since the agent was first installed. The sync system copies files to the CURRENT `TENANT_DATA_DIR`, but the gateway reads api-tools from the `agentDir` path stored in `clawdbot.json` — which may point to the OLD location.

**How it happens:**
1. Agent installed when platform ran with one `TENANT_DATA_DIR` (e.g., `./data/tenants` → `platform/data/tenants/`)
2. PM2 ecosystem config overrides `TENANT_DATA_DIR` to a different path (e.g., `~/data/tenants/`)
3. Sync copies new YAML tools to `~/data/tenants/.../api-tools/` (correct)
4. But `agentDir` in `clawdbot.json` still points to `platform/data/tenants/.../` (stale)
5. Gateway looks for api-tools at the stale path — only finds the old tools

**Fix (now automatic):** `syncAgentConfigForAllTenants()` in `sync.ts` corrects `agentDir` and `workspace` paths on every sync. Just restart platform + gateway:
```bash
pm2 restart platform && sleep 5 && pm2 restart gateway
```

**Verify:**
```bash
# Check agentDir points to current TENANT_DATA_DIR
cat ~/data/tenants/{tenant-id}/clawdbot.json | python3 -c "
import json,sys; c=json.load(sys.stdin)
for a in c.get('agents',{}).get('list',[]):
    print(a.get('id'), '->', a.get('agentDir'))
"

# Check gateway loaded all tools
pm2 logs gateway --lines 20 --nostream | grep "api-tools.*loaded"
# Should show: api-tools: loaded N tool(s) for agent {slug}: tool1, tool2, ...
```

**Prevention:** Never manually set `agentDir` in tenant configs. Let the installer and sync system manage it. If you change `TENANT_DATA_DIR`, restart the platform so sync fixes all paths automatically.

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

### Adding a New API Tool

> Only works for agents that have a template directory under `platform/src/employees/agents/{slug}/`.
> Currently only `somi` has one. For other agents, create the directory first.

- [ ] Create YAML file: `platform/src/employees/agents/{agent-slug}/api-tools/my_tool.yaml`
  - Must include: `name`, `description`, `parameters`, `request`, `allowed_hosts`
  - `name` field must be `snake_case` and match what you add to `alsoAllow`
  - Add `requires_env` if the tool needs API keys (tenant must have these configured)
- [ ] Update `templates.ts` — add tool name to `requiredTools.alsoAllow`, ensure `api-tools` is in `plugins`:
  ```ts
  requiredTools: {
    alsoAllow: ['generate_image', 'save_post', 'my_tool'],
    plugins: ['image-gen', 'api-tools'],
  },
  ```
- [ ] If tool writes to Supabase, add the table to `platform/src/db/schema.ts` and run migration (see "Database migrations" in LOCAL.md)
- [ ] If tool writes to a platform table, use `tenant_id: "{{env.TENANT_ID}}"` and hardcode `agent_slug` (see "Agent slug in YAML tools" above)
- [ ] Optionally create a companion skill in `agents/{slug}/skills/{skill-name}/SKILL.md` with `command-dispatch: tool` metadata
- [ ] Restart: `pm2 restart platform && pm2 restart gateway`
  - Platform sync copies YAML to all tenants, updates `clawdbot.json` tools + env (requires DB to be up)
  - Gateway reload picks up the new tool definition
- [ ] Verify: check tenant's `agents/{slug}/api-tools/` has the new YAML
- [ ] Verify: if using Supabase, test the PostgREST endpoint directly with `curl` first