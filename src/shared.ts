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
  // True once the owner changed the item or a post was written for it; regeneration must leave it alone.
  edited: boolean
  hasPost: boolean
  createdAt: string
  updatedAt: string
}

export interface Post {
  planItemId: number
  platform: Platform
  version: number
  body: string
  hashtags: string[]
  source: ProfileSource
  createdAt: string
}

// Published limits disagree between sources, so these are the cautious ones. The UI warns; only generated text must fit.
const PLATFORM_LIMITS: Record<Platform, { chars: number; hashtags: number }> = {
  Instagram: { chars: 2200, hashtags: 5 },
  Facebook: { chars: 10000, hashtags: 3 },
  TikTok: { chars: 2200, hashtags: 5 },
  LinkedIn: { chars: 3000, hashtags: 5 },
  X: { chars: 280, hashtags: 2 },
  Telegram: { chars: 4096, hashtags: 3 }
}

const TELEGRAM_CAPTION_CHARS = 1024

export function postLimits(platform: Platform, format: PostFormat) {
  const limits = PLATFORM_LIMITS[platform]
  return platform === 'Telegram' && format === 'video' ? { ...limits, chars: TELEGRAM_CAPTION_CHARS } : limits
}

export function normalizeHashtags(values: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const value of values.flatMap((v) => v.split(/[\s,]+/))) {
    const tag = value.replace(/^#+/, '').replace(/[^\p{L}\p{M}\p{N}_]/gu, '')
    if (!tag || seen.has(tag.toLowerCase())) continue
    seen.add(tag.toLowerCase())
    result.push(`#${tag}`)
  }
  return result
}

export const composePost = (body: string, hashtags: string[]) => (hashtags.length ? `${body.trim()}\n\n${hashtags.join(' ')}` : body.trim())

// Counts whole characters, so an emoji counts once. A platform's own counter may differ slightly, for example on X.
export const charCount = (text: string) => [...text].length

export interface MonthStrategy {
  focus: string
  themes: string[]
  rhythm: string
}

// Dates are plain YYYY-MM-DD strings computed in UTC, so a timezone or daylight saving change can't shift a post to another day.
export const toIso = (d: Date) => d.toISOString().slice(0, 10)

export function todayIso(now = new Date()) {
  return toIso(new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())))
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
