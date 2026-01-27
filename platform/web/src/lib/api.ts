const API_BASE = '/api'

interface ApiOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  body?: unknown
  token?: string | null
  timeoutMs?: number
}

class ApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

async function api<T>(endpoint: string, options: ApiOptions = {}): Promise<T> {
  const { method = 'GET', body, token, timeoutMs = 120000 } = options

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  let response: Response
  try {
    response = await fetch(`${API_BASE}${endpoint}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (err) {
    // Network error or timeout
    if (err instanceof Error) {
      if (err.name === 'TimeoutError' || err.name === 'AbortError') {
        throw new ApiError('Request timed out - the server may be busy', 408)
      }
      if (err.message.includes('fetch')) {
        throw new ApiError('Failed to connect to server - please check your connection', 0)
      }
      throw new ApiError(err.message, 0)
    }
    throw new ApiError('Network error', 0)
  }

  // Parse response body safely
  let data: unknown
  const contentType = response.headers.get('content-type')
  const text = await response.text()

  if (text && contentType?.includes('application/json')) {
    try {
      data = JSON.parse(text)
    } catch {
      // JSON parse failed
      if (!response.ok) {
        throw new ApiError(text || `Request failed (${response.status})`, response.status)
      }
      throw new ApiError('Invalid response from server', response.status)
    }
  } else if (text) {
    // Non-JSON response
    if (!response.ok) {
      throw new ApiError(text, response.status)
    }
    data = { text }
  } else {
    // Empty response
    if (!response.ok) {
      throw new ApiError(`Request failed (${response.status})`, response.status)
    }
    data = {}
  }

  if (!response.ok) {
    const errorData = data as { error?: string; message?: string }
    throw new ApiError(
      errorData.error || errorData.message || `Request failed (${response.status})`,
      response.status
    )
  }

  return data as T
}

// Auth
export const authApi = {
  register: (data: { email: string; password: string; name: string; companyName: string }) =>
    api('/auth/register', { method: 'POST', body: data }),

  login: (data: { email: string; password: string }) =>
    api('/auth/login', { method: 'POST', body: data }),

  refresh: (refreshToken: string) =>
    api('/auth/refresh', { method: 'POST', body: { refreshToken } }),

  me: (token: string) =>
    api('/auth/me', { token }),
}

// Employees
export const employeesApi = {
  list: (token?: string) =>
    api<{ employees: Employee[] }>('/employees', { token: token || undefined }),

  get: (token: string, id: string) =>
    api<{ employee: Employee }>(`/employees/${id}`, { token }),

  create: (token: string, data: CreateEmployeeInput) =>
    api<{ employee: Employee }>('/employees', { method: 'POST', body: data, token }),

  update: (token: string, id: string, data: Partial<CreateEmployeeInput>) =>
    api<{ employee: Employee }>(`/employees/${id}`, { method: 'PATCH', body: data, token }),

  delete: (token: string, id: string) =>
    api(`/employees/${id}`, { method: 'DELETE', token }),

  templates: (token: string) =>
    api<{ templates: EmployeeTemplate[] }>('/employees/templates', { token }),

  skills: (token: string) =>
    api<{ skills: Skill[] }>('/employees/skills', { token }),

  models: (token: string) =>
    api<{ models: Model[] }>('/employees/models', { token }),
}

// Conversations
export const conversationsApi = {
  list: (token: string) =>
    api<{ conversations: Conversation[] }>('/conversations', { token }),

  listByEmployee: (token: string, employeeId: string) =>
    api<{ conversations: Conversation[] }>(`/conversations/employee/${employeeId}`, { token }),

  chat: (token: string, employeeId: string, message: string, thinking?: string) =>
    api<{ conversation: Conversation; response: string }>(`/conversations/employee/${employeeId}/chat`, {
      method: 'POST',
      body: { message, thinking },
      token,
    }),

  messages: (token: string, conversationId: string) =>
    api<{ conversation: Conversation; messages: Message[] }>(`/conversations/${conversationId}/messages`, { token }),

  delete: (token: string, id: string) =>
    api(`/conversations/${id}`, { method: 'DELETE', token }),
}

// Library
export const libraryApi = {
  list: (token?: string) =>
    api<{ agents: LibraryAgent[] }>('/library', { token }),

  get: (idOrSlug: string) =>
    api<{ agent: LibraryAgent }>(`/library/${idOrSlug}`),

  install: (token: string, agentId: string, customName?: string) =>
    api<{ installed: InstalledAgent }>(`/library/${agentId}/install`, {
      method: 'POST',
      body: { customName },
      token,
    }),

  listInstalled: (token: string) =>
    api<{ installed: InstalledAgent[] }>('/library/installed/list', { token }),

  updateInstalled: (token: string, id: string, data: { customName?: string; customModel?: string; customPrompt?: string }) =>
    api<{ installed: InstalledAgent }>(`/library/installed/${id}`, {
      method: 'PATCH',
      body: data,
      token,
    }),

  uninstall: (token: string, id: string) =>
    api(`/library/installed/${id}`, { method: 'DELETE', token }),
}

// Integrations
export const integrationsApi = {
  listProviders: () =>
    api<{ providers: IntegrationProvider[]; grouped: Record<string, IntegrationProvider[]> }>('/integrations'),

  listConnections: (token: string) =>
    api<{ connections: UserConnection[] }>('/integrations/connections', { token }),

  connect: (token: string, providerSlug: string) =>
    api<{ redirectUrl: string }>(`/integrations/${providerSlug}/connect`, { method: 'POST', token }),

  disconnect: (token: string, connectionId: string) =>
    api(`/integrations/${connectionId}`, { method: 'DELETE', token }),

  checkStatus: (token: string, connectionId: string) =>
    api<{ status: string }>(`/integrations/${connectionId}/status`, { token }),
}

// Jobs
export const jobsApi = {
  list: (token: string) =>
    api<{ jobs: Job[] }>('/jobs', { token }),

  get: (token: string, id: string) =>
    api<{ job: Job }>(`/jobs/${id}`, { token }),

  create: (token: string, data: CreateJobInput) =>
    api<{ job: Job }>('/jobs', { method: 'POST', body: data, token }),

  update: (token: string, id: string, data: Partial<CreateJobInput>) =>
    api<{ job: Job }>(`/jobs/${id}`, { method: 'PATCH', body: data, token }),

  delete: (token: string, id: string) =>
    api(`/jobs/${id}`, { method: 'DELETE', token }),

  run: (token: string, id: string) =>
    api<{ execution: JobExecution }>(`/jobs/${id}/run`, { method: 'POST', token }),
}

// Types
export interface Employee {
  id: string
  agentId: string | null
  slug: string | null
  name: string
  type: string
  description: string | null
  skills: string[] | null
  model: string | null
  emoji?: string | null
  gradient?: string | null
  category?: string | null
  identityPrompt?: string | null
  customPrompt?: string | null
  isTemplate?: boolean
  isFromLibrary: boolean
  chatEnabled?: boolean
  installedAt?: string | null
  createdAt: string
  conversationCount?: number
}

export interface CreateEmployeeInput {
  name: string
  type: string
  description?: string
  skills?: string[]
  model?: string
  identityPrompt?: string
}

export interface EmployeeTemplate {
  type: string
  name: string
  description: string
  skills: string[]
  model: string
}

export interface Skill {
  id: string
  name: string
  description: string
}

export interface Model {
  id: string
  name: string
  description: string
}

export interface Conversation {
  id: string
  employeeId: string
  sessionKey: string
  title: string | null
  lastMessageAt: string | null
  createdAt: string
}

export interface Message {
  role: 'user' | 'assistant'
  content: string
  timestamp?: string
}

export interface Job {
  id: string
  name: string
  schedule: string
  prompt: string
  enabled: boolean
  lastRunAt: string | null
  createdAt: string
  employee: {
    id: string
    name: string
    type: string
  } | null
}

export interface CreateJobInput {
  name: string
  employeeId: string
  schedule: string
  prompt: string
  enabled?: boolean
}

export interface JobExecution {
  jobId: string
  status: 'running' | 'completed' | 'failed'
  startedAt: string
  completedAt?: string
  result?: string
  error?: string
}

export interface LibraryAgent {
  id: string
  slug: string
  name: string
  description: string | null
  emoji: string | null
  gradient: string | null
  category: string | null
  defaultModel: string | null
  skills: string[] | null
  installCount: number
  isInstalled?: boolean
}

export interface InstalledAgent {
  id: string
  agentId: string
  customName: string | null
  customModel: string | null
  customPrompt: string | null
  isActive: boolean
  installedAt: string
  agent?: LibraryAgent
}

export interface IntegrationProvider {
  id: string
  slug: string
  name: string
  description: string | null
  icon: string | null
  category: string | null
}

export interface UserConnection {
  id: string
  providerId: string
  providerSlug: string
  providerName: string
  providerIcon: string | null
  status: 'connected' | 'pending' | 'expired' | 'revoked'
  connectedAt: string
}

export { ApiError }
