# Local Development

## Prerequisites

- Node.js 22+
- pnpm
- PM2 (`npm i -g pm2`)

## Setup

### 1. Install dependencies

```bash
# Clawdbot (agent engine)
cd clawdbot && pnpm install && pnpm build && cd ..

# Platform API
cd platform && pnpm install && cd ..

# Frontend
cd platform/web && pnpm install && cd ..
```

### 2. Configure environment

```bash
cp platform/.env.example platform/.env
cp platform/web/.env.example platform/web/.env
```

Edit `platform/.env`:
```env
DATABASE_URL=postgresql://...
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_KEY=eyJ...
OPENROUTER_API_KEY=sk-or-...
```

Edit `platform/web/.env`:
```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
VITE_API_URL=http://localhost:3000/api
```

### 3. Start services

```bash
# Start API + Gateway
pm2 start ecosystem.config.cjs

# Start Frontend (separate terminal)
cd platform/web && pnpm dev
```

## URLs

| Service | URL |
|---------|-----|
| Frontend | http://localhost:5173 |
| API | http://localhost:3000 |
| Gateway | http://localhost:18789 |

## PM2 Commands

```bash
pm2 start ecosystem.config.cjs  # Start
pm2 stop all                     # Stop
pm2 restart all                  # Restart
pm2 logs                         # View logs
pm2 logs gateway                 # Gateway logs only
pm2 logs platform                # Platform logs only
pm2 status                       # Check status
pm2 monit                        # Live monitor
```

## Data Storage

Tenant data is stored at:
- **macOS**: `~/data/tenants/`
- **Linux**: `/data/tenants/`

Override with `TENANT_DATA_DIR` env var.

## Database

```bash
cd platform
pnpm db:push       # Push schema to Supabase
pnpm db:studio     # Open Drizzle Studio
```

## Troubleshooting

### "ENOENT: no such file or directory, mkdir '/data'"

macOS cannot create `/data`. The system auto-detects macOS and uses `~/data/tenants` instead. If this error occurs:

1. Make sure clawdbot is rebuilt: `cd clawdbot && pnpm build`
2. Check `TENANT_DATA_DIR` is set correctly in `.env`

### Gateway not responding

```bash
pm2 logs gateway  # Check for errors
pm2 restart gateway
```

### Frontend can't connect to API

Check `VITE_API_URL` in `platform/web/.env` is `http://localhost:3000/api`
