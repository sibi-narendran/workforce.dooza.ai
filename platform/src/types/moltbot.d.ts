// Type declarations for moltbot gateway server
declare module 'moltbot/gateway/server' {
  export interface GatewayServer {
    close(opts?: { reason?: string; restartExpectedMs?: number | null }): Promise<void>
  }

  export interface GatewayServerOptions {
    bind?: 'loopback' | 'lan' | 'tailnet' | 'auto'
    host?: string
    controlUiEnabled?: boolean
    openAiChatCompletionsEnabled?: boolean
    openResponsesEnabled?: boolean
  }

  export function startGatewayServer(
    port?: number,
    opts?: GatewayServerOptions
  ): Promise<GatewayServer>
}
