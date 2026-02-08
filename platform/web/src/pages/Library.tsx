import { useState } from 'react'
import { useLibrary, useInstallAgent, getErrorMessage } from '../lib/queries'
import { useAuthStore } from '../lib/store'
import { ErrorDisplay } from '../components/ErrorDisplay'
import type { LibraryAgent } from '../lib/api'
import { AgentAvatar, agentTagline } from '../components/AgentAvatar'

export function Library() {
  const { session } = useAuthStore()
  const { data: agents, isLoading, error, refetch } = useLibrary()
  const [installingId, setInstallingId] = useState<string | null>(null)
  const [localError, setLocalError] = useState('')
  const [success, setSuccess] = useState('')

  const installAgent = useInstallAgent()

  const handleInstall = async (agent: LibraryAgent) => {
    if (!session?.accessToken) {
      setLocalError('Please log in to install agents')
      return
    }

    setInstallingId(agent.id)
    setLocalError('')
    setSuccess('')

    try {
      await installAgent.mutateAsync({ agentId: agent.id })
      setSuccess(`${agent.name} installed! Go to Employees to chat.`)
    } catch (err) {
      setLocalError(getErrorMessage(err))
    } finally {
      setInstallingId(null)
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
    return <ErrorDisplay message={getErrorMessage(error)} onRetry={() => refetch()} />
  }

  const categories = [...new Set((agents ?? []).map(a => a.category || 'other'))]

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
      {localError && (
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
          {localError}
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
            {(agents ?? [])
              .filter((a) => (a.category || 'other') === category)
              .map((agent) => (
                <AgentCard
                  key={agent.id}
                  agent={agent}
                  onInstall={() => handleInstall(agent)}
                  installing={installingId === agent.id}
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
  const tagline = agentTagline(agent.slug)

  return (
    <div
      className="card"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <AgentAvatar slug={agent.slug} name={agent.name} size={56} />

        <div style={{ flex: 1, minWidth: 0 }}>
          <h3
            style={{
              margin: 0,
              fontSize: 16,
              fontWeight: 600,
              color: 'var(--text-strong)',
            }}
          >
            {agent.name}
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
