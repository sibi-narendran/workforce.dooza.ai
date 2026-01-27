import { env } from './env.js'

interface Message {
  role: 'system' | 'user' | 'assistant'
  content: string
}

interface CompletionOptions {
  model?: string
  temperature?: number
  maxTokens?: number
}

interface CompletionResult {
  content: string
  model: string
  usage: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
}

/**
 * OpenRouter API client for AI completions
 */
export class OpenRouterClient {
  private apiKey: string
  private baseUrl = 'https://openrouter.ai/api/v1'

  constructor(apiKey?: string) {
    this.apiKey = apiKey || env.OPENROUTER_API_KEY || ''
    if (!this.apiKey) {
      console.warn('[OpenRouter] No API key configured')
    }
  }

  /**
   * Create a chat completion
   */
  async chat(messages: Message[], options: CompletionOptions = {}): Promise<CompletionResult> {
    const model = options.model || env.DEFAULT_MODEL

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://workforce.dooza.ai',
        'X-Title': 'Workforce Platform',
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: options.temperature ?? 0.7,
        max_tokens: options.maxTokens ?? 4096,
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`OpenRouter API error: ${response.status} - ${error}`)
    }

    const data = await response.json()

    return {
      content: data.choices[0]?.message?.content || '',
      model: data.model,
      usage: {
        promptTokens: data.usage?.prompt_tokens || 0,
        completionTokens: data.usage?.completion_tokens || 0,
        totalTokens: data.usage?.total_tokens || 0,
      },
    }
  }

  /**
   * Simple completion with a single prompt
   */
  async complete(prompt: string, systemPrompt?: string, options: CompletionOptions = {}): Promise<CompletionResult> {
    const messages: Message[] = []

    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt })
    }

    messages.push({ role: 'user', content: prompt })

    return this.chat(messages, options)
  }
}

// Singleton instance
export const openrouter = new OpenRouterClient()
