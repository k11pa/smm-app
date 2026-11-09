import { z } from 'zod'
import { normalizeHashtags } from '../shared'
import { chat } from './ai'
import { currentProfile } from './brandIpc'
import { getBrand } from './brands'
import type { Db } from './db'
import { handle } from './ipc'
import { getItem } from './plan'
import { buildPostPrompts, parsePost } from './postAi'
import { getLatestPost, savePost } from './posts'
import { askJson } from './profile'

const POST_MAX_TOKENS = 3000

const planItemId = z.number().int().positive()
const SaveInput = z.object({
  planItemId,
  body: z.string().trim().min(1).max(70000),
  hashtags: z.array(z.string().max(200)).max(50)
})

export function registerPostIpc(getDb: () => Db) {
  handle('post:get', planItemId, (id) => {
    const db = getDb()
    const item = getItem(db, id)
    if (!item) return { ok: false, error: 'NOT_FOUND' }
    return { ok: true, post: getLatestPost(db, id, item.platform) }
  })

  handle('post:generate', planItemId, async (id) => {
    const db = getDb()
    const item = getItem(db, id)
    if (!item) return { ok: false, error: 'NOT_FOUND' }
    const brand = getBrand(db, item.brandId)
    const profile = currentProfile(db, item.brandId)
    if (!brand || !profile) return { ok: false, error: 'NO_PROFILE' }

    const previous = getLatestPost(db, id, item.platform)?.body
    const prompts = buildPostPrompts({ name: brand.name, contentLanguage: brand.contentLanguage, profile, item, previous })
    const result = await askJson(
      (prompt, system) => chat(prompt, system, undefined, POST_MAX_TOKENS),
      prompts,
      (text) => parsePost(text, item)
    )
    if (!result.ok) return result
    return { ok: true, post: savePost(db, { planItemId: id, platform: item.platform, ...result.data, source: 'ai' }) }
  })

  handle('post:save', SaveInput, ({ planItemId: id, body, hashtags }) => {
    const db = getDb()
    const item = getItem(db, id)
    if (!item) return { ok: false, error: 'NOT_FOUND' }
    return { ok: true, post: savePost(db, { planItemId: id, platform: item.platform, body, hashtags: normalizeHashtags(hashtags), source: 'user' }) }
  })
}
