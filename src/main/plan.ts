import type { PlanItem, Platform, PostFormat, ProfileSource } from '../shared'
import type { Db } from './db'

interface ItemRow {
  id: number
  brand_id: number
  date: string
  platform: Platform
  format: PostFormat
  pillar: string
  title: string
  notes: string
  source: ProfileSource
  edited: number
  created_at: string
  updated_at: string
}

export interface NewPlanItem {
  brandId: number
  date: string
  platform: Platform
  format: PostFormat
  pillar: string
  title: string
  notes: string
  source: ProfileSource
}

export type PlanItemChanges = Partial<Pick<PlanItem, 'date' | 'platform' | 'format' | 'pillar' | 'title' | 'notes'>>

const toItem = (r: ItemRow): PlanItem => ({
  id: r.id,
  brandId: r.brand_id,
  date: r.date,
  platform: r.platform,
  format: r.format,
  pillar: r.pillar,
  title: r.title,
  notes: r.notes,
  source: r.source,
  edited: r.edited === 1,
  createdAt: r.created_at,
  updatedAt: r.updated_at
})

export function getItem(db: Db, id: number): PlanItem | null {
  const row = db.prepare('SELECT * FROM plan_items WHERE id = ?').get(id) as ItemRow | undefined
  return row ? toItem(row) : null
}

// Both ends of the range are included.
export function listItems(db: Db, brandId: number, from: string, to: string): PlanItem[] {
  const rows = db
    .prepare('SELECT * FROM plan_items WHERE brand_id = ? AND date >= ? AND date <= ? ORDER BY date, id')
    .all(brandId, from, to) as ItemRow[]
  return rows.map(toItem)
}

export function createItem(db: Db, item: NewPlanItem): PlanItem {
  const now = new Date().toISOString()
  const { lastInsertRowid } = db
    .prepare(
      `INSERT INTO plan_items (brand_id, date, platform, format, pillar, title, notes, source, edited, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`
    )
    .run(item.brandId, item.date, item.platform, item.format, item.pillar, item.title, item.notes, item.source, now, now)
  return getItem(db, Number(lastInsertRowid))!
}

// Any change, including a move to another day, marks the item as the owner's.
export function updateItem(db: Db, id: number, changes: PlanItemChanges): PlanItem | null {
  const current = getItem(db, id)
  if (!current) return null
  const next = { ...current, ...changes }
  db.prepare(
    `UPDATE plan_items SET date = ?, platform = ?, format = ?, pillar = ?, title = ?, notes = ?, edited = 1, updated_at = ? WHERE id = ?`
  ).run(next.date, next.platform, next.format, next.pillar, next.title, next.notes, new Date().toISOString(), id)
  return getItem(db, id)
}

export function deleteItem(db: Db, id: number): boolean {
  return db.prepare('DELETE FROM plan_items WHERE id = ?').run(id).changes > 0
}
