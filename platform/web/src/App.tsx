import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useAuthStore } from './lib/store'
import { validateSession } from './lib/auth-interceptor'
import { Layout } from './components/Layout'
import { Login } from './pages/Login'
import { Dashboard } from './pages/Dashboard'
import { Employees } from './pages/Employees'
import { EmployeeDetail } from './pages/EmployeeDetail'
import { Chat } from './pages/Chat'
import { Jobs } from './pages/Jobs'
import { Library } from './pages/Library'
import { Integrations } from './pages/Integrations'
import {
  QUERY_STALE_TIME_MS,
  QUERY_GC_TIME_MS,
  MAX_RETRY_ATTEMPTS,
  RETRY_BASE_DELAY_MS,
  RETRY_MAX_DELAY_MS,
  HTTP_CLIENT_ERROR_MIN,
  HTTP_CLIENT_ERROR_MAX,
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

  if (isLoading || validating) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <div className="loading" />
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}

export function App() {
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
            <Route index element={<Dashboard />} />
            <Route path="employees" element={<Employees />} />
            <Route path="library" element={<Library />} />
            <Route path="integrations" element={<Integrations />} />
            <Route path="employees/:id" element={<EmployeeDetail />} />
            <Route path="employees/:id/chat" element={<Chat />} />
            <Route path="jobs" element={<Jobs />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
