import type { ChatResult, ProviderId, Settings } from '../../shared'

declare global {
  interface Window {
    api: {
      getSettings(): Promise<Settings>
      updateSettings(patch: Partial<{ language: Settings['language']; provider: ProviderId; model: string }>): Promise<Settings>
      setKey(provider: ProviderId, key: string | null): Promise<Settings>
      chat(prompt: string, system?: string): Promise<ChatResult>
      testAi(provider: ProviderId, model: string): Promise<ChatResult>
    }
  }
}
export {}
