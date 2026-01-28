import { Component, ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
  errorInfo: string | null
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null, errorInfo: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[ErrorBoundary] Caught error:', error, errorInfo)
    this.setState({ errorInfo: errorInfo.componentStack || null })
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null })
  }

  handleReload = () => {
    window.location.reload()
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            minHeight: '400px',
            padding: 32,
          }}
        >
          <div
            style={{
              textAlign: 'center',
              maxWidth: 500,
              padding: 40,
              background: 'var(--bg-elevated, #1a1a1a)',
              borderRadius: 'var(--radius-lg, 12px)',
              border: '1px solid var(--border, #333)',
            }}
          >
            <div style={{ fontSize: 48, marginBottom: 16 }}>Something went wrong</div>
            <h2
              style={{
                margin: '0 0 8px',
                fontSize: 20,
                fontWeight: 600,
                color: 'var(--text-strong, #fff)',
              }}
            >
              Unexpected Error
            </h2>
            <p
              style={{
                margin: '0 0 8px',
                color: 'var(--muted, #888)',
                fontSize: 14,
                lineHeight: 1.5,
              }}
            >
              We're sorry, but something went wrong. Please try again or refresh the page.
            </p>

            {this.state.error && (
              <details
                style={{
                  marginTop: 16,
                  marginBottom: 16,
                  textAlign: 'left',
                  padding: 12,
                  background: 'var(--bg, #0a0a0a)',
                  borderRadius: 'var(--radius-md, 8px)',
                  fontSize: 12,
                  color: 'var(--danger, #ef4444)',
                }}
              >
                <summary style={{ cursor: 'pointer', marginBottom: 8 }}>Error Details</summary>
                <pre
                  style={{
                    margin: 0,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    fontFamily: 'monospace',
                  }}
                >
                  {this.state.error.message}
                  {this.state.errorInfo && `\n\nComponent Stack:${this.state.errorInfo}`}
                </pre>
              </details>
            )}

            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              <button
                onClick={this.handleRetry}
                style={{
                  padding: '10px 20px',
                  background: 'var(--accent, #ff5c5c)',
                  color: 'white',
                  border: 'none',
                  borderRadius: 'var(--radius-md, 8px)',
                  cursor: 'pointer',
                  fontSize: 14,
                  fontWeight: 500,
                }}
              >
                Try Again
              </button>
              <button
                onClick={this.handleReload}
                style={{
                  padding: '10px 20px',
                  background: 'transparent',
                  color: 'var(--text, #ccc)',
                  border: '1px solid var(--border, #333)',
                  borderRadius: 'var(--radius-md, 8px)',
                  cursor: 'pointer',
                  fontSize: 14,
                  fontWeight: 500,
                }}
              >
                Reload Page
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

/**
 * Hook to reset error boundary from child components
 * Usage: const resetError = useErrorReset()
 */
export function useErrorReset() {
  return () => {
    // Force re-render by updating window location
    window.location.href = window.location.href
  }
}
