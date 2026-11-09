import type { Brand, BrandProfileVersion, ProfileSource } from '../shared'
import type { Db } from './db'

interface BrandRow {
  id: number
  name: string
  website: string | null
  content_language: string
  created_at: string
  updated_at: string
}

interface ProfileRow {
  brand_id: number
  version: number
  data: string
  source: ProfileSource
  created_at: string
}

const toBrand = (r: BrandRow): Brand => ({
  id: r.id,
  name: r.name,
  website: r.website,
  contentLanguage: r.content_language,
  createdAt: r.created_at,
  updatedAt: r.updated_at
})

const toProfile = (r: ProfileRow): BrandProfileVersion => ({
  brandId: r.brand_id,
  version: r.version,
  data: JSON.parse(r.data),
  source: r.source,
  createdAt: r.created_at
})

export function createBrand(db: Db, input: { name: string; website?: string | null; contentLanguage: string }): Brand {
  const now = new Date().toISOString()
  const { lastInsertRowid } = db
    .prepare('INSERT INTO brands (name, website, content_language, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
    .run(input.name, input.website ?? null, input.contentLanguage, now, now)
  return getBrand(db, Number(lastInsertRowid))!
}

export function getBrand(db: Db, id: number): Brand | null {
  const row = db.prepare('SELECT * FROM brands WHERE id = ?').get(id) as BrandRow | undefined
  return row ? toBrand(row) : null
}

export function listBrands(db: Db): Brand[] {
  return (db.prepare('SELECT * FROM brands ORDER BY id').all() as BrandRow[]).map(toBrand)
}

// Every save adds a new version, so earlier ones stay available for rollback.
export function saveProfile(db: Db, brandId: number, data: unknown, source: ProfileSource): BrandProfileVersion {
  return db.transaction(() => {
    const { next } = db
      .prepare('SELECT COALESCE(MAX(version), 0) + 1 AS next FROM brand_profiles WHERE brand_id = ?')
      .get(brandId) as { next: number }
    const now = new Date().toISOString()
    db.prepare('INSERT INTO brand_profiles (brand_id, version, data, source, created_at) VALUES (?, ?, ?, ?, ?)').run(
      brandId,
      next,
      JSON.stringify(data),
      source,
      now
    )
    db.prepare('UPDATE brands SET updated_at = ? WHERE id = ?').run(now, brandId)
    return { brandId, version: next, data, source, createdAt: now }
  })()
}

export function getLatestProfile(db: Db, brandId: number): BrandProfileVersion | null {
  const row = db
    .prepare('SELECT * FROM brand_profiles WHERE brand_id = ? ORDER BY version DESC LIMIT 1')
    .get(brandId) as ProfileRow | undefined
  return row ? toProfile(row) : null
}

export function getProfileVersion(db: Db, brandId: number, version: number): BrandProfileVersion | null {
  const row = db
    .prepare('SELECT * FROM brand_profiles WHERE brand_id = ? AND version = ?')
    .get(brandId, version) as ProfileRow | undefined
  return row ? toProfile(row) : null
}
