import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createBrand } from './brands'
import { Db, openDb } from './db'
import { createItem, getStrategy, listItems, saveDayIdeas, saveGeneratedPlan, updateItem } from './plan'
import { PlanContext, availableDates, buildDayPrompts, buildPlanPrompts, monthKey, monthRange, parseDayIdeas, parsePlan, targetCount } from './planAi'
import type { BrandProfile } from './profile'

const profile: BrandProfile = {
  schemaVersion: 1,
  brief: { business: '', products: '', audience: '', markets: '', goals: '', tone: '', platforms: [], competitors: 'Secret Rival' },
  summary: 'Тату-галерея в Хайфе.',
  products: ['Татуировки'],
  usp: [],
  proofPoints: [],
  audience: [],
  tone: { description: 'Прямо', cta: '', do: [], dont: [], examples: [] },
  avoid: ['Нет публикаций в Шаббат'],
  pillars: [{ name: 'Эскизы', description: 'x', examples: [] }],
  competitors: [{ name: 'Secret Rival', url: null, note: '', source: 'user', verified: false }],
  markets: ['Хайфа'],
  platforms: ['Instagram', 'TikTok'],
  goals: []
}

const ctx = (over: Partial<PlanContext> = {}): PlanContext => ({
  name: 'Монро',
  contentLanguage: 'ru',
  profile,
  year: 2026,
  month: 10,
  dates: ['2026-11-10', '2026-11-11', '2026-11-12'],
  needed: 2,
  kept: [],
  ...over
})

const strategy = { focus: 'Показать работы', themes: ['Эскизы'], rhythm: '2 в неделю' }
const item = (over: Record<string, unknown> = {}) => ({ date: '2026-11-10', platform: 'Instagram', format: 'reel', pillar: 'Эскизы', title: 'Как эскиз ложится на плечо', notes: 'Напишите нам', ...over })
const respond = (items: unknown[]) => JSON.stringify({ strategy, items })

describe('dates', () => {
  it('offers the whole of a future month', () => {
    const dates = availableDates(2026, 11, '2026-11-09')
    expect(dates).toHaveLength(31)
    expect(dates[0]).toBe('2026-12-01')
    expect(dates[30]).toBe('2026-12-31')
  })

  it('never offers past days of the current month', () => {
    expect(availableDates(2026, 10, '2026-11-09')[0]).toBe('2026-11-09')
    expect(availableDates(2026, 10, '2026-11-09')).toHaveLength(22)
  })

  it('offers nothing for a past month', () => {
    expect(availableDates(2026, 9, '2026-11-09')).toEqual([])
  })

  it('handles month bounds', () => {
    expect(monthRange(2028, 1)).toEqual({ first: '2028-02-01', last: '2028-02-29' })
    expect(monthKey(2026, 0)).toBe('2026-01')
  })

  it('scales the number of ideas to the days left', () => {
    expect(targetCount(3, 28)).toBe(12)
    expect(targetCount(3, 7)).toBe(3)
    expect(targetCount(1, 1)).toBe(1)
  })
})

describe('buildPlanPrompts', () => {
  const built = buildPlanPrompts(ctx({ kept: [{ id: 1, brandId: 1, date: '2026-11-12', platform: 'TikTok', format: 'video', pillar: '', title: 'Моя идея', notes: '', source: 'user', edited: false, hasPost: false, createdAt: '', updatedAt: '' }] }))

  it('writes in the brand language', () => {
    expect(built.system).toContain('Write every value in Russian')
    expect(built.system).toContain('planning a month')
  })

  it('gives the allowed dates with weekdays from the code', () => {
    expect(built.prompt).toContain('2026-11-10 Tue')
    expect(built.prompt).toContain('exactly 2 new post ideas')
  })

  it('passes the avoid list and the ideas that stay', () => {
    expect(built.prompt).toContain('Нет публикаций в Шаббат')
    expect(built.prompt).toContain('2026-11-12 TikTok: Моя идея')
  })

  it('rules out holidays and leaves unverified competitors out of the data', () => {
    expect(built.prompt).toContain('Do not mention specific holidays')
    expect(built.prompt).not.toContain('Secret Rival')
  })
})

