import { app, safeStorage } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { DEFAULT_MODELS, ProviderId, Settings } from '../shared'

const file = () => join(app.getPath('userData'), 'settings.json')

interface Stored {
  language: Settings['language']
  provider: ProviderId
  model: string
  keys: Partial<Record<ProviderId, string>> // encrypted, base64
}

const defaults: Stored = {
  language: 'en',
  provider: 'anthropic',
  model: DEFAULT_MODELS.anthropic[0],
  keys: {}
}

function load(): Stored {
  try {
    if (existsSync(file())) return { ...defaults, ...JSON.parse(readFileSync(file(), 'utf8')) }
  } catch {
    /* corrupted file: fall back to defaults */
  }
  return { ...defaults }
}

function save(s: Stored) {
  writeFileSync(file(), JSON.stringify(s, null, 2))
}

export function getSettings(): Settings {
  const s = load()
  return {
    language: s.language,
    ai: {
      provider: s.provider,
      model: s.model,
      hasKey: { anthropic: !!s.keys.anthropic, openai: !!s.keys.openai, gemini: !!s.keys.gemini }
    }
  }
}

export function updateSettings(patch: { language?: Settings['language']; provider?: ProviderId; model?: string }) {
  save({ ...load(), ...patch })
  return getSettings()
}

export function setKey(provider: ProviderId, key: string | null) {
  const s = load()
  if (!key) delete s.keys[provider]
  else {
    const enc = safeStorage.isEncryptionAvailable()
      ? 'enc:' + safeStorage.encryptString(key).toString('base64')
      : 'raw:' + Buffer.from(key).toString('base64')
    s.keys[provider] = enc
  }
  save(s)
  return getSettings()
}

export function getKey(provider: ProviderId): string | null {
  const v = load().keys[provider]
  if (!v) return null
  const buf = Buffer.from(v.slice(4), 'base64')
  return v.startsWith('enc:') ? safeStorage.decryptString(buf) : buf.toString()
}
