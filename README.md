# Workforce Platform

Multi-tenant AI Employees platform powered by Clawdbot.

## Architecture

```
workforce.dooza-ai/
├── clawdbot/           # Agent engine (submodule)
├── platform/           # API server (Hono + TypeScript)
│   ├── src/            # Backend code
│   └── web/            # Frontend (React + Vite)
├── ecosystem.config.cjs # PM2 config (local + production)
└── render.yaml         # Render deployment config
```

## Quick Start (Local Development)

### 1. Install dependencies

```bash
# Install clawdbot
cd clawdbot && pnpm install && pnpm build && cd ..

# Install platform
cd platform && pnpm install && cd ..

# Install frontend
cd platform/web && pnpm install && cd ..
```

### 2. Configure environment

```bash
cp platform/.env.example platform/.env
cp platform/web/.env.example platform/web/.env
# Edit both .env files with your keys
```

Required env vars in `platform/.env`:
- `DATABASE_URL` - Supabase PostgreSQL connection string
- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_ANON_KEY` - Supabase anon key
- `OPENROUTER_API_KEY` - OpenRouter API key for AI models

### 3. Start services

```bash
# Start API + Gateway (runs on ports 3000 and 18789)
pm2 start ecosystem.config.cjs

# Start Frontend (runs on port 5173)
cd platform/web && pnpm dev
```

### 4. Access

- Frontend: http://localhost:5173
- API: http://localhost:3000
- Gateway: http://localhost:18789

### PM2 Commands

```bash
pm2 start ecosystem.config.cjs  # Start all
pm2 stop all                     # Stop all
pm2 restart all                  # Restart all
pm2 logs                         # View logs
pm2 logs gateway                 # View gateway logs
pm2 status                       # Check status
```

## Production Deployment

### Option 1: Render + Vercel (Recommended)

**Frontend → Vercel (free)**
```bash
cd platform/web
vercel
```

Set env vars in Vercel:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_API_URL` → `https://your-app.onrender.com/api`

**Backend → Render ($7/mo)**
- Push to GitHub
- Connect repo in Render dashboard
- `render.yaml` auto-configures everything
- Add secrets in Render dashboard

### Option 2: Single Server (VPS/EC2)

```bash
# Build everything
cd clawdbot && pnpm build && cd ..
cd platform && pnpm build && cd ..
cd platform/web && pnpm build && cd ..

# Start with PM2
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup  # Auto-start on reboot
```

## Data Storage

| Environment | Location |
|-------------|----------|
| macOS (local) | `~/data/tenants/` |
| Linux (production) | `/data/tenants/` |

Set `TENANT_DATA_DIR` env var to override.

## Tech Stack

- **API**: Hono (TypeScript)
- **Database**: Supabase (PostgreSQL)
- **ORM**: Drizzle
- **Frontend**: React + Vite + Zustand
- **Agent Engine**: Clawdbot
- **Process Manager**: PM2

## License

MIT
