import { useState } from 'react'
import { DEFAULT_MODELS, ProviderId, Settings } from '../../../shared'
import { useT } from '../i18n'

const PROVIDERS: { id: ProviderId; name: string; keyUrl: string }[] = [
  { id: 'anthropic', name: 'Anthropic (Claude)', keyUrl: 'https://console.anthropic.com/settings/keys' },
  { id: 'openai', name: 'OpenAI', keyUrl: 'https://platform.openai.com/api-keys' },
  { id: 'gemini', name: 'Google Gemini', keyUrl: 'https://aistudio.google.com/apikey' }
]

export default function SettingsPage({ settings, onChange }: { settings: Settings; onChange: (s: Settings) => void }) {
  const t = useT()
  const { provider, model } = settings.ai
  const [key, setKey] = useState('')
  const [test, setTest] = useState<{ busy?: boolean; ok?: boolean; msg?: string }>({})
  const info = PROVIDERS.find((p) => p.id === provider)!

  const update = async (patch: Parameters<typeof window.api.updateSettings>[0]) => onChange(await window.api.updateSettings(patch))

  return (
    <div className="stack">
      <div className="card">
        <h2>{t('settings_title')}</h2>
        <label>{t('language')}</label>
        <select value={settings.language} onChange={(e) => update({ language: e.target.value as Settings['language'] })}>
          <option value="en">English</option>
          <option value="he">עברית</option>
          <option value="ru">Русский</option>
        </select>
      </div>

      <div className="card">
        <h2>{t('ai_title')}</h2>
        <label>{t('provider')}</label>
        <select value={provider} onChange={(e) => { const p = e.target.value as ProviderId; setTest({}); update({ provider: p, model: DEFAULT_MODELS[p][0] }) }}>
          {PROVIDERS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>

        <label>{t('model')}</label>
        <input list="models" value={model} onChange={(e) => update({ model: e.target.value })} />
        <datalist id="models">{DEFAULT_MODELS[provider].map((m) => <option key={m} value={m} />)}</datalist>

        <label>{t('api_key')}</label>
        <p className={settings.ai.hasKey[provider] ? 'ok small' : 'muted small'}>
          {settings.ai.hasKey[provider] ? t('key_saved') : t('key_none')} · <a href={info.keyUrl} target="_blank">{t('get_key')}</a>
        </p>
        <div className="row">
          <input type="password" value={key} placeholder="sk-…" onChange={(e) => setKey(e.target.value)} />
          <button className="primary" disabled={!key.trim()} onClick={async () => { onChange(await window.api.setKey(provider, key.trim())); setKey(''); setTest({}) }}>{t('save_key')}</button>
          {settings.ai.hasKey[provider] && <button onClick={async () => onChange(await window.api.setKey(provider, null))}>{t('remove_key')}</button>}
        </div>

        <div className="row">
          <button disabled={!settings.ai.hasKey[provider] || test.busy} onClick={async () => {
            setTest({ busy: true })
            const r = await window.api.testAi(provider, model)
            setTest({ ok: r.ok, msg: r.ok ? t('test_ok') : r.error })
          }}>{test.busy ? t('testing') : t('test')}</button>
          {test.msg && <span className={test.ok ? 'ok' : 'error'}>{test.msg}</span>}
        </div>
      </div>
    </div>
  )
}
