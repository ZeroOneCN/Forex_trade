import { useState, useEffect, useMemo } from 'react'
import { api } from '../api/client'
import { useTranslation } from '../i18n/I18nProvider'

export default function Calendar() {
  const { t, locale } = useTranslation()
  const MONTH_NAMES = t('calendar.monthNames')
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth() + 1) // 1-12
  const [data, setData] = useState([])
  const [curve, setCurve] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedCell, setSelectedCell] = useState(null)
  const [monthInput, setMonthInput] = useState('')
  const [showShare, setShowShare] = useState(false)

  const WEEKDAYS = t('calendar.weekdayShort')

  const loadData = async () => {
    setLoading(true)
    try {
      const [calData, curveData] = await Promise.all([
        api.getCalendar(year, month),
        api.getEquityCurve()
      ])
      setData(calData)
      setCurve(curveData)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData() }, [year, month])

  // 数据映射
  const dataMap = useMemo(() => {
    const m = new Map()
    for (const d of data) {
      m.set(d.date, d)
    }
    return m
  }, [data])

  // 构建月历网格
  const calendarCells = useMemo(() => {
    const firstDay = new Date(year, month - 1, 1)
    const lastDay = new Date(year, month, 0)
    const startWeekday = firstDay.getDay() // 0=周日
    const daysInMonth = lastDay.getDate()

    const cells = []
    for (let i = 0; i < startWeekday; i++) {
      cells.push(null)
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      const dayData = dataMap.get(dateStr)
      cells.push({ day: d, date: dateStr, data: dayData })
    }
    return cells
  }, [year, month, dataMap])

  // 月度汇总
  const monthSummary = useMemo(() => {
    let totalProfit = 0
    let totalTrades = 0
    let totalWins = 0
    let profitDays = 0
    let lossDays = 0
    let totalDeposits = 0
    let totalWithdrawals = 0
    for (const d of data) {
      const np = Number(d.net_profit)
      totalProfit += np
      totalTrades += Number(d.trades)
      totalWins += Number(d.wins)
      if (np >= 0) profitDays++
      else lossDays++
    }
    // 从净值曲线获取本月资金进出
    const monthPrefix = `${year}-${String(month).padStart(2, '0')}`
    for (const c of curve) {
      if (c.date && c.date.startsWith(monthPrefix)) {
        totalDeposits += Number(c.deposit || 0)
        totalWithdrawals += Number(c.withdrawal || 0)
      }
    }
    return {
      totalProfit,
      totalTrades,
      winRate: totalTrades > 0 ? (totalWins / totalTrades * 100).toFixed(1) : 0,
      tradingDays: profitDays + lossDays,
      profitDays,
      lossDays,
      totalDeposits,
      totalWithdrawals
    }
  }, [data, curve, year, month])

  // 本月 ROI 计算
  const roi = useMemo(() => {
    const monthPrefix = `${year}-${String(month).padStart(2, '0')}`
    const prevMonthDate = new Date(year, month - 1, 0) // 上月最后一天
    const prevDateStr = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, '0')}-${String(prevMonthDate.getDate()).padStart(2, '0')}`

    // 上月底净值
    let equityAtStart = 0
    for (const c of curve) {
      if (c.date <= prevDateStr) {
        equityAtStart = Number(c.equity)
      }
    }

    // 本月入金
    const monthDeposits = monthSummary.totalDeposits

    // ROI 基准：
    // 1. 如果本月有入金 → 基准 = 本月入金（重新计算）
    // 2. 如果上月盈利（无入金）→ 基准 = 上月底净值（剩余资金）
    let basis = 0
    if (monthDeposits > 0) {
      basis = monthDeposits
    } else if (equityAtStart > 0) {
      basis = equityAtStart
    }

    const monthProfit = monthSummary.totalProfit
    const roiValue = basis > 0 ? (monthProfit / basis * 100) : 0

    return { basis, roiValue, equityAtStart, monthDeposits }
  }, [curve, year, month, monthSummary])

  const fmt = (n) => Number(n).toLocaleString(locale === 'zh-CN' ? 'zh-CN' : 'en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

  const prevMonth = () => {
    if (month === 1) { setYear(y => y - 1); setMonth(12) }
    else setMonth(m => m - 1)
  }
  const nextMonth = () => {
    if (month === 12) { setYear(y => y + 1); setMonth(1) }
    else setMonth(m => m + 1)
  }

  const handleMonthJump = (e) => {
    e.preventDefault()
    // 支持 "2026-03" 或 "2026/3" 格式
    const m = monthInput.match(/^(\d{4})[-/](\d{1,2})$/)
    if (m) {
      const y = Number(m[1])
      const mo = Number(m[2])
      if (mo >= 1 && mo <= 12 && y >= 2000 && y <= 2100) {
        setYear(y)
        setMonth(mo)
        setMonthInput('')
      }
    }
  }

  return (
    <div className="fade-in">
      {/* 顶部 */}
      <div className="flex justify-between items-center mb-lg">
        <div className="display-md">{t('calendar.title')}</div>
        {/* 月份导航 + 跳转 */}
        <div className="flex gap-sm items-center">
          <button className="btn btn-ghost" onClick={prevMonth} style={{ width: 40, padding: 0 }}>‹</button>
          <span className="heading-lg" style={{ minWidth: 140, textAlign: 'center' }}>{t('calendar.yearMonth', { year, month: MONTH_NAMES[month - 1] })}</span>
          <button className="btn btn-ghost" onClick={nextMonth} style={{ width: 40, padding: 0 }}>›</button>
          {/* 自定义月份跳转 */}
          <form onSubmit={handleMonthJump} className="flex items-center" style={{ marginLeft: 'var(--s-sm)', gap: 'var(--s-sm)' }}>
            <input
              type="text"
              className="input"
              style={{ width: 110, textAlign: 'center' }}
              placeholder="2026-03"
              value={monthInput}
              onChange={e => setMonthInput(e.target.value)}
            />
            <button type="submit" className="btn btn-ghost">{t('calendar.jump')}</button>
          </form>
          <button className="btn btn-primary" onClick={() => setShowShare(true)} style={{ marginLeft: 'var(--s-sm)' }}>
            {t('calendar.share')}
          </button>
        </div>
      </div>

      {/* 月度汇总（含 ROI） */}
      <div className="grid mb-lg" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
        <div className="stat-card surface">
          <div className="stat-label">{t('calendar.monthRoi')}</div>
          <div className="stat-value" style={{ color: roi.roiValue >= 0 ? 'var(--green)' : 'var(--loss)' }}>
            {roi.roiValue >= 0 ? '+' : ''}{t('calendar.winRate', { rate: roi.roiValue.toFixed(2) })}
          </div>
          <div className="caption mt-sm">
            {t('calendar.roiBase')} {fmt(roi.basis)}
            {roi.monthDeposits > 0 ? ` · ${t('calendar.monthDeposit')}` : ` · ${t('calendar.lastCarry')}`}
          </div>
        </div>
        <div className="stat-card surface">
          <div className="stat-label">{t('calendar.monthPnl')}</div>
          <div className="stat-value" style={{ color: monthSummary.totalProfit >= 0 ? 'var(--green)' : 'var(--loss)' }}>
            {monthSummary.totalProfit >= 0 ? '+' : ''}{fmt(monthSummary.totalProfit)}
          </div>
        </div>
        <div className="stat-card surface">
          <div className="stat-label">{t('calendar.profitDays')}</div>
          <div className="stat-value text-profit">{monthSummary.profitDays}</div>
        </div>
        <div className="stat-card surface">
          <div className="stat-label">{t('calendar.lossDays')}</div>
          <div className="stat-value text-loss">{monthSummary.lossDays}</div>
        </div>
        <div className="stat-card surface">
          <div className="stat-label">{t('calendar.winRateLabel')}</div>
          <div className="stat-value">{t('calendar.winRate', { rate: monthSummary.winRate })}</div>
        </div>
      </div>

      {/* 日历网格 + 详情 */}
      <div className="grid" style={{ gridTemplateColumns: '1fr 260px', gap: 'var(--s-md)' }}>
        {/* 日历 */}
        <div className="card" style={{ padding: 'var(--s-md)' }}>
          {/* 星期头 */}
          <div className="calendar-grid mb-sm">
            {WEEKDAYS.map(w => (
              <div key={w} className="text-center caption" style={{ padding: '2px 0', fontSize: 12 }}>{w}</div>
            ))}
          </div>
          {/* 日期格 */}
          <div className="calendar-grid">
            {calendarCells.map((cell, i) => {
              if (!cell) return <div key={i} className="calendar-cell empty" />
              const hasData = !!cell.data
              const isProfit = hasData && cell.data.net_profit >= 0
              const isLoss = hasData && cell.data.net_profit < 0
              const isToday = cell.date === todayStr
              const isSelected = selectedCell && selectedCell.date === cell.date
              return (
                <div
                  key={i}
                  className={`calendar-cell ${hasData ? 'has-data' : 'empty'} ${isProfit ? 'profit-bg' : ''} ${isLoss ? 'loss-bg' : ''} ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''}`}
                  onClick={() => hasData && setSelectedCell(cell)}
                >
                  <div className="cal-day" style={{ opacity: hasData ? 1 : 0.4, fontWeight: 600 }}>{cell.day}</div>
                  {hasData && (
                    <div>
                      <div className="cal-profit" style={{ color: '#fff', fontWeight: 600 }}>
                        {isProfit ? '+' : ''}{fmt(cell.data.net_profit)}
                      </div>
                      <div className="cal-sub" style={{ color: 'rgba(255,255,255,0.85)' }}>
                        {t('calendar.tradesCount', { n: cell.data.trades })} · {t('calendar.winRate', { rate: cell.data.win_rate })}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* 右侧：当日详情 / 月度资金 */}
        <div className="card">
          {selectedCell && selectedCell.data ? (
            <>
              <div className="heading-sm mb-md">{t('calendar.dailyTitle')} · {selectedCell.date}</div>
              <div className="flex-col gap-md">
                <div className="flex justify-between">
                  <span className="text-muted">{t('calendar.netProfit')}</span>
                  <span className={`heading-sm ${selectedCell.data.net_profit >= 0 ? 'text-profit' : 'text-loss'}`}>
                    {selectedCell.data.net_profit >= 0 ? '+' : ''}{fmt(selectedCell.data.net_profit)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">{t('calendar.trades')}</span>
                  <span className="heading-sm">{selectedCell.data.trades}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">{t('calendar.winRateLabel')}</span>
                  <span className="heading-sm">{t('calendar.winRate', { rate: selectedCell.data.win_rate })}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">{t('calendar.win')}/{t('calendar.loss')}</span>
                  <span className="heading-sm">
                    <span className="text-profit">{selectedCell.data.wins}</span>
                    {' / '}
                    <span className="text-loss">{selectedCell.data.losses}</span>
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">{t('calendar.avgProfit')}</span>
                  <span className="heading-sm">{fmt(selectedCell.data.total_volume)}</span>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="heading-sm mb-md">{t('calendar.monthlyTitle')}</div>
              <div className="flex-col gap-md">
                <div className="flex justify-between">
                  <span className="text-muted">{t('calendar.totalDeposit')}</span>
                  <span className="heading-sm text-profit">{fmt(monthSummary.totalDeposits)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">{t('calendar.totalWithdrawal')}</span>
                  <span className="heading-sm text-loss">{fmt(monthSummary.totalWithdrawals)}</span>
                </div>
                <div style={{ height: 1, background: 'var(--border)' }} />
                <div className="flex justify-between">
                  <span className="text-muted">{t('calendar.netDeposit')}</span>
                  <span className="heading-sm">{fmt(roi.equityAtStart)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">{t('calendar.dailyRoi')}</span>
                  <span className="heading-sm">{fmt(roi.basis)}</span>
                </div>
                <div style={{ height: 1, background: 'var(--border)' }} />
                <div className="caption" style={{ lineHeight: 1.6 }}>
                  {roi.monthDeposits > 0
                    ? t('calendar.noDataDay')
                    : roi.equityAtStart > 0
                      ? t('calendar.carryDesc')
                      : t('calendar.noDataDay')}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* 图例 */}
      <div className="flex gap-lg mt-md text-muted" style={{ fontSize: 13 }}>
        <div className="flex items-center gap-sm">
          <div style={{ width: 12, height: 12, borderRadius: 3, borderLeft: '3px solid var(--green)', background: 'var(--surface-onyx)' }} />
          <span>{t('calendar.legendProfit')}</span>
        </div>
        <div className="flex items-center gap-sm">
          <div style={{ width: 12, height: 12, borderRadius: 3, borderLeft: '3px solid var(--loss)', background: 'var(--surface-onyx)' }} />
          <span>{t('calendar.legendLoss')}</span>
        </div>
        <div className="flex items-center gap-sm">
          <div style={{ width: 12, height: 12, borderRadius: 3, outline: '2px solid var(--primary)' }} />
          <span>{t('calendar.legendToday')}</span>
        </div>
      </div>

      {/* 分享弹窗 */}
      {showShare && (() => {
        const isProfit = monthSummary.totalProfit >= 0
        const profit = monthSummary.totalProfit
        const roiPct = roi.roiValue
        const profitDays = monthSummary.profitDays
        const lossDays = monthSummary.lossDays
        const winRate = monthSummary.winRate

        return (
          <div className="modal-overlay">
            <div
              style={{
                width: 360,
                borderRadius: '20px 20px 12px 12px',
                overflow: 'hidden',
                background: 'var(--surface-indigo)',
                boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
              }}
            >
              {/* 顶部渐变区 */}
              <div style={{
                padding: '32px 24px 20px',
                background: isProfit
                  ? 'linear-gradient(135deg, #1a3a2a 0%, #0d1f16 100%)'
                  : 'linear-gradient(135deg, #3a1a1a 0%, #1f0d0d 100%)',
                textAlign: 'center',
              }}>
                {/* SVG 表情 */}
                {isProfit ? (
                  <svg width="80" height="80" viewBox="0 0 80 80" style={{ marginBottom: 8 }}>
                    <circle cx="40" cy="40" r="36" fill="#FFD700" stroke="#FFA500" strokeWidth="2"/>
                    {/* 笑眯眯眼睛 */}
                    <path d="M22 32 Q28 26 34 32" fill="none" stroke="#333" strokeWidth="3" strokeLinecap="round"/>
                    <path d="M46 32 Q52 26 58 32" fill="none" stroke="#333" strokeWidth="3" strokeLinecap="round"/>
                    {/* 腮红 */}
                    <circle cx="24" cy="44" r="5" fill="#FF6B6B" opacity="0.5"/>
                    <circle cx="56" cy="44" r="5" fill="#FF6B6B" opacity="0.5"/>
                    {/* 大笑嘴巴 */}
                    <path d="M22 44 Q40 66 58 44 Q40 56 22 44 Z" fill="#333"/>
                    <path d="M26 48 Q40 58 54 48" fill="#FF6B6B" opacity="0.4"/>
                  </svg>
                ) : (
                  <svg width="80" height="80" viewBox="0 0 80 80" style={{ marginBottom: 8 }}>
                    <circle cx="40" cy="40" r="36" fill="#4A90D9" stroke="#2563EB" strokeWidth="2"/>
                    {/* 哭泣眼睛 */}
                    <ellipse cx="28" cy="32" rx="4" ry="5" fill="#333"/>
                    <ellipse cx="52" cy="32" rx="4" ry="5" fill="#333"/>
                    {/* 眼泪 */}
                    <path d="M28 38 Q26 48 28 52 Q30 48 28 38 Z" fill="#5BC0EB" opacity="0.8"/>
                    <path d="M52 38 Q50 48 52 54 Q54 48 52 38 Z" fill="#5BC0EB" opacity="0.8"/>
                    {/* 难过嘴巴 */}
                    <path d="M22 56 Q40 44 58 56" fill="none" stroke="#333" strokeWidth="3" strokeLinecap="round"/>
                  </svg>
                )}
                <div style={{ color: 'var(--on-colored)', fontSize: 18, fontWeight: 700, marginBottom: 4 }}>
                  {t('calendar.yearMonth', { year, month: MONTH_NAMES[month - 1] })}
                </div>
                <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13 }}>
                  {isProfit ? t('calendar.shareProfit') : t('calendar.shareLoss')}
                </div>
              </div>

              {/* 数据区 */}
              <div style={{ padding: '20px 24px' }}>
                {/* 盈亏金额 */}
                <div style={{ textAlign: 'center', marginBottom: 16 }}>
                  <div style={{ color: 'var(--muted)', fontSize: 12, marginBottom: 4 }}>{t('calendar.monthPnl')}</div>
                  <div style={{
                    fontSize: 32,
                    fontWeight: 800,
                    color: isProfit ? 'var(--green)' : 'var(--loss)',
                  }}>
                    {isProfit ? '+' : ''}{fmt(profit)}
                  </div>
                </div>

                {/* ROI 百分比 */}
                <div style={{
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  gap: 8,
                  marginBottom: 16,
                  padding: '8px 16px',
                  borderRadius: 10,
                  background: isProfit ? 'rgba(39,174,96,0.12)' : 'rgba(231,76,60,0.12)',
                }}>
                  <span style={{ color: 'var(--muted)', fontSize: 13 }}>ROI</span>
                  <span style={{
                    fontSize: 20,
                    fontWeight: 700,
                    color: isProfit ? 'var(--green)' : 'var(--loss)',
                  }}>
                    {isProfit ? '+' : ''}{roiPct.toFixed(2)}%
                  </span>
                </div>

                {/* 统计网格 */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr 1fr',
                  gap: 8,
                  marginBottom: 16,
                }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ color: 'var(--muted)', fontSize: 11 }}>{t('calendar.shareProfitDay')}</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--green)' }}>{profitDays}</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ color: 'var(--muted)', fontSize: 11 }}>{t('calendar.shareLossDay')}</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--loss)' }}>{lossDays}</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ color: 'var(--muted)', fontSize: 11 }}>{t('calendar.shareWinRate')}</div>
                    <div style={{ fontSize: 16, fontWeight: 700 }}>{winRate}%</div>
                  </div>
                </div>

                {/* 底部 */}
                <div style={{
                  textAlign: 'center',
                  color: 'var(--muted)',
                  fontSize: 11,
                  borderTop: '1px solid var(--border)',
                  paddingTop: 12,
                }}>
                  {t('calendar.shareFooter')}
                </div>
              </div>

              {/* 关闭按钮 */}
              <div style={{ padding: '0 24px 16px', textAlign: 'center' }}>
                <button className="btn btn-primary w-full" onClick={() => setShowShare(false)}>
                  {t('common.close')}
                </button>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
