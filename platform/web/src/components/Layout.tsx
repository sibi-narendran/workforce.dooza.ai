import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuthStore, useThemeStore } from '../lib/store'

export function Layout() {
  const { user, tenant, clearAuth } = useAuthStore()
  const { theme, toggleTheme } = useThemeStore()
  const navigate = useNavigate()

  const handleLogout = () => {
    clearAuth()
    navigate('/login')
  }

  return (
    <div className="app-shell">
      {/* Sidebar */}
      <aside className="app-shell__sidebar">
        <div className="sidebar">
          {/* Logo */}
          <div className="sidebar__logo">
            <img src="/logo.png" alt="Workforce" />
            <span className="sidebar__logo-text">Workforce</span>
          </div>

          {tenant && (
            <div style={{
              padding: '8px 12px',
              marginBottom: 16,
              background: 'var(--primary-100)',
              borderRadius: 'var(--radius-md)',
              fontSize: 13,
              color: 'var(--primary-700)',
              fontWeight: 500
            }}>
              {tenant.name}
            </div>
          )}

          {/* Navigation */}
          <nav className="sidebar__nav">
            <NavItem to="/" icon="dashboard">
              Dashboard
            </NavItem>
            <NavItem to="/employees" icon="people">
              Employees
            </NavItem>
            <NavItem to="/library" icon="library">
              Library
            </NavItem>
            <NavItem to="/integrations" icon="integrations">
              Integrations
            </NavItem>
            <NavItem to="/jobs" icon="schedule">
              Jobs
            </NavItem>
          </nav>

          {/* User section */}
          <div className="sidebar__user">
            <div className="user-menu">
              <div className="user-menu__trigger">
                <div className="user-menu__avatar">
                  {user?.name?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || 'U'}
                </div>
                <div className="user-menu__info">
                  <div className="user-menu__name">
                    {user?.name || user?.email?.split('@')[0]}
                  </div>
                  <div className="user-menu__email">{user?.email}</div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button
                  className="btn btn-ghost"
                  onClick={toggleTheme}
                  style={{ flex: 1, padding: '8px 12px', fontSize: 13 }}
                >
                  {theme === 'dark' ? '☀️ Light' : '🌙 Dark'}
                </button>
                <button
                  className="btn btn-ghost"
                  onClick={handleLogout}
                  style={{ flex: 1, padding: '8px 12px', fontSize: 13 }}
                >
                  Logout
                </button>
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="app-shell__main">
        <Outlet />
      </main>
    </div>
  )
}

function NavItem({
  to,
  icon,
  children,
}: {
  to: string
  icon: string
  children: React.ReactNode
}) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) =>
        `sidebar__link ${isActive ? 'sidebar__link--active' : ''}`
      }
    >
      <NavIcon name={icon} />
      {children}
    </NavLink>
  )
}

function NavIcon({ name }: { name: string }) {
  const icons: Record<string, string> = {
    dashboard: 'M4 4h6v6H4V4zm10 0h6v6h-6V4zM4 14h6v6H4v-6zm10 0h6v6h-6v-6z',
    people:
      'M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z',
    library:
      'M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H8V4h12v12zM10 9h8v2h-8V9zm0 3h4v2h-4v-2zm0-6h8v2h-8V6z',
    integrations:
      'M17 7h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1 0 1.43-.98 2.63-2.31 2.98l1.46 1.46C20.88 15.61 22 13.95 22 12c0-2.76-2.24-5-5-5zm-1 4h-2.19l2 2H16v-2zM2 4.27l3.11 3.11C3.29 8.12 2 9.91 2 12c0 2.76 2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1 0-1.59 1.21-2.9 2.76-3.07L8.73 11H8v2h2.73L13 15.27V17h1.73l4.01 4.01 1.41-1.41L3.41 2.86 2 4.27z',
    schedule:
      'M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67V7z',
  }

  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d={icons[name] || ''} />
    </svg>
  )
}
