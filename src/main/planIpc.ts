import { z } from 'zod'
import { PLATFORMS, POST_FORMATS, todayIso } from '../shared'
import { chat } from './ai'
import { currentProfile } from './brandIpc'
import { getBrand } from './brands'
import type { Db } from './db'
import { handle } from './ipc'
import { createItem, deleteItem, getStrategy, listItems, saveDayIdeas, saveGeneratedPlan, updateItem } from './plan'
import { availableDates, buildDayPrompts, buildPlanPrompts, monthKey, monthRange, parseDayIdeas, parsePlan, targetCount } from './planAi'
import { askJson } from './profile'

const id = z.number().int().positive()

// The round trip rejects dates that match the pattern but don't exist, like 2026-02-30.
const date = z.string().refine((s) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const parsed = new Date(`${s}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === s
})

const fields = {
  date,
  platform: z.enum(PLATFORMS),
  format: z.enum(POST_FORMATS),
  pillar: z.string().trim().max(200),
  title: z.string().trim().min(1).max(500),
  notes: z.string().trim().max(3000)
}

const ListInput = z.object({ brandId: id, from: date, to: date })
const CreateInput = z.object({ brandId: id, ...fields })
const UpdateInput = z.object({ id, changes: z.object(fields).partial() })
const MonthInput = z.object({ brandId: id, year: z.number().int().min(2000).max(2100), month: z.number().int().min(0).max(11) })
const GenerateInput = MonthInput.extend({ postsPerWeek: z.number().int().min(1).max(14) })

const DayInput = z.object({ brandId: id, date })

const PLAN_MAX_TOKENS = 8000
const DAY_MAX_TOKENS = 2000

export function registerPlanIpc(getDb: () => Db) {
  handle('plan:list', ListInput, ({ brandId, from, to }) => ({ ok: true, items: listItems(getDb(), brandId, from, to) }))

  handle('plan:create', CreateInput, (input) => ({ ok: true, item: createItem(getDb(), { ...input, source: 'user' }) }))

  handle('plan:update', UpdateInput, ({ id, changes }) => {
    const item = updateItem(getDb(), id, changes)
    return item ? { ok: true, item } : { ok: false, error: 'NOT_FOUND' }
  })

  handle('plan:delete', id, (itemId) => (deleteItem(getDb(), itemId) ? { ok: true } : { ok: false, error: 'NOT_FOUND' }))

  handle('plan:getStrategy', MonthInput, ({ brandId, year, month }) => ({ ok: true, strategy: getStrategy(getDb(), brandId, monthKey(year, month)) }))

  handle('plan:generate', GenerateInput, async ({ brandId, year, month, postsPerWeek }) => {
    const db = getDb()
    const brand = getBrand(db, brandId)
    if (!brand) return { ok: false, error: 'NOT_FOUND' }
    // The profile comes from the database, so the plan always uses the latest saved version.
    const profile = currentProfile(db, brandId)
    if (!profile) return { ok: false, error: 'NO_PROFILE' }

    const dates = availableDates(year, month, todayIso())
    if (!dates.length) return { ok: false, error: 'PLAN_MONTH_PAST' }
    const from = dates[0]
    const to = dates[dates.length - 1]
    const kept = listItems(db, brandId, from, to).filter((i) => i.source !== 'ai' || i.edited)
    const needed = targetCount(postsPerWeek, dates.length) - kept.length
    if (needed <= 0) return { ok: false, error: 'PLAN_FULL' }

    const ctx = { name: brand.name, contentLanguage: brand.contentLanguage, profile, year, month, dates, needed, kept }
    const result = await askJson(
      (prompt, system) => chat(prompt, system, undefined, PLAN_MAX_TOKENS),
      buildPlanPrompts(ctx),
      (text) => parsePlan(text, ctx)
    )
    if (!result.ok) return result

    const { strategy, items } = result.data
    const created = saveGeneratedPlan(db, { brandId, month: monthKey(year, month), from, to, strategy, items })
    return { ok: true, strategy, created }
  })

  handle('plan:regenerateDay', DayInput, async ({ brandId, date: day }) => {
    const db = getDb()
    const brand = getBrand(db, brandId)
    if (!brand) return { ok: false, error: 'NOT_FOUND' }
    const profile = currentProfile(db, brandId)
    if (!profile) return { ok: false, error: 'NO_PROFILE' }
    if (day < todayIso()) return { ok: false, error: 'PLAN_DAY_PAST' }

    const year = Number(day.slice(0, 4))
    const month = Number(day.slice(5, 7)) - 1
    const { first, last } = monthRange(year, month)
    const all = listItems(db, brandId, first, last)
    const replacing = all.filter((i) => i.date === day && i.source === 'ai' && !i.edited)
    const kept = all.filter((i) => !replacing.includes(i))

    // A day with nothing to replace gets one new idea, next to anything the owner placed there.
    const ctx = {
      name: brand.name,
      contentLanguage: brand.contentLanguage,
      profile,
      year,
      month,
      dates: [day],
      needed: Math.max(1, replacing.length),
      kept,
      replacing,
      strategy: getStrategy(db, brandId, monthKey(year, month))
    }
    const result = await askJson(
      (prompt, system) => chat(prompt, system, undefined, DAY_MAX_TOKENS),
      buildDayPrompts(ctx),
      (text) => parseDayIdeas(text, ctx)
    )
    if (!result.ok) return result
    return { ok: true, created: saveDayIdeas(db, brandId, day, result.data) }
  })
}
