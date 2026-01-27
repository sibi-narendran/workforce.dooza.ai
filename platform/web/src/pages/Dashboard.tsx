import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { employeesApi, jobsApi, conversationsApi, type Employee, type Job, type Conversation } from '../lib/api'
import { useAuthStore } from '../lib/store'
import { EmployeeCard } from '../components/EmployeeCard'

export function Dashboard() {
  const { session, tenant } = useAuthStore()
  const [employees, setEmployees] = useState<Employee[]>([])
  const [jobs, setJobs] = useState<Job[]>([])
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!session?.accessToken) return

    Promise.all([
      employeesApi.list(session.accessToken),
      jobsApi.list(session.accessToken),
      conversationsApi.list(session.accessToken),
    ])
      .then(([empRes, jobRes, convRes]) => {
        setEmployees(empRes.employees)
        setJobs(jobRes.jobs)
        setConversations(convRes.conversations)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [session?.accessToken])

  if (loading) {
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
          label="Scheduled Jobs"
          value={jobs.filter((j) => j.enabled).length}
          color="var(--accent-2)"
          link="/jobs"
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

      {/* Recent Jobs */}
      <section>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 16,
          }}
        >
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: 'var(--text-strong)' }}>
            Scheduled Jobs
          </h2>
          <Link to="/jobs" style={{ fontSize: 13, color: 'var(--accent)' }}>
            View all
          </Link>
        </div>

        {jobs.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: 40 }}>
            <p style={{ margin: '0 0 16px', color: 'var(--muted)' }}>
              No scheduled jobs. Set up automated tasks for your employees.
            </p>
            <Link to="/jobs" className="btn">
              Create Job
            </Link>
          </div>
        ) : (
          <div className="card" style={{ padding: 0 }}>
            {jobs.slice(0, 5).map((job, i) => (
              <div
                key={job.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '12px 16px',
                  borderBottom: i < jobs.length - 1 ? '1px solid var(--border)' : 'none',
                }}
              >
                <div
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: job.enabled ? 'var(--ok)' : 'var(--muted)',
                    marginRight: 12,
                  }}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500, color: 'var(--text-strong)' }}>{job.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                    {job.employee?.name || 'Unknown'} - {job.schedule}
                  </div>
                </div>
                {job.lastRunAt && (
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                    Last: {new Date(job.lastRunAt).toLocaleDateString()}
                  </div>
                )}
              </div>
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
