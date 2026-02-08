/**
 * Streaming Types - Shared types for SSE and WebSocket streaming
 */

export interface ChatEvent {
  runId: string
  seq: number
  state: 'delta' | 'final' | 'aborted' | 'error' | 'connected'
  sessionKey?: string
  content?: string          // delta: streaming token
  message?: StreamMessage   // final: complete message
  error?: string            // error: error message
  usage?: TokenUsage        // final: token usage
}

export interface StreamMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp?: number
}

export interface TokenUsage {
  inputTokens: number
  outputTokens: number
  totalTokens?: number
}

export interface ChatSendParams {
  sessionKey: string
  message: string
  agentId?: string
  idempotencyKey?: string
  timeoutMs?: number
  tools?: GatewayTool[]
}

export interface GatewayTool {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

export interface GatewayChatEvent {
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

export type ChatCallback = (event: ChatEvent) => void

// ============= Cron Types (mirror clawdbot/src/cron/types.ts) =============

export type CronSchedule =
  | { kind: 'at'; atMs: number }
  | { kind: 'every'; everyMs: number; anchorMs?: number }
  | { kind: 'cron'; expr: string; tz?: string }

export type CronSessionTarget = 'main' | 'isolated'
export type CronWakeMode = 'next-heartbeat' | 'now'

export type CronPayload =
  | { kind: 'systemEvent'; text: string }
  | { kind: 'agentTurn'; message: string; model?: string; thinking?: string; timeoutSeconds?: number }

export interface CronJobState {
  nextRunAtMs?: number
  runningAtMs?: number
  lastRunAtMs?: number
  lastStatus?: 'ok' | 'error' | 'skipped'
  lastError?: string
  lastDurationMs?: number
}

export interface CronJob {
  id: string
  agentId?: string
  name: string
  description?: string
  enabled: boolean
  deleteAfterRun?: boolean
  createdAtMs: number
  updatedAtMs: number
  schedule: CronSchedule
  sessionTarget: CronSessionTarget
  wakeMode: CronWakeMode
  payload: CronPayload
  state: CronJobState
}

export type CronJobCreate = Omit<CronJob, 'id' | 'createdAtMs' | 'updatedAtMs' | 'state'> & {
  state?: Partial<CronJobState>
}

export type CronJobPatch = Partial<Omit<CronJob, 'id' | 'createdAtMs' | 'state'>> & {
  state?: Partial<CronJobState>
}
