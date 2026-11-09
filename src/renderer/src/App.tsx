import { useEffect, useState } from 'react'
import type { Settings } from '../../shared'
import { I18nContext, TKey, translate } from './i18n'
import Home from './pages/Home'
import SettingsPage from './pages/Settings'

type Page = 'home' | 'brand' | 'plan' | 'content' | 'publish' | 'analytics' | 'settings'
const NAV: { id: Page; label: TKey }[] = [
  { id: 'home', label: 'nav_home' },
  { id: 'brand', label: 'nav_brand' },
  { id: 'plan', label: 'nav_plan' },
  { id: 'content', label: 'nav_content' },
  { id: 'publish', label: 'nav_publish' },
  { id: 'analytics', label: 'nav_analytics' },
  { id: 'settings', label: 'nav_settings' }
]

export default function App() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [page, setPage] = useState<Page>('home')

  useEffect(() => { window.api.getSettings().then(setSettings) }, [])
  useEffect(() => {
    if (!settings) return
    document.documentElement.lang = settings.language
    document.documentElement.dir = settings.language === 'he' ? 'rtl' : 'ltr'
  }, [settings?.language])

  if (!settings) return null
  const t = translate(settings.language)

  return (
    <I18nContext.Provider value={t}>
      <div className="layout">
        <aside className="sidebar">
          <div className="logo">{t('appName')}</div>
          {NAV.map((n) => (
            <button key={n.id} className={page === n.id ? 'nav active' : 'nav'} onClick={() => setPage(n.id)}>
              {t(n.label)}
            </button>
          ))}
        </aside>
        <main className="content">
          {page === 'home' && <Home settings={settings} goSettings={() => setPage('settings')} />}
          {page === 'settings' && <SettingsPage settings={settings} onChange={setSettings} />}
          {!['home', 'settings'].includes(page) && (
            <div className="card"><h2>{t(NAV.find((n) => n.id === page)!.label)}</h2><p className="muted">{t('soon')}</p></div>
          )}
        </main>
      </div>
    </I18nContext.Provider>
  )
}
