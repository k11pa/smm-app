import { z } from 'zod'
import { MonthStrategy, PLATFORMS, POST_FORMATS, PlanItem, Platform, PostFormat, toIso } from '../shared'
import type { NewPlanItem } from './plan'
import { BrandProfile, extractJson, normalizePlatforms, systemPrompt } from './profile'

const PLATFORM_FORMATS: Record<Platform, PostFormat[]> = {
  Instagram: ['post', 'carousel', 'reel', 'story'],
  Facebook: ['post', 'carousel', 'video', 'story'],
  TikTok: ['video', 'carousel'],
  LinkedIn: ['post', 'carousel', 'video'],
  X: ['post', 'video'],
  Telegram: ['post', 'video']
}

export interface PlanContext {
  name: string
  contentLanguage: string
  profile: BrandProfile
  year: number
  month: number // 0-11
  // The only days the model may use, from the code rather than from the model.
  dates: string[]
  needed: number
  // Ideas the owner created or changed. They stay, and the plan works around them.
  kept: PlanItem[]
}

export type GeneratedItem = Omit<NewPlanItem, 'brandId' | 'source'>

export const monthKey = (year: number, month: number) => `${year}-${String(month + 1).padStart(2, '0')}`

export function monthRange(year: number, month: number) {
  return { first: toIso(new Date(Date.UTC(year, month, 1))), last: toIso(new Date(Date.UTC(year, month + 1, 0))) }
}

// A plan never places ideas in the past, so a current month starts today.
export function availableDates(year: number, month: number, today: string): string[] {
  const { last } = monthRange(year, month)
  const count = Number(last.slice(8))
  return Array.from({ length: count }, (_, i) => toIso(new Date(Date.UTC(year, month, i + 1)))).filter((d) => d >= today)
}

export function targetCount(postsPerWeek: number, days: number) {
  return Math.max(1, Math.round((postsPerWeek * days) / 7))
}

const usablePlatforms = (profile: BrandProfile): readonly Platform[] => (profile.platforms.length ? profile.platforms : PLATFORMS)

