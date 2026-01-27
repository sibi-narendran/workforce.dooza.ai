import { z } from 'zod'
import { getTemplate, type EmployeeTemplate } from './templates.js'

/**
 * Schema for creating a new employee
 */
export const createEmployeeSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.string().min(1),
  description: z.string().optional(),
  skills: z.array(z.string()).optional(),
  model: z.string().default('google/gemini-3-pro-preview'),
  identityPrompt: z.string().optional(),
})

export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>

/**
 * Schema for updating an employee
 */
export const updateEmployeeSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().optional(),
  skills: z.array(z.string()).optional(),
  model: z.string().optional(),
  identityPrompt: z.string().optional(),
})

export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>

/**
 * Available skills that can be assigned to employees
 */
export const AVAILABLE_SKILLS = [
  { id: 'web-search', name: 'Web Search', description: 'Search the web for information' },
  { id: 'web-fetch', name: 'Web Fetch', description: 'Fetch and read web pages' },
  { id: 'file-read', name: 'File Read', description: 'Read files from workspace' },
  { id: 'file-write', name: 'File Write', description: 'Create and modify files' },
  { id: 'bash', name: 'Shell Commands', description: 'Execute shell commands' },
  { id: 'python', name: 'Python', description: 'Run Python scripts' },
  { id: 'grep', name: 'Search Code', description: 'Search through code files' },
  { id: 'glob', name: 'Find Files', description: 'Find files by pattern' },
] as const

export type SkillId = (typeof AVAILABLE_SKILLS)[number]['id']

/**
 * Available AI models (via OpenRouter)
 */
export const AVAILABLE_MODELS = [
  { id: 'google/gemini-3-pro-preview', name: 'Gemini 3 Pro', description: 'Fast and capable (Recommended)' },
  { id: 'google/gemini-2.0-flash-001', name: 'Gemini 2 Flash', description: 'Fastest, most affordable' },
  { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet', description: 'High quality reasoning' },
  { id: 'openai/gpt-4o', name: 'GPT-4o', description: 'OpenAI flagship model' },
  { id: 'meta-llama/llama-3.3-70b-instruct', name: 'Llama 3.3 70B', description: 'Open source, capable' },
] as const

/**
 * Build employee configuration from input
 */
export function buildEmployeeConfig(input: CreateEmployeeInput): {
  name: string
  type: string
  description: string | null
  skills: string[]
  model: string
  identityPrompt: string | null
} {
  // If using a template, merge with template defaults
  const template = getTemplate(input.type)

  if (template) {
    return {
      name: input.name || template.name,
      type: input.type,
      description: input.description || template.description,
      skills: input.skills || template.skills,
      model: input.model || template.model,
      identityPrompt: input.identityPrompt || template.identity,
    }
  }

  // Custom employee
  return {
    name: input.name,
    type: input.type,
    description: input.description || null,
    skills: input.skills || [],
    model: input.model,
    identityPrompt: input.identityPrompt || null,
  }
}

/**
 * Validate that requested skills are available
 */
export function validateSkills(skills: string[]): string[] {
  const availableIds = AVAILABLE_SKILLS.map((s) => s.id)
  const invalid = skills.filter((s) => !availableIds.includes(s as SkillId))

  if (invalid.length > 0) {
    throw new Error(`Invalid skills: ${invalid.join(', ')}`)
  }

  return skills
}

/**
 * Validate that requested model is available
 * Note: OpenRouter supports many models, so we accept any valid model string
 */
export function validateModel(model: string): string {
  // Basic validation - model should have format provider/model-name
  if (!model || model.length < 3) {
    throw new Error(`Invalid model: ${model}`)
  }

  return model
}
