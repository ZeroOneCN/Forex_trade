import { useState, useEffect } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useTranslation } from '../i18n/I18nProvider'

function Breadcrumb({ currentLabel, t }) {
  return (
    <nav className="breadcrumb" style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-xs)', fontSize: '14px', color: 'var(--muted)' }}>
      <NavLink to="/" style={{ color: 'var(--muted)' }}>{t('nav.home')}</NavLink>
      <span style={{ color: 'var(--muted-dim)' }}>/</span>
      <span style={{ color: 'var(--ink)', fontWeight: 600 }}>{currentLabel}</span>
    </nav>
  )
}

function LanguageSwitcher({ t, locale, setLocale, locales }) {
  const [open, setOpen] = useState(false)
  const current = locales.find(l => l.code === locale)
  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        className="btn btn-ghost"
        style={{ width: 40, height: 40, padding: 0 }}
        title={current.label}
        aria-label={current.label}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="2" y1="12" x2="22" y2="12" />
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        </svg>
      </button>
      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 298 }} onClick={() => setOpen(false)} />
          <div style={{
            position: 'absolute',
            right: 0,
            top: 'calc(100% + 6px)',
            background: 'var(--surface-indigo)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--r-md)',
            padding: 4,
            minWidth: 150,
            zIndex: 299,
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
          }}>
            {locales.map(l => (
              <button
                key={l.code}
                onClick={() => { setLocale(l.code); setOpen(false) }}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--s-sm)',
                  padding: '8px 12px',
                  borderRadius: 'var(--r-xs)',
                  background: l.code === locale ? 'var(--primary)' : 'transparent',
                  color: l.code === locale ? 'var(--on-colored)' : 'var(--ink)',
                  fontSize: 13,
                  fontWeight: 600,
                  textAlign: 'left',
                  cursor: 'pointer',
                  border: 'none',
                }}
              >
                <span style={{ fontSize: 16 }}>{l.flag}</span>
                <span>{l.label}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

export default function Layout({ children }) {
  const location = useLocation()
  const { t, locale, setLocale, locales } = useTranslation()

  const NAV_ITEMS = [
    { path: '/', label: t('nav.dashboard'), short: t('nav.dashboardShort') },
    { path: '/trades', label: t('nav.trades'), short: t('nav.tradesShort') },
    { path: '/calendar', label: t('nav.calendar'), short: t('nav.calendarShort') },
    { path: '/calculator', label: t('nav.calculator'), short: t('nav.calculatorShort') },
    { path: '/capital', label: t('nav.capital'), short: t('nav.capitalShort') },
    { path: '/insights', label: t('nav.insights'), short: t('nav.insightsShort') },
  ]

  const current = NAV_ITEMS.find(n => n.path === location.pathname) || NAV_ITEMS[0]
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark')

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('theme', theme)
  }, [theme])

  useEffect(() => {
    localStorage.setItem('currentTab', location.pathname)
  }, [location.pathname])

  const toggleTheme = () => {
    setTheme(th => th === 'dark' ? 'light' : 'dark')
  }

  return (
    <div style={{ minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
      <header className="layout-nav-wrap" style={{
        background: 'var(--canvas)',
        borderBottom: '1px solid var(--border)',
        padding: 'var(--s-md) var(--s-xxl)',
        position: 'sticky',
        top: 0,
        zIndex: 100,
      }}>
        <div className="layout-nav" style={{ maxWidth: '1280px', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--s-xl)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-lg)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-sm)' }}>
              <img src="/favicon.svg" alt="logo" style={{ width: 32, height: 32, borderRadius: 'var(--r-xs)' }} />
              <div style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 700,
                fontSize: '18px',
                letterSpacing: '0.02em',
                color: 'var(--ink)',
              }}>
                {t('nav.title')}
              </div>
            </div>
            <Breadcrumb currentLabel={current.label} t={t} />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-md)' }}>
            <nav className="layout-nav-links" style={{ display: 'flex', gap: 'var(--s-xs)' }}>
              {NAV_ITEMS.map(item => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  className="nav-link"
                  style={({ isActive }) => ({
                    padding: 'var(--s-xs) var(--s-md)',
                    borderRadius: 'var(--r-sm)',
                    fontSize: '14px',
                    fontWeight: 600,
                    color: isActive ? 'var(--on-colored)' : 'var(--muted)',
                    background: isActive ? 'var(--primary)' : 'transparent',
                    transition: 'all 0.15s',
                  })}
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
            <button
              onClick={toggleTheme}
              className="btn btn-ghost"
              style={{ width: 40, height: 40, padding: 0, fontSize: 18 }}
              title={theme === 'dark' ? t('nav.switchLight') : t('nav.switchDark')}
            >
              {theme === 'dark' ? '☀' : '☾'}
            </button>
            <LanguageSwitcher t={t} locale={locale} setLocale={setLocale} locales={locales} />
          </div>
        </div>
      </header>

      <main className="layout-content" style={{
        flex: 1,
        maxWidth: '1280px',
        width: '100%',
        margin: '0 auto',
        padding: 'var(--s-xxl) var(--s-xxl) var(--s-section)',
      }}>
        {children}
      </main>

      <footer style={{
        background: 'var(--canvas)',
        borderTop: '1px solid var(--border)',
        padding: 'var(--s-xl) var(--s-xxl)',
        textAlign: 'center',
      }}>
        <span className="caption">{t('nav.footer')}</span>
      </footer>
    </div>
  )
}
