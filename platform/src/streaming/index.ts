/**
 * Streaming Module - Real-time chat streaming infrastructure
 *
 * Exports:
 * - sseManager: Manages browser SSE connections
 * - eventRouter: Routes gateway events to SSE connections
 * - gatewayPool: Per-tenant WebSocket connection pool
 * - Types: ChatEvent, StreamMessage, etc.
 */

export { sseManager } from './sse-manager.js'
export { eventRouter } from './event-router.js'
export { gatewayPool } from './gateway-pool.js'
export { GatewayWSClient } from './gateway-ws-client.js'
export * from './types.js'
