import { ipcMain } from 'electron'
import { z } from 'zod'
import { PROFILE_SECTIONS } from '../shared'
import { chat } from './ai'
import { createBrand, getBrand, getLatestProfile, listBrands, saveProfile, updateBrand } from './brands'
import type { Db } from './db'
import {
  AnswersSchema,
  BrandProfile,
  ProfileSchema,
  askJson,
  buildProfilePrompts,
  buildSectionPrompts,
  buildSuggestPrompts,
  parseGeneratedProfile,
  parseSection,
  parseSuggestedAnswers
} from './profile'
import { fetchSiteText } from './site'
import { getSettings } from './store'

const PROFILE_MAX_TOKENS = 6000
const SHORT_MAX_TOKENS = 2500

const name = z.string().trim().min(1).max(200)
const website = z.string().trim().max(500).nullable()
const contentLanguage = z.string().trim().min(2).max(10)
const siteText = z.string().max(20000).optional()

const GenerateInput = z.object({ name, website, contentLanguage, answers: AnswersSchema, siteText })
const SuggestInput = z.object({ name, contentLanguage, siteText: z.string().min(1).max(20000) })
const SectionInput = z.object({ name, contentLanguage, section: z.enum(PROFILE_SECTIONS), profile: ProfileSchema })
const SaveInput = z.object({
  brandId: z.number().int().positive().nullable(),
  name,
  website,
  contentLanguage,
  profile: ProfileSchema,
  source: z.enum(['ai', 'user'])
})

const workingLanguage = () => getSettings().language
const chatWith = (maxTokens: number) => (prompt: string, system: string) => chat(prompt, system, undefined, maxTokens)

// Input crosses a process boundary, so it is validated here even though our own UI sent it.
function handle<S extends z.ZodType>(channel: string, schema: S, fn: (input: z.infer<S>) => unknown) {
  ipcMain.handle(channel, async (_e, raw) => {
    const input = schema.safeParse(raw)
    if (!input.success) return { ok: false, error: 'INVALID_INPUT' }
    try {
      return await fn(input.data)
    } catch (e: any) {
      return { ok: false, error: e?.message ?? String(e) }
    }
  })
}

function currentProfile(db: Db, brandId: number): BrandProfile | null {
  const parsed = ProfileSchema.safeParse(getLatestProfile(db, brandId)?.data)
  return parsed.success ? parsed.data : null
}

export function registerBrandIpc(getDb: () => Db) {
  handle('brand:getCurrent', z.undefined(), () => {
    const db = getDb()
    const brand = listBrands(db)[0] ?? null
    return { ok: true, brand, profile: brand ? currentProfile(db, brand.id) : null }
  })

  handle('brand:fetchSite', z.string().max(500), (url) => fetchSiteText(url))

  handle('brand:suggestAnswers', SuggestInput, (input) =>
    askJson(chatWith(SHORT_MAX_TOKENS), buildSuggestPrompts({ ...input, workingLanguage: workingLanguage() }), parseSuggestedAnswers)
  )

  handle('brand:generate', GenerateInput, (input) =>
    askJson(chatWith(PROFILE_MAX_TOKENS), buildProfilePrompts({ ...input, workingLanguage: workingLanguage() }), (text) =>
      parseGeneratedProfile(text, input.answers)
    )
  )

  handle('brand:regenerateSection', SectionInput, (input) =>
    askJson(chatWith(PROFILE_MAX_TOKENS), buildSectionPrompts({ ...input, workingLanguage: workingLanguage() }), (text) =>
      parseSection(text, input.section, input.profile)
    )
  )

  handle('brand:save', SaveInput, (input) => {
    const db = getDb()
    const fields = { name: input.name, website: input.website, contentLanguage: input.contentLanguage }
    return db.transaction(() => {
      const brand =
        input.brandId !== null && getBrand(db, input.brandId) ? updateBrand(db, input.brandId, fields) : createBrand(db, fields)
      const saved = saveProfile(db, brand.id, input.profile, input.source)
      return { ok: true, brand: getBrand(db, brand.id), version: saved.version }
    })()
  })
}
