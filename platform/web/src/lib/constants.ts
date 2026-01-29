/**
 * Application-wide constants.
 * Centralizes magic numbers and configuration values.
 */

// ============= Query/Cache Configuration =============

/** Time in ms before cached data is considered stale */
export const QUERY_STALE_TIME_MS = 30_000 // 30 seconds

/** Time in ms to keep unused data in cache before garbage collection */
export const QUERY_GC_TIME_MS = 5 * 60_000 // 5 minutes

/** Maximum number of retry attempts for failed requests */
export const MAX_RETRY_ATTEMPTS = 3

/** Base delay in ms for exponential backoff (doubles each attempt) */
export const RETRY_BASE_DELAY_MS = 1000

/** Maximum delay in ms between retry attempts */
export const RETRY_MAX_DELAY_MS = 8000

// ============= UI Configuration =============

/** Time in ms before auto-dismissing error toasts */
export const ERROR_TOAST_DURATION_MS = 5000

// ============= HTTP Status Codes =============

/** Start of client error range (inclusive) */
export const HTTP_CLIENT_ERROR_MIN = 400

/** End of client error range (exclusive) */
export const HTTP_CLIENT_ERROR_MAX = 500

/** Unauthorized status code */
export const HTTP_UNAUTHORIZED = 401

/** Forbidden status code */
export const HTTP_FORBIDDEN = 403

/** Bad request status code */
export const HTTP_BAD_REQUEST = 400

// ============= Validation =============

/** Maximum length for error messages shown to users (longer messages are likely internal) */
export const MAX_USER_ERROR_MESSAGE_LENGTH = 200

// ============= Error Messages =============

/**
 * User-friendly error messages for common error types.
 * Avoids exposing internal implementation details.
 */
export const USER_FRIENDLY_ERRORS: Record<string, string> = {
  'No valid session': 'Your session has expired. Please log in again.',
  'No valid session. Please log in.': 'Your session has expired. Please log in again.',
  'Failed to fetch': 'Unable to connect to the server. Please check your internet connection.',
  'Network Error': 'Unable to connect to the server. Please check your internet connection.',
  'Request timed out': 'The request took too long. Please try again.',
}

/** Default error message when we can't determine a user-friendly one */
export const DEFAULT_ERROR_MESSAGE = 'Something went wrong. Please try again.'
