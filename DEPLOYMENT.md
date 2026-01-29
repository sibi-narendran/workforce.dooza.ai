# Workforce Platform - Deployment Guide

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     PRODUCTION SETUP                         │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   ┌──────────────┐          ┌──────────────────────────┐    │
│   │   Vercel     │          │        Render            │    │
│   │  (Frontend)  │  ──────▶ │       (Backend)          │    │
│   │              │   API    │                          │    │
│   │ workforce.   │  calls   │ workforce-api-g3kg.      │    │
│   │ dooza.ai     │          │ onrender.com             │    │
│   └──────────────┘          └──────────────────────────┘    │
│         │                              │                     │
│         │                              │                     │
│         ▼                              ▼                     │
│   ┌──────────────────────────────────────────────────┐      │
│   │              Supabase (Database + Auth)           │      │
│   │         cydhvvqvgrvntzitrrwy.supabase.co         │      │
│   └──────────────────────────────────────────────────┘      │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Live URLs

| Service | URL | Platform |
|---------|-----|----------|
| Frontend | https://workforce.dooza.ai | Vercel |
| Backend API | https://workforce-api-g3kg.onrender.com | Render |
| Health Check | https://workforce-api-g3kg.onrender.com/health | Render |

## Git Integration

Both services auto-deploy on push to `main` branch:
- **Repository**: `sibi-narendran/workforce.dooza.ai`
- **Branch**: `main`

---

## Environment Variables

### Backend (Render) - `platform/.env`

```env
# Server
PORT=3000
NODE_ENV=production
TENANT_DATA_DIR=/data/tenants

# Supabase
SUPABASE_URL=https://cydhvvqvgrvntzitrrwy.supabase.co
SUPABASE_ANON_KEY=<your-supabase-anon-key>
SUPABASE_SERVICE_KEY=<your-supabase-service-key>

# Database
DATABASE_URL=postgresql://postgres.cydhvvqvgrvntzitrrwy:<password>@aws-1-ap-south-1.pooler.supabase.com:6543/postgres

# AI Provider
OPENROUTER_API_KEY=<your-openrouter-api-key>
DEFAULT_MODEL=google/gemini-3-pro-preview
```

### Frontend (Vercel) - `platform/web/.env`

```env
VITE_SUPABASE_URL=https://cydhvvqvgrvntzitrrwy.supabase.co
VITE_SUPABASE_ANON_KEY=<your-supabase-anon-key>
VITE_API_URL=https://workforce-api-g3kg.onrender.com/api
```

---

## How to Get Keys

### 1. Supabase Keys
1. Go to https://supabase.com/dashboard/project/cydhvvqvgrvntzitrrwy/settings/api
2. Copy:
   - `anon public` key → `SUPABASE_ANON_KEY` / `VITE_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_KEY`

### 2. Database URL
1. Go to https://supabase.com/dashboard/project/cydhvvqvgrvntzitrrwy/settings/database
2. Copy the connection string (pooler mode recommended)
3. URL encode special characters in password (e.g., `!` becomes `%21`)

### 3. OpenRouter API Key
1. Go to https://openrouter.ai/keys
2. Create a new API key
3. Copy to `OPENROUTER_API_KEY`

---

## Render Configuration

### Service Settings
- **Name**: workforce-api
- **Runtime**: Node
- **Root Directory**: `platform`
- **Build Command**: `npm install --include=dev && npm run build`
- **Start Command**: `npm run start`
- **Region**: Oregon (us-west)

### Environment Variables (set in Render Dashboard)
| Key | Value | Sync |
|-----|-------|------|
| `PORT` | `3000` | Yes |
| `NODE_ENV` | `production` | Yes |
| `TENANT_DATA_DIR` | `/data/tenants` | Yes |
| `SUPABASE_URL` | `https://cydhvvqvgrvntzitrrwy.supabase.co` | No |
| `SUPABASE_ANON_KEY` | `<secret>` | No |
| `SUPABASE_SERVICE_KEY` | `<secret>` | No |
| `DATABASE_URL` | `<secret>` | No |
| `OPENROUTER_API_KEY` | `<secret>` | No |
| `DEFAULT_MODEL` | `google/gemini-3-pro-preview` | Yes |

### Disk
- **Name**: tenant-data
- **Mount Path**: `/data`
- **Size**: 1 GB

---

## Vercel Configuration

### Project Settings
- **Name**: web
- **Framework**: Vite
- **Root Directory**: `platform/web`
- **Build Command**: `npm run build`
- **Output Directory**: `dist`
- **Install Command**: `npm install`

### Environment Variables (set in Vercel Dashboard)
| Key | Value | Environment |
|-----|-------|-------------|
| `VITE_SUPABASE_URL` | `https://cydhvvqvgrvntzitrrwy.supabase.co` | Production |
| `VITE_SUPABASE_ANON_KEY` | `<secret>` | Production |
| `VITE_API_URL` | `https://workforce-api-g3kg.onrender.com/api` | Production |

### Custom Domain
- **Domain**: workforce.dooza.ai
- **SSL**: Automatic (Let's Encrypt)

---

## Local Development

### Quick Start
```bash
# 1. Clone and install
git clone https://github.com/sibi-narendran/workforce.dooza.ai.git
cd workforce.dooza.ai

# 2. Copy environment files
cp .env.example .env
cp platform/web/.env.example platform/web/.env

# 3. Fill in the keys (see "How to Get Keys" above)

# 4. Run the deployment script
./deploy.sh
```

### Manual Start
```bash
# Backend (terminal 1)
cd platform
pnpm install
pnpm dev  # Runs on http://localhost:3000

# Frontend (terminal 2)
cd platform/web
pnpm install
pnpm dev  # Runs on http://localhost:5173
```

---

## Deployment Commands

### Deploy Backend (Render)
```bash
# Trigger deploy via API
curl -X POST "https://api.render.com/v1/services/srv-d5sdgkjlr7ts738tqcn0/deploys" \
  -H "Authorization: Bearer $RENDER_API_KEY"
```

### Deploy Frontend (Vercel)
```bash
cd platform/web
vercel --prod
```

### Check Health
```bash
curl https://workforce-api-g3kg.onrender.com/health
# Expected: {"status":"ok","timestamp":"...","service":"workforce-platform"}
```

---

## Troubleshooting

### Backend not responding
1. Check Render dashboard for build errors
2. Verify environment variables are set
3. Check logs: `render logs -s workforce-api`

### Frontend API calls failing
1. Check browser console for CORS errors
2. Verify `VITE_API_URL` is set correctly
3. Ensure backend CORS allows the frontend origin

### Database connection issues
1. Verify `DATABASE_URL` is correct and URL-encoded
2. Check Supabase dashboard for connection limits
3. Ensure IP allowlist includes Render's IPs

---

## Service IDs (for API access)

| Service | ID |
|---------|-----|
| Render Service | `srv-d5sdgkjlr7ts738tqcn0` |
| Render Owner | `tea-cteopvpu0jms739ensog` |
| Vercel Project | `prj_4kyiMiTScqOghsET0cHK1jCqtkOT` |
| Vercel Team | `team_cp09fdPmZCanzad8ARWo6dTM` |
| Supabase Project | `cydhvvqvgrvntzitrrwy` |

rnd_e9bNLP2bojBJMD2rW1en5XSLnOOQ render api