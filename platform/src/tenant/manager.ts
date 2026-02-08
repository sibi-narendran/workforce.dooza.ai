import { mkdir, rm, writeFile, readFile, access } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import { join } from 'node:path'
import { env } from '../lib/env.js'

/**
 * Generate a secure random token for gateway authentication
 */
function generateGatewayToken(): string {
  return randomBytes(24).toString('hex')
}

// Constants - avoid magic strings
const CONFIG_FILES = {
  TENANT_CONFIG: 'config.json',
  MOLTBOT_CONFIG: 'moltbot.json',
  CLAWDBOT_CONFIG: 'clawdbot.json',
  AGENTS_DIR: 'agents',
} as const

const DEFAULT_GATEWAY_MODE = 'local' as const

/**
 * Tenant config structure (minimal - for tenant metadata only)
 */
interface TenantConfig {
  tenant: {
    id: string
    name: string
  }
}

/**
 * Moltbot config structure (gateway agent registrations)
 */
interface MoltbotConfig {
  agents: {
    list: Array<{
      id: string
      name: string
      workspace: string
    }>
  }
}

/**
 * Clawdbot gateway config structure
 */
interface ClawdbotConfig {
  gateway: {
    mode: 'local' | 'remote'
    http?: {
      endpoints?: {
        chatCompletions?: {
          enabled: boolean
        }
      }
    }
    // Auth token for incoming gateway requests
    auth?: {
      mode: 'token'
      token: string
    }
    // Remote token for agent-to-agent communication (must match auth.token)
    remote?: {
      token: string
    }
  }
  // Multi-tenant security: Disable dangerous tools
  tools?: {
    // Deny list for dangerous tools (exec, process = bash/shell access)
    deny?: string[]
  }
  agents: {
    defaults: {
      model: {
        primary: string
      }
      // Web-chat: disable message ID hints and reply tags
      includeMessageIdHints?: boolean
      promptMode?: string
      // Multi-tenant security: Sandbox configuration
      sandbox?: {
        // Mode: 'off' | 'all' | 'docker' - use 'all' to enable path validation
        mode?: string
        // Workspace root for sandboxed sessions
        workspaceRoot?: string
        // Access mode: 'none' | 'ro' | 'rw'
        workspaceAccess?: string
        // Session visibility: 'spawned' (only see own spawned) | 'all' (see all sessions)
        sessionToolsVisibility?: 'spawned' | 'all'
      }
      // Memory flush before context compaction
      compaction?: {
        memoryFlush?: {
          enabled: boolean
          softThresholdTokens?: number
        }
      }
      // Semantic memory search
      memorySearch?: {
        enabled: boolean
        provider?: 'openai' | 'gemini' | 'local'
        sources?: string[]
      }
    }
    list?: Array<{
      id: string
      default?: boolean
      workspace: string   // clawdbot uses this for resolveAgentWorkspaceDir()
      agentDir: string    // clawdbot uses this for resolveAgentDir() (sessions/memory)
      tools?: Record<string, unknown>
    }>
  }
  // Internal hooks configuration
  hooks?: {
    internal?: {
      enabled: boolean
      entries?: {
        [key: string]: {
          enabled: boolean
          env?: Record<string, string>
        }
      }
    }
  }
  // Plugin system
  plugins?: {
    enabled: boolean
    slots?: {
      memory?: string
    }
    entries?: Record<string, { enabled: boolean }>
  }
  // Environment variables passed to YAML tools (api-tools plugin)
  env?: Record<string, string>
}

/**
 * Validate tenant ID to prevent path traversal attacks
 */
function validateTenantId(tenantId: string): void {
  if (!tenantId || typeof tenantId !== 'string') {
    throw new Error('Tenant ID is required')
  }
  // Only allow UUID format or alphanumeric with hyphens
  const validPattern = /^[a-zA-Z0-9-]+$/
  if (!validPattern.test(tenantId)) {
    throw new Error('Invalid tenant ID format')
  }
  // Prevent path traversal
  if (tenantId.includes('..') || tenantId.includes('/') || tenantId.includes('\\')) {
    throw new Error('Invalid tenant ID: path traversal detected')
  }
}

