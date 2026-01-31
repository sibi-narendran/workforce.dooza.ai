const path = require('path')
const fs = require('fs')

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
const platformEnv = parseEnvFile(path.join(baseDir, 'platform', '.env'))
const clawdbotEnv = parseEnvFile(path.join(baseDir, 'clawdbot', '.env'))

module.exports = {
  apps: [
    {
      name: 'platform',
      cwd: './platform',
      script: 'npx',
      args: 'tsx src/index.ts',
      env: {
        ...platformEnv,
        PORT: 3000,
        NODE_ENV: 'development',
        TENANT_DATA_DIR: path.join(baseDir, 'platform', 'data', 'tenants'),
      },
    },
    {
      name: 'gateway',
      cwd: './clawdbot',
      script: 'npx',
      args: 'tsx src/entry.ts gateway run --port 18789 --bind loopback',
      env: {
        ...clawdbotEnv,
        TENANT_DATA_DIR: path.join(baseDir, 'platform', 'data', 'tenants'),
      },
    },
  ],
}
