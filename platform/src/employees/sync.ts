import { tenantManager, type WorkspaceFiles } from '../tenant/manager.js'
import type { Employee } from '../db/schema.js'
import { getTemplate } from './templates.js'

/**
 * Sync employee from database to clawdbot agent config
 * Uses template workspace files if employee type matches a template
 */
export async function syncEmployeeToClawdbot(employee: Employee): Promise<void> {
  // Try to get template for this employee type
  const template = getTemplate(employee.type)

  // Build workspace files from template or use defaults
  let workspaceFiles: WorkspaceFiles | undefined

  if (template) {
    // Use template's pre-defined workspace files
    workspaceFiles = {
      soul: template.soul,
      agents: template.agents,
      identity: template.identity,
    }
  } else if (employee.identityPrompt) {
    // Custom employee with identity prompt - use it as SOUL.md
    workspaceFiles = {
      soul: employee.identityPrompt,
      agents: generateCustomAgentsMd(employee.name),
      identity: generateCustomIdentityMd(employee.name),
    }
  }
  // If no template and no identityPrompt, manager will use defaults

  await tenantManager.writeEmployeeConfig(employee.tenantId, employee.id, {
    name: employee.name,
    model: employee.model || 'claude-sonnet-4-5',
    skills: employee.skills || [],
    workspaceFiles,
  })
}

/**
 * Generate AGENTS.md for custom employees
 */
function generateCustomAgentsMd(name: string): string {
  return `# AGENTS.md - ${name}

## Your Role

You are ${name}, an AI employee. Follow the instructions in SOUL.md for your personality and approach.

## How to Work

1. **Understand the request** - Clarify before acting
2. **Use your tools** - Leverage your skills effectively
3. **Communicate clearly** - Keep stakeholders informed
4. **Learn and improve** - Document what works

## Safety

- Don't exfiltrate private data
- Don't run destructive commands without asking
- When in doubt, ask

## When Stuck

- Ask for clarification
- Suggest alternative approaches
- Document blockers
`
}

/**
 * Generate IDENTITY.md for custom employees
 */
function generateCustomIdentityMd(name: string): string {
  return `# IDENTITY.md

- **Name:** ${name}
- **Emoji:** 🤖
- **Creature:** AI Employee
- **Vibe:** Professional, helpful, efficient
`
}

/**
 * Remove employee from clawdbot
 */
export async function removeEmployeeFromClawdbot(
  tenantId: string,
  employeeId: string
): Promise<void> {
  await tenantManager.deleteEmployeeDir(tenantId, employeeId)
}

/**
 * Sync all employees for a tenant
 */
export async function syncAllEmployees(tenantId: string, employees: Employee[]): Promise<void> {
  await Promise.all(employees.map((emp) => syncEmployeeToClawdbot(emp)))
}
