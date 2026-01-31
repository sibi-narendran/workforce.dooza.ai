#!/bin/bash
set -e

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLATFORM_DIR="$(dirname "$SCRIPT_DIR")"
PROJECT_ROOT="$(dirname "$PLATFORM_DIR")"

# Load platform env vars
if [ -f "$PLATFORM_DIR/.env" ]; then
  echo "[start-gateway] Loading environment from $PLATFORM_DIR/.env"
  set -a
  source "$PLATFORM_DIR/.env"
  set +a
else
  echo "[start-gateway] ERROR: No .env file found at $PLATFORM_DIR/.env"
  exit 1
fi

# Set required vars for multi-tenant gateway
# Convert relative TENANT_DATA_DIR to absolute path if needed
if [[ "$TENANT_DATA_DIR" == ./* ]]; then
  export TENANT_DATA_DIR="$PLATFORM_DIR/${TENANT_DATA_DIR#./}"
fi
export TENANT_DATA_DIR="${TENANT_DATA_DIR:-$PLATFORM_DIR/data/tenants}"

# Verify API key is set
if [ -z "$OPENROUTER_API_KEY" ]; then
  echo "[start-gateway] ERROR: OPENROUTER_API_KEY is not set"
  exit 1
fi

# Log configuration
echo "[start-gateway] Configuration:"
echo "  TENANT_DATA_DIR: $TENANT_DATA_DIR"
echo "  OPENROUTER_API_KEY: ${OPENROUTER_API_KEY:0:10}..."
echo "  DEFAULT_MODEL: $DEFAULT_MODEL"

# Find clawdbot directory
CLAWDBOT_DIR="$PROJECT_ROOT/clawdbot"
if [ ! -d "$CLAWDBOT_DIR" ]; then
  echo "[start-gateway] ERROR: clawdbot directory not found at $CLAWDBOT_DIR"
  exit 1
fi

echo "[start-gateway] Starting gateway from $CLAWDBOT_DIR"

# Start gateway
cd "$CLAWDBOT_DIR"
exec node scripts/run-node.mjs gateway run --port 18789 --bind loopback
