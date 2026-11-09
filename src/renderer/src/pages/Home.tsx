import { useState } from 'react'
import type { Settings } from '../../../shared'
import { useT } from '../i18n'

const SYSTEM = 'You are an expert social media manager for small businesses in Israel and Europe. Write ready-to-publish content: a strong hook, body, call to action and relevant hashtags. Answer in the language of the request.'

export default function Home({ settings, goSettings }: { settings: Settings; goSettings: () => void }) {
  const t = useT()
  const [prompt, setPrompt] = useState('')
  const [out, setOut] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const hasKey = settings.ai.hasKey[settings.ai.provider]

  async function run() {
    setBusy(true); setErr(''); setOut('')
    const r = await window.api.chat(prompt, SYSTEM)
    setBusy(false)
    if (r.ok) setOut(r.text ?? '')
    else setErr(r.error === 'NO_KEY' ? t('no_key') : r.error ?? 'Error')
  }

  return (
    <div className="card">
      <h2>{t('home_title')}</h2>
      <p className="muted">{t('home_hint')}</p>
      {!hasKey && <p className="warn">{t('no_key')} <button className="link" onClick={goSettings}>{t('nav_settings')} →</button></p>}
      <textarea rows={4} value={prompt} placeholder={t('home_placeholder')} onChange={(e) => setPrompt(e.target.value)} />
      <div className="row">
        <button className="primary" disabled={busy || !prompt.trim() || !hasKey} onClick={run}>{busy ? t('generating') : t('generate')}</button>
        <span className="muted small">{settings.ai.provider} · {settings.ai.model}</span>
      </div>
      {err && <p className="error">{err}</p>}
      {out && (
        <div className="output">
          <pre>{out}</pre>
          <button onClick={() => { navigator.clipboard.writeText(out); setCopied(true); setTimeout(() => setCopied(false), 1500) }}>
            {copied ? t('copied') : t('copy')}
          </button>
        </div>
      )}
    </div>
  )
}
