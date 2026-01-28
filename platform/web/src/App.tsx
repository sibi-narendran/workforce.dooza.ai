import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './lib/store'
import { Layout } from './components/Layout'
import { ErrorBoundary } from './components/ErrorBoundary'
import { Login } from './pages/Login'
import { Dashboard } from './pages/Dashboard'
import { Employees } from './pages/Employees'
import { EmployeeDetail } from './pages/EmployeeDetail'
import { Chat } from './pages/Chat'
import { Jobs } from './pages/Jobs'
import { Library } from './pages/Library'
import { Integrations } from './pages/Integrations'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuthStore()

  if (isLoading) {
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
    <ErrorBoundary>
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
            <Route
              index
              element={
                <ErrorBoundary>
                  <Dashboard />
                </ErrorBoundary>
              }
            />
            <Route
              path="employees"
              element={
                <ErrorBoundary>
                  <Employees />
                </ErrorBoundary>
              }
            />
            <Route
              path="library"
              element={
                <ErrorBoundary>
                  <Library />
                </ErrorBoundary>
              }
            />
            <Route
              path="integrations"
              element={
                <ErrorBoundary>
                  <Integrations />
                </ErrorBoundary>
              }
            />
            <Route
              path="employees/:id"
              element={
                <ErrorBoundary>
                  <EmployeeDetail />
                </ErrorBoundary>
              }
            />
            <Route
              path="employees/:id/chat"
              element={
                <ErrorBoundary>
                  <Chat />
                </ErrorBoundary>
              }
            />
            <Route
              path="jobs"
              element={
                <ErrorBoundary>
                  <Jobs />
                </ErrorBoundary>
              }
            />
          </Route>
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  )
}
