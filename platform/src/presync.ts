/**
 * Pre-start sync script — runs BEFORE PM2 launches gateway + platform.
 * Ensures clawdbot.json has the correct model before gateway reads it.
 *
 * Crashes on failure so broken deploys are visible, not silent.
 *
 * Usage: node platform/dist/presync.js
 */
import { syncAllAgentTemplates } from './employees/sync.js'
import { client } from './db/client.js'

const TIMEOUT_MS = 15_000

async function main() {
  console.log('[Presync] Running agent template sync...')
  const start = Date.now()

  const timer = setTimeout(() => {
    console.error(`[Presync] Timed out after ${TIMEOUT_MS}ms`)
    process.exit(1)
  }, TIMEOUT_MS)

  try {
    await syncAllAgentTemplates()
    console.log(`[Presync] Done in ${Date.now() - start}ms`)
  } finally {
    clearTimeout(timer)
    await client.end()
  }
}

main()
