import postgres from 'postgres'
import { readFileSync } from 'fs'

const dbUrl = process.env.DATABASE_URL
if (!dbUrl) {
  console.error('DATABASE_URL not set')
  process.exit(1)
}

const sql = postgres(dbUrl)
const migration = readFileSync('./supabase/migrations/001_initial.sql', 'utf-8')

// Split by semicolons and run each statement
const statements = migration.split(';').filter(s => s.trim())

async function run() {
  console.log('Running migration...')

  for (const stmt of statements) {
    if (stmt.trim()) {
      try {
        await sql.unsafe(stmt)
        console.log('OK:', stmt.trim().slice(0, 60).replace(/\n/g, ' ') + '...')
      } catch (e: any) {
        if (e.message.includes('already exists')) {
          console.log('Skip (exists):', stmt.trim().slice(0, 40).replace(/\n/g, ' '))
        } else if (e.message.includes('auth.users')) {
          console.log('Skip (auth):', stmt.trim().slice(0, 40).replace(/\n/g, ' '))
        } else {
          console.log('Error:', e.message.slice(0, 80))
        }
      }
    }
  }

  await sql.end()
  console.log('\nMigration complete!')
}

run()
