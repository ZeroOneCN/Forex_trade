import { useState, useEffect } from 'react'
import { NavLink, useLocation } from 'react-router-dom'

const NAV_ITEMS = [
  { path: '/', label: '统计看板', short: '首页' },
  { path: '/trades', label: '交易动态', short: '交易' },
  { path: '/calendar', label: '交易日历', short: '日历' },
  { path: '/calculator', label: '交易计算', short: '计算' },
  { path: '/capital', label: '资金动态', short: '资金' },
]

function Breadcrumb({ currentLabel }) {
  return (
    <nav className="breadcrumb" style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-xs)', fontSize: '14px', color: 'var(--muted)' }}>
      <NavLink to="/" style={{ color: 'var(--muted)' }}>首页</NavLink>
      <span style={{ color: 'var(--muted-dim)' }}>/</span>
      <span style={{ color: 'var(--ink)', fontWeight: 600 }}>{currentLabel}</span>
    </nav>
  )
}

export default function Layout({ children }) {
  const location = useLocation()
  const current = NAV_ITEMS.find(n => n.path === location.pathname) || NAV_ITEMS[0]
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark')

  // 应用主题到 document
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('theme', theme)
  }, [theme])

  // 页面刷新保留当前 tab
  useEffect(() => {
    localStorage.setItem('currentTab', location.pathname)
  }, [location.pathname])

  const toggleTheme = () => {
    setTheme(t => t === 'dark' ? 'light' : 'dark')
  }

  return (
    <div style={{ minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* 顶部导航 */}
      <header style={{
        background: 'var(--canvas)',
        borderBottom: '1px solid var(--border)',
        padding: 'var(--s-md) var(--s-xxl)',
        position: 'sticky',
        top: 0,
        zIndex: 100
      }}>
        <div style={{ maxWidth: '1280px', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--s-xl)' }}>
          {/* Logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-lg)' }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--s-sm)',
            }}>
              <img src="/favicon.svg" alt="logo" style={{ width: 32, height: 32, borderRadius: 'var(--r-xs)' }} />
              <div style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 700,
                fontSize: '18px',
                letterSpacing: '0.02em',
                color: 'var(--ink)'
              }}>
                个人交易统计
              </div>
            </div>
            <Breadcrumb currentLabel={current.label} />
          </div>

          {/* 右侧：主题切换 + 导航 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-md)' }}>
            <button
              onClick={toggleTheme}
              className="btn btn-ghost"
              style={{ width: 40, height: 40, padding: 0, fontSize: 18 }}
              title={theme === 'dark' ? '切换到浅色模式' : '切换到深色模式'}
            >
              {theme === 'dark' ? '☀' : '☾'}
            </button>
            <nav style={{ display: 'flex', gap: 'var(--s-xs)' }}>
              {NAV_ITEMS.map(item => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  className={({ isActive }) =>
                    'nav-link' + (isActive ? ' nav-link-active' : '')
                  }
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
          </div>
        </div>
      </header>

      {/* 页面内容 */}
      <main style={{
        flex: 1,
        maxWidth: '1280px',
        width: '100%',
        margin: '0 auto',
        padding: 'var(--s-xxl) var(--s-xxl) var(--s-section)',
      }}>
        {children}
      </main>

      {/* 底部 */}
      <footer style={{
        background: 'var(--canvas)',
        borderTop: '1px solid var(--border)',
        padding: 'var(--s-xl) var(--s-xxl)',
        textAlign: 'center',
      }}>
        <span className="caption">PULSE Trading · 交易记录与计算</span>
      </footer>
    </div>
  )
}
