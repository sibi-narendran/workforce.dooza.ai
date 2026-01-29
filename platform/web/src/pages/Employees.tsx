import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { employeesApi, type Employee } from '../lib/api'
import { useAuthStore } from '../lib/store'
import { EmployeeCard } from '../components/EmployeeCard'

export function Employees() {
  const { session } = useAuthStore()
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)

  const loadData = async () => {
    try {
      const empRes = await employeesApi.list(session?.accessToken || '')
      setEmployees(empRes.employees)
    } catch (error) {
      console.error('Failed to load employees:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [session?.accessToken])

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <div className="loading" />
      </div>
    )
  }

  return (
    <div style={{ padding: 32, height: '100%', overflowY: 'auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
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
      {employees.length === 0 ? (
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
