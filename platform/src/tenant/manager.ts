import { mkdir, rm, writeFile, readFile, access } from 'node:fs/promises'
import { join } from 'node:path'
import { env } from '../lib/env.js'

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
    return join(this.baseDir, tenantId)
  }

  /**
   * Get the tenant config path
   */
  getConfigPath(tenantId: string): string {
    return join(this.getTenantDir(tenantId), 'config.json')
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
   */
  getUserMdPath(tenantId: string): string {
    return join(this.getTenantDir(tenantId), 'USER.md')
  }

  /**
   * Create directory structure for a new tenant
   */
  async createTenant(tenantId: string, tenantName: string): Promise<void> {
    const tenantDir = this.getTenantDir(tenantId)

    // Create tenant directory
    await mkdir(tenantDir, { recursive: true })

    // Create config
    const config: TenantConfig = {
      tenant: {
        id: tenantId,
        name: tenantName,
      },
    }
    await this.saveConfig(tenantId, config)

    // Create USER.md
    const userMd = this.generateUserMd(tenantName)
    await writeFile(join(tenantDir, 'USER.md'), userMd)
  }

  /**
   * Generate default USER.md content for a tenant
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
}

// Singleton instance
export const tenantManager = new TenantManager()
