import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { integrationsApi, type IntegrationProvider, type UserConnection } from '../lib/api'
import { useAuthStore } from '../lib/store'

const CATEGORY_LABELS: Record<string, string> = {
  productivity: 'Productivity',
  communication: 'Communication',
  dev: 'Development',
  storage: 'Storage',
  social: 'Social',
  other: 'Other',
}

const CATEGORY_ORDER = ['productivity', 'communication', 'dev', 'storage', 'social', 'other']

export function Integrations() {
  const { session } = useAuthStore()
  const [searchParams, setSearchParams] = useSearchParams()
  const [providers, setProviders] = useState<IntegrationProvider[]>([])
  const [connections, setConnections] = useState<UserConnection[]>([])
  const [loading, setLoading] = useState(true)
  const [connecting, setConnecting] = useState<string | null>(null)
  const [disconnecting, setDisconnecting] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Handle OAuth callback
  useEffect(() => {
    const successParam = searchParams.get('success')
    const errorParam = searchParams.get('error')
    const appParam = searchParams.get('app')

    if (successParam === 'true') {
      setSuccess(appParam ? `Successfully connected to ${appParam}!` : 'Successfully connected!')
      setSearchParams({})
    } else if (errorParam) {
      const errorMessages: Record<string, string> = {
        missing_connection_id: 'Connection failed: missing connection ID',
        connection_not_found: 'Connection failed: could not find pending connection',
        callback_failed: 'Connection failed: callback error',
      }
      setError(errorMessages[errorParam] || 'Connection failed')
      setSearchParams({})
    }
  }, [searchParams, setSearchParams])

  const loadData = async () => {
    try {
      const providersRes = await integrationsApi.listProviders()
      setProviders(providersRes.providers)

      if (session?.accessToken) {
        const connectionsRes = await integrationsApi.listConnections(session.accessToken)
        setConnections(connectionsRes.connections)
      }
    } catch (err) {
      console.error('Failed to load integrations:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [session?.accessToken])

  const handleConnect = async (provider: IntegrationProvider) => {
    if (!session?.accessToken) {
      setError('Please log in to connect integrations')
      return
    }

    setConnecting(provider.slug)
    setError('')
    setSuccess('')

    try {
      const res = await integrationsApi.connect(session.accessToken, provider.slug)
      // Open OAuth in new window/tab
      window.open(res.redirectUrl, '_blank', 'width=600,height=700')
    } catch (err: any) {
      setError(err.message || 'Failed to initiate connection')
    } finally {
      setConnecting(null)
    }
  }

  const handleDisconnect = async (connection: UserConnection) => {
    if (!session?.accessToken) return

    setDisconnecting(connection.id)
    setError('')
    setSuccess('')

    try {
      await integrationsApi.disconnect(session.accessToken, connection.id)
      setSuccess(`Disconnected from ${connection.providerName}`)
      // Refresh connections
      const connectionsRes = await integrationsApi.listConnections(session.accessToken)
      setConnections(connectionsRes.connections)
    } catch (err: any) {
      setError(err.message || 'Failed to disconnect')
    } finally {
      setDisconnecting(null)
    }
  }

  const getConnectionForProvider = (providerId: string) => {
    return connections.find((c) => c.providerId === providerId && c.status === 'connected')
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <div className="loading" />
      </div>
    )
  }

  // Group providers by category
  const categories = [...new Set(providers.map((p) => p.category || 'other'))]
    .sort((a, b) => CATEGORY_ORDER.indexOf(a) - CATEGORY_ORDER.indexOf(b))

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
          Integrations
        </h1>
        <p style={{ margin: '8px 0 0', color: 'var(--muted)' }}>
          Connect your apps to give AI employees access to your tools and data
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

      {/* Connected integrations summary */}
      {connections.length > 0 && (
        <div
          style={{
            padding: 16,
            background: 'var(--surface)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border)',
            marginBottom: 24,
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-strong)', marginBottom: 8 }}>
            Connected ({connections.length})
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {connections.map((conn) => (
              <div
                key={conn.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '4px 10px',
                  background: 'var(--bg)',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: 12,
                }}
              >
                {conn.providerIcon && (
                  <img
                    src={conn.providerIcon}
                    alt=""
                    style={{ width: 14, height: 14 }}
                    onError={(e) => (e.currentTarget.style.display = 'none')}
                  />
                )}
                {conn.providerName}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Providers by category */}
      {categories.map((category) => (
        <div key={category} style={{ marginBottom: 32 }}>
          <h2
            style={{
              margin: '0 0 16px',
              fontSize: 16,
              fontWeight: 600,
              color: 'var(--text-strong)',
            }}
          >
            {CATEGORY_LABELS[category] || category}
          </h2>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: 16,
            }}
          >
            {providers
              .filter((p) => (p.category || 'other') === category)
              .map((provider) => {
                const connection = getConnectionForProvider(provider.id)
                return (
                  <IntegrationCard
                    key={provider.id}
                    provider={provider}
                    connection={connection}
                    onConnect={() => handleConnect(provider)}
                    onDisconnect={() => connection && handleDisconnect(connection)}
                    connecting={connecting === provider.slug}
                    disconnecting={disconnecting === connection?.id}
                    isLoggedIn={!!session?.accessToken}
                  />
                )
              })}
          </div>
        </div>
      ))}
    </div>
  )
}

function IntegrationCard({
  provider,
  connection,
  onConnect,
  onDisconnect,
  connecting,
  disconnecting,
  isLoggedIn,
}: {
  provider: IntegrationProvider
  connection?: UserConnection
  onConnect: () => void
  onDisconnect: () => void
  connecting: boolean
  disconnecting: boolean
  isLoggedIn: boolean
}) {
  const isConnected = !!connection

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
        {/* Icon */}
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 'var(--radius-md)',
            background: 'var(--surface)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            border: '1px solid var(--border)',
          }}
        >
          {provider.icon ? (
            <img
              src={provider.icon}
              alt=""
              style={{ width: 24, height: 24 }}
              onError={(e) => {
                e.currentTarget.style.display = 'none'
                e.currentTarget.parentElement!.innerHTML = provider.name?.[0] || '?'
              }}
            />
          ) : (
            <span style={{ fontSize: 18, color: 'var(--muted)' }}>{provider.name?.[0] || '?'}</span>
          )}
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
            {provider.name}
          </h3>
          {isConnected && (
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                fontSize: 11,
                color: 'var(--success, #10b981)',
                marginTop: 2,
              }}
            >
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor' }} />
              Connected
            </div>
          )}
        </div>
      </div>

      {provider.description && (
        <p
          style={{
            margin: 0,
            fontSize: 13,
            color: 'var(--muted)',
            lineHeight: 1.5,
          }}
        >
          {provider.description}
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
        {isConnected ? (
          <button
            className="btn btn-secondary"
            onClick={onDisconnect}
            disabled={disconnecting}
            style={{ flex: 1, padding: 8, fontSize: 13 }}
          >
            {disconnecting ? (
              <div className="loading" style={{ width: 16, height: 16 }} />
            ) : (
              'Disconnect'
            )}
          </button>
        ) : (
          <button
            className="btn"
            onClick={onConnect}
            disabled={connecting || !isLoggedIn}
            style={{ flex: 1, padding: 8, fontSize: 13 }}
          >
            {connecting ? (
              <div className="loading" style={{ width: 16, height: 16 }} />
            ) : isLoggedIn ? (
              'Connect'
            ) : (
              'Login to Connect'
            )}
          </button>
        )}
      </div>
    </div>
  )
}
