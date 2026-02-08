import { Link } from 'react-router-dom'
import { useDashboardData } from '../lib/queries'
import { useAuthStore } from '../lib/store'
import { EmployeeCard } from '../components/EmployeeCard'

export function Dashboard() {
  const { tenant } = useAuthStore()
  const { employees, conversations, isLoading } = useDashboardData()

  if (isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <div className="loading" />
      </div>
    )
  }

  return (
    <div style={{ padding: 32 }}>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 600, color: 'var(--text-strong)' }}>
          Welcome back
        </h1>
        <p style={{ margin: '8px 0 0', color: 'var(--muted)' }}>
          Here's what's happening with your AI workforce
        </p>
      </div>

      {/* Stats */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 16,
          marginBottom: 32,
        }}
      >
        <StatCard
          label="AI Employees"
          value={employees.length}
          color="var(--accent)"
          link="/employees"
        />
        <StatCard
          label="Conversations"
          value={conversations.length}
          color="var(--info)"
        />
        <StatCard
          label="Plan"
          value={tenant?.plan || 'Free'}
          color="var(--muted)"
          isText
        />
      </div>

      {/* Recent Employees */}
      <section style={{ marginBottom: 32 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 16,
          }}
        >
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: 'var(--text-strong)' }}>
            Your Employees
          </h2>
          <Link to="/employees" style={{ fontSize: 13, color: 'var(--accent)' }}>
            View all
          </Link>
        </div>

        {employees.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: 40 }}>
            <p style={{ margin: '0 0 16px', color: 'var(--muted)' }}>
              No employees yet. Create your first AI employee to get started.
            </p>
            <Link to="/employees" className="btn">
              Add Employee
            </Link>
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: 16,
            }}
          >
            {employees.slice(0, 4).map((emp) => (
              <EmployeeCard key={emp.id} employee={emp} />
            ))}
          </div>
        )}
      </section>

    </div>
  )
}

function StatCard({
  label,
  value,
  color,
  link,
  isText,
}: {
  label: string
  value: number | string
  color: string
  link?: string
  isText?: boolean
}) {
  const content = (
    <div
      className="card"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        cursor: link ? 'pointer' : undefined,
        transition: 'border-color var(--duration-fast)',
      }}
    >
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: 'var(--radius-md)',
          background: `${color}20`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <span style={{ color, fontSize: isText ? 14 : 20, fontWeight: 600 }}>
          {isText ? value.toString()[0].toUpperCase() : value}
        </span>
      </div>
      <div>
        <div style={{ fontSize: isText ? 16 : 24, fontWeight: 600, color: 'var(--text-strong)' }}>
          {isText ? value : null}
        </div>
        <div style={{ fontSize: 13, color: 'var(--muted)' }}>{label}</div>
      </div>
    </div>
  )

  if (link) {
    return <Link to={link} style={{ textDecoration: 'none' }}>{content}</Link>
  }

  return content
}
