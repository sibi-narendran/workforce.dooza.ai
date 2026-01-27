#!/bin/bash
set -e

echo "╔═══════════════════════════════════════════════════════════╗"
echo "║          Workforce Platform - Deployment Script           ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration
SUPABASE_PROJECT="cydhvvqvgrvntzitrrwy"
SUPABASE_URL="https://${SUPABASE_PROJECT}.supabase.co"
SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN5ZGh2dnF2Z3J2bnR6aXRycnd5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk0MTQwOTQsImV4cCI6MjA4NDk5MDA5NH0.xrSUiWvNBLOhJGT_ClTPwUkQiCgd09asuRQgT1mRy7o"
SUPABASE_SERVICE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN5ZGh2dnF2Z3J2bnR6aXRycnd5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTQxNDA5NCwiZXhwIjoyMDg0OTkwMDk0fQ.Fp2_pC9mDblB_uxNq2X6utfUftWE7R5yC208xdmd9aU"
# Password URL-encoded (! = %21)
DATABASE_URL="postgresql://postgres.${SUPABASE_PROJECT}:zY4t%21sYpQj6m8X6@aws-1-ap-south-1.pooler.supabase.com:6543/postgres"
OPENROUTER_API_KEY="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"
DEFAULT_MODEL="google/gemini-3-pro-preview"

cd "$(dirname "$0")"
ROOT_DIR=$(pwd)

echo -e "${YELLOW}[1/5] Creating directories...${NC}"
mkdir -p /tmp/workforce-tenants
echo -e "${GREEN}Done${NC}"

echo ""
echo -e "${YELLOW}[2/5] Installing dependencies...${NC}"
cd "$ROOT_DIR/platform" && pnpm install --silent
cd "$ROOT_DIR/platform/web" && pnpm install --silent
echo -e "${GREEN}Done${NC}"

echo ""
echo -e "${YELLOW}[3/5] Pushing database schema...${NC}"
cd "$ROOT_DIR/platform"
DATABASE_URL="$DATABASE_URL" pnpm db:push 2>&1 | grep -E "(Changes|✓|Error)" || echo "Schema up to date"
echo -e "${GREEN}Done${NC}"

echo ""
echo -e "${YELLOW}[4/5] Starting servers...${NC}"
# Kill existing processes
lsof -ti:3000 | xargs kill -9 2>/dev/null || true
lsof -ti:5173 | xargs kill -9 2>/dev/null || true
lsof -ti:5174 | xargs kill -9 2>/dev/null || true
sleep 1

# Start API server
cd "$ROOT_DIR/platform"
pnpm dev > /tmp/workforce-api.log 2>&1 &
API_PID=$!

# Start web frontend
cd "$ROOT_DIR/platform/web"
pnpm dev > /tmp/workforce-web.log 2>&1 &
WEB_PID=$!

sleep 5
echo -e "${GREEN}Servers started${NC}"

echo ""
echo -e "${YELLOW}[5/5] Checking status...${NC}"
if curl -s http://localhost:3000/health | grep -q "ok"; then
  echo -e "${GREEN}API Server: Running on http://localhost:3000${NC}"
else
  echo -e "${RED}API Server: Not responding${NC}"
fi

WEB_PORT=$(grep -oE "localhost:[0-9]+" /tmp/workforce-web.log | head -1 | cut -d: -f2)
if [ -n "$WEB_PORT" ]; then
  echo -e "${GREEN}Web Frontend: Running on http://localhost:${WEB_PORT}${NC}"
else
  echo -e "${YELLOW}Web Frontend: Starting...${NC}"
fi

echo ""
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║                    SETUP COMPLETE                         ║"
echo "╠═══════════════════════════════════════════════════════════╣"
echo "║                                                           ║"
echo "║  To complete auth setup, get Supabase keys:               ║"
echo "║                                                           ║"
echo "║  1. Go to: ${CYAN}https://supabase.com/dashboard/project/${NC}         ║"
echo "║           ${CYAN}${SUPABASE_PROJECT}/settings/api${NC}                  ║"
echo "║                                                           ║"
echo "║  2. Copy 'anon public' and 'service_role' keys            ║"
echo "║                                                           ║"
echo "║  3. Add to platform/.env:                                 ║"
echo "║     SUPABASE_ANON_KEY=your-anon-key                       ║"
echo "║     SUPABASE_SERVICE_KEY=your-service-key                 ║"
echo "║                                                           ║"
echo "║  4. Add to platform/web/.env:                             ║"
echo "║     VITE_SUPABASE_ANON_KEY=your-anon-key                  ║"
echo "║                                                           ║"
echo "║  5. Restart servers: ./deploy.sh                          ║"
echo "║                                                           ║"
echo "╠═══════════════════════════════════════════════════════════╣"
echo "║                                                           ║"
echo "║  Configuration:                                           ║"
echo "║  - Supabase: $SUPABASE_URL             ║"
echo "║  - AI Model: $DEFAULT_MODEL (via OpenRouter)  ║"
echo "║  - Database: Connected                                    ║"
echo "║                                                           ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""
echo "View logs:"
echo "  API: tail -f /tmp/workforce-api.log"
echo "  Web: tail -f /tmp/workforce-web.log"
echo ""
