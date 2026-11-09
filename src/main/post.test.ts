import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { PlanItem, charCount, composePost, normalizeHashtags, postLimits } from '../shared'
import { createBrand } from './brands'
import { Db, openDb } from './db'
import { createItem, deleteItem, getItem, saveGeneratedPlan, saveDayIdeas, updateItem } from './plan'
import { buildPostPrompts, parsePost } from './postAi'
import { getLatestPost, savePost } from './posts'
import type { BrandProfile } from './profile'

const profile: BrandProfile = {
  schemaVersion: 1,
  brief: { business: '', products: '', audience: '', markets: '', goals: '', tone: '', platforms: [], competitors: '' },
  summary: 'Тату-галерея в Хайфе.',
  products: [],
  usp: [],
  proofPoints: [],
  audience: [],
  tone: { description: 'Прямо', cta: 'Напишите нам', do: [], dont: [], examples: [] },
  avoid: ['Обещания о цене'],
  pillars: [],
  competitors: [{ name: 'Secret Rival', url: null, note: '', source: 'user', verified: false }],
  markets: [],
  platforms: ['Instagram'],
  goals: []
}

const item = (over: Partial<PlanItem> = {}): PlanItem => ({
  id: 1, brandId: 1, date: '2026-11-20', platform: 'Instagram', format: 'post', pillar: 'Эскизы', title: 'Как эскиз ложится на плечо', notes: 'Показать процесс',
  source: 'ai', edited: false, hasPost: false, createdAt: '', updatedAt: '', ...over
})

const ctx = { name: 'Монро', contentLanguage: 'he', profile }

describe('hashtags and limits', () => {
  it('normalizes hashtags, keeping Hebrew and Cyrillic', () => {
    expect(normalizeHashtags(['#קעקוע tattoo, #Tattoo', '##тату-салон', '#', ''])).toEqual(['#קעקוע', '#tattoo', '#тату-салон'.replace('-', '')])
  })

  it('composes the final text and counts whole characters', () => {
    expect(composePost(' Текст ', ['#a', '#b'])).toBe('Текст\n\n#a #b')
    expect(composePost('Текст', [])).toBe('Текст')
    expect(charCount('a😀')).toBe(2)
  })

  it('has a shorter limit for Telegram captions', () => {
    expect(postLimits('Telegram', 'post').chars).toBe(4096)
    expect(postLimits('Telegram', 'video').chars).toBe(1024)
    expect(postLimits('X', 'post').chars).toBe(280)
  })
})

describe('buildPostPrompts', () => {
  it('writes in the brand language for the platform of the idea', () => {
    const { system, prompt } = buildPostPrompts({ ...ctx, item: item({ platform: 'LinkedIn' }) })
    expect(system).toContain('Write every value in Hebrew')
    expect(prompt).toContain('on LinkedIn')
    expect(prompt).toContain('fit in 3000 characters')
    expect(prompt).toContain('Как эскиз ложится на плечо')
    expect(prompt).toContain('Обещания о цене')
  })

  it('asks for a caption, not a script, on video formats', () => {
    expect(buildPostPrompts({ ...ctx, item: item({ format: 'reel' }) }).prompt).toContain('caption that accompanies a reel')
  })

  it('leaves out competitors and rules out invented facts', () => {
    const { prompt } = buildPostPrompts({ ...ctx, item: item() })
    expect(prompt).not.toContain('Secret Rival')
    expect(prompt).toContain('Never invent prices')
  })

  it('names a rejected version only when regenerating', () => {
    expect(buildPostPrompts({ ...ctx, item: item() }).prompt).not.toContain('rejected this version')
    expect(buildPostPrompts({ ...ctx, item: item(), previous: 'Старый текст' }).prompt).toContain('Старый текст')
  })
})

