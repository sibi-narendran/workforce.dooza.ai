# Workforce Platform - Deployment Guide

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         Load Balancer                           │
└─────────────────────────┬───────────────────────────────────────┘
                          │
        ┌─────────────────┼─────────────────┐
        ▼                 ▼                 ▼
┌───────────────┐ ┌───────────────┐ ┌───────────────┐
│  Platform API │ │  Platform API │ │  Platform API │
│   (Hono)      │ │   (Hono)      │ │   (Hono)      │
└───────┬───────┘ └───────┬───────┘ └───────┬───────┘
        │                 │                 │
        └─────────────────┼─────────────────┘
                          │
                          ▼
              ┌───────────────────────┐
              │   Clawdbot Gateway    │
              │   (Single Instance)   │
              └───────────┬───────────┘
                          │
        ┌─────────────────┼─────────────────┐
        ▼                 ▼                 ▼
┌───────────────┐ ┌───────────────┐ ┌───────────────┐
│   Supabase    │ │  /data/tenants│ │  Anthropic    │
│   (Postgres)  │ │  (Storage)    │ │  Claude API   │
└───────────────┘ └───────────────┘ └───────────────┘
```

## Prerequisites

- Node.js 20+
- PostgreSQL (Supabase recommended)
- Anthropic API key

---

## Tenant Data Storage

### Important: Multi-Tenant Isolation

The platform uses a **shared gateway** architecture where a single Clawdbot gateway serves all tenants. Tenant isolation is achieved through:

1. **X-Tenant-ID header** - Passed with every request to the gateway
2. **Isolated state directories** - Each tenant's data lives in a separate directory

### Directory Structure

```
/data/tenants/                      # TENANT_DATA_DIR (must exist)
├── {tenant-uuid-1}/                # Tenant A
│   ├── agents/
│   │   └── {agent-slug}/
│   │       └── sessions/
│   │           ├── sessions.json   # Session registry
│   │           └── {session}.jsonl # Chat transcripts
│   ├── config.json                 # Tenant-specific config
│   └── workspace/                  # Agent workspace files
│
├── {tenant-uuid-2}/                # Tenant B
│   └── ...
└── ...
```

### Setup (Required Before First Run)

#### Local Development

**macOS** (root filesystem is read-only):
```bash
mkdir -p ~/data/tenants
# Then set TENANT_DATA_DIR=$HOME/data/tenants when starting gateway
```

**Linux**:
```bash
sudo mkdir -p /data/tenants
sudo chown $USER /data/tenants
```

#### Docker

```dockerfile
# In your Dockerfile or docker-compose.yml
volumes:
  - tenant-data:/data/tenants

volumes:
  tenant-data:
```

#### Docker Compose Example

```yaml
version: '3.8'

services:
  platform-api:
    build: ./platform
    environment:
      - TENANT_DATA_DIR=/data/tenants
      - CLAWDBOT_GATEWAY_URL=http://gateway:18789
    volumes:
      - tenant-data:/data/tenants
    depends_on:
      - gateway

  gateway:
    build: ./clawdbot
    environment:
      - TENANT_DATA_DIR=/data/tenants
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
    volumes:
      - tenant-data:/data/tenants
    ports:
      - "18789:18789"

  web:
    build: ./platform/web
    ports:
      - "80:80"

volumes:
  tenant-data:
    driver: local
    # For production, use cloud storage:
    # driver: efs  # AWS
    # driver: azurefile  # Azure
    # driver: gcsfuse  # GCP
```

#### Kubernetes

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: tenant-data-pvc
spec:
  accessModes:
    - ReadWriteMany  # Important: multiple pods need access
  resources:
    requests:
      storage: 100Gi
  storageClassName: efs-sc  # Or your cloud storage class
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: platform-api
spec:
  template:
    spec:
      containers:
        - name: api
          env:
            - name: TENANT_DATA_DIR
              value: /data/tenants
          volumeMounts:
            - name: tenant-data
              mountPath: /data/tenants
      volumes:
        - name: tenant-data
          persistentVolumeClaim:
            claimName: tenant-data-pvc
```

---

## Environment Variables

### Platform API (`platform/.env`)

```env
# Database
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_KEY=eyJ...
DATABASE_URL=postgresql://...

# Server
PORT=3000

# Clawdbot Gateway
CLAWDBOT_GATEWAY_URL=http://127.0.0.1:18789
CLAWDBOT_HOOK_TOKEN=your-secure-token-here

# Tenant Storage (MUST match gateway's TENANT_DATA_DIR)
TENANT_DATA_DIR=/data/tenants

# Optional: Composio integrations
COMPOSIO_API_KEY=your-key
```

