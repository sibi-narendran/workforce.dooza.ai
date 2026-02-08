import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from './store'
import { employeesApi, routinesApi, libraryApi, conversationsApi, ApiError } from './api'
import {
  HTTP_UNAUTHORIZED,
  HTTP_BAD_REQUEST,
  USER_FRIENDLY_ERRORS,
  DEFAULT_ERROR_MESSAGE,
  MAX_USER_ERROR_MESSAGE_LENGTH,
} from './constants'

// ============= Constants =============

// Query key factory for consistency and type safety
export const queryKeys = {
  employees: ['employees'] as const,
  employee: (id: string) => ['employees', id] as const,
  routines: (employeeId: string) => ['routines', employeeId] as const,
  library: ['library'] as const,
  conversations: ['conversations'] as const,
  employeeConversations: (id: string) => ['conversations', 'employee', id] as const,
} as const

// ============= Helpers =============

/**
 * Gets fresh access token from store.
 * Called at mutation time to avoid stale closures.
 * Throws ApiError with 401 status if no session exists.
 */
function getAccessToken(): string {
  const { session } = useAuthStore.getState()
  if (!session?.accessToken) {
    throw new ApiError('No valid session. Please log in.', HTTP_UNAUTHORIZED)
  }
  return session.accessToken
}

/**
 * Converts internal error message to user-friendly message.
 * Prevents exposing internal implementation details to users.
 */
function sanitizeErrorMessage(message: string): string {
  // Check for known error patterns
  for (const [pattern, userMessage] of Object.entries(USER_FRIENDLY_ERRORS)) {
    if (message.includes(pattern)) {
      return userMessage
    }
  }

  // For API errors with proper messages, return as-is (they're designed for users)
  // For unknown errors (too long, contains stack traces), return generic message
  const looksLikeStackTrace = message.includes('Error:') || message.includes('at ')
  if (message.length > MAX_USER_ERROR_MESSAGE_LENGTH || looksLikeStackTrace) {
    return DEFAULT_ERROR_MESSAGE
  }

  return message
}

/**
 * Safely extracts and sanitizes error message from unknown error type.
 * Handles ApiError, Error, and unknown types.
 * Returns user-friendly message, never exposes stack traces or internal details.
 */
export function getErrorMessage(error: unknown): string {
  let message: string

  if (error instanceof ApiError) {
    message = error.message
  } else if (error instanceof Error) {
    message = error.message
  } else if (typeof error === 'string') {
    message = error
  } else {
    return DEFAULT_ERROR_MESSAGE
  }

  return sanitizeErrorMessage(message)
}

// ============= Employee Queries =============

export function useEmployees() {
  const { session } = useAuthStore()
  const accessToken = session?.accessToken

  return useQuery({
    queryKey: queryKeys.employees,
    queryFn: async () => {
      if (!accessToken) {
        throw new ApiError('No valid session', HTTP_UNAUTHORIZED)
      }
      const res = await employeesApi.list(accessToken)
      return res.employees
    },
    enabled: !!accessToken,
  })
}

export function useEmployee(id: string | undefined) {
  const { session } = useAuthStore()
  const accessToken = session?.accessToken

  return useQuery({
    queryKey: queryKeys.employee(id ?? ''),
    queryFn: async () => {
      if (!accessToken) {
        throw new ApiError('No valid session', HTTP_UNAUTHORIZED)
      }
      if (!id) {
        throw new ApiError('Employee ID is required', HTTP_BAD_REQUEST)
      }
      const res = await employeesApi.get(accessToken, id)
      return res.employee
    },
    enabled: !!accessToken && !!id,
  })
}

export function useDeleteEmployee() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => {
      const token = getAccessToken()
      return employeesApi.delete(token, id)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.employees })
    },
  })
}

// ============= Routines Queries =============

export function useRoutines(employeeId: string | undefined, enabled = true) {
  const { session } = useAuthStore()
  const accessToken = session?.accessToken

  return useQuery({
    queryKey: queryKeys.routines(employeeId ?? ''),
    queryFn: async () => {
      if (!accessToken || !employeeId) {
        throw new ApiError('No valid session', HTTP_UNAUTHORIZED)
      }
      const res = await routinesApi.list(accessToken, employeeId)
      return res.routines
    },
    enabled: !!accessToken && !!employeeId && enabled,
    refetchInterval: enabled ? 30_000 : false,
  })
}