/**
 * Manages tenant directory structure
 *
 * Note: Agent workspaces are defined in code (platform/src/employees/agents/),
 * not created per-tenant. This manager only handles tenant-level data.
 */
export class TenantManager {
  private baseDir: string

  constructor(baseDir?: string) {
    this.baseDir = baseDir || env.TENANT_DATA_DIR
  }

  /**
   * Get the root directory for a tenant
   */
  getTenantDir(tenantId: string): string {
    validateTenantId(tenantId)
    return join(this.baseDir, tenantId)
  }

  /**
   * Get the tenant config path
   */
  getConfigPath(tenantId: string): string {
    return join(this.getTenantDir(tenantId), CONFIG_FILES.TENANT_CONFIG)
  }

  /**
   * Get the moltbot.json config path (gateway agent registrations)
   */
  getMoltbotConfigPath(tenantId: string): string {
    return join(this.getTenantDir(tenantId), CONFIG_FILES.MOLTBOT_CONFIG)
  }

  /**
   * Get the clawdbot.json config path (gateway config)
   */
  getClawdbotConfigPath(tenantId: string): string {
    return join(this.getTenantDir(tenantId), CONFIG_FILES.CLAWDBOT_CONFIG)
  }

  /**
   * Get the agents directory for a tenant
   */
  getAgentsDir(tenantId: string): string {
    return join(this.getTenantDir(tenantId), CONFIG_FILES.AGENTS_DIR)
  }

  /**
   * Get a specific agent's directory within a tenant
   */
  getAgentDir(tenantId: string, agentSlug: string): string {
    return join(this.getAgentsDir(tenantId), agentSlug)
  }

