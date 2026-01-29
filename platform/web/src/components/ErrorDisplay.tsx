interface ErrorDisplayProps {
  message: string
  onRetry?: () => void
  fullHeight?: boolean
}

export function ErrorDisplay({ message, onRetry, fullHeight = true }: ErrorDisplayProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: fullHeight ? '100%' : 'auto',
        padding: 32,
        textAlign: 'center',
      }}
    >
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: '50%',
          background: 'var(--danger-subtle, rgba(239, 68, 68, 0.1))',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 16,
        }}
      >
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--danger, #ef4444)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      </div>

      <h3
        style={{
          margin: '0 0 8px',
          fontSize: 16,
          fontWeight: 600,
          color: 'var(--text-strong)',
        }}
      >
        Something went wrong
      </h3>

      <p
        style={{
          margin: '0 0 20px',
          fontSize: 14,
          color: 'var(--muted)',
          maxWidth: 400,
          lineHeight: 1.5,
        }}
      >
        {message}
      </p>

      {onRetry && (
        <button className="btn" onClick={onRetry} style={{ padding: '10px 20px' }}>
          Try Again
        </button>
      )}
    </div>
  )
}
