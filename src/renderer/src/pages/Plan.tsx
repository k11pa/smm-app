import { DragEvent, useEffect, useMemo, useState } from 'react'
import type { BrandProfile } from '../../../main/profile'
import { Brand, MonthStrategy, PLATFORMS, POST_FORMATS, PlanItem, Platform, PostFormat, Settings } from '../../../shared'
import { isInMonth, monthGrid, shiftMonth, todayIso, weekStartFor } from '../calendar'
import type { PlanItemFields } from '../env'
import { TKey, useT } from '../i18n'
import { useErrorText } from './Brand'

export const FORMAT_LABEL: Record<PostFormat, TKey> = {
  post: 'format_post',
  carousel: 'format_carousel',
  reel: 'format_reel',
  story: 'format_story',
  video: 'format_video'
}

type Editing = { item: PlanItem } | { date: string }

export default function Plan({ settings, goBrand, onWrite }: { settings: Settings; goBrand: () => void; onWrite: (itemId: number) => void }) {
  const t = useT()
  const [brand, setBrand] = useState<Brand | null>(null)
  const [profile, setProfile] = useState<BrandProfile | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [view, setView] = useState(() => {
    const now = new Date()
    return { year: now.getFullYear(), month: now.getMonth() }
  })
  const [items, setItems] = useState<PlanItem[]>([])
  const [editing, setEditing] = useState<Editing | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [strategy, setStrategy] = useState<MonthStrategy | null>(null)
  const [postsPerWeek, setPostsPerWeek] = useState(3)
  const [generating, setGenerating] = useState(false)
  const [notice, setNotice] = useState('')
  const [reloadTick, setReloadTick] = useState(0)
  const [itemsTick, setItemsTick] = useState(0)
  const [regeneratingDay, setRegeneratingDay] = useState<string | null>(null)
  const errorText = useErrorText()
  const hasKey = settings.ai.hasKey[settings.ai.provider]

  const today = todayIso()
  const days = useMemo(
    () => monthGrid(view.year, view.month, weekStartFor(brand?.contentLanguage ?? settings.language)),
    [view, brand, settings.language]
  )
  const from = days[0]
  const to = days[days.length - 1]

  useEffect(() => {
    window.api.brand.getCurrent().then((r) => {
      setLoaded(true)
      if (!r.ok) return setError(r.error)
      setBrand(r.brand)
      setProfile(r.profile)
    })
  }, [])

  useEffect(() => {
    if (!brand) return
    let current = true
    window.api.plan.list({ brandId: brand.id, from, to }).then((r) => {
      if (!current) return
      if (r.ok) setItems(r.items)
      else setError(r.error)
    })
    return () => { current = false }
  }, [brand, from, to, reloadTick, itemsTick])

  useEffect(() => setNotice(''), [view])

  useEffect(() => {
    if (!brand) return
    let current = true
    window.api.plan.getStrategy({ brandId: brand.id, year: view.year, month: view.month }).then((r) => {
      if (current && r.ok) setStrategy(r.strategy)
    })
    return () => { current = false }
  }, [brand, view, reloadTick])

  const next = shiftMonth(view.year, view.month, 1)
  const monthIsPast = `${next.year}-${String(next.month + 1).padStart(2, '0')}-01` <= today
  const replaceable = items.filter((i) => isInMonth(i.date, view.year, view.month) && i.date >= today && i.source === 'ai' && !i.edited).length

  async function generate() {
    if (!brand) return
    if (replaceable > 0 && !window.confirm(t('plan_regen_confirm'))) return
    const target = view
    setGenerating(true); setError(''); setNotice('')
    const r = await window.api.plan.generate({ brandId: brand.id, year: target.year, month: target.month, postsPerWeek })
    setGenerating(false)
    if (!r.ok) return setError(errorText(r.error))
    setReloadTick((n) => n + 1)
    setNotice(`${t('plan_generated')}: ${r.created}`)
  }

  async function regenerateDay(date: string) {
    if (!brand) return
    const hasUntouched = items.some((i) => i.date === date && i.source === 'ai' && !i.edited)
    if (hasUntouched && !window.confirm(t('plan_day_confirm'))) return
    setRegeneratingDay(date); setError(''); setNotice('')
    const r = await window.api.plan.regenerateDay({ brandId: brand.id, date })
    setRegeneratingDay(null)
    if (!r.ok) return setError(errorText(r.error))
    setItemsTick((n) => n + 1)
  }

  const formatDay = (options: Intl.DateTimeFormatOptions, iso: string) =>
    new Intl.DateTimeFormat(settings.language, { ...options, timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`))

  const monthTitle = new Intl.DateTimeFormat(settings.language, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(Date.UTC(view.year, view.month, 1))
  )

  async function move(id: number, date: string) {
    const item = items.find((i) => i.id === id)
    if (!item || item.date === date) return
    const previous = items
    setError('')
    setItems(items.map((i) => (i.id === id ? { ...i, date } : i)))
    const r = await window.api.plan.update({ id, changes: { date } })
    if (r.ok) setItems((cur) => cur.map((i) => (i.id === id ? r.item : i)))
    else {
      setItems(previous)
      setError(t('plan_save_failed'))
    }
  }

  function onDrop(e: DragEvent, date: string) {
    e.preventDefault()
    setDropTarget(null)
    const id = Number(e.dataTransfer.getData('text/plain'))
    if (id) move(id, date)
  }

  const inView = (date: string) => date >= from && date <= to

  async function save(fields: PlanItemFields) {
    if (!brand || !editing) return false
    const r = 'item' in editing
      ? await window.api.plan.update({ id: editing.item.id, changes: fields })
      : await window.api.plan.create({ brandId: brand.id, ...fields })
    if (!r.ok) return false
    setItems((cur) => {
      const rest = cur.filter((i) => i.id !== r.item.id)
      return inView(r.item.date) ? [...rest, r.item].sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id) : rest
    })
    setEditing(null)
    return true
  }

  async function remove(id: number) {
    const r = await window.api.plan.delete(id)
    if (!r.ok) return false
    setItems((cur) => cur.filter((i) => i.id !== id))
    setEditing(null)
    return true
  }

  if (!loaded) return <div className="card muted">{t('loading')}</div>
  if (!brand) {
    return (
      <div className="card">
        <h2>{t('nav_plan')}</h2>
        <p className="muted">{t('plan_no_brand')}</p>
        <div className="row"><button className="primary" onClick={goBrand}>{t('plan_go_brand')}</button></div>
      </div>
    )
  }

  return (
    <div className="plan">
      <div className="plan-head">
        <h2 className="plan-title">{monthTitle}</h2>
        <div className="row flush">
          <button aria-label={t('plan_prev')} onClick={() => setView(shiftMonth(view.year, view.month, -1))}>{document.documentElement.dir === 'rtl' ? '→' : '←'}</button>
          <button onClick={() => { const now = new Date(); setView({ year: now.getFullYear(), month: now.getMonth() }) }}>{t('plan_today')}</button>
          <button aria-label={t('plan_next')} onClick={() => setView(shiftMonth(view.year, view.month, 1))}>{document.documentElement.dir === 'rtl' ? '←' : '→'}</button>
          <button className="primary" onClick={() => setEditing({ date: isInMonth(today, view.year, view.month) ? today : `${view.year}-${String(view.month + 1).padStart(2, '0')}-01` })}>{t('plan_add')}</button>
        </div>
      </div>
      {error && <p className="error">{error}</p>}

      <div className="card plan-ai">
        {strategy && (
          <div className="strategy" dir="auto">
            <h3>{t('plan_strategy')}</h3>
            <p>{strategy.focus}</p>
            {strategy.themes.length > 0 && <ul>{strategy.themes.map((theme) => <li key={theme}>{theme}</li>)}</ul>}
            {strategy.rhythm && <p className="muted">{strategy.rhythm}</p>}
          </div>
        )}
        {!profile && <p className="warn">{t('plan_no_brand')} <button className="link" onClick={goBrand}>{t('plan_go_brand')} →</button></p>}
        {!hasKey && <p className="warn">{t('no_key')}</p>}
        {monthIsPast && <p className="muted small">{t('plan_month_past')}</p>}
        <div className="row flush plan-generate">
          <label className="inline" htmlFor="posts-per-week">{t('plan_posts_per_week')}</label>
          <input id="posts-per-week" type="number" min={1} max={14} value={postsPerWeek} onChange={(e) => setPostsPerWeek(Math.min(14, Math.max(1, Number(e.target.value) || 1)))} />
          <button className="primary" disabled={generating || !!regeneratingDay || !hasKey || !profile || monthIsPast} onClick={generate}>
            {generating ? t('plan_generating') : strategy ? t('plan_regenerate') : t('plan_generate')}
          </button>
          {!generating && notice && <span className="ok">{notice}</span>}
        </div>
        <p className="muted small spaced">{t('plan_generate_hint')} {settings.ai.provider} · {settings.ai.model}</p>
      </div>

      <div className="grid" role="grid">
        {days.slice(0, 7).map((d) => <div key={d} className="weekday">{formatDay({ weekday: 'short' }, d)}</div>)}
        {days.map((date) => (
          <div
            key={date}
            data-date={date}
            className={['cell', isInMonth(date, view.year, view.month) ? '' : 'outside', date === today ? 'today' : '', dropTarget === date ? 'drop' : ''].join(' ')}
            onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDropTarget(date) }}
            onDragLeave={() => setDropTarget((cur) => (cur === date ? null : cur))}
            onDrop={(e) => onDrop(e, date)}
          >
            <div className="cell-head">
              <span className="daynum">{Number(date.slice(8))}</span>
              <div className="day-actions">
                {date >= today && profile && (
                  <button
                    className={regeneratingDay === date ? 'link add busy' : 'link add'}
                    aria-label={`${t('plan_day_regen')}: ${date}`}
                    title={hasKey ? t('plan_day_regen') : t('no_key')}
                    disabled={!!regeneratingDay || generating || !hasKey}
                    onClick={() => regenerateDay(date)}
                  >
                    {regeneratingDay === date ? '…' : '↻'}
                  </button>
                )}
                <button className="link add" aria-label={`${t('plan_add')}: ${date}`} onClick={() => setEditing({ date })}>+</button>
              </div>
            </div>
            {items.filter((i) => i.date === date).map((i) => (
              <button
                key={i.id}
                className="chip"
                draggable
                dir="auto"
                title={`${i.platform} · ${t(FORMAT_LABEL[i.format])}\n${i.title}`}
                onDragStart={(e) => { e.dataTransfer.setData('text/plain', String(i.id)); e.dataTransfer.effectAllowed = 'move' }}
                onDragEnd={() => setDropTarget(null)}
                onClick={() => setEditing({ item: i })}
              >
                <span className="chip-meta">{i.platform}{i.source === 'ai' && !i.edited ? ' · AI' : ''}{i.hasPost ? ' · ✓' : ''}</span>
                <span className="chip-title">{i.title}</span>
              </button>
            ))}
          </div>
        ))}
      </div>

      {items.length === 0 && <p className="muted small spaced">{t('plan_empty')}</p>}

      {editing && (
        <ItemForm
          key={'item' in editing ? editing.item.id : editing.date}
          item={'item' in editing ? editing.item : null}
          date={'item' in editing ? editing.item.date : editing.date}
          defaultPlatform={profile?.platforms[0] ?? 'Instagram'}
          pillars={profile?.pillars.map((p) => p.name) ?? []}
          onSave={save}
          onDelete={remove}
          onWrite={onWrite}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}

function ItemForm(props: {
  item: PlanItem | null
  date: string
  defaultPlatform: Platform
  pillars: string[]
  onSave: (fields: PlanItemFields) => Promise<boolean>
  onDelete: (id: number) => Promise<boolean>
  onWrite: (itemId: number) => void
  onClose: () => void
}) {
  const { item, defaultPlatform, onSave, onDelete, onWrite, onClose } = props
  const t = useT()
  const [date, setDate] = useState(props.date)
  const [platform, setPlatform] = useState<Platform>(item?.platform ?? defaultPlatform)
  const [format, setFormat] = useState<PostFormat>(item?.format ?? 'post')
  const [pillar, setPillar] = useState(item?.pillar ?? '')
  const [title, setTitle] = useState(item?.title ?? '')
  const [notes, setNotes] = useState(item?.notes ?? '')
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  // A pillar renamed in the profile must not silently vanish from an existing idea.
  const pillars = pillar && !props.pillars.includes(pillar) ? [pillar, ...props.pillars] : props.pillars

  async function run(action: () => Promise<boolean>) {
    setBusy(true); setFailed(false)
    const ok = await action()
    setBusy(false)
    if (!ok) setFailed(true)
  }

  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }} onKeyDown={(e) => { if (e.key === 'Escape') onClose() }}>
      <div className="dialog card" role="dialog" aria-modal="true" aria-label={item ? t('plan_edit') : t('plan_new')}>
        <h2>{item ? t('plan_edit') : t('plan_new')}</h2>
        <label>{t('plan_f_idea')}</label>
        <textarea dir="auto" rows={3} autoFocus value={title} onChange={(e) => setTitle(e.target.value)} />
        <label>{t('plan_f_date')}</label>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <label>{t('plan_f_platform')}</label>
        <select value={platform} onChange={(e) => setPlatform(e.target.value as Platform)}>
          {PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <label>{t('plan_f_format')}</label>
        <select value={format} onChange={(e) => setFormat(e.target.value as PostFormat)}>
          {POST_FORMATS.map((f) => <option key={f} value={f}>{t(FORMAT_LABEL[f])}</option>)}
        </select>
        <label>{t('plan_f_pillar')}</label>
        <select dir="auto" value={pillar} onChange={(e) => setPillar(e.target.value)}>
          <option value="">{t('plan_no_pillar')}</option>
          {pillars.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <label>{t('f_note')}</label>
        <textarea dir="auto" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />

        {failed && <p className="error">{t('plan_save_failed')}</p>}
        <div className="row">
          <button className="primary" disabled={busy || !title.trim() || !date} onClick={() => run(() => onSave({ date, platform, format, pillar, title: title.trim(), notes: notes.trim() }))}>{t('plan_save')}</button>
          <button disabled={busy} onClick={onClose}>{t('plan_cancel')}</button>
          {item && <button disabled={busy} onClick={() => onWrite(item.id)}>{item.hasPost ? t('post_open') : t('post_write')}</button>}
          {item && <button className="link danger push" disabled={busy} onClick={() => { if (window.confirm(item.hasPost ? t('plan_delete_post_confirm') : t('plan_delete_confirm'))) run(() => onDelete(item.id)) }}>{t('remove_item')}</button>}
        </div>
      </div>
    </div>
  )
}
