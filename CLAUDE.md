# Workforce Platform - Claude Code Context

## Project Overview
Workforce Platform (workforce.dooza.ai) is a multi-tenant SaaS platform where businesses can use pre-built "AI Employees" or create custom ones. Clawdbot serves as the agent engine; the platform handles tenants, auth, billing, and UI.

## Documentation
- **Local development**: See `docs/LOCAL.md`
- **Production deployment**: See `docs/DEPLOY.md`

## Architecture

```
workforce.dooza-ai/
├── clawdbot/              # Agent engine (submodule)
├── platform/              # Multi-tenant wrapper
│   ├── src/               # Hono API server
│   │   ├── server/        # Routes and middleware
│   │   ├── tenant/        # Tenant isolation & gateway management
│   │   ├── employees/     # AI Employee management
│   │   ├── jobs/          # Scheduled task queue
│   │   └── db/            # Drizzle schema & client
│   └── web/               # React + Vite frontend
├── ecosystem.config.cjs   # PM2 config
├── render.yaml            # Render deployment
└── docs/                  # Documentation
```

## Key Files

### Platform API
- `platform/src/index.ts` - Entry point
- `platform/src/server/routes/` - API endpoints
- `platform/src/tenant/manager.ts` - Tenant directory management
- `platform/src/employees/templates.ts` - Pre-built employee types
- `platform/src/db/schema.ts` - Drizzle schema

### Platform Web
- `platform/web/src/App.tsx` - React router
- `platform/web/src/pages/` - Pages
- `platform/web/src/lib/api.ts` - API client
- `platform/web/src/lib/store.ts` - Zustand state

### Clawdbot
- `clawdbot/src/gateway/` - Gateway server
- `clawdbot/src/config/paths.ts` - Tenant path resolution

## Tech Stack

| Component | Technology |
|-----------|------------|
| API | Hono (TypeScript) |
| Database | Supabase (PostgreSQL) |
| ORM | Drizzle |
| Auth | Supabase Auth |
| Frontend | React + Vite + Zustand |
| Agent Engine | Clawdbot |
| Process Manager | PM2 |

## Tenant Data

| Environment | Location |
|-------------|----------|
| macOS | `~/data/tenants/` |
| Linux | `/data/tenants/` |

Structure:
```
{tenantId}/
├── clawdbot.json       # Gateway config
├── moltbot.json        # Agent registrations
├── workspace/          # Sandbox
└── agents/{slug}/      # Per-agent data
```

## Supabase Storage

Two buckets are used:

| Bucket | Visibility | Purpose |
|--------|-----------|---------|
| `brain` | Private | Agent memory/knowledge files |
| `media` | Public | Generated images (CDN-backed, no auth to read) |

**Media bucket** — used by `image-gen` plugin. Images upload to `media/{tenantId}/{agentId}/{filename}`. Public URLs are returned to the LLM and rendered inline in the frontend. Setup: `npx tsx platform/scripts/setup-media-bucket.ts`. Gateway needs `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` env vars (passed via `ecosystem.config.cjs`).

## Code Conventions
- TypeScript strict mode
- ESM modules
- Hono for API
- Drizzle for database
- Zustand for client state