export function useCreateRoutine(employeeId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: Parameters<typeof routinesApi.create>[2]) => {
      const token = getAccessToken()
      return routinesApi.create(token, employeeId, data)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.routines(employeeId) })
    },
  })
}

export function useToggleRoutine(employeeId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) => {
      const token = getAccessToken()
      return routinesApi.toggle(token, id, enabled)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.routines(employeeId) })
    },
  })
}

export function useDeleteRoutine(employeeId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => {
      const token = getAccessToken()
      return routinesApi.delete(token, id)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.routines(employeeId) })
    },
  })
}

export function useRunRoutine(employeeId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => {
      const token = getAccessToken()
      return routinesApi.run(token, id)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.routines(employeeId) })
    },
  })
}

// ============= Library Queries =============

export function useLibrary() {
  const { session } = useAuthStore()
  // Library can be viewed without auth, token is optional for installed status
  const accessToken = session?.accessToken

  return useQuery({
    queryKey: queryKeys.library,
    queryFn: async () => {
      const res = await libraryApi.list(accessToken)
      return res.agents
    },
  })
}

export function useInstallAgent() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ agentId, customName }: { agentId: string; customName?: string }) => {
      const token = getAccessToken()
      return libraryApi.install(token, agentId, customName)
    },
    onSuccess: () => {
      // Invalidate both library (for install count) and employees (new employee created)
      queryClient.invalidateQueries({ queryKey: queryKeys.library })
      queryClient.invalidateQueries({ queryKey: queryKeys.employees })
    },
  })
}

// ============= Conversation Queries =============

export function useConversations() {
  const { session } = useAuthStore()
  const accessToken = session?.accessToken

  return useQuery({
    queryKey: queryKeys.conversations,
    queryFn: async () => {
      if (!accessToken) {
        throw new ApiError('No valid session', HTTP_UNAUTHORIZED)
      }
      const res = await conversationsApi.list(accessToken)
      return res.conversations
    },
    enabled: !!accessToken,
  })
}

export function useEmployeeConversations(employeeId: string | undefined) {
  const { session } = useAuthStore()
  const accessToken = session?.accessToken

  return useQuery({
    queryKey: queryKeys.employeeConversations(employeeId ?? ''),
    queryFn: async () => {
      if (!accessToken) {
        throw new ApiError('No valid session', HTTP_UNAUTHORIZED)
      }
      if (!employeeId) {
        throw new ApiError('Employee ID is required', HTTP_BAD_REQUEST)
      }
      const res = await conversationsApi.listByEmployee(accessToken, employeeId)
      return res.conversations
    },
    enabled: !!accessToken && !!employeeId,
  })
}

// ============= Combined Queries =============

export function useDashboardData() {
  const employeesQuery = useEmployees()
  const conversationsQuery = useConversations()

  return {
    employees: employeesQuery.data ?? [],
    conversations: conversationsQuery.data ?? [],
    isLoading: employeesQuery.isLoading || conversationsQuery.isLoading,
    error: employeesQuery.error || conversationsQuery.error,
    refetch: async () => {
      const results = await Promise.allSettled([
        employeesQuery.refetch(),
        conversationsQuery.refetch(),
      ])

      const failures = results.filter(
        (r): r is PromiseRejectedResult => r.status === 'rejected'
      )
      if (failures.length > 0) {
        throw new Error(getErrorMessage(failures[0].reason))
      }
    },
  }
}

export function useEmployeeDetail(id: string | undefined) {
  const employeeQuery = useEmployee(id)
  const conversationsQuery = useEmployeeConversations(id)

  return {
    employee: employeeQuery.data,
    conversations: conversationsQuery.data ?? [],
    isLoading: employeeQuery.isLoading || conversationsQuery.isLoading,
    error: employeeQuery.error || conversationsQuery.error,
    refetch: async () => {
      const results = await Promise.allSettled([
        employeeQuery.refetch(),
        conversationsQuery.refetch(),
      ])

      const failures = results.filter(
        (r): r is PromiseRejectedResult => r.status === 'rejected'
      )
      if (failures.length > 0) {
        throw new Error(getErrorMessage(failures[0].reason))
      }
    },
  }
}
