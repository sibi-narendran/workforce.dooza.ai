import { lazy, type ComponentType } from 'react'
import type { Employee } from '../../lib/api'

// Lazy load workspaces for code splitting
const SomiWorkspace = lazy(() =>
  import('./somi/SomiWorkspace').then((m) => ({ default: m.SomiWorkspace }))
)
const UtumyWorkspace = lazy(() =>
  import('./utumy/UtumyWorkspace').then((m) => ({ default: m.UtumyWorkspace }))
)
const GenericWorkspace = lazy(() =>
  import('./generic/GenericWorkspace').then((m) => ({ default: m.GenericWorkspace }))
)

type WorkspaceComponent = ComponentType<{ employee: Employee | null }>

const registry: Record<string, WorkspaceComponent> = {
  somi: SomiWorkspace,
  linky: SomiWorkspace,
  utumy: UtumyWorkspace,
}

export function getWorkspace(slug: string | null): WorkspaceComponent {
  if (slug && registry[slug]) {
    return registry[slug]
  }
  return GenericWorkspace
}
