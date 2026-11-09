import { app, safeStorage } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { DEFAULT_MODELS, INTERFACE_LANGUAGES, ProviderId, Settings } from '../shared'

const file = () => join(app.getPath('userData'), 'settings.json')

const ENC_PREFIX = 'enc:'
const isEncrypted = (v: string | undefined): v is string => !!v?.startsWith(ENC_PREFIX)

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
    // A saved language may no longer be offered; the Settings dropdown would otherwise show it blank.
    language: INTERFACE_LANGUAGES.some((l) => l.code === s.language) ? s.language : defaults.language,
    ai: {
      provider: s.provider,
      model: s.model,
      hasKey: { anthropic: isEncrypted(s.keys.anthropic), openai: isEncrypted(s.keys.openai), gemini: isEncrypted(s.keys.gemini) }
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
    // Never store a key unencrypted: fail so the UI can tell the user.
    if (!safeStorage.isEncryptionAvailable()) throw new Error('ENCRYPTION_UNAVAILABLE')
    s.keys[provider] = ENC_PREFIX + safeStorage.encryptString(key).toString('base64')
  }
  save(s)
  return getSettings()
}

export function getKey(provider: ProviderId): string | null {
  const v = load().keys[provider]
  if (!isEncrypted(v)) return null
  try {
    return safeStorage.decryptString(Buffer.from(v.slice(ENC_PREFIX.length), 'base64'))
  } catch {
    return null // e.g. settings copied from another Windows user: the key must be re-entered
  }
}
