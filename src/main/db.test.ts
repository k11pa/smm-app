import Database from 'better-sqlite3'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createBrand, getBrand, getLatestProfile, getProfileVersion, listBrands, saveProfile } from './brands'
import { Db, migrate, openDb } from './db'

let dir: string
let db: Db

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'smm-db-'))
  db = openDb(join(dir, 'test.db'))
})

afterEach(() => {
  db.close()
  rmSync(dir, { recursive: true, force: true })
})

describe('migrations', () => {
  it('stops at the latest version when reopened, keeping data', () => {
    const version = db.pragma('user_version', { simple: true })
    expect(version).toBeGreaterThan(0)
    createBrand(db, { name: 'Cafe', contentLanguage: 'he' })
    db.close()

    db = openDb(join(dir, 'test.db'))
    expect(db.pragma('user_version', { simple: true })).toBe(version)
    expect(listBrands(db)).toHaveLength(1)
  })

  it('rolls back a failing migration and keeps the version', () => {
    const mem = new Database(':memory:')
    expect(() => migrate(mem, ['CREATE TABLE a (x)', 'CREATE TABLE b (x); NOT VALID SQL'])).toThrow()
    expect(mem.pragma('user_version', { simple: true })).toBe(1)
    expect(mem.prepare("SELECT name FROM sqlite_master WHERE name = 'b'").get()).toBeUndefined()
    mem.close()
  })

  it('refuses a database from a newer app version', () => {
    const mem = new Database(':memory:')
    mem.pragma('user_version = 99')
    expect(() => migrate(mem)).toThrow(/DB_TOO_NEW/)
    mem.close()
  })
})

describe('brands', () => {
  it('stores a brand with a content language separate from the interface', () => {
    const b = createBrand(db, { name: 'Cafe', website: 'https://cafe.example', contentLanguage: 'he' })
    expect(getBrand(db, b.id)).toMatchObject({ name: 'Cafe', website: 'https://cafe.example', contentLanguage: 'he' })
  })

  it('returns null for an unknown brand and no profile for a new one', () => {
    expect(getBrand(db, 404)).toBeNull()
    const b = createBrand(db, { name: 'Cafe', contentLanguage: 'en' })
    expect(getLatestProfile(db, b.id)).toBeNull()
  })
})

describe('profile versions', () => {
  it('keeps every version, per brand, and returns the latest', () => {
    const a = createBrand(db, { name: 'A', contentLanguage: 'en' })
    const b = createBrand(db, { name: 'B', contentLanguage: 'en' })
    saveProfile(db, a.id, { tone: 'first' }, 'ai')
    saveProfile(db, a.id, { tone: 'second' }, 'user')
    saveProfile(db, b.id, { tone: 'other' }, 'ai')

    expect(getLatestProfile(db, a.id)).toMatchObject({ version: 2, source: 'user', data: { tone: 'second' } })
    expect(getProfileVersion(db, a.id, 1)?.data).toEqual({ tone: 'first' })
    expect(getLatestProfile(db, b.id)).toMatchObject({ version: 1, data: { tone: 'other' } })
  })

  it('rejects a profile for a missing brand', () => {
    expect(() => saveProfile(db, 404, {}, 'ai')).toThrow(/FOREIGN KEY/)
  })

  it('deletes profiles together with their brand', () => {
    const b = createBrand(db, { name: 'A', contentLanguage: 'en' })
    saveProfile(db, b.id, {}, 'ai')
    db.prepare('DELETE FROM brands WHERE id = ?').run(b.id)
    expect(db.prepare('SELECT COUNT(*) AS c FROM brand_profiles').get()).toEqual({ c: 0 })
  })
})
