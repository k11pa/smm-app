import type { BrandAnswers, BrandProfile } from '../../main/profile'
import type { Brand, ChatResult, MonthStrategy, PlanItem, ProfileSection, ProfileSource, ProviderId, Settings } from '../../shared'

type Failure = { ok: false; error: string }
type Result<T> = ({ ok: true } & T) | Failure

export type PlanItemFields = Pick<PlanItem, 'date' | 'platform' | 'format' | 'pillar' | 'title' | 'notes'>

export interface BrandFields {
  name: string
  website: string | null
  contentLanguage: string
}

declare global {
  interface Window {
    api: {
      getSettings(): Promise<Settings>
      updateSettings(patch: Partial<{ language: Settings['language']; provider: ProviderId; model: string }>): Promise<Settings>
      setKey(provider: ProviderId, key: string | null): Promise<Settings>
      chat(prompt: string, system?: string): Promise<ChatResult>
      testAi(provider: ProviderId, model: string): Promise<ChatResult>
      brand: {
        getCurrent(): Promise<Result<{ brand: Brand | null; profile: BrandProfile | null }>>
        fetchSite(url: string): Promise<Result<{ url: string; text: string }>>
        suggestAnswers(input: { name: string; contentLanguage: string; siteText: string }): Promise<Result<{ data: BrandAnswers }>>
        generate(input: BrandFields & { answers: BrandAnswers; siteText?: string }): Promise<Result<{ data: BrandProfile }>>
        regenerateSection(input: { name: string; contentLanguage: string; section: ProfileSection; profile: BrandProfile }): Promise<Result<{ data: Partial<BrandProfile> }>>
        save(input: BrandFields & { brandId: number | null; profile: BrandProfile; source: ProfileSource }): Promise<Result<{ brand: Brand; version: number }>>
      }
      plan: {
        list(input: { brandId: number; from: string; to: string }): Promise<Result<{ items: PlanItem[] }>>
        create(input: { brandId: number } & PlanItemFields): Promise<Result<{ item: PlanItem }>>
        update(input: { id: number; changes: Partial<PlanItemFields> }): Promise<Result<{ item: PlanItem }>>
        delete(id: number): Promise<Result<{}>>
        getStrategy(input: { brandId: number; year: number; month: number }): Promise<Result<{ strategy: MonthStrategy | null }>>
        generate(input: { brandId: number; year: number; month: number; postsPerWeek: number }): Promise<Result<{ strategy: MonthStrategy; created: number }>>
      }
    }
  }
}
export {}
