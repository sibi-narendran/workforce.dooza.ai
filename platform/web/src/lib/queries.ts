import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from './store'
import { employeesApi, jobsApi, libraryApi, conversationsApi, ApiError } from './api'
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
  jobs: ['jobs'] as const,
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

// ============= Jobs Queries =============

export function useJobs() {
  const { session } = useAuthStore()
  const accessToken = session?.accessToken

  return useQuery({
    queryKey: queryKeys.jobs,
    queryFn: async () => {
      if (!accessToken) {
        throw new ApiError('No valid session', HTTP_UNAUTHORIZED)
      }
      const res = await jobsApi.list(accessToken)
      return res.jobs
    },
    enabled: !!accessToken,
  })
}

export function useJobsWithEmployees() {
  const employeesQuery = useEmployees()
  const jobsQuery = useJobs()

  return {
    jobs: jobsQuery.data,
    employees: employeesQuery.data,
    isLoading: jobsQuery.isLoading || employeesQuery.isLoading,
    error: jobsQuery.error || employeesQuery.error,
    refetch: async () => {
      // Await both refetches and aggregate results
      const results = await Promise.allSettled([
        jobsQuery.refetch(),
        employeesQuery.refetch(),
      ])

      // Check if any refetch failed
      const failures = results.filter(
        (r): r is PromiseRejectedResult => r.status === 'rejected'
      )
      if (failures.length > 0) {
        throw new Error(getErrorMessage(failures[0].reason))
      }
    },
  }
}

export function useCreateJob() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: Parameters<typeof jobsApi.create>[1]) => {
      const token = getAccessToken()
      return jobsApi.create(token, data)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.jobs })
    },
  })
}

export function useUpdateJob() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof jobsApi.update>[2] }) => {
      const token = getAccessToken()
      return jobsApi.update(token, id, data)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.jobs })
    },
  })
}

export function useDeleteJob() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => {
      const token = getAccessToken()
      return jobsApi.delete(token, id)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.jobs })
    },
  })
}

export function useRunJob() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => {
      const token = getAccessToken()
      return jobsApi.run(token, id)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.jobs })
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
  const jobsQuery = useJobs()
  const conversationsQuery = useConversations()

  return {
    employees: employeesQuery.data ?? [],
    jobs: jobsQuery.data ?? [],
    conversations: conversationsQuery.data ?? [],
    isLoading: employeesQuery.isLoading || jobsQuery.isLoading || conversationsQuery.isLoading,
    error: employeesQuery.error || jobsQuery.error || conversationsQuery.error,
    refetch: async () => {
      const results = await Promise.allSettled([
        employeesQuery.refetch(),
        jobsQuery.refetch(),
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
