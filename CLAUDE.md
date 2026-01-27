# Workforce Platform - Claude Code Context

## Project Overview
Workforce Platform (workforce.dooza.ai) is a multi-tenant SaaS platform where businesses can use pre-built "AI Employees" or create custom ones. Clawdbot serves as the agent engine; the platform handles tenants, auth, billing, and UI.

## Architecture

```
clawed-setup/
├── clawdbot/              # Agent engine (unchanged, upstream)
├── platform/              # Multi-tenant wrapper
│   ├── src/               # Hono API server
│   │   ├── server/        # Routes and middleware
│   │   ├── tenant/        # Tenant isolation & gateway management
│   │   ├── employees/     # AI Employee management
│   │   ├── jobs/          # Scheduled task queue
│   │   └── db/            # Drizzle schema & client
│   └── web/               # React + Vite frontend
├── pnpm-workspace.yaml    # Monorepo config
└── package.json           # Root scripts
```

## Quick Commands

### Platform API Server
```bash
cd platform
pnpm install
pnpm dev                   # Start dev server on :3000
```

### Platform Web Frontend
```bash
cd platform/web
pnpm install
pnpm dev                   # Start Vite on :5173
```

### Database
```bash
cd platform
pnpm db:push              # Push schema to Supabase
pnpm db:studio            # Open Drizzle Studio
```

### Clawdbot (unchanged)
```bash
cd clawdbot
pnpm install
pnpm dev                  # Run clawdbot CLI
```

## Key Files

### Platform API
- `platform/src/index.ts` - Entry point, starts Hono server
- `platform/src/server/index.ts` - Route mounting
- `platform/src/server/routes/` - API endpoints (auth, employees, chat, jobs)
- `platform/src/tenant/manager.ts` - Tenant directory management
- `platform/src/tenant/gateway.ts` - Per-tenant clawdbot gateway spawning
- `platform/src/employees/templates.ts` - Pre-built employee types
- `platform/src/db/schema.ts` - Drizzle/PostgreSQL schema

### Platform Web
- `platform/web/src/App.tsx` - React router setup
- `platform/web/src/pages/` - Dashboard, Employees, Chat, Jobs
- `platform/web/src/lib/api.ts` - API client
- `platform/web/src/lib/store.ts` - Zustand auth state

### Clawdbot (reference)
- `clawdbot/src/cli/` - CLI commands
- `clawdbot/src/gateway/` - Gateway server
- `clawdbot/skills/` - Skill definitions

## Tech Stack

| Component | Technology |
|-----------|------------|
| API Server | Hono (TypeScript) |
| Database | Supabase (PostgreSQL) |
| ORM | Drizzle |
| Auth | Supabase Auth |
| Frontend | React + Vite |
| State | Zustand |
| Agent Engine | Clawdbot |

## Environment Variables

### Platform API (.env)
```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_KEY=eyJ...
DATABASE_URL=postgresql://...
PORT=3000
TENANT_DATA_DIR=/data/tenants
ANTHROPIC_API_KEY=sk-ant-...
```

### Platform Web (.env)
```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

## Design System
Uses Clawdbot's CSS variables:
- Dark theme with red accent (#ff5c5c)
- Space Grotesk font
- Supports light/dark themes via `[data-theme]`

## Code Conventions
- TypeScript strict mode
- ESM modules
- Hono for API (lightweight, fast)
- Drizzle for type-safe database queries
- Zustand for client state
- No unnecessary abstractions

## Tenant Isolation
Each tenant gets isolated directory at `/data/tenants/{tenantId}/`:
```
.clawdbot/
├── config.json
├── state/sessions.json
└── agents/{employeeId}/sessions/
workspace/
├── SOUL.md
└── skills/
```

Clawdbot gateway spawned per-tenant with `CLAWDBOT_STATE_DIR` env var.
