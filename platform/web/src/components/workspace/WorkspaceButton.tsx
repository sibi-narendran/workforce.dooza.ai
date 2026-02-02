interface WorkspaceButtonProps {
  isOpen: boolean
  onToggle: () => void
}

export function WorkspaceButton({ isOpen, onToggle }: WorkspaceButtonProps) {
  return (
    <button
      className="workspace-btn"
      onClick={onToggle}
      title={isOpen ? 'Close workspace' : 'Open workspace'}
      aria-label={isOpen ? 'Close workspace' : 'Open workspace'}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
      <span>Workspace</span>
    </button>
  )
}