describe('parsePlan', () => {
  it('reads a valid plan in date order', () => {
    const r = parsePlan(respond([item({ date: '2026-11-12' }), item({ date: '2026-11-10' })]), ctx())
    expect(r.strategy).toEqual(strategy)
    expect(r.items.map((i) => i.date)).toEqual(['2026-11-10', '2026-11-12'])
  })

  it('drops ideas on dates that were not offered, including past days', () => {
    const r = parsePlan(respond([item({ date: '2026-11-01' }), item({ date: '2026-02-30' }), item(), item({ date: '2026-11-11' })]), ctx())
    expect(r.items.map((i) => i.date)).toEqual(['2026-11-10', '2026-11-11'])
  })

  it('drops platforms outside the profile and maps names', () => {
    const r = parsePlan(respond([item({ platform: 'LinkedIn' }), item({ platform: 'instagram' }), item({ platform: 'MySpace' })]), ctx({ needed: 1 }))
    expect(r.items).toHaveLength(1)
    expect(r.items[0].platform).toBe('Instagram')
  })

  it('replaces a format the platform does not have', () => {
    const r = parsePlan(respond([item({ platform: 'TikTok', format: 'story' })]), ctx({ needed: 1 }))
    expect(r.items[0].format).toBe('video')
  })

  it('keeps a known pillar with its exact name and clears an invented one', () => {
    const r = parsePlan(respond([item({ pillar: 'эскизы' }), item({ pillar: 'Выдуманная', date: '2026-11-11' })]), ctx())
    expect(r.items.map((i) => i.pillar)).toEqual(['Эскизы', ''])
  })

  it('caps the number of ideas', () => {
    const r = parsePlan(respond([item(), item({ date: '2026-11-11' }), item({ date: '2026-11-12' })]), ctx({ needed: 2 }))
    expect(r.items).toHaveLength(2)
  })

  it('asks for a retry when too few ideas survive or the strategy is missing', () => {
    expect(() => parsePlan(respond([item({ date: '2030-01-01' })]), ctx({ needed: 4 }))).toThrow(/usable/)
    expect(() => parsePlan(JSON.stringify({ items: [item()] }), ctx())).toThrow()
    expect(() => parsePlan('не JSON', ctx())).toThrow()
  })

  it('accepts a partial plan that is mostly usable', () => {
    expect(parsePlan(respond([item()]), ctx({ needed: 2 })).items).toHaveLength(1)
  })
})

describe('regenerating one day', () => {
  const owned = { id: 1, brandId: 1, platform: 'TikTok' as const, format: 'video' as const, pillar: '', notes: '', source: 'user' as const, edited: false, hasPost: false, createdAt: '', updatedAt: '' }
  const day = (over = {}) => ({ ...ctx({ dates: ['2026-11-10'], needed: 1 }), strategy, replacing: [], ...over })

  it('asks for that day only, in the brand language, using the month strategy', () => {
    const { system, prompt } = buildDayPrompts(day())
    expect(system).toContain('Write every value in Russian')
    expect(prompt).toContain('exactly 1 new post idea for')
    expect(prompt).toContain('every idea must be 2026-11-10')
    expect(prompt).toContain('2026-11-10 (Tue)')
    expect(prompt).toContain('Показать работы')
  })

  it('names the rejected ideas and the ones that stay', () => {
    const { prompt } = buildDayPrompts(day({
      replacing: [{ ...owned, date: '2026-11-10', title: 'Отвергнутая' }],
      kept: [{ ...owned, date: '2026-11-20', title: 'Другая идея месяца' }]
    }))
    expect(prompt).toContain('The owner rejected these')
    expect(prompt).toContain('Отвергнутая')
    expect(prompt).toContain('Другая идея месяца')
  })

  it('leaves out competitors and works without a strategy', () => {
    const { prompt } = buildDayPrompts(day({ strategy: null }))
    expect(prompt).not.toContain('Secret Rival')
    expect(prompt).not.toContain('Strategy for this month')
  })

  it('accepts only the requested date', () => {
    const c = day()
    expect(parseDayIdeas(JSON.stringify({ items: [item()] }), c)).toHaveLength(1)
    expect(() => parseDayIdeas(JSON.stringify({ items: [item({ date: '2026-11-11' })] }), c)).toThrow(/usable/)
    expect(() => parseDayIdeas('{}', c)).toThrow()
  })
})

