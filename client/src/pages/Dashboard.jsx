import { useState, useEffect } from 'react'
import { api } from '../api/client'
import EquityCurve from '../components/EquityCurve'

export default function Dashboard() {
  const [overview, setOverview] = useState(null)
  const [curve, setCurve] = useState([])
  const [loading, setLoading] = useState(true)

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
    return <div className="card text-center text-muted">暂无数据，请先导入交易记录</div>
  }

  const fmt = (n) => Number(n).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const fmtPct = (n) => Number(n).toFixed(2) + '%'

  return (
    <div className="fade-in">
      {/* 统计卡片 */}
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        <div className="stat-card">
          <div className="stat-label">账户净值</div>
          <div className="stat-value">{fmt(overview.equity)}</div>
        </div>
        {/* 净收益模块：同步显示入金和出金 */}
        <div className="stat-card surface">
          <div className="stat-label">净收益</div>
          <div className="stat-value" style={{ color: overview.net_profit >= 0 ? 'var(--green)' : 'var(--loss)' }}>
            {overview.net_profit >= 0 ? '+' : ''}{fmt(overview.net_profit)}
          </div>
          <div style={{ display: 'flex', gap: 'var(--s-md)', marginTop: 'var(--s-xs)', fontSize: 12 }}>
            <span className="text-muted">
              入金 <span className="text-profit">{fmt(overview.total_deposit + overview.total_bonus - overview.total_bonus_loss)}</span>
            </span>
            <span className="text-muted">
              出金 <span className="text-loss">{fmt(overview.total_withdrawal)}</span>
            </span>
          </div>
        </div>
        <div className="stat-card surface">
          <div className="stat-label">总交易数</div>
          <div className="stat-value">{overview.total_trades}</div>
        </div>
        <div className="stat-card surface">
          <div className="stat-label">胜率</div>
          <div className="stat-value">{fmtPct(overview.win_rate)}</div>
          <div className="body-sm" style={{ opacity: 0.7, marginTop: 'var(--s-xs)' }}>
            盈 {overview.win_count} / 亏 {overview.loss_count}
          </div>
        </div>
      </div>

      {/* 收益曲线 */}
      <div className="card mt-lg">
        <div className="flex justify-between items-center mb-md">
          <div className="heading-lg">收益曲线</div>
          <div className="body-sm text-muted">按日累计 · 0 基线居中</div>
        </div>
        <EquityCurve data={curve} />
      </div>

      {/* 品种分布 + 资金概览 */}
      <div className="grid mt-lg" style={{ gridTemplateColumns: '1fr 1fr' }}>
        {/* 品种分布 */}
        <div className="card">
          <div className="heading-lg mb-md">品种分布</div>
          {overview.symbol_distribution.map(s => {
            const maxCount = Math.max(...overview.symbol_distribution.map(x => x.count))
            const widthPct = (s.count / maxCount) * 100
            return (
              <div key={s.symbol} className="mb-md">
                <div className="flex justify-between mb-sm">
                  <span className="heading-sm">{s.symbol}</span>
                  <span className="body-sm text-muted">{s.count} 笔</span>
                </div>
                <div style={{
                  height: 8,
                  background: 'var(--surface-onyx)',
                  borderRadius: 'var(--r-full)',
                  overflow: 'hidden'
                }}>
                  <div style={{
                    height: '100%',
                    width: `${widthPct}%`,
                    background: s.net_profit >= 0 ? 'var(--green)' : 'var(--loss)',
                    borderRadius: 'var(--r-full)',
                    transition: 'width 0.3s'
                  }} />
                </div>
                <div className={`body-sm mt-sm ${s.net_profit >= 0 ? 'text-profit' : 'text-loss'}`}>
                  净盈亏 {s.net_profit >= 0 ? '+' : ''}{fmt(s.net_profit)}
                </div>
              </div>
            )
          })}
        </div>

        {/* 资金概览 */}
        <div className="card">
          <div className="heading-lg mb-md">资金概览</div>
          <div className="flex-col gap-md">
            <div className="flex justify-between">
              <span className="text-muted">总入金</span>
              <span className="heading-sm text-profit">{fmt(overview.total_deposit)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">总出金</span>
              <span className="heading-sm text-loss">{fmt(overview.total_withdrawal)}</span>
            </div>
            {overview.total_bonus > 0 && (
              <div className="flex justify-between">
                <span className="text-muted">体验金入金</span>
                <span className="heading-sm text-profit">{fmt(overview.total_bonus)}</span>
              </div>
            )}
            {overview.total_bonus > 0 && (
              <div className="flex justify-between">
                <span className="text-muted">剩余体验金</span>
                <span className="heading-sm">{fmt(overview.remaining_bonus || 0)}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted">净入金</span>
              <span className="heading-sm">{fmt(overview.net_capital)}</span>
            </div>
            <div style={{ height: 1, background: 'var(--border)', margin: 'var(--s-sm) 0' }} />
            <div className="flex justify-between">
              <span className="text-muted">总手续费</span>
              <span className="body-sm text-loss">{fmt(overview.total_commission)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">总隔夜费</span>
              <span className="body-sm text-loss">{fmt(overview.total_swap)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">总毛利</span>
              <span className="body-sm text-profit">{fmt(overview.total_profit)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
