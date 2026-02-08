import { Link } from 'react-router-dom'
import type { Employee } from '../lib/api'
import { AgentAvatar, agentTagline } from './AgentAvatar'

interface EmployeeCardProps {
  employee: Employee
}

export function EmployeeCard({ employee }: EmployeeCardProps) {
  const tagline = agentTagline(employee.type)

  return (
    <div
      className="card"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        transition: 'border-color var(--duration-fast)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <AgentAvatar slug={employee.type} name={employee.name} size={56} />

        <div style={{ flex: 1, minWidth: 0 }}>
          <h3
            style={{
              margin: 0,
              fontSize: 16,
              fontWeight: 600,
              color: 'var(--text-strong)',
            }}
          >
            {employee.name}
          </h3>
          <div
            style={{
              fontSize: 13,
              color: 'var(--muted)',
              marginTop: 3,
            }}
          >
            {tagline}
          </div>
        </div>
      </div>

      {employee.description && (
        <p
          style={{
            margin: 0,
            fontSize: 13,
            color: 'var(--muted)',
            lineHeight: 1.5,
          }}
        >
          {employee.description}
        </p>
      )}

      <div
        style={{
          display: 'flex',
          gap: 8,
          marginTop: 'auto',
          paddingTop: 8,
          borderTop: '1px solid var(--border)',
        }}
      >
        <Link
          to={`/employees/${employee.id}/chat`}
          className="btn"
          style={{ flex: 1, padding: 8, fontSize: 13 }}
        >
          Chat
        </Link>
      </div>
    </div>
  )
}
