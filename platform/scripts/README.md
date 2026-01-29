# Platform Scripts

Maintenance and migration scripts for the Workforce Platform.

## How to Run

All scripts should be run from the `platform` directory with the `.env` file loaded:

```bash
cd platform
npx tsx --env-file=.env scripts/<script-name>.ts
```

## Available Scripts

### `migrate-tenant-configs.ts`

**Purpose:** Migrate existing tenants' `clawdbot.json` to include `agents.list`

**When to use:** After updating the installer to add agents to `clawdbot.json`, existing tenants need this migration so clawdbot can discover their agent workspaces and skills.

**What it does:**
1. Queries DB for all tenants with active installed agents
2. For each tenant, adds installed agents to `clawdbot.json` `agents.list`
3. Skips tenants that already have `agents.list` configured
4. Reports summary of updated/skipped/errored tenants

```bash
npx tsx --env-file=.env scripts/migrate-tenant-configs.ts
```
