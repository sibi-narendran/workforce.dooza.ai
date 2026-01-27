import { useEffect, useState } from 'react'
import { jobsApi, employeesApi, type Job, type Employee } from '../lib/api'
import { useAuthStore } from '../lib/store'

export function Jobs() {
  const { session } = useAuthStore()
  const [jobs, setJobs] = useState<Job[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)

  const loadData = async () => {
    if (!session?.accessToken) return

    try {
      const [jobsRes, empRes] = await Promise.all([
        jobsApi.list(session.accessToken),
        employeesApi.list(session.accessToken),
      ])
      setJobs(jobsRes.jobs)
      setEmployees(empRes.employees)
    } catch (error) {
      console.error('Failed to load jobs:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [session?.accessToken])

  const handleToggle = async (job: Job) => {
    if (!session?.accessToken) return

    try {
      await jobsApi.update(session.accessToken, job.id, { enabled: !job.enabled })
      loadData()
    } catch (error) {
      console.error('Failed to toggle job:', error)
    }
  }

  const handleRun = async (jobId: string) => {
    if (!session?.accessToken) return

    try {
      await jobsApi.run(session.accessToken, jobId)
      loadData()
    } catch (error) {
      console.error('Failed to run job:', error)
    }
  }

  const handleDelete = async (jobId: string) => {
    if (!session?.accessToken) return
    if (!confirm('Are you sure you want to delete this job?')) return

    try {
      await jobsApi.delete(session.accessToken, jobId)
      loadData()
    } catch (error) {
      console.error('Failed to delete job:', error)
    }
  }

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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 600, color: 'var(--text-strong)' }}>
            Scheduled Jobs
          </h1>
          <p style={{ margin: '8px 0 0', color: 'var(--muted)' }}>
            Automate tasks with your AI employees
          </p>
        </div>
        <button className="btn" onClick={() => setShowCreate(true)} disabled={employees.length === 0}>
          + Create Job
        </button>
      </div>

      {employees.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 60 }}>
          <h3 style={{ margin: '0 0 8px', color: 'var(--text-strong)' }}>Create an employee first</h3>
          <p style={{ margin: 0, color: 'var(--muted)' }}>
            You need at least one AI employee to create scheduled jobs.
          </p>
        </div>
      ) : jobs.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 60 }}>
          <h3 style={{ margin: '0 0 8px', color: 'var(--text-strong)' }}>No scheduled jobs</h3>
          <p style={{ margin: '0 0 20px', color: 'var(--muted)' }}>
            Create a job to automate tasks with your AI employees.
          </p>
          <button className="btn" onClick={() => setShowCreate(true)}>
            Create Job
          </button>
        </div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 12, color: 'var(--muted)', fontWeight: 500 }}>
                  Status
                </th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 12, color: 'var(--muted)', fontWeight: 500 }}>
                  Name
                </th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 12, color: 'var(--muted)', fontWeight: 500 }}>
                  Employee
                </th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 12, color: 'var(--muted)', fontWeight: 500 }}>
                  Schedule
                </th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 12, color: 'var(--muted)', fontWeight: 500 }}>
                  Last Run
                </th>
                <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: 12, color: 'var(--muted)', fontWeight: 500 }}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={job.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '12px 16px' }}>
                    <button
                      onClick={() => handleToggle(job)}
                      style={{
                        width: 36,
                        height: 20,
                        borderRadius: 10,
                        border: 'none',
                        background: job.enabled ? 'var(--ok)' : 'var(--border)',
                        cursor: 'pointer',
                        position: 'relative',
                        transition: 'background var(--duration-fast)',
                      }}
                    >
                      <div
                        style={{
                          width: 16,
                          height: 16,
                          borderRadius: '50%',
                          background: 'white',
                          position: 'absolute',
                          top: 2,
                          left: job.enabled ? 18 : 2,
                          transition: 'left var(--duration-fast)',
                        }}
                      />
                    </button>
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ fontWeight: 500, color: 'var(--text-strong)' }}>{job.name}</div>
                    <div
                      style={{
                        fontSize: 12,
                        color: 'var(--muted)',
                        marginTop: 2,
                        maxWidth: 200,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {job.prompt}
                    </div>
                  </td>
                  <td style={{ padding: '12px 16px', color: 'var(--text)' }}>
                    {job.employee?.name || 'Unknown'}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <code
                      style={{
                        padding: '2px 6px',
                        background: 'var(--bg)',
                        borderRadius: 'var(--radius-sm)',
                        fontSize: 12,
                        fontFamily: 'var(--mono)',
                        color: 'var(--text)',
                      }}
                    >
                      {job.schedule}
                    </code>
                  </td>
                  <td style={{ padding: '12px 16px', color: 'var(--muted)', fontSize: 13 }}>
                    {job.lastRunAt ? new Date(job.lastRunAt).toLocaleString() : 'Never'}
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                    <button
                      className="btn btn-ghost"
                      onClick={() => handleRun(job.id)}
                      style={{ padding: '6px 10px', fontSize: 12, marginRight: 8 }}
                    >
                      Run Now
                    </button>
                    <button
                      className="btn btn-ghost"
                      onClick={() => handleDelete(job.id)}
                      style={{ padding: '6px 10px', fontSize: 12, color: 'var(--danger)' }}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <CreateJobModal
          employees={employees}
          token={session?.accessToken || ''}
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false)
            loadData()
          }}
        />
      )}
    </div>
  )
}

function CreateJobModal({
  employees,
  token,
  onClose,
  onCreated,
}: {
  employees: Employee[]
  token: string
  onClose: () => void
  onCreated: () => void
}) {
  const [name, setName] = useState('')
  const [employeeId, setEmployeeId] = useState(employees[0]?.id || '')
  const [schedule, setSchedule] = useState('0 9 * * *')
  const [prompt, setPrompt] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleCreate = async () => {
    if (!name.trim() || !prompt.trim()) {
      setError('Name and prompt are required')
      return
    }

    setLoading(true)
    setError('')

    try {
      await jobsApi.create(token, {
        name,
        employeeId,
        schedule,
        prompt,
        enabled: true,
      })
      onCreated()
    } catch (err: any) {
      setError(err.message || 'Failed to create job')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: 20,
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="card" style={{ width: '100%', maxWidth: 500 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: 'var(--text-strong)' }}>
            Create Scheduled Job
          </h2>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 20 }}
          >
            x
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 500 }}>
              Job Name *
            </label>
            <input
              type="text"
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Daily report"
            />
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 500 }}>
              Employee *
            </label>
            <select className="input" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 500 }}>
              Schedule (Cron) *
            </label>
            <input
              type="text"
              className="input"
              value={schedule}
              onChange={(e) => setSchedule(e.target.value)}
              placeholder="0 9 * * *"
            />
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
              Examples: "0 9 * * *" (9 AM daily), "0 */6 * * *" (every 6 hours)
            </div>
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 500 }}>
              Task Prompt *
            </label>
            <textarea
              className="input"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="What should the employee do?"
              rows={4}
            />
          </div>

          {error && (
            <div
              style={{
                padding: '10px 12px',
                background: 'var(--danger-subtle)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--danger)',
                fontSize: 13,
              }}
            >
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
            <button className="btn btn-secondary" onClick={onClose} style={{ flex: 1 }}>
              Cancel
            </button>
            <button className="btn" onClick={handleCreate} disabled={loading} style={{ flex: 1 }}>
              {loading ? <div className="loading" style={{ width: 18, height: 18 }} /> : 'Create Job'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
