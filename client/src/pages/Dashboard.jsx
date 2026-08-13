import { useState, useEffect } from 'react'
import { api } from '../api/client'
import EquityCurve from '../components/EquityCurve'
import { useTranslation } from '../i18n/I18nProvider'

export default function Dashboard() {
  const [overview, setOverview] = useState(null)
  const [curve, setCurve] = useState([])
  const [loading, setLoading] = useState(true)
  const { t, locale } = useTranslation()

  const loadData = async () => {
    try {
      const [ov, cv] = await Promise.all([api.getOverview(), api.getEquityCurve()])
      setOverview(ov)
      setCurve(cv)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData() }, [])

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--s-section)' }}><div className="spinner" /></div>
  }

  if (!overview) {
    return <div className="card text-center text-muted">{t('common.noData')}</div>
  }

  const fmt = (n) => Number(n).toLocaleString(locale === 'zh-CN' ? 'zh-CN' : 'en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const fmtPct = (n) => Number(n).toFixed(2) + '%'

  return (
    <div className="fade-in">
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        <div className="stat-card enter-stagger" style={{ '--i': 0 }}>
          <div className="stat-label">{t('dashboard.equity')}</div>
          <div className="stat-value">{fmt(overview.equity)}</div>
        </div>
        <div className="stat-card surface enter-stagger" style={{ '--i': 1 }}>
          <div className="stat-label">{t('dashboard.netProfit')}</div>
          <div className="stat-value" style={{ color: overview.net_profit >= 0 ? 'var(--green)' : 'var(--loss)' }}>
            {overview.net_profit >= 0 ? '+' : ''}{fmt(overview.net_profit)}
          </div>
          <div className="stat-sub" style={{ display: 'flex', gap: 'var(--s-md)' }}>
            <span className="text-muted">
              {t('dashboard.deposit')} <span className="text-profit">{fmt(overview.total_deposit + overview.total_bonus - overview.total_bonus_loss)}</span>
            </span>
            <span className="text-muted">
              {t('dashboard.withdrawal')} <span className="text-loss">{fmt(overview.total_withdrawal)}</span>
            </span>
          </div>
        </div>
        <div className="stat-card surface enter-stagger" style={{ '--i': 2 }}>
          <div className="stat-label">{t('dashboard.totalTrades')}</div>
          <div className="stat-value">{overview.total_trades}</div>
        </div>
        <div className="stat-card surface enter-stagger" style={{ '--i': 3 }}>
          <div className="stat-label">{t('dashboard.winRate')}</div>
          <div className="stat-value">{fmtPct(overview.win_rate)}</div>
          <div className="stat-sub">
            {t('dashboard.winLose', { win: overview.win_count, loss: overview.loss_count })}
          </div>
        </div>
      </div>

      <div className="card mt-lg enter-stagger" style={{ '--i': 4 }}>
        <div className="flex justify-between items-center mb-md">
          <div className="heading-lg">{t('dashboard.equityCurve')}</div>
          <div className="body-sm text-muted">{t('dashboard.curveSub')}</div>
        </div>
        <EquityCurve data={curve} />
      </div>

      <div className="grid mt-lg" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <div className="card enter-stagger" style={{ '--i': 5 }}>
          <div className="heading-lg mb-md">{t('dashboard.symbolDist')}</div>
          {overview.symbol_distribution.map(s => {
            const maxCount = Math.max(...overview.symbol_distribution.map(x => x.count))
            const widthPct = (s.count / maxCount) * 100
            return (
              <div key={s.symbol} className="mb-md">
                <div className="flex justify-between mb-sm">
                  <span className="heading-sm">{s.symbol}</span>
                  <span className="body-sm text-muted">{t('dashboard.tradesCount', { n: s.count })}</span>
                </div>
                <div style={{
                  height: 8,
                  background: 'var(--surface-onyx)',
                  borderRadius: 'var(--r-full)',
                  overflow: 'hidden'
                }}>
                  <div className="stat-bar-fill" style={{
                    height: '100%',
                    width: `${widthPct}%`,
                    background: s.net_profit >= 0 ? 'var(--green)' : 'var(--loss)',
                    borderRadius: 'var(--r-full)',
                  }} />
                </div>
                <div className={`body-sm mt-sm ${s.net_profit >= 0 ? 'text-profit' : 'text-loss'}`}>
                  {t('dashboard.netPnl')} {s.net_profit >= 0 ? '+' : ''}{fmt(s.net_profit)}
                </div>
              </div>
            )
          })}
        </div>

        <div className="card enter-stagger" style={{ '--i': 6 }}>
          <div className="heading-lg mb-md">{t('dashboard.capitalOverview')}</div>
          <div className="flex-col gap-md">
            <div className="flex justify-between">
              <span className="text-muted">{t('dashboard.totalDeposit')}</span>
              <span className="heading-sm text-profit">{fmt(overview.total_deposit)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">{t('dashboard.totalWithdrawal')}</span>
              <span className="heading-sm text-loss">{fmt(overview.total_withdrawal)}</span>
            </div>
            {overview.total_bonus > 0 && (
              <div className="flex justify-between">
                <span className="text-muted">{t('dashboard.bonusIn')}</span>
                <span className="heading-sm text-profit">{fmt(overview.total_bonus)}</span>
              </div>
            )}
            {overview.total_bonus > 0 && (
              <div className="flex justify-between">
                <span className="text-muted">{t('dashboard.remainingBonus')}</span>
                <span className="heading-sm">{fmt(overview.remaining_bonus || 0)}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted">{t('dashboard.netCapital')}</span>
              <span className="heading-sm">{fmt(overview.net_capital)}</span>
            </div>
            <div style={{ height: 1, background: 'var(--border)', margin: 'var(--s-sm) 0' }} />
            <div className="flex justify-between">
              <span className="text-muted">{t('dashboard.totalCommission')}</span>
              <span className="body-sm text-loss">{fmt(overview.total_commission)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">{t('dashboard.totalSwap')}</span>
              <span className="body-sm text-loss">{fmt(overview.total_swap)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">{t('dashboard.grossProfit')}</span>
              <span className="body-sm text-profit">{fmt(overview.total_profit)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
