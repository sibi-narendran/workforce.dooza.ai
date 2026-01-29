/**
 * Gateway RPC Client - WebSocket RPC for clawdbot gateway
 *
 * Uses clawdbot's standard WebSocket RPC protocol for:
 * - chat.send: Send messages to agents
 * - chat.history: Get conversation history
 * - chat.abort: Abort running chats
 *
 * Each tenant has their own gateway, so connections are made per-tenant.
 */
import { WebSocket } from 'ws'
import { env } from './env.js'
import { randomUUID } from 'crypto'

const GATEWAY_TOKEN = env.CLAWDBOT_HOOK_TOKEN

interface RpcRequest {
  type: 'req'
  id: string
  method: string
  params: Record<string, unknown>
}

interface ChatEvent {
  type: 'event'
  event: 'chat'
  payload: {
    runId: string
    sessionKey: string
    seq: number
    state: 'delta' | 'final' | 'aborted' | 'error'
    message?: {
      role: string
      content: Array<{ type: string; text?: string }>
    }
    usage?: {
      input: number
      output: number
      totalTokens: number
    }
    stopReason?: string
    error?: string
  }
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp?: number
}

interface ChatHistoryResponse {
  sessionKey: string
  sessionId: string
  messages: Array<{
    role: string
    content: string | Array<{ type: string; text?: string }>
    timestamp?: number
  }>
  thinkingLevel: string
}

interface ChatSendResponse {
  runId: string
  status: string
}

/**
 * Create a WebSocket RPC connection to a specific gateway
 */
async function createRpcConnection(wsUrl: string): Promise<{
  ws: WebSocket
  rpc: <T>(method: string, params: Record<string, unknown>, timeoutMs?: number) => Promise<T>
  close: () => void
}> {
  return new Promise((resolve, reject) => {
    console.log(`[GatewayRPC] Connecting to ${wsUrl}`)
    const ws = new WebSocket(wsUrl)

    const pendingRequests = new Map<string, {
      resolve: (value: unknown) => void
      reject: (error: Error) => void
      timeout: NodeJS.Timeout
    }>()
    const chatCallbacks = new Map<string, (event: ChatEvent['payload']) => void>()

    const connectTimeout = setTimeout(() => {
      reject(new Error('WebSocket connection timeout'))
      ws.close()
    }, 10000)

    let connected = false

    ws.on('open', () => {
      console.log('[GatewayRPC] WebSocket connected, waiting for challenge...')
    })

    ws.on('message', (data) => {
      try {
        const frame = JSON.parse(data.toString())
        console.log('[GatewayRPC] Received frame:', JSON.stringify(frame).slice(0, 500))

        // Handle challenge event - need to send connect request
        if (frame.type === 'event' && frame.event === 'connect.challenge') {
          console.log('[GatewayRPC] Received challenge, sending connect request...')
          const connectReq: RpcRequest = {
            type: 'req',
            id: randomUUID(),
            method: 'connect',
            params: {
              minProtocol: 3,
              maxProtocol: 3,
              client: {
                id: 'gateway-client',  // Must be a valid clawdbot client ID
                displayName: 'Workforce Platform',
                version: '1.0.0',
                mode: 'backend',  // Backend mode for server-side connections
                platform: 'node',
              },
              auth: {
                token: GATEWAY_TOKEN,
              },
              role: 'operator',
              scopes: ['operator.admin'],
            },
          }
          ws.send(JSON.stringify(connectReq))
          return
        }

        // Handle connect response (HelloOk)
        if (frame.type === 'res' && frame.ok === true && frame.payload?.type === 'hello-ok') {
          console.log('[GatewayRPC] Handshake complete')
          clearTimeout(connectTimeout)
          connected = true

          const rpc = async <T>(method: string, params: Record<string, unknown>, timeoutMs = 30000): Promise<T> => {
            if (!connected || ws.readyState !== WebSocket.OPEN) {
              throw new Error('WebSocket not connected')
            }

            const id = randomUUID()
            const request: RpcRequest = {
              type: 'req',
              id,
              method,
              params,
            }

            return new Promise((resolveRpc, rejectRpc) => {
              const timeout = setTimeout(() => {
                pendingRequests.delete(id)
                rejectRpc(new Error(`RPC timeout: ${method}`))
              }, timeoutMs)

              pendingRequests.set(id, {
                resolve: resolveRpc as (value: unknown) => void,
                reject: rejectRpc,
                timeout,
              })

              ws.send(JSON.stringify(request))
            })
          }

          const close = () => {
            ws.close()
            for (const [id, pending] of pendingRequests) {
              clearTimeout(pending.timeout)
              pending.reject(new Error('Connection closed'))
              pendingRequests.delete(id)
            }
          }

          resolve({ ws, rpc, close })
          return
        }

        // Handle RPC responses
        if (frame.type === 'res') {
          const pending = pendingRequests.get(frame.id)
          if (pending) {
            clearTimeout(pending.timeout)
            pendingRequests.delete(frame.id)
            if (frame.ok) {
              pending.resolve(frame.payload)
            } else {
              pending.reject(new Error(frame.error?.message || 'RPC error'))
            }
          }
          return
        }

        // Handle chat events
        if (frame.type === 'event' && frame.event === 'chat') {
          const callback = chatCallbacks.get(frame.payload.runId)
          if (callback) {
            callback(frame.payload)
            if (frame.payload.state === 'final' || frame.payload.state === 'aborted' || frame.payload.state === 'error') {
              chatCallbacks.delete(frame.payload.runId)
            }
          }
        }
      } catch (error) {
        console.error('[GatewayRPC] Failed to parse message:', error)
      }
    })

    ws.on('error', (error) => {
      console.error('[GatewayRPC] WebSocket error:', error)
      clearTimeout(connectTimeout)
      reject(error)
    })

    ws.on('close', () => {
      console.log('[GatewayRPC] WebSocket closed')
      connected = false
      for (const [id, pending] of pendingRequests) {
        clearTimeout(pending.timeout)
        pending.reject(new Error('Connection closed'))
        pendingRequests.delete(id)
      }
    })
  })
}

