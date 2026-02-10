/**
 * Chat Store - Zustand store for streaming chat state
 *
 * Manages:
 * - Message history per employee
 * - Streaming content accumulation
 * - Streaming state (isStreaming, currentRunId)
 */
import { create } from 'zustand'
import type { StreamMessage, TokenUsage } from './streaming'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  isError?: boolean
  canRetry?: boolean
  usage?: TokenUsage
}

interface EmployeeChatState {
  messages: ChatMessage[]
  streamingContent: string
  isStreaming: boolean
  currentRunId: string | null
}

interface ChatState {
  // Per-employee state
  chats: Record<string, EmployeeChatState>

  // Actions
  initChat: (employeeId: string) => void
  loadHistory: (employeeId: string, messages: Array<{ role: string; content: string }>) => void
  addUserMessage: (employeeId: string, content: string) => string
  startStreaming: (employeeId: string, runId: string) => void
  appendToken: (employeeId: string, token: string) => void
  finalizeMessage: (employeeId: string, message: StreamMessage, usage?: TokenUsage, runId?: string) => void
  setError: (employeeId: string, messageId: string, error: string) => void
  abortStreaming: (employeeId: string) => void
  clearStreamingContent: (employeeId: string) => void
  clearChat: (employeeId: string) => void
  retryMessage: (employeeId: string, messageId: string) => ChatMessage | null
}

const getDefaultChatState = (): EmployeeChatState => ({
  messages: [],
  streamingContent: '',
  isStreaming: false,
  currentRunId: null,
})

let messageIdCounter = 0
const generateMessageId = () => `msg-${Date.now()}-${++messageIdCounter}`

export const useChatStore = create<ChatState>()((set, get) => ({
  chats: {},

  initChat: (employeeId: string) => {
    const { chats } = get()
    if (!chats[employeeId]) {
      set({
        chats: {
          ...chats,
          [employeeId]: getDefaultChatState(),
        },
      })
    }
  },

  loadHistory: (employeeId: string, messages: Array<{ role: string; content: string; timestamp?: number }>) => {
    const { chats } = get()
    const chat = chats[employeeId]
    // Only load if chat exists and has no messages yet (avoid overwriting active conversation)
    if (!chat || chat.messages.length > 0) return

    const chatMessages: ChatMessage[] = messages.map((msg) => ({
      id: generateMessageId(),
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
      timestamp: msg.timestamp ? new Date(msg.timestamp) : new Date(),
    }))

    set({
      chats: {
        ...chats,
        [employeeId]: {
          ...chat,
          messages: chatMessages,
        },
      },
    })
  },

  addUserMessage: (employeeId: string, content: string) => {
    const id = generateMessageId()
    const message: ChatMessage = {
      id,
      role: 'user',
      content,
      timestamp: new Date(),
    }

    set((state) => {
      const chat = state.chats[employeeId] || getDefaultChatState()
      return {
        chats: {
          ...state.chats,
          [employeeId]: {
            ...chat,
            messages: [...chat.messages, message],
          },
        },
      }
    })

    return id
  },

  startStreaming: (employeeId: string, runId: string) => {
    set((state) => {
      const chat = state.chats[employeeId] || getDefaultChatState()
      return {
        chats: {
          ...state.chats,
          [employeeId]: {
            ...chat,
            isStreaming: true,
            currentRunId: runId,
            streamingContent: '',
          },
        },
      }
    })
  },

  appendToken: (employeeId: string, token: string) => {
    set((state) => {
      const chat = state.chats[employeeId]
      if (!chat || !chat.isStreaming) return state

      return {
        chats: {
          ...state.chats,
          [employeeId]: {
            ...chat,
            streamingContent: token,
          },
        },
      }
    })
  },

  finalizeMessage: (employeeId: string, message: StreamMessage, usage?: TokenUsage, runId?: string) => {
    set((state) => {
      const chat = state.chats[employeeId]
      if (!chat) return state

      // Only finalize if this matches our current streaming run
      if (runId && chat.currentRunId !== runId) return state

      const id = generateMessageId()
      const chatMessage: ChatMessage = {
        id,
        role: message.role,
        content: message.content,
        timestamp: message.timestamp ? new Date(message.timestamp) : new Date(),
        usage,
      }

      return {
        chats: {
          ...state.chats,
          [employeeId]: {
            ...chat,
            messages: [...chat.messages, chatMessage],
            streamingContent: '',
            isStreaming: false,
            currentRunId: null,
          },
        },
      }
    })
  },

  setError: (employeeId: string, runId: string, error: string) => {
    set((state) => {
      const chat = state.chats[employeeId]
      if (!chat) return state

      // Only handle errors for the current streaming run
      if (runId && chat.currentRunId !== runId) return state

      const id = generateMessageId()
      const errorMessage: ChatMessage = {
        id,
        role: 'assistant',
        content: error,
        timestamp: new Date(),
        isError: true,
        canRetry: true,
      }

      return {
        chats: {
          ...state.chats,
          [employeeId]: {
            ...chat,
            messages: [...chat.messages, errorMessage],
            streamingContent: '',
            isStreaming: false,
            currentRunId: null,
          },
        },
      }
    })
  },

  abortStreaming: (employeeId: string) => {
    set((state) => {
      const chat = state.chats[employeeId]
      if (!chat) return state

      // If there was partial content, add it as a message
      const messages = [...chat.messages]
      if (chat.streamingContent) {
        messages.push({
          id: generateMessageId(),
          role: 'assistant',
          content: chat.streamingContent + ' [Aborted]',
          timestamp: new Date(),
          isError: true,
        })
      }

      return {
        chats: {
          ...state.chats,
          [employeeId]: {
            ...chat,
            messages,
            streamingContent: '',
            isStreaming: false,
            currentRunId: null,
          },
        },
      }
    })
  },

  clearStreamingContent: (employeeId: string) => {
    set((state) => {
      const chat = state.chats[employeeId]
      if (!chat) return state

      return {
        chats: {
          ...state.chats,
          [employeeId]: {
            ...chat,
            streamingContent: '',
            isStreaming: false,
            currentRunId: null,
          },
        },
      }
    })
  },

  clearChat: (employeeId: string) => {
    set((state) => ({
      chats: {
        ...state.chats,
        [employeeId]: getDefaultChatState(),
      },
    }))
  },

  retryMessage: (employeeId: string, messageId: string) => {
    const { chats } = get()
    const chat = chats[employeeId]
    if (!chat) return null

    // Find the error message and the user message before it
    const errorIndex = chat.messages.findIndex((m) => m.id === messageId)
    if (errorIndex < 1) return null

    const userMessage = chat.messages[errorIndex - 1]
    if (userMessage.role !== 'user') return null

    // Remove the error message and the user message
    set((state) => {
      const chat = state.chats[employeeId]
      if (!chat) return state

      const messages = [...chat.messages]
      messages.splice(errorIndex - 1, 2) // Remove user message and error message

      return {
        chats: {
          ...state.chats,
          [employeeId]: {
            ...chat,
            messages,
          },
        },
      }
    })

    return userMessage
  },
}))

/**
 * Selector hooks for common operations
 */
const EMPTY_MESSAGES: ChatMessage[] = []

export const useChatMessages = (employeeId: string) => {
  return useChatStore((state) => state.chats[employeeId]?.messages ?? EMPTY_MESSAGES)
}

export const useStreamingContent = (employeeId: string) => {
  return useChatStore((state) => state.chats[employeeId]?.streamingContent || '')
}

export const useIsStreaming = (employeeId: string) => {
  return useChatStore((state) => state.chats[employeeId]?.isStreaming || false)
}
