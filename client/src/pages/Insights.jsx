import { useState, useEffect } from 'react'
import { useTranslation } from '../i18n/I18nProvider'

const BASE = '/api'

async function fetchJSON(path) {
  const res = await fetch(`${BASE}${path}`)
  if (!res.ok) throw new Error('Request failed')
  return res.json()
}

export default function Insights() {
  const [insights, setInsights] = useState(null)
  const [thresholds, setThresholds] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const { t, locale } = useTranslation()

  const fmt = (n) => Number(n).toLocaleString(locale === 'zh-CN' ? 'zh-CN' : 'en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const fmtPct = (n) => Number(n) + '%'
  const fmtInt = (n) => Number(n).toLocaleString()

  useEffect(() => {
    Promise.all([
      fetchJSON('/analysis/insights'),
      fetchJSON('/analysis/thresholds')
    ]).then(([ins, thr]) => {
      setInsights(ins)
      setThresholds(thr)
    }).catch(err => {
      setError(err.message)
    }).finally(() => setLoading(false))
  }, [])

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--s-section)' }}><div className="spinner" /></div>
  }

  if (error || !insights) {
    return <div className="card text-center text-muted">{t('common.noData')}</div>
  }

  const d = insights

  // 风险等级评估
  const riskLevel = d.profit_factor < 1 ? 'high' : d.profit_factor < 1.5 ? 'medium' : 'low'
  const riskColor = riskLevel === 'high' ? 'var(--loss)' : riskLevel === 'medium' ? 'var(--warn)' : 'var(--green)'
  const riskLabel = riskLevel === 'high' ? t('insights.riskHigh') : riskLevel === 'medium' ? t('insights.riskMedium') : t('insights.riskLow')

  // 判断主要问题
  const issues = []
  if (d.profit_factor < 1) issues.push('profitFactor')
  if (d.avg_loss > d.avg_win * 3) issues.push('lossTooBig')
  if (d.big_loss_count > 5) issues.push('bigLosses')
  if (d.current_loss_streak > 5) issues.push('lossStreak')

  return (
    <div className="fade-in">

      {/* 核心指标 */}
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
        <div className="stat-card">
          <div className="stat-label">{t('insights.totalTrades')}</div>
          <div className="stat-value">{fmtInt(d.total_trades)}</div>
        </div>
        <div className="stat-card surface">
          <div className="stat-label">{t('insights.winRate')}</div>
          <div className="stat-value" style={{ color: d.win_rate >= 60 ? 'var(--green)' : 'var(--loss)' }}>{fmtPct(d.win_rate)}</div>
          <div className="stat-sub">{t('insights.winLose', { w: d.win_count, l: d.loss_count })}</div>
        </div>
        <div className="stat-card surface">
          <div className="stat-label">{t('insights.netProfit')}</div>
          <div className="stat-value" style={{ color: d.net_profit >= 0 ? 'var(--green)' : 'var(--loss)' }}>
            {d.net_profit >= 0 ? '+' : ''}{fmt(d.net_profit)}
          </div>
        </div>
        <div className="stat-card surface">
          <div className="stat-label">{t('insights.profitFactor')}</div>
          <div className="stat-value" style={{ color: riskColor }}>{d.profit_factor}</div>
          <div className="stat-sub">{riskLabel}</div>
        </div>
        <div className="stat-card surface">
          <div className="stat-label">{t('insights.maxDrawdown')}</div>
          <div className="stat-value" style={{ color: 'var(--loss)' }}>{fmt(d.max_drawdown)}</div>
        </div>
        <div className="stat-card surface">
          <div className="stat-label">{t('insights.expectancy')}</div>
          <div className="stat-value" style={{ color: d.expectancy >= 0 ? 'var(--green)' : 'var(--loss)' }}>{fmt(d.expectancy)}</div>
        </div>
      </div>

      {/* 盈亏比分析 */}
      <div className="card mt-lg">
        <div className="heading-lg mb-md">{t('insights.pnlAnalysis')}</div>
        <div className="flex gap-lg" style={{ flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 200px' }}>
            <div className="stat-card surface" style={{ textAlign: 'center' }}>
              <div className="stat-label">{t('insights.avgWin')}</div>
              <div className="heading-lg" style={{ color: 'var(--green)' }}>+{fmt(d.avg_win)}</div>
            </div>
          </div>
          <div style={{ flex: '1 1 200px' }}>
            <div className="stat-card surface" style={{ textAlign: 'center' }}>
              <div className="stat-label">{t('insights.avgLoss')}</div>
              <div className="heading-lg" style={{ color: 'var(--loss)' }}>-{fmt(d.avg_loss)}</div>
            </div>
          </div>
          <div style={{ flex: '1 1 200px' }}>
            <div className="stat-card surface" style={{ textAlign: 'center' }}>
              <div className="stat-label">{t('insights.ratio')}</div>
              <div className="heading-lg" style={{ color: d.profit_factor >= 1.5 ? 'var(--green)' : 'var(--loss)' }}>1 : {d.profit_factor > 0 ? (d.avg_loss / (d.avg_win || 1)).toFixed(1) : 'N/A'}</div>
            </div>
          </div>
        </div>
        {d.avg_loss > d.avg_win * 2 && (
          <div className="body-sm mt-md" style={{ color: 'var(--loss)', padding: 'var(--s-sm) var(--s-md)', background: 'var(--surface-black)', borderRadius: 'var(--r-sm)' }}>
            ⚠ {t('insights.lossWarning', { ratio: (d.avg_loss / (d.avg_win || 1)).toFixed(1) })}
          </div>
        )}
      </div>

      {/* 连续盈亏 */}
      <div className="card mt-lg">
        <div className="heading-lg mb-md">{t('insights.streakAnalysis')}</div>
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
          <div className="stat-card surface">
            <div className="stat-label">{t('insights.maxWinStreak')}</div>
            <div className="stat-value" style={{ color: 'var(--green)' }}>{d.max_win_streak}</div>
          </div>
          <div className="stat-card surface">
            <div className="stat-label">{t('insights.maxLossStreak')}</div>
            <div className="stat-value" style={{ color: 'var(--loss)' }}>{d.max_loss_streak}</div>
          </div>
          <div className="stat-card surface">
            <div className="stat-label">{t('insights.currentStreak')}</div>
            <div className="stat-value" style={{ color: d.current_loss_streak > 0 ? 'var(--loss)' : 'var(--green)' }}>
              {d.current_loss_streak > 0 ? `-${d.current_loss_streak}` : `+${d.current_win_streak}`}
            </div>
          </div>
        </div>
        {d.current_loss_streak >= 3 && (
          <div className="body-sm mt-md" style={{ color: 'var(--warn)', padding: 'var(--s-sm) var(--s-md)', background: 'var(--surface-black)', borderRadius: 'var(--r-sm)' }}>
            ⚠ {t('insights.lossStreakWarning', { n: d.current_loss_streak })}
          </div>
        )}
      </div>

      {/* 月度趋势 */}
      <div className="card mt-lg">
        <div className="heading-lg mb-md">{t('insights.monthlyTrend')}</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <th style={{ textAlign: 'left', padding: 'var(--s-xs) var(--s-sm)' }}>{t('insights.month')}</th>
                <th style={{ textAlign: 'right', padding: 'var(--s-xs) var(--s-sm)' }}>{t('insights.trades')}</th>
                <th style={{ textAlign: 'right', padding: 'var(--s-xs) var(--s-sm)' }}>{t('insights.netProfit')}</th>
                <th style={{ textAlign: 'right', padding: 'var(--s-xs) var(--s-sm)' }}>{t('insights.winRate')}</th>
                <th style={{ textAlign: 'right', padding: 'var(--s-xs) var(--s-sm)' }}>{t('insights.winLoseShort')}</th>
              </tr>
            </thead>
            <tbody>
              {d.monthly.map(m => (
                <tr key={m.ym} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: 'var(--s-xs) var(--s-sm)', fontWeight: 600 }}>{m.ym}</td>
                  <td style={{ textAlign: 'right', padding: 'var(--s-xs) var(--s-sm)' }}>{m.trades}</td>
                  <td style={{ textAlign: 'right', padding: 'var(--s-xs) var(--s-sm)', color: m.net_profit >= 0 ? 'var(--green)' : 'var(--loss)' }}>
                    {m.net_profit >= 0 ? '+' : ''}{fmt(m.net_profit)}
                  </td>
                  <td style={{ textAlign: 'right', padding: 'var(--s-xs) var(--s-sm)' }}>{m.win_rate}%</td>
                  <td style={{ textAlign: 'right', padding: 'var(--s-xs) var(--s-sm)' }}>
                    <span className="text-profit">{m.wins}</span> / <span className="text-loss">{m.losses}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 品种分析 */}
      <div className="card mt-lg">
        <div className="heading-lg mb-md">{t('insights.symbolAnalysis')}</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <th style={{ textAlign: 'left', padding: 'var(--s-xs) var(--s-sm)' }}>{t('insights.symbol')}</th>
                <th style={{ textAlign: 'right', padding: 'var(--s-xs) var(--s-sm)' }}>{t('insights.trades')}</th>
                <th style={{ textAlign: 'right', padding: 'var(--s-xs) var(--s-sm)' }}>{t('insights.netProfit')}</th>
                <th style={{ textAlign: 'right', padding: 'var(--s-xs) var(--s-sm)' }}>{t('insights.winRate')}</th>
                <th style={{ textAlign: 'right', padding: 'var(--s-xs) var(--s-sm)' }}>{t('insights.winLoseShort')}</th>
              </tr>
            </thead>
            <tbody>
              {d.symbols.map(sym => (
                <tr key={sym.symbol} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: 'var(--s-xs) var(--s-sm)', fontWeight: 600 }}>{sym.symbol}</td>
                  <td style={{ textAlign: 'right', padding: 'var(--s-xs) var(--s-sm)' }}>{sym.trades}</td>
                  <td style={{ textAlign: 'right', padding: 'var(--s-xs) var(--s-sm)', color: sym.net_profit >= 0 ? 'var(--green)' : 'var(--loss)' }}>
                    {sym.net_profit >= 0 ? '+' : ''}{fmt(sym.net_profit)}
                  </td>
                  <td style={{ textAlign: 'right', padding: 'var(--s-xs) var(--s-sm)' }}>{sym.win_rate}%</td>
                  <td style={{ textAlign: 'right', padding: 'var(--s-xs) var(--s-sm)' }}>
                    <span className="text-profit">{sym.wins}</span> / <span className="text-loss">{sym.losses}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 大额亏损 */}
      <div className="card mt-lg">
        <div className="heading-lg mb-md">{t('insights.bigLosses')}</div>
        <div className="stat-card surface" style={{ display: 'inline-block', marginBottom: 'var(--s-md)' }}>
          <div className="stat-label">{t('insights.bigLossStats', { n: d.big_loss_count })}</div>
          <div className="heading-lg" style={{ color: 'var(--loss)' }}>{fmt(d.big_loss_total)}</div>
        </div>
        {d.big_losses.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <th style={{ textAlign: 'left', padding: 'var(--s-xs) var(--s-sm)' }}>{t('insights.date')}</th>
                  <th style={{ textAlign: 'left', padding: 'var(--s-xs) var(--s-sm)' }}>{t('insights.symbol')}</th>
                  <th style={{ textAlign: 'right', padding: 'var(--s-xs) var(--s-sm)' }}>{t('insights.volume')}</th>
                  <th style={{ textAlign: 'right', padding: 'var(--s-xs) var(--s-sm)' }}>{t('insights.loss')}</th>
                </tr>
              </thead>
              <tbody>
                {d.big_losses.map((r, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: 'var(--s-xs) var(--s-sm)' }}>{r.date}</td>
                    <td style={{ padding: 'var(--s-xs) var(--s-sm)' }}>{r.symbol}</td>
                    <td style={{ textAlign: 'right', padding: 'var(--s-xs) var(--s-sm)' }}>{r.volume}</td>
                    <td style={{ textAlign: 'right', padding: 'var(--s-xs) var(--s-sm)', color: 'var(--loss)' }}>{fmt(r.net_pnl)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 阈值检测 */}
      {thresholds && thresholds.thresholds && thresholds.thresholds.length > 0 && (
        <div className="card mt-lg">
          <div className="heading-lg mb-md">{t('insights.thresholdAnalysis')}</div>
          <div className="body-sm mb-md" style={{ color: 'var(--muted)' }}>
            {t('insights.thresholdDesc')} {t('insights.thresholdNotable')}
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <th style={{ textAlign: 'left', padding: 'var(--s-xs) var(--s-sm)' }}>{t('insights.thresholdPeak')}</th>
                  <th style={{ textAlign: 'right', padding: 'var(--s-xs) var(--s-sm)' }}>{t('insights.beforeWinRate')}</th>
                  <th style={{ textAlign: 'right', padding: 'var(--s-xs) var(--s-sm)' }}>{t('insights.afterWinRate')}</th>
                  <th style={{ textAlign: 'right', padding: 'var(--s-xs) var(--s-sm)' }}>{t('insights.beforeAvgLoss')}</th>
                  <th style={{ textAlign: 'right', padding: 'var(--s-xs) var(--s-sm)' }}>{t('insights.afterAvgLoss')}</th>
                  <th style={{ textAlign: 'right', padding: 'var(--s-xs) var(--s-sm)' }}>{t('insights.beforeAvgVol')}</th>
                  <th style={{ textAlign: 'right', padding: 'var(--s-xs) var(--s-sm)' }}>{t('insights.afterAvgVol')}</th>
                  <th style={{ textAlign: 'right', padding: 'var(--s-xs) var(--s-sm)' }}>{t('insights.afterPnl')}</th>
                </tr>
              </thead>
              <tbody>
                {thresholds.thresholds.toReversed().slice(0, 10).map((th, i) => {
                  const wrDiff = (th.after.win_rate - th.before.win_rate).toFixed(1)
                  const volDiff = ((th.after.avg_volume - th.before.avg_volume) / th.before.avg_volume * 100).toFixed(0)
                  return (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: 'var(--s-xs) var(--s-sm)', fontWeight: 600, color: 'var(--ink)' }}>{fmt(th.peak_equity)}</td>
                      <td style={{ textAlign: 'right', padding: 'var(--s-xs) var(--s-sm)' }}>{th.before.win_rate}%</td>
                      <td style={{ textAlign: 'right', padding: 'var(--s-xs) var(--s-sm)', color: wrDiff < 0 ? 'var(--loss)' : 'var(--green)' }}>
                        {th.after.win_rate}% <span className="caption">({wrDiff >= 0 ? '+' : ''}{wrDiff}%)</span>
                      </td>
                      <td style={{ textAlign: 'right', padding: 'var(--s-xs) var(--s-sm)' }}>{fmt(th.before.avg_loss)}</td>
                      <td style={{ textAlign: 'right', padding: 'var(--s-xs) var(--s-sm)', color: th.after.avg_loss > th.before.avg_loss ? 'var(--loss)' : 'var(--green)' }}>
                        {fmt(th.after.avg_loss)} <span className="caption">({th.after.avg_loss > th.before.avg_loss ? '+' : ''}{fmt(th.after.avg_loss - th.before.avg_loss)})</span>
                      </td>
                      <td style={{ textAlign: 'right', padding: 'var(--s-xs) var(--s-sm)' }}>{th.before.avg_volume}</td>
                      <td style={{ textAlign: 'right', padding: 'var(--s-xs) var(--s-sm)', color: volDiff > 10 ? 'var(--loss)' : 'var(--green)' }}>
                        {th.after.avg_volume} <span className="caption">({volDiff >= 0 ? '+' : ''}{volDiff}%)</span>
                      </td>
                      <td style={{ textAlign: 'right', padding: 'var(--s-xs) var(--s-sm)', color: th.after.net_pnl >= 0 ? 'var(--green)' : 'var(--loss)' }}>
                        {th.after.net_pnl >= 0 ? '+' : ''}{fmt(th.after.net_pnl)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 手数分析 */}
      <div className="card mt-lg">
        <div className="heading-lg mb-md">{t('insights.volumeAnalysis')}</div>
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
          <div className="stat-card surface">
            <div className="stat-label">{t('insights.avgWinVol')}</div>
            <div className="stat-value" style={{ color: 'var(--green)' }}>{d.volume_analysis.avg_win_vol}</div>
          </div>
          <div className="stat-card surface">
            <div className="stat-label">{t('insights.avgLossVol')}</div>
            <div className="stat-value" style={{ color: 'var(--loss)' }}>{d.volume_analysis.avg_loss_vol}</div>
          </div>
          <div className="stat-card surface">
            <div className="stat-label">{t('insights.avgVolume')}</div>
            <div className="stat-value">{d.volume_analysis.avg_volume}</div>
          </div>
          <div className="stat-card surface">
            <div className="stat-label">{t('insights.maxVolume')}</div>
            <div className="stat-value">{d.volume_analysis.max_volume}</div>
          </div>
        </div>
        {Number(d.volume_analysis.avg_loss_vol) > Number(d.volume_analysis.avg_win_vol) && (
          <div className="body-sm mt-md" style={{ color: 'var(--warn)', padding: 'var(--s-sm) var(--s-md)', background: 'var(--surface-black)', borderRadius: 'var(--r-sm)' }}>
            ⚠ {t('insights.volumeWarning')}
          </div>
        )}
      </div>

      {/* 改进建议 */}
      <div className="card mt-lg">
        <div className="heading-lg mb-md">{t('insights.suggestions')}</div>
        <div className="flex-col gap-md">
          {d.profit_factor < 1 && (
            <div style={{ padding: 'var(--s-md)', background: 'var(--surface-black)', borderRadius: 'var(--r-sm)', borderLeft: '4px solid var(--loss)' }}>
              <div className="fw-600 mb-xs" style={{ color: 'var(--loss)' }}>{t('insights.sugProfitFactorTitle')}</div>
              <div className="body-sm">{t('insights.sugProfitFactorDesc', { pf: d.profit_factor })}</div>
            </div>
          )}
          {d.avg_loss > d.avg_win * 3 && (
            <div style={{ padding: 'var(--s-md)', background: 'var(--surface-black)', borderRadius: 'var(--r-sm)', borderLeft: '4px solid var(--loss)' }}>
              <div className="fw-600 mb-xs" style={{ color: 'var(--loss)' }}>{t('insights.sugLossTitle')}</div>
              <div className="body-sm">{t('insights.sugLossDesc', { ratio: (d.avg_loss / (d.avg_win || 1)).toFixed(1) })}</div>
            </div>
          )}
          {d.big_loss_count > 5 && (
            <div style={{ padding: 'var(--s-md)', background: 'var(--surface-black)', borderRadius: 'var(--r-sm)', borderLeft: '4px solid var(--loss)' }}>
              <div className="fw-600 mb-xs" style={{ color: 'var(--loss)' }}>{t('insights.sugBigLossTitle')}</div>
              <div className="body-sm">{t('insights.sugBigLossDesc', { n: d.big_loss_count, total: fmt(d.big_loss_total) })}</div>
            </div>
          )}
          {Number(d.volume_analysis.avg_loss_vol) > Number(d.volume_analysis.avg_win_vol) && (
            <div style={{ padding: 'var(--s-md)', background: 'var(--surface-black)', borderRadius: 'var(--r-sm)', borderLeft: '4px solid var(--warn)' }}>
              <div className="fw-600 mb-xs" style={{ color: 'var(--warn)' }}>{t('insights.sugVolumeTitle')}</div>
              <div className="body-sm">{t('insights.sugVolumeDesc')}</div>
            </div>
          )}
          <div style={{ padding: 'var(--s-md)', background: 'var(--surface-black)', borderRadius: 'var(--r-sm)', borderLeft: '4px solid var(--primary)' }}>
            <div className="fw-600 mb-xs" style={{ color: 'var(--primary)' }}>{t('insights.sugGeneralTitle')}</div>
            <div className="body-sm">{t('insights.sugGeneralDesc')}</div>
          </div>
        </div>
      </div>
    </div>
  )
}