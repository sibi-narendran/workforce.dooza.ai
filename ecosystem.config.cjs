const path = require('path')
const fs = require('fs')
const os = require('os')

// Helper to parse .env file into object
function parseEnvFile(envPath) {
  const envObj = {}
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8')
    for (const line of content.split('\n')) {
      const trimmed = line.trim()
      if (trimmed && !trimmed.startsWith('#')) {
        const eqIndex = trimmed.indexOf('=')
        if (eqIndex > 0) {
          const key = trimmed.substring(0, eqIndex)
          const value = trimmed.substring(eqIndex + 1)
          envObj[key] = value
        }
      }
    }
  }
  return envObj
}

const baseDir = __dirname
const fileEnv = parseEnvFile(path.join(baseDir, 'platform', '.env'))
// Merge: .env file values override process.env (for local dev),
// but process.env provides values on Render/production (no .env file)
const platformEnv = { ...process.env, ...fileEnv }

// TENANT_DATA_DIR: Use env, or default based on platform
// Production (Linux): /data/tenants
// Local dev (macOS): ~/data/tenants
const TENANT_DATA_DIR = platformEnv.TENANT_DATA_DIR ||
  (process.platform === 'darwin'
    ? path.join(os.homedir(), 'data', 'tenants')
    : '/data/tenants')

// Ensure logs directory exists
const logsDir = path.join(baseDir, 'logs')
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true })
}

// Ensure tenant data directory exists
if (!fs.existsSync(TENANT_DATA_DIR)) {
  fs.mkdirSync(TENANT_DATA_DIR, { recursive: true })
}

module.exports = {
  apps: [
    {
      name: 'gateway',
      cwd: path.join(baseDir, 'clawdbot'),
      script: 'node',
      args: 'dist/index.js gateway --allow-unconfigured --port 18789 --bind loopback',
      env: {
        NODE_ENV: 'production',
        NODE_OPTIONS: '--max-old-space-size=768',
        TENANT_DATA_DIR: TENANT_DATA_DIR,
        OPENCLAW_GATEWAY_TOKEN: platformEnv.CLAWDBOT_HOOK_TOKEN,
        OPENROUTER_API_KEY: platformEnv.OPENROUTER_API_KEY,
        DEFAULT_MODEL: platformEnv.DEFAULT_MODEL || 'google/gemini-2.0-flash-001',
        SUPABASE_URL: platformEnv.SUPABASE_URL,
        SUPABASE_SERVICE_KEY: platformEnv.SUPABASE_SERVICE_KEY,
      },
      // Production settings
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '900M',
      // Logging
      error_file: path.join(logsDir, 'gateway-error.log'),
      out_file: path.join(logsDir, 'gateway-out.log'),
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    },
    {
      name: 'platform',
      cwd: path.join(baseDir, 'platform'),
      script: 'node',
      args: 'dist/index.js',
      env: {
        ...platformEnv,
        NODE_ENV: 'production',
        NODE_OPTIONS: '--max-old-space-size=512',
        PORT: platformEnv.PORT || 3000,
        TENANT_DATA_DIR: TENANT_DATA_DIR,
      },
      // Production settings
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      // Logging
      error_file: path.join(logsDir, 'platform-error.log'),
      out_file: path.join(logsDir, 'platform-out.log'),
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    },
  ],
}
