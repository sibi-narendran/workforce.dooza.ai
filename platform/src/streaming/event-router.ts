/**
 * Event Router - Routes gateway events to matching SSE connections
 *
 * Provides tenant isolation by ensuring events only go to connections
 * belonging to the same tenant.
 */
import { sseManager } from './sse-manager.js'
import type { ChatEvent, GatewayChatEvent } from './types.js'

class EventRouter {
  /**
   * Handle a raw gateway chat event and route to appropriate SSE connections
   */
  handleGatewayEvent(tenantId: string, gatewayEvent: GatewayChatEvent['payload']): void {
    // Log error events for debugging
    if (gatewayEvent.state === 'error') {
      console.error(`[EventRouter] Error event received:`, JSON.stringify(gatewayEvent, null, 2))
    }
    const chatEvent = this.transformEvent(gatewayEvent)
    this.routeToSession(tenantId, gatewayEvent.sessionKey, chatEvent)
  }

  /**
   * Route a chat event to all SSE connections for a specific session
   * Validates tenant isolation before routing
   */
  routeToSession(tenantId: string, sessionKey: string, event: ChatEvent): void {
    // Validate that the session key matches the tenant pattern
    // Session keys are formatted as: agent:{agentSlug}:tenant-{tenantId}-{employeeId}
    if (!this.validateSessionKeyForTenant(sessionKey, tenantId)) {
      console.warn(`[EventRouter] Session key ${sessionKey} doesn't match tenant ${tenantId}`)
      return
    }

    sseManager.broadcastToSession(sessionKey, event)
  }

  /**
   * Route an event to all connections for a tenant (agent-initiated messages)
   */
  routeToTenant(tenantId: string, event: ChatEvent): void {
    sseManager.broadcastToTenant(tenantId, event)
  }

  /**
   * Transform gateway event format to our ChatEvent format
   */
  private transformEvent(gatewayEvent: GatewayChatEvent['payload']): ChatEvent {
    const event: ChatEvent = {
      runId: gatewayEvent.runId,
      seq: gatewayEvent.seq,
      state: gatewayEvent.state,
      sessionKey: gatewayEvent.sessionKey,
    }

    // Handle delta state - extract streaming content
    if (gatewayEvent.state === 'delta' && gatewayEvent.message) {
      const content = this.extractContent(gatewayEvent.message.content)
      if (content) {
        event.content = content
      }
    }

    // Handle final state - include full message and usage
    if (gatewayEvent.state === 'final') {
      if (gatewayEvent.message) {
        const content = this.extractContent(gatewayEvent.message.content)
        event.message = {
          role: gatewayEvent.message.role as 'user' | 'assistant',
          content: content || '',
          timestamp: Date.now(),
        }
      }
      if (gatewayEvent.usage) {
        event.usage = {
          inputTokens: gatewayEvent.usage.input,
          outputTokens: gatewayEvent.usage.output,
          totalTokens: gatewayEvent.usage.totalTokens,
        }
      }
    }

    // Handle error state - always include error message
    // Note: clawdbot gateway sends "errorMessage", not "error"
    if (gatewayEvent.state === 'error') {
      event.error = gatewayEvent.error || (gatewayEvent as any).errorMessage || 'An error occurred while processing your message'
    }

    return event
  }

  /**
   * Extract text content from gateway message content array
   * Strips directive tags like [[reply_to:ID]] that the model writes
   */
  private extractContent(content: Array<{ type: string; text?: string }>): string {
    if (!Array.isArray(content)) return ''
    let text = content
      .filter(part => part.type === 'text' || part.type === 'output_text' || part.type === 'input_text')
      .map(part => part.text || '')
      .join('')

    // Strip [[reply_to:ID]] and [[reply_to_current]] directive tags (same as clawdbot)
    text = text.replace(/\[\[\s*(?:reply_to_current|reply_to\s*:\s*[^\]\n]+)\s*\]\]/gi, '')

    return text.trim()
  }

  /**
   * Validate that a session key belongs to the given tenant
   */
  private validateSessionKeyForTenant(sessionKey: string, tenantId: string): boolean {
    // Session key format: agent:{agentSlug}:tenant-{tenantId}-{employeeId}
    // or custom formats that include tenant ID
    return sessionKey.includes(`tenant-${tenantId}`) || sessionKey.includes(tenantId)
  }
}

// Singleton instance
export const eventRouter = new EventRouter()
