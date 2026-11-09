import { ReactNode, useState } from 'react'
import type { BrandProfile } from '../../../main/profile'
import { Brand, CONTENT_LANGUAGES, ProfileSection, ProfileSource, Settings } from '../../../shared'
import type { BrandFields } from '../env'
import { TKey, useT } from '../i18n'
import { PlatformPicker, useErrorText } from './Brand'

const SECTION_LABEL: Record<ProfileSection, TKey> = {
  about: 'section_about',
  audience: 'section_audience',
  tone: 'section_tone',
  pillars: 'section_pillars',
  competitors: 'section_competitors',
  markets: 'section_markets',
  platforms: 'section_platforms',
  goals: 'section_goals'
}

const cleanList = (items: string[]) => items.map((s) => s.trim()).filter(Boolean)

// Lists are edited one item per line, so blank lines exist while typing and are dropped on save.
function cleanProfile(p: BrandProfile): BrandProfile {
  return {
    ...p,
    products: cleanList(p.products),
    usp: cleanList(p.usp),
    proofPoints: cleanList(p.proofPoints),
    avoid: cleanList(p.avoid),
    audience: p.audience.map((a) => ({ ...a, painPoints: cleanList(a.painPoints) })),
    tone: { ...p.tone, do: cleanList(p.tone.do), dont: cleanList(p.tone.dont), examples: cleanList(p.tone.examples) },
    pillars: p.pillars.map((x) => ({ ...x, examples: cleanList(x.examples) })),
    competitors: p.competitors.map((c) => ({ ...c, url: c.url?.trim() || null })),
    markets: cleanList(p.markets),
    goals: cleanList(p.goals)
  }
}

export default function ProfileEditor(props: {
  brandId: number | null
  fields: BrandFields
  initial: BrandProfile
  initialSource: ProfileSource
  initiallySaved: boolean
  settings: Settings
  goSettings: () => void
  onSaved: (b: Brand) => void
  onStartOver: () => void
}) {
  const { fields, settings, goSettings, onSaved, onStartOver } = props
  const t = useT()
  const errorText = useErrorText()
  const [brandId, setBrandId] = useState(props.brandId)
  const [p, setP] = useState(props.initial)
  const [source, setSource] = useState(props.initialSource)
  const [dirty, setDirty] = useState(!props.initiallySaved)
  const [regenerating, setRegenerating] = useState<ProfileSection | null>(null)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null)
  const hasKey = settings.ai.hasKey[settings.ai.provider]

  // Any manual change means the saved version is the owner's, not the model's.
  function edit(patch: Partial<BrandProfile>) {
    setP((cur) => ({ ...cur, ...patch }))
    setSource('user')
    setDirty(true)
    setStatus(null)
  }

  async function regenerate(section: ProfileSection) {
    if (!window.confirm(t('regen_confirm'))) return
    setRegenerating(section); setStatus(null)
    const r = await window.api.brand.regenerateSection({ name: fields.name, contentLanguage: fields.contentLanguage, section, profile: cleanProfile(p) })
    setRegenerating(null)
    if (r.ok) {
      setP((cur) => ({ ...cur, ...r.data }))
      setDirty(true)
    } else setStatus({ ok: false, msg: errorText(r.error) })
  }

  async function save() {
    setSaving(true); setStatus(null)
    const profile = cleanProfile(p)
    const r = await window.api.brand.save({ brandId, ...fields, profile, source })
    setSaving(false)
    if (!r.ok) return setStatus({ ok: false, msg: errorText(r.error) })
    setP(profile)
    setBrandId(r.brand.id)
    setDirty(false)
    setStatus({ ok: true, msg: `${t('saved_version')} ${r.version}` })
    onSaved(r.brand)
  }

  const section = (id: ProfileSection, children: ReactNode, hint?: string) => (
    <div className="card">
      <div className="section-head">
        <h2>{t(SECTION_LABEL[id])}</h2>
        <button disabled={!!regenerating || !hasKey} onClick={() => regenerate(id)}>
          {regenerating === id ? t('regenerating') : t('regenerate')}
        </button>
      </div>
      {hint && <p className="muted small">{hint}</p>}
      {children}
    </div>
  )

  return (
    <div className="stack">
      <div className="card">
        <div className="section-head">
          <div>
            <h2 dir="auto">{fields.name}</h2>
            <p className="muted small" dir="auto">{fields.website ?? t('no_website')}</p>
            <p className="muted small">{t('content_language')}: {CONTENT_LANGUAGES.find((l) => l.code === fields.contentLanguage)?.native ?? fields.contentLanguage}</p>
          </div>
          <button onClick={() => { if (!dirty || window.confirm(t('start_over_confirm'))) onStartOver() }}>{t('start_over')}</button>
        </div>
        {!hasKey && <p className="warn">{t('no_key')} <button className="link" onClick={goSettings}>{t('nav_settings')} →</button></p>}
        <SaveRow dirty={dirty} saving={saving} status={status} onSave={save} />
      </div>

      {section('about', (
        <>
          <Field label={t('f_summary')} value={p.summary} rows={4} onChange={(summary) => edit({ summary })} />
          <Lines label={t('f_products')} value={p.products} onChange={(products) => edit({ products })} />
          <Lines label={t('f_usp')} value={p.usp} onChange={(usp) => edit({ usp })} />
          <Lines label={t('f_proof')} value={p.proofPoints} onChange={(proofPoints) => edit({ proofPoints })} />
        </>
      ))}

      {section('audience', (
        <Cards
          items={p.audience}
          addLabel={t('add_segment')}
          blank={{ name: '', description: '', painPoints: [] }}
          onChange={(audience) => edit({ audience })}
          render={(a, set) => (
            <>
              <Field label={t('f_name')} value={a.name} rows={1} onChange={(name) => set({ ...a, name })} />
              <Field label={t('f_description')} value={a.description} onChange={(description) => set({ ...a, description })} />
              <Lines label={t('f_pain_points')} value={a.painPoints} onChange={(painPoints) => set({ ...a, painPoints })} />
            </>
          )}
        />
      ))}

      {section('tone', (
        <>
          <Field label={t('f_description')} value={p.tone.description} onChange={(description) => edit({ tone: { ...p.tone, description } })} />
          <Field label={t('f_cta')} value={p.tone.cta} rows={1} onChange={(cta) => edit({ tone: { ...p.tone, cta } })} />
          <Lines label={t('f_do')} value={p.tone.do} onChange={(v) => edit({ tone: { ...p.tone, do: v } })} />
          <Lines label={t('f_dont')} value={p.tone.dont} onChange={(v) => edit({ tone: { ...p.tone, dont: v } })} />
          <Lines label={t('f_tone_examples')} value={p.tone.examples} onChange={(examples) => edit({ tone: { ...p.tone, examples } })} />
          <Lines label={t('f_avoid')} value={p.avoid} onChange={(avoid) => edit({ avoid })} />
        </>
      ))}

      {section('pillars', (
        <Cards
          items={p.pillars}
          addLabel={t('add_pillar')}
          blank={{ name: '', description: '', examples: [] }}
          onChange={(pillars) => edit({ pillars })}
          render={(x, set) => (
            <>
              <Field label={t('f_name')} value={x.name} rows={1} onChange={(name) => set({ ...x, name })} />
              <Field label={t('f_description')} value={x.description} onChange={(description) => set({ ...x, description })} />
              <Lines label={t('f_post_ideas')} value={x.examples} onChange={(examples) => set({ ...x, examples })} />
            </>
          )}
        />
      ))}

      {section('competitors', (
        <Cards
          items={p.competitors}
          addLabel={t('add_competitor')}
          blank={{ name: '', url: null, note: '', source: 'user' as const, verified: false }}
          onChange={(competitors) => edit({ competitors })}
          render={(c, set) => (
            <>
              {c.source === 'ai' && (
                <div className="row">
                  <span className={c.verified ? 'badge ok' : 'badge unverified'}>{c.verified ? t('verified') : t('unverified')}</span>
                  <button onClick={() => set({ ...c, verified: !c.verified })}>{c.verified ? t('mark_unverified') : t('mark_verified')}</button>
                </div>
              )}
              <Field label={t('f_name')} value={c.name} rows={1} onChange={(name) => set({ ...c, name })} />
              <label>{t('f_url')}</label>
              <input dir="ltr" value={c.url ?? ''} onChange={(e) => set({ ...c, url: e.target.value })} />
              <Field label={t('f_note')} value={c.note} onChange={(note) => set({ ...c, note })} />
            </>
          )}
        />
      ), t('competitors_hint'))}

      {section('markets', <Lines label={t('f_one_per_line')} value={p.markets} onChange={(markets) => edit({ markets })} />)}
      {section('platforms', <PlatformPicker value={p.platforms} onChange={(platforms) => edit({ platforms })} />)}
      {section('goals', <Lines label={t('f_one_per_line')} value={p.goals} onChange={(goals) => edit({ goals })} />)}

      <div className="card"><SaveRow dirty={dirty} saving={saving} status={status} onSave={save} /></div>
    </div>
  )
}

