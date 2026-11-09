import { z } from 'zod'
import { PLATFORMS, POST_FORMATS } from '../shared'
import type { Db } from './db'
import { handle } from './ipc'
import { createItem, deleteItem, listItems, updateItem } from './plan'

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

export function registerPlanIpc(getDb: () => Db) {
  handle('plan:list', ListInput, ({ brandId, from, to }) => ({ ok: true, items: listItems(getDb(), brandId, from, to) }))

  handle('plan:create', CreateInput, (input) => ({ ok: true, item: createItem(getDb(), { ...input, source: 'user' }) }))

  handle('plan:update', UpdateInput, ({ id, changes }) => {
    const item = updateItem(getDb(), id, changes)
    return item ? { ok: true, item } : { ok: false, error: 'NOT_FOUND' }
  })

  handle('plan:delete', id, (itemId) => (deleteItem(getDb(), itemId) ? { ok: true } : { ok: false, error: 'NOT_FOUND' }))
}
