import { lazy, type ComponentType } from 'react'
import type { Employee } from '../../lib/api'

// Lazy load workspaces for code splitting
const SomiWorkspace = lazy(() =>
  import('./somi/SomiWorkspace').then((m) => ({ default: m.SomiWorkspace }))
)
const GenericWorkspace = lazy(() =>
  import('./generic/GenericWorkspace').then((m) => ({ default: m.GenericWorkspace }))
)

type WorkspaceComponent = ComponentType<{ employee: Employee | null }>

const registry: Record<string, WorkspaceComponent> = {
  somi: SomiWorkspace,
  // Add more agent-specific workspaces here
}

export function getWorkspace(slug: string | null): WorkspaceComponent {
  if (slug && registry[slug]) {
    return registry[slug]
  }
  return GenericWorkspace
}
