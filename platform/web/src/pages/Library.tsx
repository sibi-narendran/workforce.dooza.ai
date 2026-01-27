import { useEffect, useState } from 'react'
import { libraryApi, type LibraryAgent } from '../lib/api'
import { useAuthStore } from '../lib/store'

export function Library() {
  const { session } = useAuthStore()
  const [agents, setAgents] = useState<LibraryAgent[]>([])
  const [loading, setLoading] = useState(true)
  const [installing, setInstalling] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const loadAgents = async () => {
    try {
      // Pass token if available to get installed status
      const res = await libraryApi.list(session?.accessToken)
      setAgents(res.agents)
    } catch (err) {
      console.error('Failed to load library:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAgents()
  }, [session?.accessToken])

  const handleInstall = async (agent: LibraryAgent) => {
    if (!session?.accessToken) {
      setError('Please log in to install agents')
      return
    }

    setInstalling(agent.id)
    setError('')
    setSuccess('')

    try {
      await libraryApi.install(session.accessToken, agent.id)
      setSuccess(`${agent.name} installed! Go to Employees to chat.`)
      loadAgents() // Refresh to update install count
    } catch (err: any) {
      setError(err.message || 'Failed to install agent')
    } finally {
      setInstalling(null)
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <div className="loading" />
      </div>
    )
  }

  const categories = [...new Set(agents.map(a => a.category || 'other'))]

  return (
    <div
      style={{
        padding: 32,
        height: '100%',
        overflowY: 'auto',
      }}
    >
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 600, color: 'var(--text-strong)' }}>
          Agent Library
        </h1>
        <p style={{ margin: '8px 0 0', color: 'var(--muted)' }}>
          Browse and install pre-built AI agents for your workforce
        </p>
      </div>

      {/* Messages */}
      {error && (
        <div
          style={{
            padding: '12px 16px',
            background: 'var(--danger-subtle)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--danger)',
            fontSize: 13,
            marginBottom: 20,
          }}
        >
          {error}
        </div>
      )}

      {success && (
        <div
          style={{
            padding: '12px 16px',
            background: 'var(--success-subtle, rgba(16, 185, 129, 0.1))',
            borderRadius: 'var(--radius-md)',
            color: 'var(--success, #10b981)',
            fontSize: 13,
            marginBottom: 20,
          }}
        >
          {success}
        </div>
      )}

      {/* Agents by category */}
      {categories.map((category) => (
        <div key={category} style={{ marginBottom: 32 }}>
          <h2
            style={{
              margin: '0 0 16px',
              fontSize: 16,
              fontWeight: 600,
              color: 'var(--text-strong)',
              textTransform: 'capitalize',
            }}
          >
            {category}
          </h2>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
              gap: 16,
            }}
          >
            {agents
              .filter((a) => (a.category || 'other') === category)
              .map((agent) => (
                <AgentCard
                  key={agent.id}
                  agent={agent}
                  onInstall={() => handleInstall(agent)}
                  installing={installing === agent.id}
                  isLoggedIn={!!session?.accessToken}
                  isInstalled={agent.isInstalled || false}
                />
              ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function AgentCard({
  agent,
  onInstall,
  installing,
  isLoggedIn,
  isInstalled,
}: {
  agent: LibraryAgent
  onInstall: () => void
  installing: boolean
  isLoggedIn: boolean
  isInstalled: boolean
}) {
  const gradient = agent.gradient || 'linear-gradient(135deg, #6b7280, #4b5563)'

  return (
    <div
      className="card"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
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
          <span style={{ fontSize: 22 }}>{agent.emoji || agent.name?.[0] || '?'}</span>
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
            {agent.name}
          </h3>
          <div
            style={{
              fontSize: 12,
              color: 'var(--muted)',
              marginTop: 2,
            }}
          >
            {agent.slug}
          </div>
        </div>

        {agent.installCount > 0 && (
          <div
            style={{
              fontSize: 11,
              color: 'var(--muted)',
            }}
          >
            {agent.installCount} installed
          </div>
        )}
      </div>

      {agent.description && (
        <p
          style={{
            margin: 0,
            fontSize: 13,
            color: 'var(--muted)',
            lineHeight: 1.5,
          }}
        >
          {agent.description}
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
        <button
          className={isInstalled ? 'btn btn-secondary' : 'btn'}
          onClick={onInstall}
          disabled={installing || !isLoggedIn || isInstalled}
          style={{ flex: 1, padding: 8, fontSize: 13 }}
        >
          {installing ? (
            <div className="loading" style={{ width: 16, height: 16 }} />
          ) : isInstalled ? (
            'Installed'
          ) : isLoggedIn ? (
            '+ Install'
          ) : (
            'Login to Install'
          )}
        </button>
      </div>
    </div>
  )
}
