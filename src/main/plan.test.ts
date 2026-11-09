import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createBrand } from './brands'
import { Db, openDb } from './db'
import { createItem, deleteItem, getItem, listItems, NewPlanItem, updateItem } from './plan'

let dir: string
let db: Db
let brandId: number

const item = (over: Partial<NewPlanItem> = {}): NewPlanItem => ({
  brandId,
  date: '2026-11-10',
  platform: 'Instagram',
  format: 'post',
  pillar: 'Beans',
  title: 'Meet the farmer',
  notes: '',
  source: 'user',
  ...over
})

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'smm-plan-'))
  db = openDb(join(dir, 'test.db'))
  brandId = createBrand(db, { name: 'Cafe', contentLanguage: 'ru' }).id
})

afterEach(() => {
  db.close()
  rmSync(dir, { recursive: true, force: true })
})

describe('plan items', () => {
  it('lists a date range including both ends, in date order', () => {
    createItem(db, item({ date: '2026-11-30', title: 'last' }))
    createItem(db, item({ date: '2026-11-01', title: 'first' }))
    createItem(db, item({ date: '2026-12-01', title: 'next month' }))
    expect(listItems(db, brandId, '2026-11-01', '2026-11-30').map((i) => i.title)).toEqual(['first', 'last'])
  })

  it('keeps brands apart', () => {
    const other = createBrand(db, { name: 'Other', contentLanguage: 'en' }).id
    createItem(db, item({ brandId: other }))
    expect(listItems(db, brandId, '2026-11-01', '2026-11-30')).toEqual([])
  })

  it('marks an item as edited after a move, so regeneration leaves it alone', () => {
    const created = createItem(db, item({ source: 'ai' }))
    expect(created.edited).toBe(false)
    const moved = updateItem(db, created.id, { date: '2026-11-20' })
    expect(moved).toMatchObject({ date: '2026-11-20', edited: true, source: 'ai', title: created.title })
  })

  it('changes only the given fields', () => {
    const created = createItem(db, item({ notes: 'keep me' }))
    expect(updateItem(db, created.id, { title: 'New' })).toMatchObject({ title: 'New', notes: 'keep me', date: created.date })
  })

  it('reports a missing item instead of failing', () => {
    expect(updateItem(db, 404, { title: 'x' })).toBeNull()
    expect(deleteItem(db, 404)).toBe(false)
  })

  it('deletes an item', () => {
    const created = createItem(db, item())
    expect(deleteItem(db, created.id)).toBe(true)
    expect(getItem(db, created.id)).toBeNull()
  })

  it('rejects an item for a missing brand and removes items with their brand', () => {
    expect(() => createItem(db, item({ brandId: 404 }))).toThrow(/FOREIGN KEY/)
    createItem(db, item())
    db.prepare('DELETE FROM brands WHERE id = ?').run(brandId)
    expect(db.prepare('SELECT COUNT(*) AS c FROM plan_items').get()).toEqual({ c: 0 })
  })
})

describe('upgrading a database from the previous version', () => {
  it('adds plan items and keeps existing brands', () => {
    db.close()
    const file = join(dir, 'old.db')
    const old = openDb(file)
    createBrand(old, { name: 'Existing', contentLanguage: 'he' })
    old.exec('DROP TABLE posts; DROP TABLE plan_items; DROP TABLE content_plans')
    old.pragma('user_version = 1')
    old.close()

    db = openDb(file)
    expect(db.pragma('user_version', { simple: true })).toBe(4)
    expect(db.prepare('SELECT name FROM brands').get()).toEqual({ name: 'Existing' })
    expect(db.prepare('SELECT COUNT(*) AS c FROM plan_items').get()).toEqual({ c: 0 })
  })
})
