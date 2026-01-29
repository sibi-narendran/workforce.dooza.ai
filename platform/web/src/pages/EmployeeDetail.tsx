import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useEmployeeDetail, useDeleteEmployee, getErrorMessage } from '../lib/queries'

export function EmployeeDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { employee, conversations, isLoading, error } = useEmployeeDetail(id)
  const deleteEmployee = useDeleteEmployee()
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const handleDelete = async () => {
    if (!id) return
    if (!confirm('Are you sure you want to delete this employee?')) return

    setDeleteError(null)

    try {
      await deleteEmployee.mutateAsync(id)
      navigate('/employees')
    } catch (err) {
      setDeleteError(getErrorMessage(err))
    }
  }

  if (isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <div className="loading" />
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ padding: 32, textAlign: 'center' }}>
        <p style={{ color: 'var(--danger)' }}>{getErrorMessage(error)}</p>
        <Link to="/employees" className="btn" style={{ marginTop: 16 }}>
          Back to Employees
        </Link>
      </div>
    )
  }

  if (!employee) {
    return (
      <div style={{ padding: 32, textAlign: 'center' }}>
        <p style={{ color: 'var(--muted)' }}>Employee not found</p>
        <Link to="/employees" className="btn" style={{ marginTop: 16 }}>
          Back to Employees
        </Link>
      </div>
    )
  }

  return (
    <div style={{ padding: 32 }}>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <Link
          to="/employees"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            color: 'var(--muted)',
            fontSize: 13,
            marginBottom: 16,
          }}
        >
          Back to Employees
        </Link>

        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 20 }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 'var(--radius-lg)',
              background: 'var(--accent-subtle)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--accent)',
              fontSize: 24,
              fontWeight: 600,
            }}
          >
            {employee.name[0].toUpperCase()}
          </div>

          <div style={{ flex: 1 }}>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 600, color: 'var(--text-strong)' }}>
              {employee.name}
            </h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
              <span className="badge">{employee.type}</span>
              <span style={{ color: 'var(--muted)', fontSize: 13 }}>{employee.model}</span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <Link to={`/employees/${id}/chat`} className="btn">
              Start Chat
            </Link>
            <button
              className="btn btn-ghost"
              onClick={handleDelete}
              disabled={deleteEmployee.isPending}
              style={{ color: 'var(--danger)' }}
            >
              {deleteEmployee.isPending ? 'Deleting...' : 'Delete'}
            </button>
          </div>
        </div>

        {/* Delete Error */}
        {deleteError && (
          <div
            style={{
              marginTop: 16,
              padding: '12px 16px',
              background: 'var(--danger-subtle)',
              border: '1px solid var(--danger)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--danger)',
              fontSize: 13,
              display: 'flex',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <span style={{ flex: 1 }}>{deleteError}</span>
            <button
              onClick={() => setDeleteError(null)}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--danger)',
                cursor: 'pointer',
                padding: 0,
                fontSize: 16,
              }}
            >
              ×
            </button>
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 24 }}>
        {/* Main content */}
        <div>
          {/* Description */}
          {employee.description && (
            <section className="card" style={{ marginBottom: 24 }}>
              <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 600, color: 'var(--text-strong)' }}>
                Description
              </h3>
              <p style={{ margin: 0, color: 'var(--text)', lineHeight: 1.6 }}>{employee.description}</p>
            </section>
          )}

          {/* Identity Prompt */}
          {employee.identityPrompt && (
            <section className="card" style={{ marginBottom: 24 }}>
              <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 600, color: 'var(--text-strong)' }}>
                Custom Identity
              </h3>
              <pre
                style={{
                  margin: 0,
                  padding: 16,
                  background: 'var(--bg)',
                  borderRadius: 'var(--radius-md)',
                  fontSize: 13,
                  lineHeight: 1.5,
                  whiteSpace: 'pre-wrap',
                  color: 'var(--text)',
                  fontFamily: 'var(--mono)',
                }}
              >
                {employee.identityPrompt}
              </pre>
            </section>
          )}

          {/* Conversations */}
          <section className="card">
            <h3 style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 600, color: 'var(--text-strong)' }}>
              Recent Conversations ({conversations.length})
            </h3>

            {conversations.length === 0 ? (
              <p style={{ margin: 0, color: 'var(--muted)', textAlign: 'center', padding: 20 }}>
                No conversations yet
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {conversations.map((conv) => (
                  <div
                    key={conv.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      padding: 12,
                      background: 'var(--bg)',
                      borderRadius: 'var(--radius-md)',
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 500, color: 'var(--text-strong)' }}>
                        {conv.title || 'Untitled'}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                        {conv.lastMessageAt
                          ? new Date(conv.lastMessageAt).toLocaleString()
                          : 'No messages'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Sidebar */}
        <div>
          {/* Skills */}
          <section className="card" style={{ marginBottom: 24 }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 600, color: 'var(--text-strong)' }}>
              Skills
            </h3>
            {employee.skills && employee.skills.length > 0 ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {employee.skills.map((skill) => (
                  <span
                    key={skill}
                    style={{
                      padding: '4px 10px',
                      background: 'var(--bg)',
                      borderRadius: 'var(--radius-full)',
                      fontSize: 12,
                      color: 'var(--text)',
                    }}
                  >
                    {skill}
                  </span>
                ))}
              </div>
            ) : (
              <p style={{ margin: 0, color: 'var(--muted)', fontSize: 13 }}>No skills assigned</p>
            )}
          </section>

          {/* Stats */}
          <section className="card">
            <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 600, color: 'var(--text-strong)' }}>
              Details
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase' }}>
                  Created
                </div>
                <div style={{ color: 'var(--text)' }}>
                  {new Date(employee.createdAt).toLocaleDateString()}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase' }}>
                  Total Conversations
                </div>
                <div style={{ color: 'var(--text)' }}>{employee.conversationCount || 0}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase' }}>
                  Employee ID
                </div>
                <div
                  style={{
                    color: 'var(--muted)',
                    fontSize: 11,
                    fontFamily: 'var(--mono)',
                    wordBreak: 'break-all',
                  }}
                >
                  {employee.id}
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
