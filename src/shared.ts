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

// Languages offered in Settings. Hebrew strings and RTL support stay in the code; add 'he' here to bring it back.
export const INTERFACE_LANGUAGES: { code: Settings['language']; name: string }[] = [
  { code: 'en', name: 'English' },
  { code: 'ru', name: 'Русский' }
]

export const DEFAULT_MODELS: Record<ProviderId, string[]> = {
  anthropic: ['claude-haiku-5-5', 'claude-sonnet-5-5', 'claude-opus-5-5'],
  openai: ['gpt-4o-mini', 'gpt-4o'],
  gemini: ['gemini-2.0-flash', 'gemini-1.5-pro']
}

export const PLATFORMS = ['Instagram', 'Facebook', 'TikTok', 'LinkedIn', 'X', 'Telegram'] as const
export type Platform = (typeof PLATFORMS)[number]

export const POST_FORMATS = ['post', 'carousel', 'reel', 'story', 'video'] as const
export type PostFormat = (typeof POST_FORMATS)[number]

export interface PlanItem {
  id: number
  brandId: number
  date: string // YYYY-MM-DD
  platform: Platform
  format: PostFormat
  pillar: string
  title: string
  notes: string
  source: ProfileSource
  // True once the owner changed the item; regeneration must leave it alone.
  edited: boolean
  createdAt: string
  updatedAt: string
}

export const PROFILE_SECTIONS = ['about', 'audience', 'tone', 'pillars', 'competitors', 'markets', 'platforms', 'goals'] as const
export type ProfileSection = (typeof PROFILE_SECTIONS)[number]

// Language of the brand's content. Independent of the interface language.
export const CONTENT_LANGUAGES = [
  { code: 'en', native: 'English', english: 'English' },
  { code: 'he', native: 'עברית', english: 'Hebrew' },
  { code: 'ar', native: 'العربية', english: 'Arabic' },
  { code: 'ru', native: 'Русский', english: 'Russian' },
  { code: 'de', native: 'Deutsch', english: 'German' },
  { code: 'fr', native: 'Français', english: 'French' },
  { code: 'es', native: 'Español', english: 'Spanish' },
  { code: 'it', native: 'Italiano', english: 'Italian' },
  { code: 'pt', native: 'Português', english: 'Portuguese' },
  { code: 'nl', native: 'Nederlands', english: 'Dutch' },
  { code: 'pl', native: 'Polski', english: 'Polish' }
] as const

export interface Brand {
  id: number
  name: string
  website: string | null
  contentLanguage: string
  createdAt: string
  updatedAt: string
}

export type ProfileSource = 'ai' | 'user'

export interface BrandProfileVersion {
  brandId: number
  version: number
  data: unknown
  source: ProfileSource
  createdAt: string
}

export interface ChatResult {
  ok: boolean
  text?: string
  error?: string
}
