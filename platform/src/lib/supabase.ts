import { createClient, SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY

// Warn but don't crash if keys are missing
if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('[Supabase] SUPABASE_URL and SUPABASE_ANON_KEY not set - auth features disabled')
  console.warn('[Supabase] Get keys from: https://supabase.com/dashboard/project/*/settings/api')
}

// Client for browser/user-facing operations (respects RLS)
export const supabase: SupabaseClient | null = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null

// Admin client for server-side operations (bypasses RLS)
export const supabaseAdmin: SupabaseClient | null = supabaseUrl && supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })
  : null

// Helper to create client with user's JWT (for RLS)
export function createUserClient(accessToken: string): SupabaseClient | null {
  if (!supabaseUrl || !supabaseAnonKey) return null

  return createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  })
}

// Types for auth
export interface AuthUser {
  id: string
  email: string
  tenantId?: string
  role?: string
}

export interface AuthSession {
  user: AuthUser
  accessToken: string
  refreshToken: string
}
