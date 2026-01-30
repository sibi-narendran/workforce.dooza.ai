import { mkdir, rm, writeFile, readFile, access } from 'node:fs/promises'
import { join } from 'node:path'
import { env } from '../lib/env.js'

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
  }
  agents: {
    defaults: {
      model: {
        primary: string
      }
    }
    list?: Array<{
      id: string
      default?: boolean
      workspace: string   // clawdbot uses this for resolveAgentWorkspaceDir()
      agentDir: string    // clawdbot uses this for resolveAgentDir() (sessions/memory)
    }>
  }
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
      },
      agents: {
        defaults: {
          model: {
            primary: model,
          },
        },
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
    agent: { id: string; agentDir: string; isDefault?: boolean }
  ): Promise<void> {
    const config = await this.loadClawdbotConfig(tenantId)

    // Initialize agents.list if it doesn't exist
    if (!config.agents.list) {
      config.agents.list = []
    }

    // Check if agent already exists
    const existingIndex = config.agents.list.findIndex(a => a.id === agent.id)
    const agentEntry = {
      id: agent.id,
      // clawdbot uses 'workspace' for resolveAgentWorkspaceDir(), not 'agentDir'
      workspace: agent.agentDir,
      // Also set agentDir for resolveAgentDir() (sessions, memory paths)
      agentDir: agent.agentDir,
      ...(agent.isDefault ? { default: true } : {}),
    }

    if (existingIndex >= 0) {
      // Update existing entry
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
   * Delete a tenant's directory and all data
   */
  async deleteTenant(tenantId: string): Promise<void> {
    const tenantDir = this.getTenantDir(tenantId)
    await rm(tenantDir, { recursive: true, force: true })
  }
}

// Singleton instance
export const tenantManager = new TenantManager()
