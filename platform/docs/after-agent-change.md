# After Changing an Agent in Platform

Checklist for when you modify an agent template in `platform/src/employees/agents/{slug}/`.

## What Counts as an Agent Change

- Adding/removing/modifying skills in `skills/`
- Updating `SOUL.md` (agent personality/instructions)
- Changing `AGENT.md` or other config files
- Adding new files to the agent workspace

## Steps After Making Changes

### 1. Update Existing Tenants' Agent Files

The installer copies agent templates to tenant directories. Existing tenants won't see your changes until their copy is updated.

**Option A: Update via API** (if platform is running)
```bash
# Trigger agent update for a specific tenant
curl -X POST http://localhost:3000/api/employees/{agentSlug}/update \
  -H "Authorization: Bearer {token}"
```

**Option B: Re-run installer manually** (dev/testing)
```typescript
import { updateAgentForTenant } from '../src/employees/installer.js'
await updateAgentForTenant(tenantId, 'somi')
```

### 2. Migrate Tenant Configs (if needed)

If you added the agent to `clawdbot.json` `agents.list` handling (for skill discovery), run the migration for existing tenants:

```bash
cd platform
npx tsx --env-file=.env scripts/migrate-tenant-configs.ts
```

### 3. Restart the Platform

Clawdbot gateway caches agent configs. Restart to pick up changes:

```bash
# If running locally
pnpm dev

# If running in production
# Restart your deployment
```

### 4. Verify Changes

1. Open chat with the agent
2. Ask: "What skills do you have?"
3. Confirm new/updated skills appear

## Quick Reference: File Locations

| What | Location |
|------|----------|
| Agent templates | `platform/src/employees/agents/{slug}/` |
| Tenant copies | `{TENANT_DATA_DIR}/{tenantId}/agents/{slug}/` |
| Installer code | `platform/src/employees/installer.ts` |
| Migration scripts | `platform/scripts/` |

## Common Issues

### Skills not showing up
- Check `clawdbot.json` has the agent in `agents.list`
- Run `migrate-tenant-configs.ts` if missing
- Restart platform

### Changes not reflected for existing tenants
- Template changes only affect new installs
- Use `updateAgentForTenant()` to push updates to existing tenants

### Agent memory lost after update
- The installer preserves the `memory/` directory during updates
- If memory is missing, check `installer.ts` backup/restore logic
