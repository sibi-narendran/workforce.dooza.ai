import { Suspense } from 'react'
import type { Employee } from '../../lib/api'
import { getWorkspace } from './WorkspaceRegistry'

interface WorkspacePanelProps {
  isOpen: boolean
  onClose: () => void
  employee: Employee | null
}

export function WorkspacePanel({ isOpen, onClose, employee }: WorkspacePanelProps) {
  const WorkspaceComponent = getWorkspace(employee?.slug ?? null)

  return (
    <>
      {/* Backdrop */}
      <div
        className={`workspace-backdrop ${isOpen ? 'workspace-backdrop--open' : ''}`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div className={`workspace-panel ${isOpen ? 'workspace-panel--open' : ''}`}>
        <div className="workspace-panel__header">
          <h2>Workspace</h2>
          <button
            className="btn btn-ghost"
            onClick={onClose}
            title="Close workspace"
            aria-label="Close workspace"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="workspace-panel__content">
          <Suspense
            fallback={
              <div className="workspace-panel__loading">
                <div className="loading" />
              </div>
            }
          >
            <WorkspaceComponent />
          </Suspense>
        </div>
      </div>
    </>
  )
}
