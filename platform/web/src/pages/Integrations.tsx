import { useEffect, useState, useRef, useCallback } from 'react'
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

const CATEGORY_ORDER = ['social', 'productivity', 'communication', 'dev', 'storage', 'other']

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
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const loadData = useCallback(async () => {
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
  }, [session?.accessToken])

  // Handle OAuth callback in popup window
  // Composio redirects to /integrations?status=success&connectedAccountId=...
  // The popup just notifies the parent and closes — backend waitForConnection() handles DB.
  useEffect(() => {
    const statusParam = searchParams.get('status')
    const errorParam = searchParams.get('error')
    const connectedAccountId = searchParams.get('connectedAccountId')

    // If we're in a popup, notify parent and close
    if (window.opener && (statusParam || connectedAccountId)) {
      if (statusParam === 'failed' || errorParam) {
        window.opener.postMessage({ type: 'integration-error', error: errorParam || 'Connection failed' }, '*')
      } else {
        window.opener.postMessage({ type: 'integration-connected' }, '*')
      }
      window.close()
      return
    }

    // If not in popup but has params, clean them up
    if (statusParam || connectedAccountId || errorParam) {
      if (errorParam || statusParam === 'failed') {
        setError(errorParam || 'Connection failed')
      }
      setSearchParams({})
    }
  }, [searchParams, setSearchParams])

  // Listen for messages from OAuth popup
  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      if (!e.data?.type?.startsWith('integration-')) return
      if (e.data.type === 'integration-connected') {
        // Backend waitForConnection() will update DB. Poll to pick up the change.
        setSuccess('Connection initiated — verifying...')
        startPolling()
      } else if (e.data.type === 'integration-error') {
        setError(e.data.error || 'Connection failed')
      }
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [])

  // Poll connections every 3s after OAuth to detect when backend confirms
  const startPolling = useCallback(() => {
    if (pollRef.current) return
    let attempts = 0
    const prevCount = connections.filter(c => c.status === 'connected').length

    pollRef.current = setInterval(async () => {
      attempts++
      if (!session?.accessToken || attempts > 40) { // 2 min max
        if (pollRef.current) clearInterval(pollRef.current)
        pollRef.current = null
        if (attempts > 40) setError('Connection timed out. Please try again.')
        return
      }
      try {
        const res = await integrationsApi.listConnections(session.accessToken)
        const newCount = res.connections.filter((c: UserConnection) => c.status === 'connected').length
        if (newCount > prevCount) {
          // New connection detected
          setConnections(res.connections)
          setSuccess('Successfully connected!')
          if (pollRef.current) clearInterval(pollRef.current)
          pollRef.current = null
          // Refresh full data
          loadData()
        }
      } catch { /* ignore poll errors */ }
    }, 3000)
  }, [session?.accessToken, connections, loadData])

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

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
      // Open OAuth popup centered on screen
      const w = 600, h = 700
      const left = Math.round(window.screenX + (window.outerWidth - w) / 2)
      const top = Math.round(window.screenY + (window.outerHeight - h) / 2)
      window.open(res.redirectUrl, '_blank', `width=${w},height=${h},left=${left},top=${top}`)
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
      {connections.filter((c) => c.status === 'connected').length > 0 && (
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
            Connected ({connections.filter((c) => c.status === 'connected').length})
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {connections.filter((c) => c.status === 'connected').map((conn) => (
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
                {conn.accountLabel && (
                  <span style={{ color: 'var(--muted)', marginLeft: 4 }}>
                    ({conn.accountLabel})
                  </span>
                )}
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
  const { session } = useAuthStore()
  const isConnected = !!connection
  const hasPageSelector = provider.slug === 'facebook' || provider.slug === 'linkedin'

  const [pages, setPages] = useState<{ id: string; name: string }[]>([])
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null)
  const [loadingPages, setLoadingPages] = useState(false)

  // Fetch pages when Facebook/LinkedIn is connected
  useEffect(() => {
    if (!isConnected || !hasPageSelector || !session?.accessToken || !connection) return
    setLoadingPages(true)
    integrationsApi.listPages(session.accessToken, connection.id)
      .then((res) => {
        setPages(res.pages)
        setSelectedPageId(res.selectedPageId)
      })
      .catch(() => {})
      .finally(() => setLoadingPages(false))
  }, [isConnected, hasPageSelector, session?.accessToken, connection?.id])

  const handlePageChange = async (pageId: string) => {
    if (!session?.accessToken || !connection) return
    const prevPageId = selectedPageId
    setSelectedPageId(pageId)
    try {
      await integrationsApi.selectPage(session.accessToken, connection.id, pageId)
    } catch {
      setSelectedPageId(prevPageId)
    }
  }

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
              Connected{connection?.accountLabel ? ` · ${connection.accountLabel}` : ''}
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

      {/* Page / profile selector (Facebook pages, LinkedIn profiles/orgs) */}
      {isConnected && hasPageSelector && !loadingPages && pages.length > 0 && (
        <div style={{ fontSize: 12 }}>
          <label style={{ color: 'var(--muted)', display: 'block', marginBottom: 4 }}>
            Publishing as:
          </label>
          {pages.length === 1 ? (
            <div style={{
              padding: '6px 8px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border)',
              background: 'var(--surface)',
              color: 'var(--text-strong)',
            }}>
              {pages[0].name}
            </div>
          ) : (
            <select
              value={selectedPageId || ''}
              onChange={(e) => handlePageChange(e.target.value)}
              style={{
                width: '100%',
                padding: '6px 8px',
                fontSize: 12,
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border)',
                background: 'var(--surface)',
                color: 'var(--text-strong)',
              }}
            >
              {pages.map((page) => (
                <option key={page.id} value={page.id}>{page.name}</option>
              ))}
            </select>
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
