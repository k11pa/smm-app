import { useEffect, useState } from 'react'
import type { BrandAnswers, BrandProfile } from '../../../main/profile'
import { Brand as BrandRow, CONTENT_LANGUAGES, PLATFORMS, Platform, ProfileSource, Settings } from '../../../shared'
import type { BrandFields } from '../env'
import { TKey, useT } from '../i18n'
import ProfileEditor from './ProfileEditor'

const EMPTY_ANSWERS: BrandAnswers = { business: '', products: '', audience: '', markets: '', goals: '', tone: '', platforms: [], competitors: '' }

const KNOWN_ERRORS: Record<string, TKey> = {
  NO_KEY: 'no_key',
  AI_INVALID: 'err_ai_invalid',
  INVALID_INPUT: 'err_invalid',
  SITE_INVALID_URL: 'err_site_url',
  SITE_BLOCKED: 'err_site_blocked',
  SITE_UNREACHABLE: 'err_site_unreachable',
  SITE_NOT_HTML: 'err_site_not_html',
  SITE_NO_TEXT: 'err_site_no_text'
}

export const useErrorText = () => {
  const t = useT()
  return (code: string) => (KNOWN_ERRORS[code] ? t(KNOWN_ERRORS[code]) : code)
}

export default function Brand({ settings, goSettings }: { settings: Settings; goSettings: () => void }) {
  const t = useT()
  const [loaded, setLoaded] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [brand, setBrand] = useState<BrandRow | null>(null)
  const [draft, setDraft] = useState<{ fields: BrandFields; profile: BrandProfile; source: ProfileSource; saved: boolean } | null>(null)
  const errorText = useErrorText()

  useEffect(() => {
    window.api.brand.getCurrent().then((r) => {
      setLoaded(true)
      if (!r.ok) return setLoadError(r.error)
      setBrand(r.brand)
      if (r.brand && r.profile) {
        const { name, website, contentLanguage } = r.brand
        setDraft({ fields: { name, website, contentLanguage }, profile: r.profile, source: 'user', saved: true })
      }
    })
  }, [])

  if (!loaded) return <div className="card muted">{t('loading')}</div>
  if (loadError) return <div className="card error">{errorText(loadError)}</div>

  if (draft) {
    return (
      <ProfileEditor
        key={draft.fields.name}
        brandId={brand?.id ?? null}
        fields={draft.fields}
        initial={draft.profile}
        initialSource={draft.source}
        initiallySaved={draft.saved}
        settings={settings}
        goSettings={goSettings}
        onSaved={setBrand}
        onStartOver={() => setDraft(null)}
      />
    )
  }
  return (
    <Wizard
      brand={brand}
      settings={settings}
      goSettings={goSettings}
      onDraft={(fields, profile) => setDraft({ fields, profile, source: 'ai', saved: false })}
    />
  )
}

