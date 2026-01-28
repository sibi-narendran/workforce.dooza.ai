import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface User {
  id: string
  email: string
  name?: string
  tenantId?: string
  role?: string
}

interface Tenant {
  id: string
  name: string
  slug: string
  plan?: string
}

interface Session {
  accessToken: string
  refreshToken: string
  expiresAt?: number
}

// Token expiry buffer - refresh 5 minutes before actual expiry
const TOKEN_EXPIRY_BUFFER_MS = 5 * 60 * 1000

interface AuthState {
  user: User | null
  tenant: Tenant | null
  session: Session | null
  isLoading: boolean
  isRefreshing: boolean
  lastRefreshAttempt: number | null

  setAuth: (user: User, tenant: Tenant | null, session: Session) => void
  clearAuth: () => void
  setLoading: (loading: boolean) => void
  updateSession: (session: Session) => void
  isTokenExpired: () => boolean
  isTokenExpiringSoon: () => boolean
  setRefreshing: (refreshing: boolean) => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      tenant: null,
      session: null,
      isLoading: false,
      isRefreshing: false,
      lastRefreshAttempt: null,

      setAuth: (user, tenant, session) => set({ user, tenant, session, isLoading: false }),
      clearAuth: () => set({ user: null, tenant: null, session: null, isLoading: false, isRefreshing: false }),
      setLoading: (isLoading) => set({ isLoading }),
      updateSession: (session) => set({ session, lastRefreshAttempt: Date.now() }),
      setRefreshing: (isRefreshing) => set({ isRefreshing }),

      // Check if token is expired
      isTokenExpired: () => {
        const { session } = get()
        if (!session?.expiresAt) return false
        return Date.now() >= session.expiresAt
      },

      // Check if token will expire soon (within buffer period)
      isTokenExpiringSoon: () => {
        const { session } = get()
        if (!session?.expiresAt) return false
        return Date.now() >= session.expiresAt - TOKEN_EXPIRY_BUFFER_MS
      },
    }),
    {
      name: 'workforce-auth',
      partialize: (state) => ({
        user: state.user,
        tenant: state.tenant,
        session: state.session,
      }),
      // Validate stored session on rehydration
      onRehydrateStorage: () => (state) => {
        if (state?.session?.expiresAt && Date.now() >= state.session.expiresAt) {
          // Token is expired, clear auth on next tick to avoid race conditions
          setTimeout(() => {
            const currentState = useAuthStore.getState()
            if (currentState.session?.expiresAt && Date.now() >= currentState.session.expiresAt) {
              console.warn('[Auth] Session expired, clearing auth state')
              currentState.clearAuth()
            }
          }, 0)
        }
      },
    }
  )
)

// Token refresh function - should be called from API client
let refreshPromise: Promise<Session | null> | null = null

export async function refreshToken(): Promise<Session | null> {
  const state = useAuthStore.getState()

  // Prevent concurrent refresh attempts
  if (state.isRefreshing && refreshPromise) {
    return refreshPromise
  }

  const { session } = state
  if (!session?.refreshToken) {
    return null
  }

  // Prevent rapid refresh attempts (min 10 second gap)
  if (state.lastRefreshAttempt && Date.now() - state.lastRefreshAttempt < 10000) {
    console.warn('[Auth] Skipping refresh - too soon since last attempt')
    return null
  }

  state.setRefreshing(true)

  refreshPromise = (async () => {
    try {
      const response = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: session.refreshToken }),
      })

      if (!response.ok) {
        console.error('[Auth] Token refresh failed:', response.status)
        state.clearAuth()
        return null
      }

      const data = await response.json()
      const newSession: Session = {
        accessToken: data.accessToken,
        refreshToken: data.refreshToken || session.refreshToken,
        expiresAt: data.expiresAt,
      }

      state.updateSession(newSession)
      console.log('[Auth] Token refreshed successfully')
      return newSession
    } catch (error) {
      console.error('[Auth] Token refresh error:', error)
      // Don't clear auth on network errors - let user retry
      return null
    } finally {
      state.setRefreshing(false)
      refreshPromise = null
    }
  })()

  return refreshPromise
}

// Theme store
interface ThemeState {
  theme: 'dark' | 'light'
  setTheme: (theme: 'dark' | 'light') => void
  toggleTheme: () => void
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: 'light',
      setTheme: (theme) => {
        document.documentElement.setAttribute('data-theme', theme)
        set({ theme })
      },
      toggleTheme: () => {
        const newTheme = get().theme === 'dark' ? 'light' : 'dark'
        document.documentElement.setAttribute('data-theme', newTheme)
        set({ theme: newTheme })
      },
    }),
    {
      name: 'workforce-theme',
      onRehydrateStorage: () => (state) => {
        if (state?.theme) {
          document.documentElement.setAttribute('data-theme', state.theme)
        }
      },
    }
  )
)
