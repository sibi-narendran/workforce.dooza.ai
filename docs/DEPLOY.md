# Production Deployment

## Architecture

```
┌──────────────┐     ┌─────────────────────────┐
│   Vercel     │     │       Render ($7)       │
│  (Frontend)  │────▶│  Platform + Gateway     │
│    FREE      │     │  /data/tenants (disk)   │
└──────────────┘     └─────────────────────────┘
                              │
                       ┌──────────────┐
                       │   Supabase   │
                       │    (FREE)    │
                       └──────────────┘
```

**Total cost: ~$7/month**

## Frontend → Vercel

### 1. Deploy

```bash
cd platform/web
npx vercel
```

Or connect GitHub repo to Vercel dashboard.

### 2. Settings

- **Framework**: Vite
- **Root Directory**: `platform/web`
- **Build Command**: `pnpm build`
- **Output Directory**: `dist`

### 3. Environment Variables

Set in Vercel dashboard:

| Variable | Value |
|----------|-------|
| `VITE_SUPABASE_URL` | `https://your-project.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Your Supabase anon key |
| `VITE_API_URL` | `https://your-app.onrender.com/api` |

## Backend → Render

### 1. Connect Repository

1. Go to [Render Dashboard](https://dashboard.render.com)
2. New → Blueprint
3. Connect your GitHub repo
4. Render reads `render.yaml` automatically

### 2. Environment Variables

Set these secrets in Render dashboard:

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | Supabase PostgreSQL connection string |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_ANON_KEY` | Supabase anon key |
| `SUPABASE_SERVICE_KEY` | Supabase service role key |
| `OPENROUTER_API_KEY` | OpenRouter API key |
| `CLAWDBOT_HOOK_TOKEN` | Random string for webhook auth |
| `COMPOSIO_API_KEY` | (Optional) Composio key |

### 3. Persistent Disk

The `render.yaml` includes a 1GB disk at `/data/tenants`. This requires the **Starter plan** ($7/mo).

## Deployment Files

| File | Purpose |
|------|---------|
| `render.yaml` | Render config (API + Gateway) |
| `platform/web/vercel.json` | Vercel config (Frontend) |
| `ecosystem.config.cjs` | PM2 config (used by Render) |

## Manual Deployment (VPS/EC2)

If not using Render:

```bash
# 1. Clone repo
git clone https://github.com/your/workforce.dooza-ai.git
cd workforce.dooza-ai

# 2. Install
cd clawdbot && pnpm install && pnpm build && cd ..
cd platform && pnpm install && pnpm build && cd ..

# 3. Create data directory
sudo mkdir -p /data/tenants
sudo chown $USER /data/tenants

# 4. Set environment
cp platform/.env.example platform/.env
# Edit with production values

# 5. Start with PM2
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup  # Auto-start on reboot
```

## Health Check

API health endpoint: `GET /api/health`

## Logs

### Render
View in Render dashboard → Logs

### VPS/PM2
```bash
pm2 logs
pm2 logs platform
pm2 logs gateway
```

Log files at `./logs/`:
- `platform-out.log`
- `platform-error.log`
- `gateway-out.log`
- `gateway-error.log`

## Scaling

For 100+ users, single Render instance is sufficient.

For 1000+ users, consider:
- Separate Gateway instance
- Redis for session storage
- Multiple Platform instances with load balancer