function Wizard(props: {
  brand: BrandRow | null
  settings: Settings
  goSettings: () => void
  onDraft: (fields: BrandFields, profile: BrandProfile) => void
}) {
  const { brand, settings, goSettings, onDraft } = props
  const t = useT()
  const errorText = useErrorText()
  const [step, setStep] = useState<'source' | 'answers'>('source')
  const [name, setName] = useState(brand?.name ?? '')
  const [website, setWebsite] = useState(brand?.website ?? '')
  const [language, setLanguage] = useState<string>(brand?.contentLanguage ?? settings.language)
  const [siteError, setSiteError] = useState('')
  const [pasted, setPasted] = useState('')
  const [siteText, setSiteText] = useState('')
  const [answers, setAnswers] = useState<BrandAnswers>(EMPTY_ANSWERS)
  const [busy, setBusy] = useState<'' | 'site' | 'suggest' | 'generate'>('')
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const hasKey = settings.ai.hasKey[settings.ai.provider]

  const fields = (): BrandFields => ({ name: name.trim(), website: website.trim() || null, contentLanguage: language })
  const setAnswer = (k: keyof BrandAnswers) => (v: string) => setAnswers((a) => ({ ...a, [k]: v }))

  async function prefill(text: string) {
    if (!hasKey) return setNotice(t('prefill_no_key'))
    setBusy('suggest')
    const r = await window.api.brand.suggestAnswers({ name: name.trim(), contentLanguage: language, siteText: text })
    setBusy('')
    if (r.ok) setAnswers((a) => ({ ...a, ...r.data, platforms: a.platforms, goals: a.goals, competitors: a.competitors }))
    else setNotice(`${t('prefill_failed')} ${errorText(r.error)}`)
  }

  async function next() {
    setSiteError(''); setNotice(''); setError('')
    let text = pasted.trim()
    if (!text && website.trim()) {
      setBusy('site')
      const r = await window.api.brand.fetchSite(website.trim())
      setBusy('')
      if (!r.ok) return setSiteError(r.error)
      text = r.text
    }
    setSiteText(text)
    setStep('answers')
    if (text) await prefill(text)
  }

  async function generate() {
    setBusy('generate'); setError('')
    const r = await window.api.brand.generate({ ...fields(), answers, siteText: siteText || undefined })
    setBusy('')
    if (r.ok) onDraft(fields(), r.data)
    else setError(errorText(r.error))
  }

  if (step === 'source') {
    return (
      <div className="card">
        <h2>{t('wizard_title')}</h2>
        <p className="muted">{t('wizard_hint')}</p>
        <label>{t('brand_name')}</label>
        <input dir="auto" value={name} onChange={(e) => setName(e.target.value)} />
        <label>{t('brand_website')}</label>
        <input dir="ltr" value={website} placeholder="https://" onChange={(e) => { setWebsite(e.target.value); setSiteError('') }} />
        <p className="muted small">{t('brand_website_hint')}</p>
        <label>{t('content_language')}</label>
        <select value={language} onChange={(e) => setLanguage(e.target.value)}>
          {CONTENT_LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.native}</option>)}
        </select>
        <p className="muted small">{t('content_language_hint')}</p>

        {siteError && (
          <>
            <p className="warn">{errorText(siteError)}</p>
            <label>{t('paste_label')}</label>
            <textarea dir="auto" rows={6} value={pasted} onChange={(e) => setPasted(e.target.value)} />
          </>
        )}

        <div className="row">
          <button className="primary" disabled={!name.trim() || !!busy} onClick={next}>{busy === 'site' ? t('site_loading') : t('next')}</button>
          {siteError && !pasted.trim() && <button onClick={() => { setWebsite(''); setSiteError(''); setSiteText(''); setStep('answers') }}>{t('continue_without_site')}</button>}
        </div>
      </div>
    )
  }

  return (
    <div className="card">
      <h2>{t('questions_title')}</h2>
      <p className="muted">{t('questions_hint')}</p>
      {busy === 'suggest' && <p className="muted">{t('prefilling')}</p>}
      {notice && <p className="warn">{notice}</p>}
      {!hasKey && <p className="warn">{t('no_key')} <button className="link" onClick={goSettings}>{t('nav_settings')} →</button></p>}

      <Question label={t('q_business')} value={answers.business} onChange={setAnswer('business')} />
      <Question label={t('q_products')} value={answers.products} onChange={setAnswer('products')} />
      <Question label={t('q_audience')} value={answers.audience} onChange={setAnswer('audience')} />
      <Question label={t('q_markets')} value={answers.markets} onChange={setAnswer('markets')} rows={1} />
      <Question label={t('q_goals')} value={answers.goals} onChange={setAnswer('goals')} />
      <Question label={t('q_tone')} value={answers.tone} onChange={setAnswer('tone')} />
      <label>{t('q_platforms')}</label>
      <PlatformPicker value={answers.platforms} onChange={(platforms) => setAnswers((a) => ({ ...a, platforms }))} />
      <Question label={t('q_competitors')} value={answers.competitors} onChange={setAnswer('competitors')} />

      {error && <p className="error">{error}</p>}
      <div className="row">
        <button disabled={!!busy} onClick={() => setStep('source')}>{t('back')}</button>
        <button className="primary" disabled={!!busy || !hasKey || (!answers.business.trim() && !siteText)} onClick={generate}>
          {busy === 'generate' ? t('generating_profile') : t('generate_profile')}
        </button>
        <span className="muted small">{settings.ai.provider} · {settings.ai.model}</span>
      </div>
      <p className="muted small spaced">{t('uses_your_key')}</p>
    </div>
  )
}

function Question({ label, value, onChange, rows = 2 }: { label: string; value: string; onChange: (v: string) => void; rows?: number }) {
  return (
    <>
      <label>{label}</label>
      <textarea dir="auto" rows={rows} value={value} onChange={(e) => onChange(e.target.value)} />
    </>
  )
}

export function PlatformPicker({ value, onChange }: { value: Platform[]; onChange: (v: Platform[]) => void }) {
  return (
    <div className="checks">
      {PLATFORMS.map((p) => (
        <label key={p} className="check">
          <input
            type="checkbox"
            checked={value.includes(p)}
            onChange={(e) => onChange(e.target.checked ? [...value, p] : value.filter((x) => x !== p))}
          />
          {p}
        </label>
      ))}
    </div>
  )
}
