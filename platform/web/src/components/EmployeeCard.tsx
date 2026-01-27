import { Link } from 'react-router-dom'
import type { Employee } from '../lib/api'

interface EmployeeCardProps {
  employee: Employee
}

/**
 * Get a display-friendly name for a model ID.
 * Model IDs follow patterns like:
 * - "openrouter/anthropic/claude-sonnet-4"
 * - "openrouter/google/gemini-2.5-pro-preview"
 * - "claude-sonnet-4-5"
 */
function getModelDisplayName(modelId: string | null | undefined): string {
  if (!modelId) return 'AI'

  // Known model mappings for reliable display
  const modelMap: Record<string, string> = {
    'claude-sonnet-4': 'Claude Sonnet',
    'claude-sonnet-4-5': 'Claude Sonnet',
    'claude-opus-4': 'Claude Opus',
    'claude-haiku': 'Claude Haiku',
    'gemini-2.5-pro-preview': 'Gemini Pro',
    'gemini-3-pro-preview': 'Gemini Pro',
    'gpt-4': 'GPT-4',
    'gpt-4o': 'GPT-4o',
  }

  // Try to find a match in the model ID
  for (const [key, displayName] of Object.entries(modelMap)) {
    if (modelId.includes(key)) {
      return displayName
    }
  }

  // Fallback: extract last segment and clean it up
  const lastSegment = modelId.split('/').pop() || modelId
  // Capitalize first letter of each word, limit length
  const cleaned = lastSegment
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .slice(0, 20)

  return cleaned || 'AI'
}

export function EmployeeCard({ employee }: EmployeeCardProps) {
  const typeColors: Record<string, string> = {
    clawd: '#ef4444',
    soshie: '#3b82f6',
    researcher: '#8b5cf6',
    creator: '#f59e0b',
    publisher: '#10b981',
    writer: '#ec4899',
    'data-analyst': '#06b6d4',
    'customer-support': '#6366f1',
    'code-reviewer': '#14b8a6',
    'project-manager': '#f97316',
    custom: 'var(--muted)',
  }

  const color = typeColors[employee.type] || typeColors.custom
  const gradient = employee.gradient || `linear-gradient(135deg, ${color}, ${color}dd)`
  const emoji = employee.emoji

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
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        {/* Avatar */}
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: 'var(--radius-md)',
            background: gradient,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: 22 }}>
            {emoji || employee.name?.[0]?.toUpperCase() || '?'}
          </span>
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <h3
            style={{
              margin: 0,
              fontSize: 15,
              fontWeight: 600,
              color: 'var(--text-strong)',
            }}
          >
            {employee.name}
          </h3>
          <div
            style={{
              fontSize: 12,
              color: 'var(--muted)',
              marginTop: 2,
            }}
          >
            {employee.type}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {employee.isFromLibrary && (
            <div
              style={{
                padding: '4px 8px',
                borderRadius: 'var(--radius-full)',
                background: 'var(--accent-subtle)',
                color: 'var(--accent)',
                fontSize: 11,
                fontWeight: 500,
              }}
            >
              Library
            </div>
          )}
          <div
            style={{
              padding: '4px 8px',
              borderRadius: 'var(--radius-full)',
              background: `${color}20`,
              color,
              fontSize: 11,
              fontWeight: 500,
            }}
          >
            {getModelDisplayName(employee.model)}
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

      {employee.skills && employee.skills.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {employee.skills.slice(0, 4).map((skill) => (
            <span
              key={skill}
              style={{
                padding: '3px 8px',
                background: 'var(--bg-muted)',
                borderRadius: 'var(--radius-full)',
                fontSize: 11,
                color: 'var(--muted)',
              }}
            >
              {skill}
            </span>
          ))}
          {employee.skills.length > 4 && (
            <span
              style={{
                padding: '3px 8px',
                fontSize: 11,
                color: 'var(--muted)',
              }}
            >
              +{employee.skills.length - 4} more
            </span>
          )}
        </div>
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
        <Link
          to={`/employees/${employee.id}`}
          className="btn btn-secondary"
          style={{ padding: 8, fontSize: 13 }}
        >
          Details
        </Link>
      </div>
    </div>
  )
}
