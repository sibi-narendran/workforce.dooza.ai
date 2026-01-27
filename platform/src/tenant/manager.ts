import { mkdir, rm, writeFile, readFile, access, symlink } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { env } from '../lib/env.js'
import {
  DEFAULT_AGENTS_TEMPLATE,
  DEFAULT_IDENTITY_TEMPLATE,
  DEFAULT_TOOLS_TEMPLATE,
  DEFAULT_HEARTBEAT_TEMPLATE,
} from '../employees/templates.js'

/**
 * Clawdbot tenant config structure
 */
interface TenantConfig {
  tenant: {
    id: string
    name: string
  }
  gateway: {
    mode: string
  }
  agents?: {
    list?: AgentEntry[]
  }
}

/**
 * Model config - can be string or object with primary/fallbacks
 * Following native Clawdbot AgentModelConfig type
 */
type AgentModelConfig = string | {
  primary?: string
  fallbacks?: string[]
}

/**
 * Tool profile identifier
 * Following native Clawdbot ToolProfileId type
 */
type ToolProfileId = 'minimal' | 'coding' | 'messaging' | 'full'

/**
 * Tool policy config for provider overrides
 */
interface ToolPolicyConfig {
  allow?: string[]
  deny?: string[]
  profile?: ToolProfileId
}

/**
 * Exec tool configuration
 */
interface ExecToolConfig {
  host?: 'sandbox' | 'gateway' | 'node'
  security?: 'deny' | 'allowlist' | 'full'
  ask?: 'off' | 'on-miss' | 'always'
  node?: string
  pathPrepend?: string[]
  safeBins?: string[]
  backgroundMs?: number
  timeoutSec?: number
}

/**
 * Agent tools config
 * Following native Clawdbot AgentToolsConfig type
 */
interface AgentToolsConfig {
  profile?: ToolProfileId
  allow?: string[]
  deny?: string[]
  byProvider?: Record<string, ToolPolicyConfig>
  elevated?: {
    enabled?: boolean
    allowFrom?: Record<string, string[]>
  }
  exec?: ExecToolConfig
  sandbox?: {
    tools?: {
      allow?: string[]
      deny?: string[]
    }
  }
}

/**
 * Agent entry in config.json agents.list[]
 * This is the native Clawdbot agent config format
 */
interface AgentEntry {
  id: string
  name?: string
  workspace: string
  model?: AgentModelConfig
  tools?: AgentToolsConfig
}

/**
 * Workspace files configuration
 * Following native Clawdbot conventions
 */
export interface WorkspaceFiles {
  /** SOUL.md - Agent personality/core identity */
  soul: string
  /** AGENTS.md - Operational instructions */
  agents: string
  /** IDENTITY.md - Name, emoji, avatar */
  identity: string
  /** TOOLS.md - Tool-specific config (optional) */
  tools?: string
  /** HEARTBEAT.md - Periodic task checklist (optional) */
  heartbeat?: string
}

