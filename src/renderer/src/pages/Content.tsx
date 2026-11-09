import { useEffect, useState } from 'react'
import { Brand, PlanItem, Post, Settings, charCount, composePost, normalizeHashtags, postLimits, todayIso } from '../../../shared'
import { useT } from '../i18n'
import { useErrorText } from './Brand'
import { FORMAT_LABEL } from './Plan'

export default function Content(props: { settings: Settings; focusItemId: number | null; goPlan: () => void; goBrand: () => void }) {
  const { settings, focusItemId, goPlan, goBrand } = props
  const t = useT()
  const errorText = useErrorText()
  const [loaded, setLoaded] = useState(false)
  const [brand, setBrand] = useState<Brand | null>(null)
  const [items, setItems] = useState<PlanItem[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(focusItemId)
  const [dirty, setDirty] = useState(false)
  const [error, setError] = useState('')
  const today = todayIso()

  async function loadItems(brandId: number) {
    const r = await window.api.plan.list({ brandId, from: '2000-01-01', to: '2100-01-01' })
    if (!r.ok) return setError(errorText(r.error))
    setItems(r.items)
    setSelectedId((cur) => cur ?? (r.items.find((i) => i.date >= today) ?? r.items[r.items.length - 1])?.id ?? null)
  }

  useEffect(() => {
    window.api.brand.getCurrent().then(async (r) => {
      if (!r.ok) { setLoaded(true); return setError(errorText(r.error)) }
      setBrand(r.brand)
      if (r.brand) await loadItems(r.brand.id)
      setLoaded(true)
    })
  }, [])

  function select(id: number) {
    if (id === selectedId) return
    if (dirty && !window.confirm(t('post_discard_confirm'))) return
    setDirty(false)
    setSelectedId(id)
  }

  if (!loaded) return <div className="card muted">{t('loading')}</div>
  if (!brand) {
    return (
      <div className="card">
        <h2>{t('nav_content')}</h2>
        <p className="muted">{t('plan_no_brand')}</p>
        <div className="row"><button className="primary" onClick={goBrand}>{t('plan_go_brand')}</button></div>
      </div>
    )
  }
  if (!items.length) {
    return (
      <div className="card">
        <h2>{t('nav_content')}</h2>
        <p className="muted">{t('post_no_ideas')}</p>
        <div className="row"><button className="primary" onClick={goPlan}>{t('post_go_plan')}</button></div>
      </div>
    )
  }

  const selected = items.find((i) => i.id === selectedId) ?? null
  const formatDate = (iso: string) =>
    new Intl.DateTimeFormat(settings.language, { day: 'numeric', month: 'short', weekday: 'short', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`))

  return (
    <div className="content-page">
      <aside className="idea-list" aria-label={t('post_ideas')}>
        <h2>{t('post_ideas')}</h2>
        {items.map((i) => (
          <button key={i.id} className={['idea-row', i.id === selectedId ? 'active' : '', i.date < today ? 'past' : ''].join(' ')} onClick={() => select(i.id)}>
            <span className="chip-meta">{formatDate(i.date)} · {i.platform}{i.hasPost ? ' · ✓' : ''}</span>
            <span className="chip-title" dir="auto">{i.title}</span>
          </button>
        ))}
      </aside>
      <div className="post-pane">
        {error && <p className="error">{error}</p>}
        {selected && (
          <PostEditor
            key={selected.id}
            item={selected}
            settings={settings}
            dateLabel={formatDate(selected.date)}
            onDirty={setDirty}
            onSaved={() => loadItems(brand.id)}
          />
        )}
      </div>
    </div>
  )
}

function PostEditor(props: { item: PlanItem; settings: Settings; dateLabel: string; onDirty: (dirty: boolean) => void; onSaved: () => void }) {
  const { item, settings, dateLabel, onDirty, onSaved } = props
  const t = useT()
  const errorText = useErrorText()
  const [post, setPost] = useState<Post | null>(null)
  const [body, setBody] = useState('')
  const [tags, setTags] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState<'' | 'generate' | 'save'>('')
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null)
  const [copied, setCopied] = useState(false)
  const hasKey = settings.ai.hasKey[settings.ai.provider]

  const limits = postLimits(item.platform, item.format)
  const hashtags = normalizeHashtags([tags])
  const full = composePost(body, hashtags)
  const length = charCount(full)
  const dirty = loaded && (body !== (post?.body ?? '') || hashtags.join(' ') !== (post?.hashtags.join(' ') ?? ''))

  useEffect(() => { onDirty(dirty) }, [dirty])

  function show(next: Post | null) {
    setPost(next)
    setBody(next?.body ?? '')
    setTags(next?.hashtags.join(' ') ?? '')
  }

  useEffect(() => {
    let current = true
    window.api.post.get(item.id).then((r) => {
      if (!current) return
      setLoaded(true)
      if (r.ok) show(r.post)
      else setStatus({ ok: false, msg: errorText(r.error) })
    })
    return () => { current = false }
  }, [item.id])

  async function generate() {
    if ((post || dirty) && !window.confirm(t('post_regen_confirm'))) return
    setBusy('generate'); setStatus(null)
    const r = await window.api.post.generate(item.id)
    setBusy('')
    if (!r.ok) return setStatus({ ok: false, msg: errorText(r.error) })
    show(r.post)
    onSaved()
  }

  async function save() {
    setBusy('save'); setStatus(null)
    const r = await window.api.post.save({ planItemId: item.id, body, hashtags })
    setBusy('')
    if (!r.ok) return setStatus({ ok: false, msg: errorText(r.error) })
    show(r.post)
    setStatus({ ok: true, msg: `${t('saved_version')} ${r.post.version}` })
    onSaved()
  }

  async function copy() {
    await navigator.clipboard.writeText(full)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="card post-card">
      <p className="muted small">{dateLabel} · {item.platform} · {t(FORMAT_LABEL[item.format])}{item.pillar ? ` · ${item.pillar}` : ''}</p>
      <h2 dir="auto">{item.title}</h2>
      {item.notes && <p className="muted" dir="auto">{item.notes}</p>}
      {!hasKey && <p className="warn">{t('no_key')}</p>}

      <div className="row">
        <button className="primary" disabled={!!busy || !hasKey || !loaded} onClick={generate}>
          {busy === 'generate' ? t('post_generating') : post ? t('post_regenerate') : t('post_generate')}
        </button>
        <span className="muted small">{settings.ai.provider} · {settings.ai.model}</span>
      </div>

      <label>{t('post_text')}</label>
      <textarea dir="auto" rows={12} value={body} onChange={(e) => { setBody(e.target.value); setStatus(null) }} />
      <label>{t('post_hashtags')}</label>
      <input dir="auto" value={tags} onChange={(e) => { setTags(e.target.value); setStatus(null) }} />

      <p className={length > limits.chars ? 'error small spaced' : 'muted small spaced'}>
        {t('post_chars')}: {length} / {limits.chars}{length > limits.chars ? ` · ${t('post_over_limit')}` : ''}
      </p>
      {hashtags.length > limits.hashtags && <p className="warn small">{t('post_too_many_tags')}: {hashtags.length} / {limits.hashtags}</p>}

      <div className="row">
        <button disabled={!!busy || !dirty || !body.trim()} onClick={save}>{busy === 'save' ? t('saving') : t('post_save')}</button>
        <button disabled={!body.trim()} onClick={copy}>{copied ? t('copied') : t('copy')}</button>
        {status && <span className={status.ok ? 'ok' : 'error'}>{status.msg}</span>}
        {!status && dirty && <span className="muted small">{t('unsaved')}</span>}
      </div>
    </div>
  )
}