/**
 * Get chat history for a session via WebSocket RPC
 */
export async function chatHistory(
  gatewayWsUrl: string,
  sessionKey: string,
  limit = 200
): Promise<ChatMessage[]> {
  const { rpc, close } = await createRpcConnection(gatewayWsUrl)

  try {
    const response = await rpc<ChatHistoryResponse>('chat.history', {
      sessionKey,
      limit,
    })

    return response.messages
      .filter(msg => msg.role === 'user' || msg.role === 'assistant')
      .map(msg => ({
        role: msg.role as 'user' | 'assistant',
        content: typeof msg.content === 'string'
          ? msg.content
          : msg.content
              .filter(part => part.type === 'text' || part.type === 'output_text' || part.type === 'input_text')
              .map(part => part.text || '')
              .join('\n'),
        timestamp: msg.timestamp,
      }))
  } finally {
    close()
  }
}

/**
 * Send a chat message and wait for final response via WebSocket RPC
 */
export async function chatSend(
  gatewayWsUrl: string,
  sessionKey: string,
  message: string,
  options?: {
    timeoutMs?: number
  }
): Promise<{
  response: string
  usage?: { inputTokens: number; outputTokens: number }
}> {
  const { ws, rpc, close } = await createRpcConnection(gatewayWsUrl)
  const idempotencyKey = randomUUID()
  const timeoutMs = options?.timeoutMs || 120000

  try {
    return await new Promise((resolve, reject) => {
      let responseText = ''
      let usage: { inputTokens: number; outputTokens: number } | undefined

      // Set up event listener for chat events
      const handleMessage = (data: Buffer) => {
        try {
          const frame = JSON.parse(data.toString())

          if (frame.type === 'event' && frame.event === 'chat' && frame.payload?.runId === idempotencyKey) {
            const event = frame.payload

            if (event.message?.role === 'assistant') {
              // Accumulate delta content
              const content = event.message.content
              if (Array.isArray(content)) {
                for (const part of content) {
                  if (part.text) {
                    responseText += part.text
                  }
                }
              }
            }

            if (event.usage) {
              usage = {
                inputTokens: event.usage.input,
                outputTokens: event.usage.output,
              }
            }

            if (event.state === 'final') {
              ws.off('message', handleMessage)
              resolve({ response: responseText, usage })
            } else if (event.state === 'error') {
              ws.off('message', handleMessage)
              reject(new Error(event.error || 'Chat error'))
            } else if (event.state === 'aborted') {
              ws.off('message', handleMessage)
              reject(new Error('Chat aborted'))
            }
          }
        } catch (error) {
          // Ignore parse errors for non-JSON messages
        }
      }

      ws.on('message', handleMessage)

      // Set timeout
      const timeout = setTimeout(() => {
        ws.off('message', handleMessage)
        reject(new Error('Chat timeout'))
      }, timeoutMs)

      // Send the request
      rpc<ChatSendResponse>('chat.send', {
        sessionKey,
        message,
        idempotencyKey,
        timeoutMs,
      }).catch((error) => {
        clearTimeout(timeout)
        ws.off('message', handleMessage)
        reject(error)
      })
    })
  } finally {
    close()
  }
}
