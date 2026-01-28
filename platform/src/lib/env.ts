// Environment configuration with validation

export const env = {
  // Server
  PORT: parseInt(process.env.PORT || '3000', 10),
  NODE_ENV: process.env.NODE_ENV || 'development',

  // Supabase
  SUPABASE_URL: process.env.SUPABASE_URL!,
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY!,
  SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY,

  // Database
  DATABASE_URL: process.env.DATABASE_URL!,

  // Tenant data
  TENANT_DATA_DIR: process.env.TENANT_DATA_DIR || '/tmp/workforce-tenants',

  // Gateway ports
  GATEWAY_PORT_START: parseInt(process.env.GATEWAY_PORT_START || '18790', 10),
  GATEWAY_PORT_END: parseInt(process.env.GATEWAY_PORT_END || '18890', 10),

  // OpenRouter (for AI completions)
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
  DEFAULT_MODEL: process.env.DEFAULT_MODEL || 'google/gemini-3-pro-preview',

  // Clawdbot Gateway
  CLAWDBOT_GATEWAY_URL: process.env.CLAWDBOT_GATEWAY_URL || 'http://127.0.0.1:18789',
  CLAWDBOT_HOOK_TOKEN: process.env.CLAWDBOT_HOOK_TOKEN || '',

  // Clawdbot (optional, for per-tenant gateway mode)
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  CLAWDBOT_PATH: process.env.CLAWDBOT_PATH || '../clawdbot/dist/entry.js',

  // Composio (for user integrations)
  COMPOSIO_API_KEY: process.env.COMPOSIO_API_KEY,
} as const

// Validate required environment variables
export function validateEnv() {
  const required = ['DATABASE_URL']
  const missing = required.filter((key) => !process.env[key])

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`)
  }

  // Warn about optional but recommended vars
  if (!process.env.SUPABASE_URL) {
    console.warn('[Env] SUPABASE_URL not set - auth will not work')
  }
  if (!process.env.OPENROUTER_API_KEY) {
    console.warn('[Env] OPENROUTER_API_KEY not set - OpenRouter fallback will fail')
  }
  if (!process.env.CLAWDBOT_GATEWAY_URL) {
    console.warn('[Env] CLAWDBOT_GATEWAY_URL not set - using default http://127.0.0.1:18789')
  }
}
