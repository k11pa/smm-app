export type ProviderId = 'anthropic' | 'openai' | 'gemini'

export interface AiSettings {
  provider: ProviderId
  model: string
  hasKey: Record<ProviderId, boolean>
}

export interface Settings {
  language: 'en' | 'he' | 'ru'
  ai: AiSettings
}

export const DEFAULT_MODELS: Record<ProviderId, string[]> = {
  anthropic: ['claude-haiku-5-5', 'claude-sonnet-5-5', 'claude-opus-5-5'],
  openai: ['gpt-4o-mini', 'gpt-4o'],
  gemini: ['gemini-2.0-flash', 'gemini-1.5-pro']
}

export interface ChatResult {
  ok: boolean
  text?: string
  error?: string
}