/**
 * Manages tenant directory structure for isolated clawdbot instances
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
    return join(this.baseDir, tenantId)
  }

  /**
   * Get the clawdbot state directory for a tenant
   */
  getStateDir(tenantId: string): string {
    return join(this.getTenantDir(tenantId), '.clawdbot')
  }

  /**
   * Get the main tenant config path
   */
  getConfigPath(tenantId: string): string {
    return join(this.getStateDir(tenantId), 'config.json')
  }

  /**
   * Get the workspaces container directory for a tenant
   */
  getWorkspacesDir(tenantId: string): string {
    return join(this.getTenantDir(tenantId), 'workspaces')
  }

  /**
   * Get the workspace directory for a specific employee
   */
  getAgentWorkspaceDir(tenantId: string, employeeId: string): string {
    return join(this.getWorkspacesDir(tenantId), employeeId)
  }

  /**
   * Check if a tenant directory exists
   */
  async tenantExists(tenantId: string): Promise<boolean> {
    try {
      await access(this.getTenantDir(tenantId))
      return true
    } catch {
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
   * Get the tenant-level USER.md path
   * USER.md is shared by all agents in a tenant (describes the organization/human they serve)
   */
  getUserMdPath(tenantId: string): string {
    return join(this.getTenantDir(tenantId), 'USER.md')
  }

  /**
   * Create the full directory structure for a new tenant
   * Note: Per-agent workspaces are created when agents are added
   */
  async createTenant(tenantId: string, tenantName: string): Promise<void> {
    const stateDir = this.getStateDir(tenantId)
    const tenantDir = this.getTenantDir(tenantId)

    // Create directory structure
    await mkdir(join(stateDir, 'agents'), { recursive: true })
    await mkdir(join(stateDir, 'state'), { recursive: true })

    // Create default clawdbot config with empty agents list
    const config: TenantConfig = {
      tenant: {
        id: tenantId,
        name: tenantName,
      },
      gateway: {
        mode: 'local',
      },
      agents: {
        list: [],
      },
    }
    await this.saveConfig(tenantId, config)

    // Create empty sessions file
    await writeFile(join(stateDir, 'state', 'sessions.json'), '{}')

    // Create tenant-level USER.md (shared by all agents)
    const userMd = this.generateUserMd(tenantName)
    await writeFile(join(tenantDir, 'USER.md'), userMd)
  }

  /**
   * Generate default USER.md content for a tenant
   * This describes the organization/human all agents serve
   */
  private generateUserMd(tenantName: string): string {
    return `# USER.md - About Your Organization

*This file describes the organization all AI employees serve.*

- **Organization:** ${tenantName}
- **Industry:**
- **Timezone:**
- **Notes:**

## Context

*(What does this organization do? What are its values? What should AI employees know about it?)*

## Preferences

*(Communication style, working hours, response expectations, etc.)*

---

Update this file to help your AI employees understand who they're working for.
`
  }

  /**
   * Update tenant's USER.md file
   */
  async updateUserMd(tenantId: string, content: string): Promise<void> {
    const userMdPath = this.getUserMdPath(tenantId)
    await writeFile(userMdPath, content)
  }

  /**
   * Read tenant's USER.md file
   */
  async readUserMd(tenantId: string): Promise<string | null> {
    try {
      const userMdPath = this.getUserMdPath(tenantId)
      return await readFile(userMdPath, 'utf-8')
    } catch {
      return null
    }
  }

  /**
   * Delete a tenant's directory and all data
   */
  async deleteTenant(tenantId: string): Promise<void> {
    const tenantDir = this.getTenantDir(tenantId)
    await rm(tenantDir, { recursive: true, force: true })
  }

  /**
   * Create an employee's agent sessions directory
   */
  async createEmployeeDir(tenantId: string, employeeId: string): Promise<string> {
    const agentDir = join(this.getStateDir(tenantId), 'agents', employeeId, 'sessions')
    await mkdir(agentDir, { recursive: true })
    return agentDir
  }

  /**
   * Create workspace directory for an employee with all Clawdbot workspace files
   * Following native Clawdbot conventions:
   * - SOUL.md - Agent personality/core identity
   * - AGENTS.md - Operational instructions
   * - IDENTITY.md - Name, emoji, avatar
   * - TOOLS.md - Tool-specific config
   * - HEARTBEAT.md - Periodic task checklist
   * - skills/ - Agent-specific skills
   */
  async createEmployeeWorkspace(
    tenantId: string,
    employeeId: string,
    options: {
      name: string
      files?: WorkspaceFiles
    }
  ): Promise<string> {
    const workspaceDir = this.getAgentWorkspaceDir(tenantId, employeeId)

    // Create workspace structure
    await mkdir(join(workspaceDir, 'skills'), { recursive: true })
    await mkdir(join(workspaceDir, 'memory'), { recursive: true })

    // Use provided files or generate defaults
    const files = options.files || this.generateDefaultWorkspaceFiles(options.name)

    // Write all workspace files
    await Promise.all([
      writeFile(join(workspaceDir, 'SOUL.md'), files.soul),
      writeFile(join(workspaceDir, 'AGENTS.md'), files.agents),
      writeFile(join(workspaceDir, 'IDENTITY.md'), files.identity),
      writeFile(join(workspaceDir, 'TOOLS.md'), files.tools || DEFAULT_TOOLS_TEMPLATE),
      writeFile(join(workspaceDir, 'HEARTBEAT.md'), files.heartbeat || DEFAULT_HEARTBEAT_TEMPLATE),
    ])

    // Symlink USER.md from tenant root into agent workspace
    // Real file: /tenants/{id}/USER.md (one copy, shared)
    // Symlink:   /tenants/{id}/workspaces/{agent}/USER.md → ../../USER.md
    const tenantUserMd = this.getUserMdPath(tenantId)
    const agentUserMdLink = join(workspaceDir, 'USER.md')
    try {
      const relativePath = relative(workspaceDir, tenantUserMd)
      await symlink(relativePath, agentUserMdLink)
    } catch {
      // Symlink may fail (Windows, or file exists) - copy as fallback
      try {
        const content = await readFile(tenantUserMd, 'utf-8')
        await writeFile(agentUserMdLink, content)
      } catch {
        // USER.md may not exist yet, skip
      }
    }

    return workspaceDir
  }

  /**
   * Generate default workspace files for an employee
   */
  private generateDefaultWorkspaceFiles(employeeName: string): WorkspaceFiles {
    return {
      soul: this.generateDefaultSoulContent(employeeName),
      agents: DEFAULT_AGENTS_TEMPLATE,
      identity: DEFAULT_IDENTITY_TEMPLATE(employeeName, '🤖'),
      tools: DEFAULT_TOOLS_TEMPLATE,
      heartbeat: DEFAULT_HEARTBEAT_TEMPLATE,
    }
  }

  /**
   * Update an employee's SOUL.md file
   */
  async updateEmployeeSoul(
    tenantId: string,
    employeeId: string,
    soulContent: string
  ): Promise<void> {
    const soulPath = join(this.getAgentWorkspaceDir(tenantId, employeeId), 'SOUL.md')
    await writeFile(soulPath, soulContent)
  }

  /**
   * Update an employee's AGENTS.md file
   */
  async updateEmployeeAgents(
    tenantId: string,
    employeeId: string,
    agentsContent: string
  ): Promise<void> {
    const agentsPath = join(this.getAgentWorkspaceDir(tenantId, employeeId), 'AGENTS.md')
    await writeFile(agentsPath, agentsContent)
  }

  /**
   * Update an employee's IDENTITY.md file
   */
  async updateEmployeeIdentity(
    tenantId: string,
    employeeId: string,
    identityContent: string
  ): Promise<void> {
    const identityPath = join(this.getAgentWorkspaceDir(tenantId, employeeId), 'IDENTITY.md')
    await writeFile(identityPath, identityContent)
  }

  /**
   * Generate default SOUL.md content for an employee
   */
  private generateDefaultSoulContent(employeeName: string): string {
    return `# ${employeeName}

You are ${employeeName}, an AI employee.

## Core Values
- Be genuinely helpful, not performatively helpful
- Have opinions when asked
- Be resourceful before asking questions

## Boundaries
- Protect sensitive data
- Ask for clarification when needed
- Don't run destructive commands without asking
`
  }

  /**
   * Register or update an employee/agent in the tenant config
   * This is the native Clawdbot way - agents must be in config.json agents.list[]
   */
  async writeEmployeeConfig(
    tenantId: string,
    employeeId: string,
    config: {
      name: string
      model: AgentModelConfig
      skills?: string[]
      /** Workspace files - if provided, uses template content */
      workspaceFiles?: WorkspaceFiles
    }
  ): Promise<void> {
    // Create agent sessions directory
    await this.createEmployeeDir(tenantId, employeeId)

    // Create agent workspace with all Clawdbot workspace files
    const workspaceDir = await this.createEmployeeWorkspace(tenantId, employeeId, {
      name: config.name,
      files: config.workspaceFiles,
    })

    // Load current tenant config
    const tenantConfig = await this.loadConfig(tenantId)

    // Ensure agents.list exists
    if (!tenantConfig.agents) {
      tenantConfig.agents = { list: [] }
    }
    if (!tenantConfig.agents.list) {
      tenantConfig.agents.list = []
    }

    // Build agent entry for Clawdbot config
    const agentEntry: AgentEntry = {
      id: employeeId,
      name: config.name,
      workspace: workspaceDir,
      model: config.model,
    }

    // Add tools/skills if provided
    if (config.skills && config.skills.length > 0) {
      agentEntry.tools = {
        allow: config.skills,
      }
    }

    // Update or add agent to list
    const existingIndex = tenantConfig.agents.list.findIndex((a) => a.id === employeeId)
    if (existingIndex >= 0) {
      tenantConfig.agents.list[existingIndex] = agentEntry
    } else {
      tenantConfig.agents.list.push(agentEntry)
    }

    // Save updated config
    await this.saveConfig(tenantId, tenantConfig)
  }

  /**
   * Delete an employee's agent directory, workspace, and config entry
   */
  async deleteEmployeeDir(tenantId: string, employeeId: string): Promise<void> {
    // Delete agent state directory
    const agentDir = join(this.getStateDir(tenantId), 'agents', employeeId)
    await rm(agentDir, { recursive: true, force: true })

    // Delete agent workspace directory
    const workspaceDir = this.getAgentWorkspaceDir(tenantId, employeeId)
    await rm(workspaceDir, { recursive: true, force: true })

    // Remove agent from tenant config
    try {
      const tenantConfig = await this.loadConfig(tenantId)
      if (tenantConfig.agents?.list) {
        tenantConfig.agents.list = tenantConfig.agents.list.filter((a) => a.id !== employeeId)
        await this.saveConfig(tenantId, tenantConfig)
      }
    } catch {
      // Config may not exist if tenant was deleted
    }
  }
}

// Singleton instance
export const tenantManager = new TenantManager()
