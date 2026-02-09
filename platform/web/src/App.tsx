import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useAuthStore } from './lib/store'
import { validateSession } from './lib/auth-interceptor'
import { Layout } from './components/Layout'
import { Login } from './pages/Login'

import { Employees } from './pages/Employees'
import { EmployeeDetail } from './pages/EmployeeDetail'
import { Chat } from './pages/Chat'
import { Library } from './pages/Library'
import { Integrations } from './pages/Integrations'
import { Brain } from './pages/Brain'
import { authApi } from './lib/api'
import {
  QUERY_STALE_TIME_MS,
  QUERY_GC_TIME_MS,
  MAX_RETRY_ATTEMPTS,
  RETRY_BASE_DELAY_MS,
  RETRY_MAX_DELAY_MS,
  HTTP_CLIENT_ERROR_MIN,
  HTTP_CLIENT_ERROR_MAX,
  TOKEN_REFRESH_CHECK_INTERVAL_MS,
  ACCOUNTS_URL,
} from './lib/constants'

/**
 * Type guard to check if an error has a status property.
 */
function hasStatusCode(error: unknown): error is { status: number } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    typeof (error as { status: unknown }).status === 'number'
  )
}

/**
 * Determines if a failed request should be retried.
 * - Retries network errors and 5xx server errors
 * - Does NOT retry 4xx client errors (they won't succeed on retry)
 */
function shouldRetry(failureCount: number, error: unknown): boolean {
  if (failureCount >= MAX_RETRY_ATTEMPTS) {
    return false
  }

  // Don't retry on client errors (4xx) - they won't succeed on retry
  if (hasStatusCode(error)) {
    const { status } = error
    if (status >= HTTP_CLIENT_ERROR_MIN && status < HTTP_CLIENT_ERROR_MAX) {
      return false
    }
  }

  return true
}

/**
 * Calculates retry delay using exponential backoff.
 * Delays: 1s, 2s, 4s (capped at 8s)
 */
function retryDelay(attemptIndex: number): number {
  return Math.min(RETRY_BASE_DELAY_MS * 2 ** attemptIndex, RETRY_MAX_DELAY_MS)
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: QUERY_STALE_TIME_MS,
      gcTime: QUERY_GC_TIME_MS,
      retry: shouldRetry,
      retryDelay,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: shouldRetry,
      retryDelay,
    },
  },
})

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuthStore()
  const [validating, setValidating] = useState(true)

  useEffect(() => {
    // Validate session on mount (check token expiry, refresh if needed)
    // Pass functions to avoid stale closures
    validateSession(
      () => useAuthStore.getState().session,
      (session) => useAuthStore.getState().updateSession(session),
      () => useAuthStore.getState().clearAuth()
    ).finally(() => setValidating(false))
  }, [])

  // Cross-tab session sync via storage events
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key !== 'workforce-auth') return

      if (!e.newValue) {
        // Storage cleared — another tab logged out
        useAuthStore.getState().clearAuth()
        return
      }

      try {
        const { state } = JSON.parse(e.newValue)
        const current = useAuthStore.getState()

        if (!state?.session?.accessToken) {
          // No valid session in storage
          if (current.session) current.clearAuth()
          return
        }

        // Only sync if the access token actually changed (prevents write-back loops)
        if (current.session?.accessToken !== state.session.accessToken) {
          if (state.user && state.tenant) {
            current.setAuth(state.user, state.tenant, state.session)
          } else {
            current.updateSession(state.session)
          }
        }
      } catch {
        // Ignore malformed storage data
      }
    }

    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
  }, [])

  // Background token refresh
  useEffect(() => {
    const intervalId = setInterval(() => {
      const store = useAuthStore.getState()
      if (store.session && store.shouldRefreshToken()) {
        store.refreshSession()
      }
    }, TOKEN_REFRESH_CHECK_INTERVAL_MS)

    return () => clearInterval(intervalId)
  }, [])

  if (isLoading || validating) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <div className="loading" />
      </div>
    )
  }

  if (!user) {
    window.location.href = `${ACCOUNTS_URL}/signin?product=workforce`
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <div className="loading" />
      </div>
    )
  }

  return <>{children}</>
}

/**
 * Extract hash tokens ONCE at module load — before React mounts.
 * This survives React.StrictMode's unmount/remount cycle in dev.
 */
const _pendingTokens: { accessToken: string; refreshToken: string } | null = (() => {
  const hash = window.location.hash.substring(1)
  if (!hash) return null
  const params = new URLSearchParams(hash)
  const accessToken = params.get('access_token')
  const refreshToken = params.get('refresh_token')
  if (!accessToken || !refreshToken) return null
  window.history.replaceState(null, '', window.location.pathname + window.location.search)
  return { accessToken, refreshToken }
})()

function useHashTokenExchange() {
  const [exchanging, setExchanging] = useState(!!_pendingTokens)
  const { setAuth } = useAuthStore()

  useEffect(() => {
    if (!_pendingTokens) return

    authApi
      .exchange(_pendingTokens)
      .then((result: any) => {
        if (result.success && result.user && result.session) {
          setAuth(result.user, result.tenant, result.session)
        } else {
          window.location.href = `${ACCOUNTS_URL}/signin?product=workforce`
        }
      })
      .catch(() => {
        window.location.href = `${ACCOUNTS_URL}/signin?product=workforce`
      })
      .finally(() => setExchanging(false))
  }, [setAuth])

  return exchanging
}

export function App() {
  const exchanging = useHashTokenExchange()

  if (exchanging) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <div className="loading" />
      </div>
    )
  }

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />

          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="/employees" replace />} />
            <Route path="employees" element={<Employees />} />
            <Route path="library" element={<Library />} />
            <Route path="integrations" element={<Integrations />} />
            <Route path="employees/:id" element={<EmployeeDetail />} />
            <Route path="employees/:id/chat" element={<Chat />} />
            <Route path="brain" element={<Brain />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