function SaveRow({ dirty, saving, status, onSave }: { dirty: boolean; saving: boolean; status: { ok: boolean; msg: string } | null; onSave: () => void }) {
  const t = useT()
  return (
    <div className="row">
      <button className="primary" disabled={!dirty || saving} onClick={onSave}>{saving ? t('saving') : t('save_profile')}</button>
      {status && <span className={status.ok ? 'ok' : 'error'}>{status.msg}</span>}
      {!status && dirty && <span className="muted small">{t('unsaved')}</span>}
    </div>
  )
}

function Field({ label, value, onChange, rows = 2 }: { label: string; value: string; onChange: (v: string) => void; rows?: number }) {
  return (
    <>
      <label>{label}</label>
      <textarea dir="auto" rows={rows} value={value} onChange={(e) => onChange(e.target.value)} />
    </>
  )
}

function Lines({ label, value, onChange }: { label: string; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <>
      <label>{label}</label>
      <textarea dir="auto" rows={Math.max(3, value.length + 1)} value={value.join('\n')} onChange={(e) => onChange(e.target.value.split('\n'))} />
    </>
  )
}

function Cards<T>(props: { items: T[]; blank: T; addLabel: string; onChange: (items: T[]) => void; render: (item: T, set: (next: T) => void) => ReactNode }) {
  const { items, blank, addLabel, onChange, render } = props
  const t = useT()
  return (
    <>
      {items.map((item, i) => (
        <div key={i} className="subcard">
          {render(item, (next) => onChange(items.map((x, j) => (j === i ? next : x))))}
          <div className="row">
            <button className="link danger" onClick={() => onChange(items.filter((_, j) => j !== i))}>{t('remove_item')}</button>
          </div>
        </div>
      ))}
      <div className="row"><button onClick={() => onChange([...items, blank])}>{addLabel}</button></div>
    </>
  )
}
