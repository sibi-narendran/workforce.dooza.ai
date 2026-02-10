import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  isTokenExpired as checkTokenExpired,
  shouldRefreshToken as checkShouldRefresh,
  tokenRefreshCoordinator,
  type Session,
} from './auth-interceptor'

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

interface AuthState {
  user: User | null
  tenant: Tenant | null
  session: Session | null
  isLoading: boolean

  setAuth: (user: User, tenant: Tenant | null, session: Session) => void
  clearAuth: () => void
  setLoading: (loading: boolean) => void
  updateSession: (session: Session) => void
  isTokenExpired: () => boolean
  shouldRefreshToken: () => boolean
  refreshSession: () => Promise<boolean>
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      tenant: null,
      session: null,
      isLoading: false,

      setAuth: (user, tenant, session) => set({ user, tenant, session, isLoading: false }),
      clearAuth: () => set({ user: null, tenant: null, session: null, isLoading: false }),
      setLoading: (isLoading) => set({ isLoading }),
      updateSession: (session) => set({ session }),

      isTokenExpired: () => {
        const { session } = get()
        return checkTokenExpired(session?.expiresAt)
      },

      shouldRefreshToken: () => {
        const { session } = get()
        return checkShouldRefresh(session?.expiresAt)
      },

      refreshSession: async () => {
        // Always read fresh state
        const { session } = get()
        if (!session?.refreshToken) {
          get().clearAuth()
          return false
        }

        try {
          const newSession = await tokenRefreshCoordinator.refresh(session.refreshToken)

          // Re-check session after async operation - user might have logged out
          const currentSession = get().session
          if (!currentSession) {
            // Session was cleared during refresh - don't restore it
            return false
          }

          set({
            session: {
              accessToken: newSession.accessToken,
              refreshToken: newSession.refreshToken,
              expiresAt: newSession.expiresAt,
            },
          })
          return true
        } catch {
          get().clearAuth()
          return false
        }
      },
    }),
    {
      name: 'workforce-auth',
      partialize: (state) => ({
        user: state.user,
        tenant: state.tenant,
        session: state.session,
      }),
    }
  )
)