### Clawdbot Gateway

The gateway reads `TENANT_DATA_DIR` from its environment. **Both platform and gateway MUST use the same value.**

```env
TENANT_DATA_DIR=/data/tenants
ANTHROPIC_API_KEY=sk-ant-...
```

> **CRITICAL:** If `TENANT_DATA_DIR` differs between platform and gateway:
> - Platform writes agent identity files to one location
> - Gateway looks for them in another location
> - Result: Agents have no identity ("I have no name")
>
> Always use **absolute paths** (not relative like `./data/tenants`) to avoid confusion.

### Platform Web (`platform/web/.env`)

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
VITE_API_URL=https://api.yourapp.com  # Or /api for same-origin
```

---

## Starting Services

### Development

```bash
# Terminal 1: Gateway (with tenant data dir)
cd clawdbot
TENANT_DATA_DIR=/data/tenants pnpm gateway run --port 18789

# Terminal 2: Platform API
cd platform
pnpm dev

# Terminal 3: Web Frontend
cd platform/web
pnpm dev
```

### Production

```bash
# Gateway (systemd, pm2, or Docker)
TENANT_DATA_DIR=/data/tenants \
ANTHROPIC_API_KEY=sk-ant-... \
openclaw gateway run --port 18789 --bind 0.0.0.0

# Platform API
cd platform
NODE_ENV=production pnpm start

# Web (serve built assets via nginx/CDN)
cd platform/web
pnpm build
# Deploy dist/ to CDN or nginx
```

---

## Common Issues

### "ENOENT: no such file or directory, mkdir '/data'"

**Cause:** `TENANT_DATA_DIR` not set or `/data/tenants` doesn't exist.

**Fix:**
```bash
# Linux: Create the directory
sudo mkdir -p /data/tenants
sudo chown $USER /data/tenants

# macOS: Root filesystem is read-only, use home directory instead
mkdir -p ~/data/tenants
export TENANT_DATA_DIR=$HOME/data/tenants
```

### "Read-only file system" on macOS

**Cause:** macOS Catalina+ has a read-only root filesystem (System Integrity Protection).

**Fix:** Use a user-writable path:
```bash
mkdir -p ~/data/tenants
# Start gateway with:
TENANT_DATA_DIR=$HOME/data/tenants openclaw gateway run --port 18789
```

### "Unknown error" or "An error occurred while processing your message"

**Cause:** Gateway returning error without details.

**Debug:**
1. Check gateway logs for the actual error
2. Verify `TENANT_DATA_DIR` is set identically for both platform and gateway
3. Ensure tenant directory exists and is writable

### SSE disconnects immediately

**Cause:** React useEffect dependencies causing re-renders.

**Fix:** Already patched in `Chat.tsx` - uses `useChatStore.getState()` pattern.

---

## Security Considerations

1. **Tenant isolation** - Each tenant's data is in a separate directory. Never allow path traversal.

2. **API authentication** - All API routes require Supabase JWT token.

3. **Gateway authentication** - Uses `CLAWDBOT_HOOK_TOKEN` for platform-to-gateway auth.

4. **Secrets management** - Use environment variables or secrets manager (never commit `.env`).

5. **GDPR compliance** - To delete a tenant's data:
   ```bash
   rm -rf /data/tenants/{tenant-uuid}
   ```

---

## Monitoring

### Health Checks

```bash
# Platform API
curl http://localhost:3000/api/health

# Gateway
curl http://localhost:18789/

# Streaming stats (requires auth)
curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/stream/stats
```

### Logs

- Platform API: stdout/stderr
- Gateway: stdout/stderr
- For production, ship to your log aggregator (Datadog, CloudWatch, etc.)

---

## Scaling

### Horizontal Scaling

- **Platform API**: Stateless, scale horizontally behind load balancer
- **Gateway**: Currently single instance (stateful WebSocket connections)
- **Tenant Data**: Use shared storage (EFS, NFS, cloud storage)

### Future: Gateway Clustering

For high availability, gateway clustering would require:
1. Shared session state (Redis)
2. WebSocket sticky sessions or pub/sub for events
3. Distributed chat run management

---

## Backup & Recovery

### Tenant Data Backup

```bash
# Full backup
tar -czf tenants-backup-$(date +%Y%m%d).tar.gz /data/tenants/

# Per-tenant backup
tar -czf tenant-{uuid}-backup.tar.gz /data/tenants/{uuid}/
```

### Database Backup

Use Supabase's built-in backup or `pg_dump` for self-hosted Postgres.
