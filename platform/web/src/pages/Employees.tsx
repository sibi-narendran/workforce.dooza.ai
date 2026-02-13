import { Link } from 'react-router-dom'
import { useEmployees, getErrorMessage } from '../lib/queries'
import { EmployeeCard } from '../components/EmployeeCard'
import { ErrorDisplay } from '../components/ErrorDisplay'

export function Employees() {
  const { data: employees, isLoading, error, refetch } = useEmployees()

  if (isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <div className="loading" />
      </div>
    )
  }

  if (error) {
    return <ErrorDisplay message={getErrorMessage(error)} onRetry={() => refetch()} />
  }

  return (
    <div className="page-content" style={{ padding: 32, height: '100%', overflowY: 'auto' }}>
      {/* Header */}
      <div className="employees-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 600, color: 'var(--text-strong)' }}>
            AI Employees
          </h1>
          <p style={{ margin: '8px 0 0', color: 'var(--muted)' }}>
            Manage your AI workforce
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link to="/library" className="btn btn-secondary">
            Browse Library
          </Link>
          <button
            className="btn"
            disabled
            title="Coming soon"
            style={{ opacity: 0.5, cursor: 'not-allowed' }}
          >
            + Custom Employee
          </button>
        </div>
      </div>

      {/* Employee Grid */}
      {!employees || employees.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 60 }}>
          <h3 style={{ margin: '0 0 8px', color: 'var(--text-strong)' }}>No employees yet</h3>
          <p style={{ margin: '0 0 20px', color: 'var(--muted)' }}>
            Install agents from the library to get started.
          </p>
          <Link to="/library" className="btn">
            Browse Library
          </Link>
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
            gap: 20,
          }}
        >
          {employees.map((emp) => (
            <EmployeeCard key={emp.id} employee={emp} />
          ))}
        </div>
      )}
    </div>
  )
}
