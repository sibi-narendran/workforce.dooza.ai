import { join } from 'node:path'
import { env } from '../lib/env.js'

/**
 * Helper functions for tenant data paths
 */

export function getTenantDir(tenantId: string): string {
  return join(env.TENANT_DATA_DIR, tenantId)
}

export function getStateDir(tenantId: string): string {
  return join(getTenantDir(tenantId), '.clawdbot')
}

export function getConfigPath(tenantId: string): string {
  return join(getStateDir(tenantId), 'config.json')
}

export function getSessionsPath(tenantId: string): string {
  return join(getStateDir(tenantId), 'state', 'sessions.json')
}

export function getAgentDir(tenantId: string, agentId: string): string {
  return join(getStateDir(tenantId), 'agents', agentId)
}

export function getAgentSessionsDir(tenantId: string, agentId: string): string {
  return join(getAgentDir(tenantId, agentId), 'sessions')
}

/**
 * Get the workspaces container directory (holds all agent workspaces)
 */
export function getWorkspacesDir(tenantId: string): string {
  return join(getTenantDir(tenantId), 'workspaces')
}

/**
 * Get the workspace directory for a specific agent/employee
 */
export function getAgentWorkspaceDir(tenantId: string, agentId: string): string {
  return join(getWorkspacesDir(tenantId), agentId)
}

/**
 * Get the skills directory for a specific agent/employee
 */
export function getAgentSkillsDir(tenantId: string, agentId: string): string {
  return join(getAgentWorkspaceDir(tenantId, agentId), 'skills')
}

/**
 * Get the SOUL.md path for a specific agent/employee
 */
export function getAgentSoulPath(tenantId: string, agentId: string): string {
  return join(getAgentWorkspaceDir(tenantId, agentId), 'SOUL.md')
}
