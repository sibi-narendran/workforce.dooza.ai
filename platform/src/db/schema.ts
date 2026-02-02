import { pgTable, uuid, text, timestamp, boolean, jsonb, integer } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

// Agent Library (shared catalog of available agents)
export const agentLibrary = pgTable('agent_library', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').unique().notNull(), // e.g., 'clawd', 'researcher'
  name: text('name').notNull(),
  description: text('description'),
  emoji: text('emoji'),
  gradient: text('gradient'), // CSS gradient for avatar
  category: text('category').default('assistant'), // 'assistant', 'specialist', 'support', 'creative'
  defaultModel: text('default_model').default('openrouter/anthropic/claude-sonnet-4'),
  identityPrompt: text('identity_prompt'), // System prompt / personality
  skills: text('skills').array(), // Available skills/tools
  isPublic: boolean('is_public').default(true), // Visible in library
  installCount: integer('install_count').default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
})

// Installed Agents (per-tenant instances from library)
export const installedAgents = pgTable('installed_agents', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').references(() => tenants.id).notNull(),
  userId: uuid('user_id').notNull(), // Who installed it
  agentId: uuid('agent_id').references(() => agentLibrary.id).notNull(),
  customName: text('custom_name'), // Optional name override
  customPrompt: text('custom_prompt'), // Additional instructions
  customModel: text('custom_model'), // Model override
  settings: jsonb('settings'), // Any other customizations
  isActive: boolean('is_active').default(true),
  installedAt: timestamp('installed_at', { withTimezone: true }).defaultNow(),
})

// Tenants (organizations)
export const tenants = pgTable('tenants', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').unique().notNull(),
  plan: text('plan').default('free'),
  ownerId: uuid('owner_id').notNull(), // References auth.users(id)
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
})

// User profiles (extends Supabase auth.users)
export const profiles = pgTable('profiles', {
  id: uuid('id').primaryKey(), // References auth.users(id)
  tenantId: uuid('tenant_id').references(() => tenants.id),
  role: text('role').default('member'),
  displayName: text('display_name'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
})

// AI Employees
export const employees = pgTable('employees', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').references(() => tenants.id).notNull(),
  name: text('name').notNull(),
  type: text('type').notNull(), // 'researcher', 'writer', 'assistant', 'custom'
  description: text('description'),
  skills: text('skills').array(), // ['web-search', 'file-write', ...]
  model: text('model').default('google/gemini-3-pro-preview'),
  identityPrompt: text('identity_prompt'), // Custom SOUL.md content
  isTemplate: boolean('is_template').default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
})

// Scheduled Jobs
export const jobs = pgTable('jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').references(() => tenants.id).notNull(),
  employeeId: uuid('employee_id').references(() => employees.id).notNull(),
  name: text('name').notNull(),
  schedule: text('schedule').notNull(), // Cron expression
  prompt: text('prompt').notNull(), // What to tell the employee
  enabled: boolean('enabled').default(true),
  lastRunAt: timestamp('last_run_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
})

// Conversation metadata (transcripts stored in clawdbot files)
export const conversations = pgTable('conversations', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').references(() => tenants.id).notNull(),
  employeeId: uuid('employee_id').references(() => employees.id).notNull(),
  sessionKey: text('session_key').notNull(), // Maps to clawdbot session
  title: text('title'),
  lastMessageAt: timestamp('last_message_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
})

// Integration Providers (available apps like Google, Slack, etc.)
export const integrationProviders = pgTable('integration_providers', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').unique().notNull(), // e.g., 'google', 'slack', 'github'
  name: text('name').notNull(),
  description: text('description'),
  icon: text('icon'), // Emoji or URL
  // IMPORTANT: This must be the authConfigId from Composio dashboard, NOT the app name
  // Create auth configs at: https://app.composio.dev/auth_configs
  // Example: 'ac_12343544' (not 'gmail' or 'google')
  composioAppKey: text('composio_app_key').notNull(),
  // Toolkit name for fetching tools (uppercase), e.g., 'GMAIL', 'SLACK'
  composioToolkit: text('composio_toolkit'),
  category: text('category').default('productivity'), // 'communication', 'productivity', 'dev', 'storage', 'social'
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
})

// Tenant's connected integration accounts (1 user = 1 tenant for now)
export const userIntegrations = pgTable('user_integrations', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').references(() => tenants.id).notNull(),
  providerId: uuid('provider_id').references(() => integrationProviders.id).notNull(),
  composioEntityId: text('composio_entity_id').notNull(), // Composio entity (workforce-{tenantId})
  composioConnectionId: text('composio_connection_id').notNull(), // The connection
  status: text('status').default('connected'), // 'connected', 'expired', 'revoked', 'pending'
  connectedAt: timestamp('connected_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  // Unique constraint: one connection per provider per tenant
  // Note: DB migration needed to change from (userId, providerId) to (tenantId, providerId)
})

// Which integrations an agent can use (optional - for explicit assignment)
export const agentIntegrationSkills = pgTable('agent_integration_skills', {
  id: uuid('id').primaryKey().defaultRandom(),
  agentId: uuid('agent_id').references(() => agentLibrary.id).notNull(),
  providerId: uuid('provider_id').references(() => integrationProviders.id).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
})

// Type exports for use in application code
export type AgentLibraryItem = typeof agentLibrary.$inferSelect
export type NewAgentLibraryItem = typeof agentLibrary.$inferInsert
export type InstalledAgent = typeof installedAgents.$inferSelect
export type NewInstalledAgent = typeof installedAgents.$inferInsert
export type Tenant = typeof tenants.$inferSelect
export type NewTenant = typeof tenants.$inferInsert
export type Profile = typeof profiles.$inferSelect
export type NewProfile = typeof profiles.$inferInsert
export type Employee = typeof employees.$inferSelect
export type NewEmployee = typeof employees.$inferInsert
export type Job = typeof jobs.$inferSelect
export type NewJob = typeof jobs.$inferInsert
export type Conversation = typeof conversations.$inferSelect
export type NewConversation = typeof conversations.$inferInsert
export type IntegrationProvider = typeof integrationProviders.$inferSelect
export type NewIntegrationProvider = typeof integrationProviders.$inferInsert
export type UserIntegration = typeof userIntegrations.$inferSelect
export type NewUserIntegration = typeof userIntegrations.$inferInsert
export type AgentIntegrationSkill = typeof agentIntegrationSkills.$inferSelect
export type NewAgentIntegrationSkill = typeof agentIntegrationSkills.$inferInsert

// Brain Files (AI-managed storage per tenant)
export const brainFiles = pgTable('brain_files', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').references(() => tenants.id).notNull(),
  fileName: text('file_name').notNull(),
  filePath: text('file_path').notNull(),
  mimeType: text('mime_type'),
  fileSize: integer('file_size'),
  category: text('category').default('general'),
  description: text('description'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
})

export type BrainFile = typeof brainFiles.$inferSelect
export type NewBrainFile = typeof brainFiles.$inferInsert
