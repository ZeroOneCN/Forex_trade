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
  const [lastUpdated, setLastUpdated] = useState(null)
  const { t, locale } = useTranslation()

  const fmt = (n) => Number(n).toLocaleString(locale === 'zh-CN' ? 'zh-CN' : 'en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const fmtPct = (n) => Number(n) + '%'
  const fmtInt = (n) => Number(n).toLocaleString()

  const loadData = () => {
    setLoading(true)
    Promise.all([
      fetchJSON('/analysis/insights'),
      fetchJSON('/analysis/thresholds')
    ]).then(([ins, thr]) => {
      setInsights(ins)
      setThresholds(thr)
      setLastUpdated(new Date())
    }).catch(err => {
      setError(err.message)
    }).finally(() => setLoading(false))
  }

  useEffect(() => { loadData() }, [])

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--s-section)' }}><div className="spinner" /></div>
  }

  if (error || !insights) {
    return <div className="card text-center text-muted">{t('common.noData')}</div>
  }

  const d = insights

  const riskLevel = d.profit_factor < 1 ? 'high' : d.profit_factor < 1.5 ? 'medium' : 'low'
  const riskColor = riskLevel === 'high' ? 'var(--loss)' : riskLevel === 'medium' ? 'var(--warn)' : 'var(--green)'
  const riskLabel = riskLevel === 'high' ? t('insights.riskHigh') : riskLevel === 'medium' ? t('insights.riskMedium') : t('insights.riskLow')

  // 表头行样式
  const thStyle = { textAlign: 'left', padding: 'var(--s-xs) var(--s-sm)', fontWeight: 600, fontSize: 12, color: 'var(--muted)', whiteSpace: 'nowrap' }
  const thRight = { ...thStyle, textAlign: 'right' }
  const tdStyle = { padding: 'var(--s-xs) var(--s-sm)', fontSize: 13 }
  const tdRight = { ...tdStyle, textAlign: 'right' }

  // 警告横幅组件
  function AlertBanner({ type, title, desc }) {
    const colors = {
      error: { border: 'var(--loss)', bg: 'color-mix(in srgb, var(--loss) 10%, transparent)', text: 'var(--loss)' },
      warn: { border: 'var(--warn)', bg: 'color-mix(in srgb, var(--warn) 10%, transparent)', text: 'var(--warn)' },
      info: { border: 'var(--primary)', bg: 'color-mix(in srgb, var(--primary) 10%, transparent)', text: 'var(--primary)' }
    }
    const c = colors[type] || colors.info
    return (
      <div style={{ padding: 'var(--s-md)', background: c.bg, borderRadius: 'var(--r-sm)', borderLeft: `4px solid ${c.border}` }}>
        {title && <div className="fw-600 mb-xs" style={{ color: c.text, fontSize: 13 }}>{title}</div>}
        {desc && <div className="body-sm" style={{ color: 'var(--text-muted)', lineHeight: 1.6, whiteSpace: 'pre-line' }}>{desc}</div>}
      </div>
    )
  }

  return (
    <div className="fade-in">

      {/* 刷新栏 */}
      <div className="flex justify-end items-center mb-sm" style={{ minHeight: 28 }}>
        {lastUpdated && (
          <span className="caption text-muted" style={{ marginRight: 'var(--s-sm)' }}>
            {t('insights.lastUpdated')} {lastUpdated.toLocaleTimeString(locale === 'zh-CN' ? 'zh-CN' : 'en-US')}
          </span>
        )}
        <button className="btn btn-ghost" onClick={loadData} disabled={loading}
          style={{ width: 28, height: 28, padding: 0, fontSize: 14, borderRadius: 'var(--r-sm)' }}>
          {loading ? '…' : '↻'}
        </button>
      </div>

      {/* 核心指标 - 一行六列 */}
      <div className="grid" style={{ gridTemplateColumns: 'repeat(6, 1fr)' }}>
        <div className="stat-card enter-stagger" style={{ '--i': 0 }}>
          <div className="stat-label">{t('insights.totalTrades')}</div>
          <div className="stat-value">{fmtInt(d.total_trades)}</div>
        </div>
        <div className="stat-card surface enter-stagger" style={{ '--i': 1 }}>
          <div className="stat-label">{t('insights.winRate')}</div>
          <div className="stat-value" style={{ color: d.win_rate >= 60 ? 'var(--green)' : 'var(--loss)' }}>{fmtPct(d.win_rate)}</div>
          <div className="stat-sub">{t('insights.winLose', { w: d.win_count, l: d.loss_count })}</div>
        </div>
        <div className="stat-card surface enter-stagger" style={{ '--i': 2 }}>
          <div className="stat-label">{t('insights.netProfit')}</div>
          <div className="stat-value" style={{ color: d.net_profit >= 0 ? 'var(--green)' : 'var(--loss)' }}>
            {d.net_profit >= 0 ? '+' : ''}{fmt(d.net_profit)}
          </div>
        </div>
        <div className="stat-card surface enter-stagger" style={{ '--i': 3 }}>
          <div className="stat-label">{t('insights.profitFactor')}</div>
          <div className="stat-value" style={{ color: riskColor }}>{d.profit_factor}</div>
          <div className="stat-sub">{riskLabel}</div>
        </div>
        <div className="stat-card surface enter-stagger" style={{ '--i': 4 }}>
          <div className="stat-label">{t('insights.maxDrawdown')}</div>
          <div className="stat-value" style={{ color: 'var(--loss)' }}>{fmt(d.max_drawdown)}</div>
        </div>
        <div className="stat-card surface enter-stagger" style={{ '--i': 5 }}>
          <div className="stat-label">{t('insights.expectancy')}</div>
          <div className="stat-value" style={{ color: d.expectancy >= 0 ? 'var(--green)' : 'var(--loss)' }}>{fmt(d.expectancy)}</div>
        </div>
      </div>

      {/* 盈亏比分析 + 连续盈亏 + 手数分析 - 三列 */}
      <div className="grid mt-lg" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        {/* 盈亏比分析 */}
        <div className="card enter-stagger" style={{ '--i': 6, display: 'flex', flexDirection: 'column' }}>
          <div className="heading-lg mb-md">{t('insights.pnlAnalysis')}</div>
          <div className="flex-col gap-md" style={{ flex: 1 }}>
            <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <div className="stat-card surface" style={{ textAlign: 'center', padding: 'var(--s-sm)' }}>
                <div className="stat-label">{t('insights.avgWin')}</div>
                <div className="heading-lg" style={{ color: 'var(--green)' }}>+{fmt(d.avg_win)}</div>
              </div>
              <div className="stat-card surface" style={{ textAlign: 'center', padding: 'var(--s-sm)' }}>
                <div className="stat-label">{t('insights.avgLoss')}</div>
                <div className="heading-lg" style={{ color: 'var(--loss)' }}>-{fmt(d.avg_loss)}</div>
              </div>
            </div>
            <div className="stat-card surface" style={{ textAlign: 'center', padding: 'var(--s-sm)' }}>
              <div className="stat-label">{t('insights.ratio')}</div>
              <div className="heading-lg" style={{ color: d.profit_factor >= 1.5 ? 'var(--green)' : 'var(--loss)' }}>
                1 : {d.profit_factor > 0 ? (d.avg_loss / (d.avg_win || 1)).toFixed(1) : 'N/A'}
              </div>
            </div>
            {d.avg_loss > d.avg_win * 2 && (
              <div className="body-sm" style={{ color: 'var(--loss)', padding: 'var(--s-sm) var(--s-md)', background: 'color-mix(in srgb, var(--loss) 10%, transparent)', borderRadius: 'var(--r-sm)' }}>
                ⚠ {t('insights.lossWarning', { ratio: (d.avg_loss / (d.avg_win || 1)).toFixed(1) })}
              </div>
            )}
          </div>
        </div>
        {/* 连续盈亏 */}
        <div className="card enter-stagger" style={{ '--i': 7, display: 'flex', flexDirection: 'column' }}>
          <div className="heading-lg mb-md">{t('insights.streakAnalysis')}</div>
          <div className="flex-col gap-md" style={{ flex: 1 }}>
            <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <div className="stat-card surface" style={{ textAlign: 'center', padding: 'var(--s-sm)' }}>
                <div className="stat-label">{t('insights.maxWinStreak')}</div>
                <div className="heading-lg" style={{ color: 'var(--green)' }}>{d.max_win_streak}</div>
              </div>
              <div className="stat-card surface" style={{ textAlign: 'center', padding: 'var(--s-sm)' }}>
                <div className="stat-label">{t('insights.maxLossStreak')}</div>
                <div className="heading-lg" style={{ color: 'var(--loss)' }}>{d.max_loss_streak}</div>
              </div>
            </div>
            <div className="stat-card surface" style={{ textAlign: 'center', padding: 'var(--s-sm)' }}>
              <div className="stat-label">{t('insights.currentStreak')}</div>
              <div className="heading-lg" style={{ color: d.current_loss_streak > 0 ? 'var(--loss)' : 'var(--green)' }}>
                {d.current_loss_streak > 0 ? `-${d.current_loss_streak}` : `+${d.current_win_streak}`}
              </div>
            </div>
            {d.current_loss_streak >= 3 && (
              <div className="body-sm" style={{ color: 'var(--warn)', padding: 'var(--s-sm) var(--s-md)', background: 'color-mix(in srgb, var(--warn) 10%, transparent)', borderRadius: 'var(--r-sm)' }}>
                ⚠ {t('insights.lossStreakWarning', { n: d.current_loss_streak })}
              </div>
            )}
          </div>
        </div>
        {/* 手数分析 */}
        <div className="card enter-stagger" style={{ '--i': 8, display: 'flex', flexDirection: 'column' }}>
          <div className="heading-lg mb-md">{t('insights.volumeAnalysis')}</div>
          <div className="flex-col gap-md" style={{ flex: 1 }}>
            <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <div className="stat-card surface" style={{ textAlign: 'center', padding: 'var(--s-sm)' }}>
                <div className="stat-label">{t('insights.avgWinVol')}</div>
                <div className="stat-value" style={{ color: 'var(--green)' }}>{d.volume_analysis.avg_win_vol}</div>
              </div>
              <div className="stat-card surface" style={{ textAlign: 'center', padding: 'var(--s-sm)' }}>
                <div className="stat-label">{t('insights.avgLossVol')}</div>
                <div className="stat-value" style={{ color: 'var(--loss)' }}>{d.volume_analysis.avg_loss_vol}</div>
              </div>
            </div>
            <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <div className="stat-card surface" style={{ textAlign: 'center', padding: 'var(--s-sm)' }}>
                <div className="stat-label">{t('insights.avgVolume')}</div>
                <div className="stat-value">{d.volume_analysis.avg_volume}</div>
              </div>
              <div className="stat-card surface" style={{ textAlign: 'center', padding: 'var(--s-sm)' }}>
                <div className="stat-label">{t('insights.maxVolume')}</div>
                <div className="stat-value">{d.volume_analysis.max_volume}</div>
              </div>
            </div>
            {Number(d.volume_analysis.avg_loss_vol) > Number(d.volume_analysis.avg_win_vol) && (
              <div className="body-sm" style={{ color: 'var(--warn)', padding: 'var(--s-sm) var(--s-md)', background: 'color-mix(in srgb, var(--warn) 10%, transparent)', borderRadius: 'var(--r-sm)' }}>
                ⚠ {t('insights.volumeWarning')}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 月度趋势 */}
      <div className="card mt-lg enter-stagger" style={{ '--i': 9 }}>
        <div className="heading-lg mb-md">{t('insights.monthlyTrend')}</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <th style={thStyle}>{t('insights.month')}</th>
                <th style={thRight}>{t('insights.trades')}</th>
                <th style={thRight}>{t('insights.netProfit')}</th>
                <th style={thRight}>{t('insights.winRate')}</th>
                <th style={thRight}>{t('insights.winLoseShort')}</th>
              </tr>
            </thead>
            <tbody>
              {d.monthly.map(m => (
                <tr key={m.ym} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ ...tdStyle, fontWeight: 600 }}>{m.ym}</td>
                  <td style={tdRight}>{m.trades}</td>
                  <td style={{ ...tdRight, color: m.net_profit >= 0 ? 'var(--green)' : 'var(--loss)' }}>
                    {m.net_profit >= 0 ? '+' : ''}{fmt(m.net_profit)}
                  </td>
                  <td style={tdRight}>{m.win_rate}%</td>
                  <td style={tdRight}>
                    <span className="text-profit">{m.wins}</span> / <span className="text-loss">{m.losses}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 品种分析 + 大额亏损 - 两列 */}
      <div className="grid mt-lg" style={{ gridTemplateColumns: '1fr 1fr' }}>
        {/* 品种分析 */}
        <div className="card enter-stagger" style={{ '--i': 10 }}>
          <div className="heading-lg mb-md">{t('insights.symbolAnalysis')}</div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <th style={thStyle}>{t('insights.symbol')}</th>
                  <th style={thRight}>{t('insights.trades')}</th>
                  <th style={thRight}>{t('insights.netProfit')}</th>
                  <th style={thRight}>{t('insights.winRate')}</th>
                </tr>
              </thead>
              <tbody>
                {d.symbols.map(sym => (
                  <tr key={sym.symbol} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ ...tdStyle, fontWeight: 600 }}>{sym.symbol}</td>
                    <td style={tdRight}>{sym.trades}</td>
                    <td style={{ ...tdRight, color: sym.net_profit >= 0 ? 'var(--green)' : 'var(--loss)' }}>
                      {sym.net_profit >= 0 ? '+' : ''}{fmt(sym.net_profit)}
                    </td>
                    <td style={tdRight}>{sym.win_rate}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        {/* 大额亏损 */}
        <div className="card enter-stagger" style={{ '--i': 11 }}>
          <div className="heading-lg mb-md">{t('insights.bigLosses')}</div>
          <div className="stat-card surface" style={{ display: 'inline-flex', alignItems: 'baseline', gap: 'var(--s-sm)', marginBottom: 'var(--s-md)' }}>
            <div className="stat-label">{t('insights.bigLossStats', { n: d.big_loss_count })}</div>
            <div className="heading-lg" style={{ color: 'var(--loss)' }}>{fmt(d.big_loss_total)}</div>
          </div>
          {d.big_losses.length > 0 && (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <th style={thStyle}>{t('insights.date')}</th>
                    <th style={thStyle}>{t('insights.symbol')}</th>
                    <th style={thRight}>{t('insights.volume')}</th>
                    <th style={thRight}>{t('insights.loss')}</th>
                  </tr>
                </thead>
                <tbody>
                  {d.big_losses.map((r, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={tdStyle}>{r.date}</td>
                      <td style={tdStyle}>{r.symbol}</td>
                      <td style={tdRight}>{r.volume}</td>
                      <td style={{ ...tdRight, color: 'var(--loss)', fontWeight: 600 }}>{fmt(r.net_pnl)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* 阈值检测 */}
      {thresholds && thresholds.thresholds && thresholds.thresholds.length > 0 && (
        <div className="card mt-lg enter-stagger" style={{ '--i': 12 }}>
          <div className="heading-lg mb-md">{t('insights.thresholdAnalysis')}</div>
          <div className="body-sm mb-md text-muted" style={{ lineHeight: 1.6 }}>
            {t('insights.thresholdDesc')} {t('insights.thresholdNotable')}
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <th style={thStyle}>{t('insights.thresholdPeak')}</th>
                  <th style={thRight}>{t('insights.beforeWinRate')}</th>
                  <th style={thRight}>{t('insights.afterWinRate')}</th>
                  <th style={thRight}>{t('insights.beforeAvgLoss')}</th>
                  <th style={thRight}>{t('insights.afterAvgLoss')}</th>
                  <th style={thRight}>{t('insights.beforeAvgVol')}</th>
                  <th style={thRight}>{t('insights.afterAvgVol')}</th>
                  <th style={thRight}>{t('insights.afterPnl')}</th>
                </tr>
              </thead>
              <tbody>
                {thresholds.thresholds.toReversed().slice(0, 10).map((th, i) => {
                  const wrDiff = (th.after.win_rate - th.before.win_rate).toFixed(1)
                  const volDiff = ((th.after.avg_volume - th.before.avg_volume) / th.before.avg_volume * 100).toFixed(0)
                  return (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ ...tdStyle, fontWeight: 700, color: 'var(--ink)' }}>{fmt(th.peak_equity)}</td>
                      <td style={tdRight}>{th.before.win_rate}%</td>
                      <td style={{ ...tdRight, color: wrDiff < 0 ? 'var(--loss)' : 'var(--green)' }}>
                        {th.after.win_rate}% <span className="caption" style={{ color: 'var(--muted)' }}>({wrDiff >= 0 ? '+' : ''}{wrDiff}%)</span>
                      </td>
                      <td style={tdRight}>{fmt(th.before.avg_loss)}</td>
                      <td style={{ ...tdRight, color: th.after.avg_loss > th.before.avg_loss ? 'var(--loss)' : 'var(--green)' }}>
                        {fmt(th.after.avg_loss)} <span className="caption" style={{ color: 'var(--muted)' }}>({th.after.avg_loss > th.before.avg_loss ? '+' : ''}{fmt(th.after.avg_loss - th.before.avg_loss)})</span>
                      </td>
                      <td style={tdRight}>{th.before.avg_volume}</td>
                      <td style={{ ...tdRight, color: volDiff > 10 ? 'var(--loss)' : 'var(--green)' }}>
                        {th.after.avg_volume} <span className="caption" style={{ color: 'var(--muted)' }}>({volDiff >= 0 ? '+' : ''}{volDiff}%)</span>
                      </td>
                      <td style={{ ...tdRight, fontWeight: 600, color: th.after.net_pnl >= 0 ? 'var(--green)' : 'var(--loss)' }}>
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

      {/* 改进建议 */}
      <div className="card mt-lg enter-stagger" style={{ '--i': 13 }}>
        <div className="heading-lg mb-md">{t('insights.suggestions')}</div>
        <div className="flex-col gap-md">
          {d.profit_factor < 1 && (
            <AlertBanner type="error" title={t('insights.sugProfitFactorTitle')}
              desc={t('insights.sugProfitFactorDesc', { pf: d.profit_factor })} />
          )}
          {d.avg_loss > d.avg_win * 3 && (
            <AlertBanner type="error" title={t('insights.sugLossTitle')}
              desc={t('insights.sugLossDesc', { ratio: (d.avg_loss / (d.avg_win || 1)).toFixed(1) })} />
          )}
          {d.big_loss_count > 5 && (
            <AlertBanner type="error" title={t('insights.sugBigLossTitle')}
              desc={t('insights.sugBigLossDesc', { n: d.big_loss_count, total: fmt(d.big_loss_total) })} />
          )}
          {Number(d.volume_analysis.avg_loss_vol) > Number(d.volume_analysis.avg_win_vol) && (
            <AlertBanner type="warn" title={t('insights.sugVolumeTitle')}
              desc={t('insights.sugVolumeDesc')} />
          )}
          <AlertBanner type="info" title={t('insights.sugGeneralTitle')}
            desc={t('insights.sugGeneralDesc')} />
        </div>
      </div>
    </div>
  )
}