import { useMemo, useRef, useState } from 'react'

/**
 * 纯 SVG 净值曲线
 * - 0 基线居中（Y 轴对称范围）
 * - 盈利部分绿色，亏损部分红色（线条+填充均分色）
 * - X 轴日期完整显示，密集时斜放 -45°
 * - 悬停显示当日盈亏、资金进出、累计盈亏
 */
export default function EquityCurve({ data }) {
  const containerRef = useRef(null)
  const [hover, setHover] = useState(null)

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

    const scaleY = chart.height / rect.height
    setHover({
      svgX: px / scaleX,
      svgY: py / scaleY,
      point,
      index: nearestIdx
    })
  }

  const handleMouseLeave = () => setHover(null)

  if (!chart) {
    return (
      <div className="card" style={{ height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span className="text-muted">暂无数据</span>
      </div>
    )
  }

  const { width, height, padding, linePath, areaPath, zeroY, yTicks, xTicks, needRotate } = chart
  const fmt = (n) => Number(n).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const hoverSvgX = hover ? hover.svgX * (chart.width / (containerRef.current?.clientWidth || chart.width)) : 0
  const hoverSvgY = hover ? hover.svgY * (chart.height / (containerRef.current?.clientHeight || chart.height)) : 0

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        style={{ width: '100%', height: 'auto' }}
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
          />
        ))}

        {/* 0 基线（居中） */}
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

        {/* 填充区域：0 以上绿色，0 以下红色 */}
        <path d={areaPath} fill="rgba(53,237,126,0.15)" clipPath="url(#clip-positive)" />
        <path d={areaPath} fill="rgba(242,63,67,0.15)" clipPath="url(#clip-negative)" />

        {/* 曲线：0 以上绿色，0 以下红色 */}
        <path d={linePath} fill="none" stroke="var(--green)" strokeWidth="2.5" clipPath="url(#clip-positive)" />
        <path d={linePath} fill="none" stroke="var(--loss)" strokeWidth="2.5" clipPath="url(#clip-negative)" />

        {/* 悬停指示线 + 点 */}
        {hover && (
          <>
            <line
              x1={hoverSvgX}
              y1={padding.top}
              x2={hoverSvgX}
              y2={height - padding.bottom}
              stroke="var(--muted)"
              strokeWidth="1"
              strokeDasharray="3 3"
              opacity="0.5"
            />
            <circle
              cx={hoverSvgX}
              cy={hoverSvgY}
              r="5"
              fill="var(--magenta)"
              stroke="var(--ink)"
              strokeWidth="2"
            />
          </>
        )}

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

      {/* Tooltip */}
      {hover && hover.point && (
        <div
          className="tooltip"
          style={{
            left: Math.min(hover.svgX + 12, (containerRef.current?.clientWidth || 0) - 220),
            top: Math.max(hover.svgY - 80, 10),
            whiteSpace: 'normal',
            minWidth: 200
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: '6px', color: 'var(--ink)' }}>{hover.point.date}</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', marginBottom: '3px' }}>
            <span style={{ color: 'var(--muted)' }}>交易笔数</span>
            <span>{hover.point.trades || 0}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', marginBottom: '3px' }}>
            <span style={{ color: 'var(--muted)' }}>当日盈亏</span>
            <span style={{ color: hover.point.daily_profit >= 0 ? 'var(--green)' : 'var(--loss)', fontWeight: 600 }}>
              {hover.point.daily_profit >= 0 ? '+' : ''}{fmt(hover.point.daily_profit)}
            </span>
          </div>
          {(hover.point.deposit > 0 || hover.point.withdrawal > 0 || hover.point.bonus > 0 || hover.point.bonus_loss > 0 || hover.point.bonus_expired > 0) && (
            <>
              {hover.point.deposit > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
                  <span style={{ color: 'var(--muted)' }}>入金</span>
                  <span style={{ color: 'var(--green)' }}>+{fmt(hover.point.deposit)}</span>
                </div>
              )}
              {hover.point.withdrawal > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
                  <span style={{ color: 'var(--muted)' }}>出金</span>
                  <span style={{ color: 'var(--loss)' }}>-{fmt(hover.point.withdrawal)}</span>
                </div>
              )}
              {hover.point.bonus > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
                  <span style={{ color: 'var(--muted)' }}>赠金</span>
                  <span style={{ color: 'var(--green)' }}>+{fmt(hover.point.bonus)}</span>
                </div>
              )}
              {hover.point.bonus_loss > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
                  <span style={{ color: 'var(--muted)' }}>赠金亏损</span>
                  <span style={{ color: 'var(--loss)' }}>-{fmt(hover.point.bonus_loss)}</span>
                </div>
              )}
              {hover.point.bonus_expired > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
                  <span style={{ color: 'var(--muted)' }}>赠金失效</span>
                  <span style={{ color: 'var(--loss)' }}>-{fmt(hover.point.bonus_expired)}</span>
                </div>
              )}
            </>
          )}
          <div style={{ height: 1, background: 'var(--border)', margin: '6px 0' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', marginBottom: '3px' }}>
            <span style={{ color: 'var(--muted)' }}>累计盈亏</span>
            <span style={{ color: hover.point.net_profit >= 0 ? 'var(--green)' : 'var(--loss)', fontWeight: 600 }}>
              {hover.point.net_profit >= 0 ? '+' : ''}{fmt(hover.point.net_profit)}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
            <span style={{ color: 'var(--muted)' }}>累计盈亏</span>
            <span style={{ fontWeight: 700, color: hover.point.net_profit >= 0 ? 'var(--green)' : 'var(--loss)' }}>
              {fmt(hover.point.net_profit)}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
