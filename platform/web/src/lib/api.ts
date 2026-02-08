import { useAuthStore } from './store'
import { tokenRefreshCoordinator, shouldRefreshToken, AuthError } from './auth-interceptor'

const API_BASE = import.meta.env.VITE_API_URL || '/api'

interface ApiOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  body?: unknown
  token?: string | null
  timeoutMs?: number
  retry401?: boolean
}

class ApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

/**
 * Make a fetch request and parse the response
 */
async function fetchWithParsing<T>(
  endpoint: string,
  token: string | null | undefined,
  options: Omit<ApiOptions, 'token' | 'retry401'>
): Promise<T> {
  const { method = 'GET', body, timeoutMs = 120000 } = options

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

  // Parse response body
  let data: unknown
  const contentType = response.headers.get('content-type')
  const text = await response.text()

  if (text && contentType?.includes('application/json')) {
    try {
      data = JSON.parse(text)
    } catch {
      if (!response.ok) {
        throw new ApiError(text || `Request failed (${response.status})`, response.status)
      }
      throw new ApiError('Invalid response from server', response.status)
    }
  } else if (text) {
    if (!response.ok) {
      throw new ApiError(text, response.status)
    }
    data = { text }
  } else {
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

/**
 * Get current access token from store, refreshing proactively if near expiry
 * Always reads fresh state from store to avoid stale data
 */
async function getAccessToken(): Promise<string | null> {
  // Always read fresh state
  const { session } = useAuthStore.getState()

  if (!session?.accessToken) {
    return null
  }

  // Check if token needs proactive refresh
  if (!shouldRefreshToken(session.expiresAt)) {
    return session.accessToken
  }

  // Token needs refresh - attempt proactive refresh
  if (session.refreshToken) {
    try {
      const newSession = await tokenRefreshCoordinator.refresh(session.refreshToken)

      // Re-read state after async operation - user might have logged out
      const currentState = useAuthStore.getState()
      if (!currentState.session) {
        // Session was cleared (user logged out) - don't restore it
        return null
      }

      // Update store with new session
      currentState.updateSession({
        accessToken: newSession.accessToken,
        refreshToken: newSession.refreshToken,
        expiresAt: newSession.expiresAt,
      })

      return newSession.accessToken
    } catch {
      // Proactive refresh failed
      // Re-read fresh state - another call might have succeeded
      const freshState = useAuthStore.getState()
      if (freshState.session?.accessToken) {
        return freshState.session.accessToken
      }
      return null
    }
  }

  return session.accessToken
}

/**
 * Handle 401 error by refreshing token and retrying
 * Always reads fresh state to handle concurrent refresh scenarios
 */
async function handleUnauthorized<T>(
  endpoint: string,
  options: Omit<ApiOptions, 'token' | 'retry401'>
): Promise<T> {
  // Read fresh state - another call might have already refreshed
  const { session } = useAuthStore.getState()

  if (!session?.refreshToken) {
    useAuthStore.getState().clearAuth()
    throw new ApiError('Session expired. Please log in again.', 401)
  }

  try {
    const newSession = await tokenRefreshCoordinator.refresh(session.refreshToken)

    // Re-read state after async operation - user might have logged out
    const currentState = useAuthStore.getState()
    if (!currentState.session) {
      // Session was cleared (user logged out) - don't restore it
      throw new ApiError('Session expired. Please log in again.', 401)
    }

    // Update store
    currentState.updateSession({
      accessToken: newSession.accessToken,
      refreshToken: newSession.refreshToken,
      expiresAt: newSession.expiresAt,
    })

    // Retry with new token
    return await fetchWithParsing<T>(endpoint, newSession.accessToken, options)
  } catch (error) {
    // Refresh failed - check if it's because token was already rotated
    // by another concurrent request
    const freshState = useAuthStore.getState()

    // Check if another call refreshed successfully while we were trying
    if (
      freshState.session?.accessToken &&
      freshState.session.accessToken !== session.accessToken
    ) {
      // Another call refreshed successfully, retry with the new token
      try {
        return await fetchWithParsing<T>(endpoint, freshState.session.accessToken, options)
      } catch (retryError) {
        // Still failed, clear auth
        useAuthStore.getState().clearAuth()
        throw retryError
      }
    }

    // No concurrent refresh succeeded
    // Clear auth for auth failures, preserve error for others
    if (error instanceof AuthError && (error.status === 401 || error.status === 403)) {
      useAuthStore.getState().clearAuth()
      throw new ApiError('Session expired. Please log in again.', 401)
    }

    // Non-auth error (network, timeout, etc.) - clear auth but throw original
    useAuthStore.getState().clearAuth()
    throw error
  }
}

/**
 * Main API function with automatic token refresh
 */
async function api<T>(endpoint: string, options: ApiOptions = {}): Promise<T> {
  const { token, retry401 = true, ...requestOptions } = options

  // Determine if this is an authenticated request
  // (token param is truthy, not just present)
  const isAuthenticatedRequest = Boolean(token)

  // For authenticated requests, get current valid token
  let effectiveToken: string | null = null
  if (isAuthenticatedRequest) {
    effectiveToken = await getAccessToken()
    if (!effectiveToken) {
      // No valid token available
      useAuthStore.getState().clearAuth()
      throw new ApiError('Session expired. Please log in again.', 401)
    }
  }

  try {
    return await fetchWithParsing<T>(endpoint, effectiveToken, requestOptions)
  } catch (error) {
    // Handle 401 with retry if enabled and this was an authenticated request
    if (
      error instanceof ApiError &&
      error.status === 401 &&
      retry401 &&
      isAuthenticatedRequest
    ) {
      return handleUnauthorized<T>(endpoint, requestOptions)
    }

    throw error
  }
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

  // Streaming chat - returns immediately with runId, events delivered via SSE
  chatStream: (token: string, employeeId: string, message: string, thinking?: string) =>
    api<{ runId: string; sessionKey: string; status: 'streaming' }>(`/conversations/employee/${employeeId}/chat?stream=true`, {
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

// Routines (Clawdbot cron)
export const routinesApi = {
  list: (token: string, employeeId: string) =>
    api<{ routines: Routine[] }>(`/routines/employee/${employeeId}`, { token }),

  create: (token: string, employeeId: string, data: CreateRoutineInput) =>
    api<{ routine: Routine }>(`/routines/employee/${employeeId}`, { method: 'POST', body: data, token }),

  toggle: (token: string, id: string, enabled: boolean) =>
    api<{ routine: Routine }>(`/routines/${id}`, { method: 'PATCH', body: { enabled }, token }),

  delete: (token: string, id: string) =>
    api(`/routines/${id}`, { method: 'DELETE', token }),

  run: (token: string, id: string) =>
    api(`/routines/${id}/run`, { method: 'POST', token }),
}

// Posts
export const postsApi = {
  list: (token: string, params?: { month?: string; agentSlug?: string }) => {
    const query = new URLSearchParams()
    if (params?.month) query.set('month', params.month)
    if (params?.agentSlug) query.set('agentSlug', params.agentSlug)
    const qs = query.toString()
    return api<{ posts: Post[] }>(`/posts${qs ? `?${qs}` : ''}`, { token })
  },

  create: (token: string, data: CreatePostInput) =>
    api<{ post: Post }>('/posts', { method: 'POST', body: data, token }),

  update: (token: string, id: string, data: Partial<CreatePostInput>) =>
    api<{ post: Post }>(`/posts/${id}`, { method: 'PATCH', body: data, token }),

  delete: (token: string, id: string) =>
    api(`/posts/${id}`, { method: 'DELETE', token }),
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

export interface Routine {
  id: string
  agentId?: string
  name: string
  enabled: boolean
  schedule:
    | { kind: 'cron'; expr: string; tz?: string }
    | { kind: 'every'; everyMs: number }
    | { kind: 'at'; atMs: number }
  payload:
    | { kind: 'agentTurn'; message: string }
    | { kind: 'systemEvent'; text: string }
  state: {
    nextRunAtMs?: number
    lastRunAtMs?: number
    lastStatus?: 'ok' | 'error' | 'skipped'
    lastError?: string
    lastDurationMs?: number
  }
  createdAtMs: number
}

export interface CreateRoutineInput {
  name: string
  schedule: string   // cron expression
  message: string
  tz?: string        // IANA timezone
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

// Posts
export interface Post {
  id: string
  tenantId: string
  agentSlug: string | null
  platform: string
  title: string | null
  content: string
  imageUrl: string | null
  scheduledDate: string
  status: string
  metadata: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
}

export interface CreatePostInput {
  agentSlug?: string
  platform: 'youtube' | 'instagram' | 'facebook' | 'linkedin' | 'tiktok'
  title?: string
  content: string
  imageUrl?: string
  scheduledDate: string
  status?: 'draft' | 'scheduled' | 'published' | 'failed'
  metadata?: Record<string, unknown>
}

// Brain
export interface BrandExtractResponse {
  success: boolean
  url: string
  extracted: {
    business_name: string | null
    website: string | null
    tagline: string | null
    colors: { primary?: string; secondary?: string } | null
    social_links: Record<string, string> | null
    description: string | null
    value_proposition: string | null
    target_audience: string | null
    industry: string | null
    logo_url: string | null
  }
  error?: string
}

export interface BrainBrand {
  id: string
  tenantId: string
  businessName: string | null
  website: string | null
  tagline: string | null
  industry: string | null
  targetAudience: string | null
  description: string | null
  valueProposition: string | null
  primaryColor: string | null
  secondaryColor: string | null
  socialLinks: Record<string, string> | null
  logoUrl: string | null
  createdAt: string
  updatedAt: string
}

export interface BrainItem {
  id: string
  tenantId: string
  type: string
  title: string
  fileName: string
  filePath: string
  mimeType: string | null
  fileSize: number | null
  createdAt: string
  updatedAt: string
}

export const brainApi = {
  extractBrand: (token: string, url: string) =>
    api<BrandExtractResponse>('/brain/extract', { method: 'POST', body: { url }, token }),

  // Brand persistence
  getBrand: (token: string) =>
    api<{ brand: BrainBrand | null }>('/brain/brand', { token }),

  saveBrand: (token: string, data: Partial<Omit<BrainBrand, 'id' | 'tenantId' | 'createdAt' | 'updatedAt'>>) =>
    api<{ success: boolean }>('/brain/brand', { method: 'POST', body: data, token }),

  // Get signed URL for logo
  getLogoUrl: (token: string) =>
    api<{ url: string | null }>('/brain/logo-url', { token }),

  // Brain items (files)
  getItems: (token: string, type?: string) =>
    api<{ items: BrainItem[] }>(`/brain/items${type ? `?type=${type}` : ''}`, { token }),

  createItem: async (token: string, formData: FormData): Promise<{ success: boolean; item?: BrainItem; error?: string }> => {
    const response = await fetch(`${API_BASE}/brain/items`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    })
    return response.json()
  },

  deleteItem: (token: string, id: string) =>
    api<{ success: boolean }>(`/brain/items/${id}`, { method: 'DELETE', token }),
}

export { ApiError }
