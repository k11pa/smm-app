import type { Post, ProfileSource } from '../shared'
import type { Db } from './db'

interface PostRow {
  plan_item_id: number
  platform: Post['platform']
  version: number
  body: string
  hashtags: string
  source: ProfileSource
  created_at: string
}

const toPost = (r: PostRow): Post => ({
  planItemId: r.plan_item_id,
  platform: r.platform,
  version: r.version,
  body: r.body,
  hashtags: JSON.parse(r.hashtags),
  source: r.source,
  createdAt: r.created_at
})

export function getLatestPost(db: Db, planItemId: number, platform: Post['platform']): Post | null {
  const row = db
    .prepare('SELECT * FROM posts WHERE plan_item_id = ? AND platform = ? ORDER BY version DESC LIMIT 1')
    .get(planItemId, platform) as PostRow | undefined
  return row ? toPost(row) : null
}

// Every save adds a version. It also marks the idea as touched, so regenerating the plan can't delete a written post.
export function savePost(db: Db, input: { planItemId: number; platform: Post['platform']; body: string; hashtags: string[]; source: ProfileSource }): Post {
  const { planItemId, platform, body, hashtags, source } = input
  return db.transaction(() => {
    const { next } = db
      .prepare('SELECT COALESCE(MAX(version), 0) + 1 AS next FROM posts WHERE plan_item_id = ? AND platform = ?')
      .get(planItemId, platform) as { next: number }
    const now = new Date().toISOString()
    db.prepare('INSERT INTO posts (plan_item_id, platform, version, body, hashtags, source, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
      planItemId,
      platform,
      next,
      body,
      JSON.stringify(hashtags),
      source,
      now
    )
    db.prepare('UPDATE plan_items SET edited = 1, updated_at = ? WHERE id = ?').run(now, planItemId)
    return { planItemId, platform, version: next, body, hashtags, source, createdAt: now }
  })()
}
