import { useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from '../i18n/I18nProvider'

/**
 * 纯 SVG 净值曲线（Portal Tooltip 版本）
 * - 0 基线居中（Y 轴对称范围）
 * - 盈利部分绿色，亏损部分红色（线条+填充均分色）
 * - X 轴日期完整显示，密集时斜放 -45°
 * - 悬停显示当日盈亏、资金进出、累计盈亏
 * - Tooltip 使用 Portal 渲染到 body，避免被兄弟卡片遮挡
 */
export default function EquityCurve({ data }) {
  const { t, locale } = useTranslation()
  const containerRef = useRef(null)
  const [tooltip, setTooltip] = useState(null)
  const [tooltipPos, setTooltipPos] = useState({ left: 0, top: 0 })

  // 稳定的渐变/滤镜 ID（组件整个生命周期不变）
  const uid = useRef(`c${Math.random().toString(36).slice(2, 8)}`).current

  const chart = useMemo(() => {
    if (!data || data.length === 0) return null

    const width = 1000
    const height = 360
    const padding = { top: 20, right: 30, bottom: 60, left: 70 }
    const chartW = width - padding.left - padding.right
    const chartH = height - padding.top - padding.bottom

    // 使用累计盈亏而非账户净值，正确反映交易盈亏
    const values = data.map(d => d.net_profit)
    // 0 基线居中：Y 轴范围对称
    const maxAbs = Math.max(Math.abs(Math.min(...values)), Math.abs(Math.max(...values)), 1)
    const minVal = -maxAbs
    const maxVal = maxAbs
    const range = maxVal - minVal // = 2 * maxAbs

    const xStep = chartW / Math.max(1, data.length - 1)
    const yScale = (v) => padding.top + chartH - ((v - minVal) / range) * chartH
    const xPos = (i) => padding.left + i * xStep

    // 0 基线 Y 坐标（正好在中间）
    const zeroY = yScale(0)

    const linePath = data.map((d, i) =>
      `${i === 0 ? 'M' : 'L'} ${xPos(i)} ${yScale(d.net_profit)}`
    ).join(' ')

    const areaPath = `${linePath} L ${xPos(data.length - 1)} ${zeroY} L ${xPos(0)} ${zeroY} Z`

    // Y 轴刻度
    const yTicks = []
    const tickCount = 6
    for (let i = 0; i <= tickCount; i++) {
      const val = minVal + (range * i / tickCount)
      yTicks.push({ val, y: yScale(val) })
    }

    // X 轴日期
    const xTicks = data.map((d, i) => ({
      label: d.date,
      x: xPos(i),
      index: i
    }))

    // 判断是否需要斜放（间距 < 60px）
    const needRotate = data.length > 10 || (chartW / data.length < 60)

    return { width, height, padding, linePath, areaPath, zeroY, yTicks, xTicks, needRotate, xPos, yScale, data }
  }, [data])

  // 更新 tooltip 位置（跟随鼠标，使用 viewport 坐标，通过 Portal 渲染到 body）
  const handleMouseMove = (e) => {
    if (!chart) return
    const svg = e.currentTarget
    const rect = svg.getBoundingClientRect()
    const scaleX = chart.width / rect.width
    const mouseX = (e.clientX - rect.left) * scaleX

    const { padding, xPos, data } = chart
    let nearestIdx = 0
    let minDist = Infinity
    for (let i = 0; i < data.length; i++) {
      const dist = Math.abs(xPos(i) - mouseX)
      if (dist < minDist) {
        minDist = dist
        nearestIdx = i
      }
    }

    const point = data[nearestIdx]
    const py = chart.yScale(point.net_profit)
    const px = chart.xPos(nearestIdx)

    // 计算 SVG 坐标对应的 viewport 位置
    const svgX = rect.left + (px / scaleX)
    const svgY = rect.top + (py / (chart.height / rect.height))

    setTooltip({ point, index: nearestIdx })
    setTooltipPos({
      left: Math.min(svgX + 16, window.innerWidth - 240),
      top: Math.max(svgY - 80, 12)
    })
  }

  const handleMouseLeave = () => {
    setTooltip(null)
    setTooltipPos({ left: 0, top: 0 })
  }

  if (!chart) {
    return (
      <div className="card" style={{ height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span className="text-muted">{t('curve.noData')}</span>
      </div>
    )
  }

  const { width, height, padding, linePath, areaPath, zeroY, yTicks, xTicks, needRotate } = chart
  const fmt = (n) => Number(n).toLocaleString(locale === 'zh-CN' ? 'zh-CN' : 'en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const hoverPoint = tooltip?.point

  // 曲线渐变 ID（每个实例唯一）
  const gradId = `${uid}-pos`
  const gradNegId = `${uid}-neg`
  const glowId = `${uid}-glow`

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        style={{ width: '100%', height: 'auto', display: 'block' }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        <defs>
          {/* 0 以上区域裁剪 */}
          <clipPath id="clip-positive">
            <rect x="0" y="0" width={width} height={zeroY} />
          </clipPath>
          {/* 0 以下区域裁剪 */}
          <clipPath id="clip-negative">
            <rect x="0" y={zeroY} width={width} height={height - zeroY} />
          </clipPath>
          {/* 盈利区渐变填充 */}
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--green)" stopOpacity="0.35" />
            <stop offset="100%" stopColor="var(--green)" stopOpacity="0.02" />
          </linearGradient>
          {/* 亏损区渐变填充 */}
          <linearGradient id={gradNegId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--loss)" stopOpacity="0.02" />
            <stop offset="100%" stopColor="var(--loss)" stopOpacity="0.35" />
          </linearGradient>
          {/* 曲线发光滤镜 */}
          <filter id={glowId} x="-10%" y="-10%" width="120%" height="120%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* 网格线 */}
        {yTicks.map((t, i) => (
          <line
            key={i}
            x1={padding.left}
            y1={t.y}
            x2={width - padding.right}
            y2={t.y}
            stroke="var(--border)"
            strokeWidth="1"
            opacity="0.6"
          />
        ))}

        {/* 0 基线（居中虚线） */}
        <line
          x1={padding.left}
          y1={zeroY}
          x2={width - padding.right}
          y2={zeroY}
          stroke="var(--muted-dim)"
          strokeWidth="1.5"
          strokeDasharray="6 4"
        />
        <text x={padding.left - 8} y={zeroY + 4} textAnchor="end" fill="var(--muted)" fontSize="11" fontWeight="600">0</text>

        {/* 渐变填充区域：0 以上绿色，0 以下红色 */}
        <path d={areaPath} fill={`url(#${gradId})`} clipPath="url(#clip-positive)" />
        <path d={areaPath} fill={`url(#${gradNegId})`} clipPath="url(#clip-negative)" />

        {/* 曲线发光层 */}
        <path d={linePath} fill="none" stroke="var(--green)" strokeWidth="5" opacity="0.2" clipPath="url(#clip-positive)" filter={`url(#${glowId})`} />
        <path d={linePath} fill="none" stroke="var(--loss)" strokeWidth="5" opacity="0.2" clipPath="url(#clip-negative)" filter={`url(#${glowId})`} />

        {/* 曲线主线条 */}
        <path d={linePath} fill="none" stroke="var(--green)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" clipPath="url(#clip-positive)" />
        <path d={linePath} fill="none" stroke="var(--loss)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" clipPath="url(#clip-negative)" />

        {/* 悬停指示线 + 点 */}
        {tooltip && (() => {
          const px = chart.xPos(tooltip.index)
          const py = chart.yScale(tooltip.point.net_profit)
          const svgEl = containerRef.current?.querySelector('svg')
          if (!svgEl) return null
          const rect = svgEl.getBoundingClientRect()
          const scaleX = chart.width / rect.width
          const scaleY = chart.height / rect.height
          const vpx = px / scaleX
          const vpy = py / scaleY
          return (
            <g>
              <line
                x1={px}
                y1={padding.top}
                x2={px}
                y2={height - padding.bottom}
                stroke="var(--muted)"
                strokeWidth="1"
                strokeDasharray="3 3"
                opacity="0.5"
              />
              <circle
                cx={px}
                cy={py}
                r="5"
                fill="var(--magenta)"
                stroke="var(--ink)"
                strokeWidth="2.5"
              />
              {/* 外圈光晕 */}
              <circle
                cx={px}
                cy={py}
                r="10"
                fill="none"
                stroke="var(--magenta)"
                strokeWidth="1"
                opacity="0.3"
              />
            </g>
          )
        })()}

        {/* Y 轴刻度文字 */}
        {yTicks.map((t, i) => (
          <text key={i} x={padding.left - 8} y={t.y + 4} textAnchor="end" fill="var(--muted)" fontSize="11">
            {Math.round(t.val)}
          </text>
        ))}

        {/* X 轴日期（斜放） */}
        {xTicks.map((t, i) => {
          const step = Math.max(1, Math.ceil(xTicks.length / 20))
          if (i % step !== 0 && i !== xTicks.length - 1) return null
          return (
            <text
              key={i}
              x={t.x}
              y={height - padding.bottom + 15}
              textAnchor={needRotate ? 'end' : 'middle'}
              fill="var(--muted)"
              fontSize="11"
              transform={needRotate ? `rotate(-45, ${t.x}, ${height - padding.bottom + 15})` : undefined}
            >
              {t.label}
            </text>
          )
        })}
      </svg>

      {/* Tooltip — 使用 Portal 渲染到 body，避免被下层卡片遮挡 */}
      {tooltip && hoverPoint && createPortal(
        <div
          className="curve-tooltip"
          style={{
            left: tooltipPos.left,
            top: tooltipPos.top,
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: '6px', color: 'var(--ink)' }}>{hoverPoint.date}</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', marginBottom: '3px' }}>
            <span style={{ color: 'var(--muted)' }}>{t('curve.tradesCount')}</span>
            <span>{hoverPoint.trades || 0}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', marginBottom: '3px' }}>
            <span style={{ color: 'var(--muted)' }}>{t('curve.dayPnl')}</span>
            <span style={{ color: hoverPoint.daily_profit >= 0 ? 'var(--green)' : 'var(--loss)', fontWeight: 600 }}>
              {hoverPoint.daily_profit >= 0 ? '+' : ''}{fmt(hoverPoint.daily_profit)}
            </span>
          </div>
          {(hoverPoint.deposit > 0 || hoverPoint.withdrawal > 0 || hoverPoint.bonus > 0 || hoverPoint.bonus_loss > 0 || hoverPoint.bonus_expired > 0) && (
            <>
              {hoverPoint.deposit > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
                  <span style={{ color: 'var(--muted)' }}>{t('curve.deposit')}</span>
                  <span style={{ color: 'var(--green)' }}>+{fmt(hoverPoint.deposit)}</span>
                </div>
              )}
              {hoverPoint.withdrawal > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
                  <span style={{ color: 'var(--muted)' }}>{t('curve.withdrawal')}</span>
                  <span style={{ color: 'var(--loss)' }}>-{fmt(hoverPoint.withdrawal)}</span>
                </div>
              )}
              {hoverPoint.bonus > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
                  <span style={{ color: 'var(--muted)' }}>{t('curve.bonus')}</span>
                  <span style={{ color: 'var(--green)' }}>+{fmt(hoverPoint.bonus)}</span>
                </div>
              )}
              {hoverPoint.bonus_loss > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
                  <span style={{ color: 'var(--muted)' }}>{t('curve.bonusLoss')}</span>
                  <span style={{ color: 'var(--loss)' }}>-{fmt(hoverPoint.bonus_loss)}</span>
                </div>
              )}
              {hoverPoint.bonus_expired > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
                  <span style={{ color: 'var(--muted)' }}>{t('curve.bonusExpired')}</span>
                  <span style={{ color: 'var(--loss)' }}>-{fmt(hoverPoint.bonus_expired)}</span>
                </div>
              )}
            </>
          )}
          <div style={{ height: 1, background: 'var(--border)', margin: '6px 0' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
            <span style={{ color: 'var(--muted)' }}>{t('curve.cumulativePnl')}</span>
            <span style={{ fontWeight: 700, color: hoverPoint.net_profit >= 0 ? 'var(--green)' : 'var(--loss)' }}>
              {hoverPoint.net_profit >= 0 ? '+' : ''}{fmt(hoverPoint.net_profit)}
            </span>
          </div>
          {/* 当日变化指示条 */}
          <div style={{
            height: 3,
            borderRadius: '2px',
            marginTop: 8,
            background: hoverPoint.daily_profit >= 0
              ? `linear-gradient(90deg, var(--green), ${hoverPoint.daily_profit >= 0 ? 'var(--green)' : 'var(--loss)'})`
              : `linear-gradient(90deg, var(--loss), var(--loss))`,
            opacity: 0.6
          }} />
        </div>,
        document.body
      )}
    </div>
  )
}