describe('saveGeneratedPlan', () => {
  let dir: string
  let db: Db
  let brandId: number
  const base = { date: '2026-11-15', platform: 'Instagram' as const, format: 'post' as const, pillar: '', title: 'x', notes: '' }
  const save = (items = [{ ...base, title: 'new' }]) => saveGeneratedPlan(db, { brandId, month: '2026-11', from: '2026-11-09', to: '2026-11-30', strategy, items })
  const titles = () => listItems(db, brandId, '2026-11-01', '2026-11-30').map((i) => i.title)

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'smm-planai-'))
    db = openDb(join(dir, 'test.db'))
    brandId = createBrand(db, { name: 'Монро', contentLanguage: 'ru' }).id
  })

  afterEach(() => {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('replaces untouched AI ideas', () => {
    createItem(db, { ...base, brandId, source: 'ai', title: 'old ai' })
    save()
    expect(titles()).toEqual(['new'])
  })

  it('keeps ideas the owner created or changed', () => {
    createItem(db, { ...base, brandId, source: 'user', title: 'mine' })
    const touched = createItem(db, { ...base, brandId, source: 'ai', title: 'ai moved by owner' })
    updateItem(db, touched.id, { date: '2026-11-20' })
    save()
    expect(titles().sort()).toEqual(['ai moved by owner', 'mine', 'new'])
  })

  it('leaves past days and other months alone', () => {
    createItem(db, { ...base, brandId, source: 'ai', date: '2026-11-02', title: 'past' })
    createItem(db, { ...base, brandId, source: 'ai', date: '2026-12-02', title: 'december' })
    save()
    expect(titles().sort()).toEqual(['new', 'past'])
    expect(listItems(db, brandId, '2026-12-01', '2026-12-31')).toHaveLength(1)
  })

  it('stores one strategy per month and overwrites it on regeneration', () => {
    save()
    saveGeneratedPlan(db, { brandId, month: '2026-11', from: '2026-11-09', to: '2026-11-30', strategy: { ...strategy, focus: 'Новый фокус' }, items: [] })
    expect(getStrategy(db, brandId, '2026-11')?.focus).toBe('Новый фокус')
    expect(getStrategy(db, brandId, '2026-12')).toBeNull()
  })

  it('replaces untouched AI ideas of one day and nothing else', () => {
    createItem(db, { ...base, brandId, source: 'ai', title: 'old ai' })
    createItem(db, { ...base, brandId, source: 'user', title: 'mine' })
    const moved = createItem(db, { ...base, brandId, source: 'ai', date: '2026-11-14', title: 'moved here' })
    updateItem(db, moved.id, { date: '2026-11-15' })
    createItem(db, { ...base, brandId, source: 'ai', date: '2026-11-16', title: 'next day' })
    save()
    db.prepare('DELETE FROM content_plans').run()
    createItem(db, { ...base, brandId, source: 'ai', date: '2026-11-16', title: 'next day' })
    expect(saveDayIdeas(db, brandId, '2026-11-15', [{ ...base, title: 'fresh' }])).toBe(1)
    const day = listItems(db, brandId, '2026-11-15', '2026-11-15').map((i) => i.title).sort()
    expect(day).toEqual(['fresh', 'mine', 'moved here'])
    expect(listItems(db, brandId, '2026-11-16', '2026-11-16').map((i) => i.title)).toContain('next day')
    expect(getStrategy(db, brandId, '2026-11')).toBeNull()
  })

  it('keeps the old ideas of a day if saving fails halfway', () => {
    createItem(db, { ...base, brandId, source: 'ai', title: 'old ai' })
    expect(() => saveDayIdeas(db, brandId, base.date, [{ ...base, title: null as unknown as string }])).toThrow()
    expect(titles()).toEqual(['old ai'])
  })

  it('changes nothing if saving fails halfway', () => {
    createItem(db, { ...base, brandId, source: 'ai', title: 'old ai' })
    expect(() => save([{ ...base, title: 'new' }, { ...base, title: null as unknown as string }])).toThrow()
    expect(titles()).toEqual(['old ai'])
    expect(getStrategy(db, brandId, '2026-11')).toBeNull()
  })
})