  /**
   * Check if a tenant directory exists
   */
  async tenantExists(tenantId: string): Promise<boolean> {
    try {
      await access(this.getTenantDir(tenantId))
      return true
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return false
      }
      // Unexpected error (e.g., permission denied) - log and return false
      console.error(`[TenantManager] Error checking tenant existence for ${tenantId}:`, error)
      return false
    }
  }

  /**
   * Load the tenant config
   */
  async loadConfig(tenantId: string): Promise<TenantConfig> {
    const configPath = this.getConfigPath(tenantId)
    const content = await readFile(configPath, 'utf-8')
    return JSON.parse(content) as TenantConfig
  }

  /**
   * Save the tenant config
   */
  async saveConfig(tenantId: string, config: TenantConfig): Promise<void> {
    const configPath = this.getConfigPath(tenantId)
    await writeFile(configPath, JSON.stringify(config, null, 2))
  }

  /**
   * Create directory structure for a new tenant
   * @throws Error if tenant already exists or validation fails
   */
  async createTenant(tenantId: string, tenantName: string): Promise<void> {
    // Validate inputs
    validateTenantId(tenantId)
    if (!tenantName || typeof tenantName !== 'string') {
      throw new Error('Tenant name is required')
    }

    // Check if tenant already exists to prevent accidental overwrites
    const exists = await this.tenantExists(tenantId)
    if (exists) {
      throw new Error(`Tenant already exists: ${tenantId}`)
    }

    const tenantDir = this.getTenantDir(tenantId)

    // Create tenant directory
    await mkdir(tenantDir, { recursive: true })

    // Create agents directory
    await mkdir(this.getAgentsDir(tenantId), { recursive: true })

    // Create config
    const config: TenantConfig = {
      tenant: {
        id: tenantId,
        name: tenantName,
      },
    }
    await this.saveConfig(tenantId, config)

    // Create moltbot.json (empty gateway config)
    const moltbotConfig: MoltbotConfig = {
      agents: {
        list: [],
      },
    }
    await this.saveMoltbotConfig(tenantId, moltbotConfig)

    // Create clawdbot.json (gateway config with local mode and HTTP API enabled)
    // Ensure model has openrouter/ prefix for OpenRouter routing
    const model = env.DEFAULT_MODEL.startsWith('openrouter/')
      ? env.DEFAULT_MODEL
      : `openrouter/${env.DEFAULT_MODEL}`

    // Multi-tenant security: Create workspace directory for sandboxing
    const workspaceDir = join(tenantDir, 'workspace')
    await mkdir(workspaceDir, { recursive: true })

    // Generate a secure token for gateway auth (shared between auth and remote)
    const gatewayToken = generateGatewayToken()

    const clawdbotConfig: ClawdbotConfig = {
      gateway: {
        mode: DEFAULT_GATEWAY_MODE,
        http: {
          endpoints: {
            chatCompletions: {
              enabled: true,
            },
          },
        },
        // Auth token for incoming gateway requests
        auth: {
          mode: 'token',
          token: gatewayToken,
        },
        // Remote token for agent-to-agent communication (must match auth.token)
        remote: {
          token: gatewayToken,
        },
      },
      // Multi-tenant security: Disable shell/exec access to prevent command execution
      tools: {
        deny: ['exec', 'process'],
      },
      agents: {
        defaults: {
          model: {
            primary: model,
          },
          // Web-chat only: Disable message ID hints and reply tags (no threading needed)
          includeMessageIdHints: false,
          promptMode: 'minimal',
          // Multi-tenant security: Enable sandbox mode for path validation
          // workspaceRoot covers entire tenant directory so agents can access their files in /agents/{slug}/
          sandbox: {
            mode: 'paths-only',
            workspaceRoot: tenantDir,
            workspaceAccess: 'rw',
            // Allow agents to see all sessions (not just ones they spawned)
            sessionToolsVisibility: 'all',
          },
          // Memory flush before context compaction (saves to memory/YYYY-MM-DD.md)
          compaction: {
            memoryFlush: {
              enabled: true,
              softThresholdTokens: 4000,
            },
          },
          // Semantic memory search over memory files
          memorySearch: {
            enabled: true,
            provider: 'openai',
            sources: ['memory'],
          },
        },
      },
      // Internal hooks for session memory, audit logging, and startup tasks
      hooks: {
        internal: {
          enabled: true,
          entries: {
            'session-memory': { enabled: true },
            'command-logger': { enabled: true },
            'boot-md': { enabled: true },
          },
        },
      },
      // Plugin system for memory-core
      plugins: {
        enabled: true,
        slots: { memory: 'memory-core' },
      },
    }
    await writeFile(
      this.getClawdbotConfigPath(tenantId),
      JSON.stringify(clawdbotConfig, null, 2)
    )
  }

  /**
   * Load moltbot.json config
   */
  async loadMoltbotConfig(tenantId: string): Promise<MoltbotConfig> {
    const configPath = this.getMoltbotConfigPath(tenantId)
    try {
      const content = await readFile(configPath, 'utf-8')
      const parsed = JSON.parse(content)

      // Validate structure
      if (!parsed || typeof parsed !== 'object') {
        console.warn(`[TenantManager] Invalid moltbot.json structure for tenant ${tenantId}, using default`)
        return { agents: { list: [] } }
      }
      if (!parsed.agents?.list || !Array.isArray(parsed.agents.list)) {
        console.warn(`[TenantManager] Missing agents.list in moltbot.json for tenant ${tenantId}, using default`)
        return { agents: { list: [] } }
      }

      return parsed as MoltbotConfig
    } catch (error) {
      // Log error for debugging, but return empty config for graceful degradation
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        // File doesn't exist - this is expected for new tenants
        console.log(`[TenantManager] No moltbot.json found for tenant ${tenantId}, using default`)
      } else {
        console.error(`[TenantManager] Error loading moltbot.json for tenant ${tenantId}:`, error)
      }
      return { agents: { list: [] } }
    }
  }

  /**
   * Save moltbot.json config
   */
  async saveMoltbotConfig(tenantId: string, config: MoltbotConfig): Promise<void> {
    const configPath = this.getMoltbotConfigPath(tenantId)
    await writeFile(configPath, JSON.stringify(config, null, 2))
  }

  /**
   * Add an agent to the moltbot config
   */
  async addAgentToMoltbotConfig(
    tenantId: string,
    agent: { id: string; name: string; workspace: string }
  ): Promise<void> {
    const config = await this.loadMoltbotConfig(tenantId)

    // Check if agent already exists
    const existingIndex = config.agents.list.findIndex(a => a.id === agent.id)
    if (existingIndex >= 0) {
      // Update existing entry
      config.agents.list[existingIndex] = agent
    } else {
      // Add new entry
      config.agents.list.push(agent)
    }

    await this.saveMoltbotConfig(tenantId, config)
  }

  /**
   * Remove an agent from the moltbot config
   */
  async removeAgentFromMoltbotConfig(tenantId: string, agentId: string): Promise<void> {
    const config = await this.loadMoltbotConfig(tenantId)
    config.agents.list = config.agents.list.filter(a => a.id !== agentId)
    await this.saveMoltbotConfig(tenantId, config)
  }

  /**
   * Load clawdbot.json config
   */
  async loadClawdbotConfig(tenantId: string): Promise<ClawdbotConfig> {
    try {
      const configPath = this.getClawdbotConfigPath(tenantId)
      const content = await readFile(configPath, 'utf-8')
      return JSON.parse(content) as ClawdbotConfig
    } catch (error) {
      console.error(`[TenantManager] Error loading clawdbot.json for tenant ${tenantId}:`, error)
      throw error
    }
  }

  /**
   * Save clawdbot.json config
   */
  async saveClawdbotConfig(tenantId: string, config: ClawdbotConfig): Promise<void> {
    const configPath = this.getClawdbotConfigPath(tenantId)
    await writeFile(configPath, JSON.stringify(config, null, 2))
  }

  /**
   * Add an agent to the clawdbot config (agents.list)
   * This is required for clawdbot to discover the agent's workspace and skills
   */
  async addAgentToClawdbotConfig(
    tenantId: string,
    agent: {
      id: string
      agentDir: string
      isDefault?: boolean
      tools?: Record<string, unknown>
    }
  ): Promise<void> {
    const config = await this.loadClawdbotConfig(tenantId)

    // Initialize agents.list if it doesn't exist
    if (!config.agents.list) {
      config.agents.list = []
    }

    // Check if agent already exists
    const existingIndex = config.agents.list.findIndex(a => a.id === agent.id)
    const agentEntry: NonNullable<ClawdbotConfig['agents']['list']>[number] = {
      id: agent.id,
      // clawdbot uses 'workspace' for resolveAgentWorkspaceDir(), not 'agentDir'
      workspace: agent.agentDir,
      // Also set agentDir for resolveAgentDir() (sessions, memory paths)
      agentDir: agent.agentDir,
      ...(agent.isDefault ? { default: true } : {}),
      ...(agent.tools ? { tools: agent.tools } : {}),
    }

    if (existingIndex >= 0) {
      // Update existing entry, preserve default flag if already set
      const existing = config.agents.list[existingIndex]
      if (existing.default && !agent.isDefault) {
        agentEntry.default = true
      }
      config.agents.list[existingIndex] = agentEntry
    } else {
      // Add new entry - first agent is default
      if (config.agents.list.length === 0) {
        agentEntry.default = true
      }
      config.agents.list.push(agentEntry)
    }

    await this.saveClawdbotConfig(tenantId, config)
  }

  /**
   * Remove an agent from the clawdbot config
   */
  async removeAgentFromClawdbotConfig(tenantId: string, agentId: string): Promise<void> {
    const config = await this.loadClawdbotConfig(tenantId)
    if (config.agents.list) {
      config.agents.list = config.agents.list.filter(a => a.id !== agentId)
    }
    await this.saveClawdbotConfig(tenantId, config)
  }

  /**
   * Enable specific plugins in clawdbot.json
   * Ensures plugins.entries[pluginId] = { enabled: true } for each plugin ID
   */
  async enablePlugins(tenantId: string, pluginIds: string[]): Promise<void> {
    const config = await this.loadClawdbotConfig(tenantId)

    if (!config.plugins) {
      config.plugins = { enabled: true }
    }
    if (!config.plugins.entries) {
      config.plugins.entries = {}
    }

    for (const pluginId of pluginIds) {
      config.plugins.entries[pluginId] = { enabled: true }
    }

    await this.saveClawdbotConfig(tenantId, config)
  }

  /**
   * Delete a tenant's directory and all data
   */
  async deleteTenant(tenantId: string): Promise<void> {
    const tenantDir = this.getTenantDir(tenantId)
    await rm(tenantDir, { recursive: true, force: true })
  }
}

// Singleton instance
export const tenantManager = new TenantManager()
