import { env } from './env.js'

const DEFAULT_GATEWAY_URL = env.CLAWDBOT_GATEWAY_URL
const HOOK_TOKEN = env.CLAWDBOT_HOOK_TOKEN

export interface GatewayRequest {
  agentId: string
  message: string
  sessionKey?: string
  thinking?: string
  deliver?: boolean
  timeoutSeconds?: number
  tools?: GatewayTool[]
  gatewayUrl?: string  // Optional: use per-tenant gateway URL
  tenantId?: string    // Tenant ID for multi-tenant mode
}

export interface GatewayTool {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

export interface GatewayResponse {
  ok: boolean
  text?: string
  error?: string
  usage?: {
    inputTokens: number
    outputTokens: number
  }
}

/**
 * Call the clawdbot gateway using the OpenAI-compatible chat completions endpoint.
 * This provides a synchronous response with the agent's output.
 */
export async function callGatewayHook(req: GatewayRequest): Promise<GatewayResponse> {
  const gatewayUrl = req.gatewayUrl || DEFAULT_GATEWAY_URL
  const url = `${gatewayUrl}/v1/chat/completions`

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${HOOK_TOKEN}`,
        // Pass agent ID and session key via custom headers (OpenClaw format)
        'X-OpenClaw-Agent': req.agentId,
        'X-OpenClaw-Session-Key': req.sessionKey || '',
        // Multi-tenant: pass tenant ID for state directory resolution
        ...(req.tenantId ? { 'X-Tenant-ID': req.tenantId } : {}),
      },
      body: JSON.stringify({
        model: req.agentId, // Agent ID is passed as the model
        messages: [
          {
            role: 'user',
            content: req.message,
          },
        ],
        stream: false,
        user: req.sessionKey, // Session key for tenant isolation
        ...(req.tools && req.tools.length > 0 ? { tools: req.tools } : {}),
      }),
      signal: AbortSignal.timeout((req.timeoutSeconds || 120) * 1000),
    })

    if (!response.ok) {
      const error = await response.text()
      return {
        ok: false,
        error: `Gateway error (${response.status}): ${error}`,
      }
    }

    const data = await response.json() as {
      choices?: Array<{
        message?: {
          content?: string
        }
      }>
      usage?: {
        prompt_tokens?: number
        completion_tokens?: number
      }
      error?: {
        message?: string
      }
    }

    if (data.error) {
      return {
        ok: false,
        error: data.error.message || 'Unknown gateway error',
      }
    }

    const content = data.choices?.[0]?.message?.content || ''

    return {
      ok: true,
      text: content,
      usage: data.usage ? {
        inputTokens: data.usage.prompt_tokens || 0,
        outputTokens: data.usage.completion_tokens || 0,
      } : undefined,
    }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Check if a gateway is available
 */
export async function checkGatewayHealth(gatewayUrl?: string): Promise<boolean> {
  const url = gatewayUrl || DEFAULT_GATEWAY_URL
  try {
    // The health endpoint returns the control UI, but a 200 status means it's running
    const response = await fetch(`${url}/`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    })
    return response.ok
  } catch {
    return false
  }
}
