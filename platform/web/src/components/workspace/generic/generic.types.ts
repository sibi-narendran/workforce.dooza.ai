export interface WorkspaceRow {
  id: string
  name: string
  status: 'pending' | 'active' | 'completed'
  createdAt: Date
}