describe('parsePost', () => {
  it('reads the text and hashtags', () => {
    expect(parsePost(JSON.stringify({ body: 'Текст', hashtags: ['тату', '#haifa'] }), item())).toEqual({ body: 'Текст', hashtags: ['#тату', '#haifa'] })
  })

  it('moves hashtags repeated at the end of the body, so they are not published twice', () => {
    const r = parsePost(JSON.stringify({ body: 'Текст #внутри\n\n#тату #haifa', hashtags: ['#тату'] }), item())
    expect(r).toEqual({ body: 'Текст #внутри', hashtags: ['#тату', '#haifa'] })
  })

  it('caps hashtags for the platform', () => {
    const r = parsePost(JSON.stringify({ body: 'Текст', hashtags: ['a', 'b', 'c', 'd'] }), item({ platform: 'X' }))
    expect(r.hashtags).toEqual(['#a', '#b'])
  })

  it('asks for a retry when the post does not fit, counting the hashtags', () => {
    expect(() => parsePost(JSON.stringify({ body: 'я'.repeat(281) }), item({ platform: 'X' }))).toThrow(/limit is 280/)
    expect(() => parsePost(JSON.stringify({ body: 'я'.repeat(279), hashtags: ['#a'] }), item({ platform: 'X' }))).toThrow(/limit is 280/)
    expect(parsePost(JSON.stringify({ body: 'я'.repeat(280) }), item({ platform: 'X' })).body).toHaveLength(280)
  })

  it('rejects an empty body and works without hashtags', () => {
    expect(() => parsePost(JSON.stringify({ body: '  ' }), item())).toThrow()
    expect(() => parsePost('не JSON', item())).toThrow()
    expect(parsePost(JSON.stringify({ body: 'Текст' }), item()).hashtags).toEqual([])
  })
})

describe('saving posts', () => {
  let dir: string
  let db: Db
  let brandId: number
  const base = { date: '2026-11-20', platform: 'Instagram' as const, format: 'post' as const, pillar: '', title: 'Идея', notes: '' }
  const newIdea = () => createItem(db, { ...base, brandId, source: 'ai' })
  const save = (planItemId: number, body = 'Текст') => savePost(db, { planItemId, platform: 'Instagram', body, hashtags: ['#a'], source: 'ai' })

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'smm-post-'))
    db = openDb(join(dir, 'test.db'))
    brandId = createBrand(db, { name: 'Монро', contentLanguage: 'ru' }).id
  })

  afterEach(() => {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('keeps every version and returns the latest', () => {
    const { id } = newIdea()
    expect(getLatestPost(db, id, 'Instagram')).toBeNull()
    expect(save(id, 'Первая').version).toBe(1)
    expect(save(id, 'Вторая').version).toBe(2)
    expect(getLatestPost(db, id, 'Instagram')).toMatchObject({ version: 2, body: 'Вторая', hashtags: ['#a'] })
  })

  it('shows the idea as having a post only on its current platform', () => {
    const { id } = newIdea()
    expect(getItem(db, id)?.hasPost).toBe(false)
    save(id)
    expect(getItem(db, id)?.hasPost).toBe(true)
    updateItem(db, id, { platform: 'LinkedIn' })
    expect(getItem(db, id)?.hasPost).toBe(false)
  })

  it('protects an idea with a post from regenerating the day and the month', () => {
    const written = newIdea()
    const untouched = newIdea()
    save(written.id)
    saveDayIdeas(db, brandId, base.date, [])
    expect(getItem(db, written.id)).not.toBeNull()
    expect(getItem(db, untouched.id)).toBeNull()
    saveGeneratedPlan(db, { brandId, month: '2026-11', from: '2026-11-01', to: '2026-11-30', strategy: { focus: 'x', themes: [], rhythm: '' }, items: [] })
    expect(getLatestPost(db, written.id, 'Instagram')?.body).toBe('Текст')
  })

  it('deletes posts with their idea', () => {
    const { id } = newIdea()
    save(id)
    deleteItem(db, id)
    expect(db.prepare('SELECT COUNT(*) AS c FROM posts').get()).toEqual({ c: 0 })
  })

  it('rejects a post for a missing idea', () => {
    expect(() => save(404)).toThrow(/FOREIGN KEY/)
  })
})