const weekday = (iso: string) => new Intl.DateTimeFormat('en', { weekday: 'short', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`))

const ITEM_SHAPE = '{ "date": string, "platform": string, "format": string, "pillar": string, "title": string, "notes": string }'

// Competitors are left out: unchecked suggestions must not reach post ideas.
function profileBlock(profile: BrandProfile) {
  const { summary, products, usp, proofPoints, audience, tone, avoid, pillars, markets, goals } = profile
  return `<current_profile>\n${JSON.stringify({ summary, products, usp, proofPoints, audience, tone, avoid, pillars, markets, goals })}\n</current_profile>`
}

function ideaRules(profile: BrandProfile) {
  return [
    `- platform: only ${usablePlatforms(profile).join(', ')}. Balance them according to where this audience is.`,
    `- format: one of ${POST_FORMATS.join(', ')}, and one that exists on that platform.`,
    `- pillar: the exact name of a pillar from the profile. Balance the pillars.${profile.pillars.length ? '' : ' There are none yet, so use an empty string.'}`,
    '- title: one specific hook or scenario for this business, not a topic label.',
    '- notes: the angle and the call to action, in one or two sentences.',
    '- Follow the "avoid" list, including anything in it about particular days of the week.',
    '- Do not mention specific holidays, seasonal events or calendar dates, and do not name competitors.',
    '- Use only facts from the profile. Never invent prices, offers, numbers, clients or events.'
  ]
}

const listIdeas = (items: PlanItem[]) => items.map((i) => `- ${i.date} ${i.platform}: ${i.title}`).join('\n')

export function buildPlanPrompts(ctx: PlanContext) {
  const kept = listIdeas(ctx.kept)
  return {
    system: systemPrompt(ctx.contentLanguage, 'planning a month of social media content'),
    prompt: [
      `Plan ${monthKey(ctx.year, ctx.month)} for "${ctx.name}" with exactly ${ctx.needed} new post ideas.`,
      '',
      profileBlock(ctx.profile),
      '',
      'Dates you may use, and no others:',
      ctx.dates.map((d) => `${d} ${weekday(d)}`).join(', '),
      '',
      kept ? `Already planned by the owner. These stay, so do not repeat them, and count them when balancing:\n${kept}\n` : '',
      'Rules:',
      '- Spread the ideas evenly across the weeks. Avoid two ideas on one day unless there are too few dates.',
      ...ideaRules(ctx.profile),
      '',
      'Return JSON in exactly this shape:',
      `{ "strategy": { "focus": string (the main goal of this month, in one or two sentences), "themes": string[] (2-5), "rhythm": string (how the posts are distributed across platforms and the week) }, "items": [${ITEM_SHAPE}] }`
    ].join('\n')
  }
}

export interface DayContext extends PlanContext {
  strategy: MonthStrategy | null
  // The ideas being replaced, so the new ones can differ from them.
  replacing: PlanItem[]
}

export function buildDayPrompts(ctx: DayContext) {
  const date = ctx.dates[0]
  const others = listIdeas(ctx.kept)
  const replacing = listIdeas(ctx.replacing)
  return {
    system: systemPrompt(ctx.contentLanguage, 'planning social media content'),
    prompt: [
      `Write exactly ${ctx.needed} new post idea${ctx.needed === 1 ? '' : 's'} for "${ctx.name}" on ${date} (${weekday(date)}). The date of every idea must be ${date}.`,
      '',
      profileBlock(ctx.profile),
      '',
      ctx.strategy ? `Strategy for this month:\n${JSON.stringify(ctx.strategy)}\n` : '',
      replacing ? `The owner rejected these ideas for this day. Take a clearly different angle, not a rewording:\n${replacing}\n` : '',
      others ? `Other ideas this month. These stay, so do not repeat them, and use them to keep pillars and platforms balanced:\n${others}\n` : '',
      'Rules:',
      ...ideaRules(ctx.profile),
      '',
      'Return JSON in exactly this shape:',
      `{ "items": [${ITEM_SHAPE}] }`
    ].join('\n')
  }
}

const StrategySchema = z.object({
  focus: z.string().trim().min(1).max(1000),
  themes: z.array(z.string().trim().min(1).max(300)).max(10),
  rhythm: z.string().trim().max(1000)
})

const ResponseSchema = z.object({
  strategy: StrategySchema,
  items: z.array(z.record(z.string(), z.unknown()))
})

const DayResponseSchema = z.object({ items: z.array(z.record(z.string(), z.unknown())) })

const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

export function parsePlan(raw: string, ctx: PlanContext): { strategy: MonthStrategy; items: GeneratedItem[] } {
  const { strategy, items } = ResponseSchema.parse(extractJson(raw))
  return { strategy, items: usableItems(items, ctx) }
}

export function parseDayIdeas(raw: string, ctx: PlanContext): GeneratedItem[] {
  return usableItems(DayResponseSchema.parse(extractJson(raw)).items, ctx)
}

function usableItems(items: Record<string, unknown>[], ctx: PlanContext): GeneratedItem[] {
  const dates = new Set(ctx.dates)
  const platforms = usablePlatforms(ctx.profile)
  const pillars = new Map(ctx.profile.pillars.map((p) => [p.name.toLowerCase(), p.name]))

  const usable: GeneratedItem[] = []
  for (const item of items) {
    const date = text(item.date, 10)
    const title = text(item.title, 500)
    const [platform] = normalizePlatforms([text(item.platform, 50)])
    // A wrong date or platform can't be repaired without guessing, so the idea is dropped.
    if (!dates.has(date) || !title || !platform || !platforms.includes(platform)) continue
    const allowed = PLATFORM_FORMATS[platform]
    const format = text(item.format, 20).toLowerCase() as PostFormat
    usable.push({
      date,
      platform,
      format: allowed.includes(format) ? format : allowed[0],
      pillar: pillars.get(text(item.pillar, 200).toLowerCase()) ?? '',
      title,
      notes: text(item.notes, 3000)
    })
  }

  // Too few survivors means the response as a whole went wrong, so it gets the retry.
  if (usable.length < Math.ceil(ctx.needed / 2)) {
    throw new Error(`Only ${usable.length} of ${ctx.needed} ideas were usable. Use only the listed dates and platforms.`)
  }
  return usable.slice(0, ctx.needed).sort((a, b) => a.date.localeCompare(b.date))
}
