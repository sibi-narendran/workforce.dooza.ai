/**
 * Token refresh and auth utilities
 *
 * This module handles token expiry detection and refresh with proper
 * concurrency handling. It does NOT import from store.ts to avoid
 * circular dependencies.
 *
 * Note on timestamps:
 * - Supabase returns `expires_at` as Unix timestamp in SECONDS
 * - JavaScript's Date.now() returns milliseconds
 * - We convert Date.now() to seconds for comparison (following Supabase's official pattern)
 *
 * @see https://github.com/supabase/auth-js/blob/master/src/lib/types.ts
 * @see https://supabase.com/docs/guides/auth/sessions
 */

const API_BASE = import.meta.env.VITE_API_URL || '/api'

// Buffer time before token expiry to trigger proactive refresh (5 minutes in seconds)
const REFRESH_BUFFER_SECONDS = 5 * 60

export interface Session {
  accessToken: string
  refreshToken: string
  /** Unix timestamp in seconds when the token expires (from Supabase) */
  expiresAt?: number
}

export interface RefreshResponse {
  accessToken: string
  refreshToken: string
  /** Unix timestamp in seconds when the token expires (may be undefined per Supabase) */
  expiresAt?: number
}

/**
 * Get current time as Unix timestamp in seconds
 * Following Supabase's official pattern: Math.round(Date.now() / 1000)
 */
function nowInSeconds(): number {
  return Math.round(Date.now() / 1000)
}

/**
 * Check if a token is expired based on expiresAt timestamp
 * @param expiresAt - Unix timestamp in seconds (from Supabase)
 */
export function isTokenExpired(expiresAt?: number): boolean {
  if (!expiresAt) return true
  return nowInSeconds() >= expiresAt
}

/**
 * Check if token should be refreshed (within 5 min of expiry)
 * @param expiresAt - Unix timestamp in seconds (from Supabase)
 */
export function shouldRefreshToken(expiresAt?: number): boolean {
  if (!expiresAt) return true
  return nowInSeconds() >= expiresAt - REFRESH_BUFFER_SECONDS
}

/**
 * Custom error for authentication failures
 */
export class AuthError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'AuthError'
    this.status = status
  }
}

/**
 * Refresh the access token using the refresh token
 */
export async function refreshAccessToken(refreshToken: string): Promise<RefreshResponse> {
  const response = await fetch(`${API_BASE}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  })

  if (!response.ok) {
    const text = await response.text()
    let message = 'Session expired. Please log in again.'
    try {
      const data = JSON.parse(text)
      message = data.error || data.message || message
    } catch {
      // Use default message
    }
    throw new AuthError(message, response.status)
  }

  const data = await response.json()

  // Server returns { success: true, session: { accessToken, refreshToken, expiresAt } }
  // Validate response structure - fail fast if unexpected format
  if (!data.session || typeof data.session !== 'object') {
    throw new AuthError('Invalid refresh response: missing session object', 500)
  }

  const { accessToken, refreshToken: newRefreshToken, expiresAt } = data.session

  if (typeof accessToken !== 'string' || !accessToken) {
    throw new AuthError('Invalid refresh response: missing accessToken', 500)
  }
  if (typeof newRefreshToken !== 'string' || !newRefreshToken) {
    throw new AuthError('Invalid refresh response: missing refreshToken', 500)
  }

  return {
    accessToken,
    refreshToken: newRefreshToken,
    // expiresAt is optional per Supabase Session type
    expiresAt: typeof expiresAt === 'number' ? expiresAt : undefined,
  }
}

/**
 * Token refresh coordinator
 *
 * Handles concurrent refresh requests by:
 * 1. Tracking in-flight refresh by token to avoid duplicate requests
 * 2. Ensuring callers with same token share the same promise
 * 3. Callers with different tokens get separate refresh attempts
 */
class TokenRefreshCoordinator {
  private pendingRefresh: Map<string, Promise<RefreshResponse>> = new Map()

  async refresh(refreshToken: string): Promise<RefreshResponse> {
    // Check if there's already a refresh in progress for this exact token
    const existing = this.pendingRefresh.get(refreshToken)
    if (existing) {
      return existing
    }

    // Start new refresh
    const refreshPromise = refreshAccessToken(refreshToken).finally(() => {
      this.pendingRefresh.delete(refreshToken)
    })

    this.pendingRefresh.set(refreshToken, refreshPromise)
    return refreshPromise
  }

  /**
   * Check if a refresh is currently in progress for any token
   */
  isRefreshing(): boolean {
    return this.pendingRefresh.size > 0
  }
}

// Singleton coordinator instance
export const tokenRefreshCoordinator = new TokenRefreshCoordinator()

/**
 * Validate current session and refresh if needed
 * Returns true if session is valid (or was successfully refreshed)
 *
 * @param getSession - Function to get current session (avoids stale closures)
 * @param onSessionUpdate - Callback to update session in store
 * @param onAuthClear - Callback to clear auth state
 */
export async function validateSession(
  getSession: () => Session | null,
  onSessionUpdate: (session: Session) => void,
  onAuthClear: () => void
): Promise<boolean> {
  const session = getSession()
  if (!session) return false

  // Token not near expiry - valid
  if (!shouldRefreshToken(session.expiresAt)) {
    return true
  }

  // Token needs refresh
  try {
    const newSession = await tokenRefreshCoordinator.refresh(session.refreshToken)

    // Re-check session after async operation - user might have logged out
    const currentSession = getSession()
    if (!currentSession) {
      // Session was cleared during refresh - don't restore it
      return false
    }

    onSessionUpdate({
      accessToken: newSession.accessToken,
      refreshToken: newSession.refreshToken,
      expiresAt: newSession.expiresAt,
    })
    return true
  } catch (error) {
    // Only clear auth on definitive auth failures (401/403)
    if (error instanceof AuthError && (error.status === 401 || error.status === 403)) {
      onAuthClear()
    }
    return false
  }
}
