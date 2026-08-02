import { useState, useEffect, useMemo } from 'react'
import { api } from '../api/client'

const LIQUIDATION_PRESETS = [30, 50, 80, 100]

let posIdCounter = 1

function newPos(symbols, defaultSymbolId) {
  return {
    id: posIdCounter++,
    symbolId: defaultSymbolId || symbols[0]?.id || '',
    direction: 'buy',
    openPrice: '',
    volume: '0.01',
    targetPrice: ''
  }
}

export default function Calculator() {
  const [symbols, setSymbols] = useState([])
  const [realEquity, setRealEquity] = useState(0)
  const [loading, setLoading] = useState(true)

  const [positions, setPositions] = useState([])
  const [equityOverride, setEquityOverride] = useState('')
  const [liquidationRatio, setLiquidationRatio] = useState(50)
  const [defaultSymbolId, setDefaultSymbolId] = useState(() => {
    const saved = localStorage.getItem('calc_default_symbol')
    return saved ? Number(saved) : null
  })

  const [editingSymbol, setEditingSymbol] = useState(null)

  const loadData = async () => {
    try {
      const [syms, ov] = await Promise.all([api.getSymbols(), api.getOverview()])
      setSymbols(syms)
      setRealEquity(ov.equity)
      if (syms.length > 0 && positions.length === 0) {
        const defId = defaultSymbolId || syms[0]?.id
        setPositions([newPos(syms, defId)])
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData() }, [])

  const effectiveEquity = useMemo(() => {
    const v = Number(equityOverride)
    return equityOverride && !isNaN(v) ? v : realEquity
  }, [equityOverride, realEquity])

  // 计算汇总（仅针对有效仓位）
  const summary = useMemo(() => {
    const valid = positions.map(p => {
      const sym = symbols.find(s => s.id === Number(p.symbolId))
      if (!sym) return null
      const price = Number(p.openPrice)
      const vol = Number(p.volume)
      if (!price || !vol) return null
      const contractSize = Number(sym.contract_size)
      const leverage = Number(sym.leverage)
      if (!contractSize || !leverage) return null
      return {
        ...p,
        symbol: sym,
        price,
        vol,
        usedMargin: (vol * contractSize * price) / leverage,
        pipValue: vol * contractSize,
        digits: Number(sym.digits)
      }
    }).filter(Boolean)

    const totalUsedMargin = valid.reduce((sum, p) => sum + p.usedMargin, 0)
    const marginLevel = totalUsedMargin > 0 ? (effectiveEquity / totalUsedMargin * 100) : 0
    const ratio = liquidationRatio / 100
    const maxLoss = effectiveEquity - totalUsedMargin * ratio

    const totalTargetPnl = valid.reduce((sum, p) => {
      if (!p.targetPrice) return sum
      const tp = Number(p.targetPrice)
      if (!tp) return sum
      return sum + (p.direction === 'buy' ? (tp - p.price) * p.pipValue : (p.price - tp) * p.pipValue)
    }, 0)

    return { valid, totalUsedMargin, marginLevel, maxLoss, totalTargetPnl }
  }, [positions, symbols, effectiveEquity, liquidationRatio])

  // 更新仓位字段
  const updatePos = (id, field, value) => {
    setPositions(ps => ps.map(p => p.id === id ? { ...p, [field]: value } : p))
  }

  const addPosition = () => {
    const defId = defaultSymbolId || symbols[0]?.id
    setPositions(ps => [...ps, newPos(symbols, defId)])
  }

  const setDefaultSymbol = (id) => {
    setDefaultSymbolId(id)
    localStorage.setItem('calc_default_symbol', String(id))
  }

  const removePosition = (id) => {
    setPositions(ps => ps.length > 1 ? ps.filter(p => p.id !== id) : ps)
  }

  const handleSaveSymbol = async () => {
    if (!editingSymbol) return
    try {
      await api.updateSymbol(editingSymbol.id, {
        contract_size: editingSymbol.contract_size,
        leverage: editingSymbol.leverage,
        digits: editingSymbol.digits
      })
      setSymbols(syms => syms.map(s => s.id === editingSymbol.id ? editingSymbol : s))
      setEditingSymbol(null)
    } catch (err) {
      alert('保存失败：' + err.message)
    }
  }

  // 计算单个仓位的显示数据（在渲染时计算，确保所有仓位都能显示）
  const getPosDisplay = (p) => {
    const sym = symbols.find(s => s.id === Number(p.symbolId))
    if (!sym) return null
    const price = Number(p.openPrice)
    const vol = Number(p.volume)
    const contractSize = Number(sym.contract_size)
    const leverage = Number(sym.leverage)
    const digits = Number(sym.digits)

    if (!price || !vol || !contractSize || !leverage) {
      // 不完整的仓位：只显示基本信息，不计算强平价
      return {
        symbol: sym,
        digits,
        usedMargin: 0,
        pipValue: 0,
        liquidationPrice: null,
        targetPnl: null,
        incomplete: true
      }
    }

    const usedMargin = (vol * contractSize * price) / leverage
    const pipValue = vol * contractSize

    // 每个仓位的强平价（基于共享净值的最大可承受亏损）
    const maxLoss = effectiveEquity - summary.totalUsedMargin * (liquidationRatio / 100)
    let liquidationPrice
    if (p.direction === 'buy') {
      liquidationPrice = price - maxLoss / pipValue
    } else {
      liquidationPrice = price + maxLoss / pipValue
    }

    let targetPnl = null
    if (p.targetPrice) {
      const tp = Number(p.targetPrice)
      if (tp) {
        targetPnl = p.direction === 'buy'
          ? (tp - price) * pipValue
          : (price - tp) * pipValue
      }
    }

    return { symbol: sym, digits, usedMargin, pipValue, liquidationPrice, targetPnl, incomplete: false, price, vol }
  }

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--s-section)' }}><div className="spinner" /></div>
  }

  const fmt = (n) => Number(n).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  return (
    <div className="fade-in">
      <div className="display-md mb-lg">交易计算</div>

      {/* 实时净值 + 可覆盖 */}
      <div className="grid mb-lg" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
        <div className="stat-card surface">
          <div className="stat-label">实时账户净值</div>
          <div className="stat-value" style={{ color: realEquity >= 0 ? 'var(--green)' : 'var(--loss)' }}>{fmt(realEquity)}</div>
        </div>
        <div className="stat-card surface">
          <div className="stat-label">计算用净值 {equityOverride && equityOverride !== String(realEquity) ? '(已覆盖)' : ''}</div>
          <div className="stat-value" style={{ color: effectiveEquity >= 0 ? 'var(--green)' : 'var(--loss)' }}>{fmt(effectiveEquity)}</div>
        </div>
        <div className="stat-card surface">
          <div className="stat-label">总已用保证金</div>
          <div className="stat-value">{fmt(summary.totalUsedMargin)}</div>
        </div>
      </div>

      {/* 共享设置 */}
      <div className="card mb-lg">
        <div className="heading-lg mb-md">共享设置</div>
        <div className="flex gap-md" style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}>
          {/* 默认品种 */}
          <div style={{ flex: '0 0 auto', minWidth: 140 }}>
            <label className="caption mb-sm" style={{ display: 'block' }}>默认品种</label>
            <select className="select" value={defaultSymbolId || ''} onChange={e => setDefaultSymbol(Number(e.target.value))}>
              {symbols.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          {/* 净值覆盖 */}
          <div style={{ flex: '0 0 auto' }}>
            <label className="caption mb-sm" style={{ display: 'block' }}>
              计算净值 <span className="text-muted">（留空实时）</span>
            </label>
            <input type="number" className="input" style={{ width: 140 }} placeholder={fmt(realEquity)} step="100"
              value={equityOverride} onChange={e => setEquityOverride(e.target.value)} />
          </div>
          {/* 强平比例 */}
          <div style={{ flex: '1 1 auto', minWidth: 200 }}>
            <label className="caption mb-sm" style={{ display: 'block' }}>强平比例</label>
            <div className="flex gap-sm" style={{ flexWrap: 'wrap', alignItems: 'center' }}>
              {LIQUIDATION_PRESETS.map(r => (
                <button
                  key={r}
                  className={`btn ${liquidationRatio === r ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => setLiquidationRatio(r)}
                  style={{ minWidth: 52 }}
                >{r}%</button>
              ))}
              <input
                type="number"
                className="input"
                style={{ width: 56 }}
                value={liquidationRatio}
                onChange={e => setLiquidationRatio(Number(e.target.value))}
                min="1"
                max="100"
              />
            </div>
          </div>
        </div>
      </div>

      {/* 仓位列表 */}
      <div className="flex justify-between items-center mb-md">
        <div className="heading-lg">仓位列表 ({positions.length})</div>
        <button className="btn btn-green" onClick={addPosition}>+ 添加仓位</button>
      </div>

      {/* 汇总信息 */}
      {summary.totalUsedMargin > 0 && (
        <div className="card-onyx mb-lg" style={{ background: 'var(--surface-onyx)' }}>
          <div className="flex gap-lg" style={{ flexWrap: 'wrap' }}>
            <div>
              <div className="caption">当前保证金水平</div>
              <div className="heading-sm" style={{
                color: summary.marginLevel > liquidationRatio * 2 ? 'var(--green)'
                  : summary.marginLevel > liquidationRatio ? 'var(--warn)' : 'var(--loss)'
              }}>
                {summary.marginLevel.toFixed(1)}%
              </div>
            </div>
            <div>
              <div className="caption">最大可承受亏损</div>
              <div className="heading-sm" style={{ color: summary.maxLoss > 0 ? 'var(--ink)' : 'var(--loss)' }}>
                {fmt(summary.maxLoss)}
              </div>
            </div>
            {summary.totalTargetPnl !== 0 && (
              <div>
                <div className="caption">总目标盈亏</div>
                <div className="heading-sm" style={{ color: summary.totalTargetPnl >= 0 ? 'var(--green)' : 'var(--loss)' }}>
                  {summary.totalTargetPnl >= 0 ? '+' : ''}{fmt(summary.totalTargetPnl)}
                </div>
              </div>
            )}
            <div style={{ marginLeft: 'auto' }}>
              <div className="caption">剩余可用保证金</div>
              <div className="heading-sm">{fmt(effectiveEquity - summary.totalUsedMargin)}</div>
            </div>
          </div>
        </div>
      )}

      {/* 仓位卡片 - 一行四仓位并列显示 */}
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 'var(--s-md)' }}>
        {positions.map((p, idx) => {
          const disp = getPosDisplay(p)
          if (!disp) return null

          return (
            <div key={p.id} className="card" style={{ padding: 'var(--s-md)' }}>
              <div className="flex justify-between items-center mb-md">
                <span className="heading-sm">#{idx + 1} · {disp.symbol.name}</span>
                <button
                  className="btn-icon"
                  onClick={() => removePosition(p.id)}
                  disabled={positions.length <= 1}
                  style={positions.length <= 1 ? { opacity: 0.3 } : {}}
                >删除</button>
              </div>

              <div className="flex-col gap-md">
                <div>
                  <label className="caption mb-sm" style={{ display: 'block' }}>品种</label>
                  <select className="select" value={p.symbolId} onChange={e => updatePos(p.id, 'symbolId', e.target.value)}>
                    {symbols.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                  <div className="caption mt-sm">
                    合约 {disp.symbol.contract_size} · 1:{disp.symbol.leverage} · {disp.symbol.digits}位
                  </div>
                </div>

                <div>
                  <label className="caption mb-sm" style={{ display: 'block' }}>方向</label>
                  <div className="flex gap-sm">
                    <button
                      className={`btn ${p.direction === 'buy' ? 'btn-green' : 'btn-ghost'}`}
                      onClick={() => updatePos(p.id, 'direction', 'buy')}
                      style={{ flex: 1, padding: 0 }}
                    >买入</button>
                    <button
                      className={`btn ${p.direction === 'sell' ? 'btn-danger' : 'btn-ghost'}`}
                      onClick={() => updatePos(p.id, 'direction', 'sell')}
                      style={{ flex: 1, padding: 0 }}
                    >卖出</button>
                  </div>
                </div>

                <div>
                  <label className="caption mb-sm" style={{ display: 'block' }}>开仓价格</label>
                  <input type="number" className="input" placeholder="0.00" step="0.01"
                    value={p.openPrice} onChange={e => updatePos(p.id, 'openPrice', e.target.value)} />
                </div>

                <div>
                  <label className="caption mb-sm" style={{ display: 'block' }}>手数</label>
                  <input type="number" className="input" placeholder="0.01" step="0.01"
                    value={p.volume} onChange={e => updatePos(p.id, 'volume', e.target.value)} />
                </div>

                <div>
                  <label className="caption mb-sm" style={{ display: 'block' }}>目标价 <span className="text-muted">（可选）</span></label>
                  <input type="number" className="input" placeholder="止盈目标" step="0.01"
                    value={p.targetPrice} onChange={e => updatePos(p.id, 'targetPrice', e.target.value)} />
                </div>

                {disp.incomplete ? (
                  <div className="body-sm text-muted" style={{ padding: 'var(--s-sm)', background: 'var(--surface-onyx)', borderRadius: 'var(--r-sm)', textAlign: 'center' }}>
                    填写开仓价和手数
                  </div>
                ) : (
                  <div className="flex-col gap-sm">
                    <div className="flex justify-between">
                      <span className="caption">已用保证金</span>
                      <span className="heading-sm">{fmt(disp.usedMargin)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="caption">每点价值</span>
                      <span className="heading-sm">{fmt(disp.pipValue)}</span>
                    </div>
                    {disp.liquidationPrice !== null && (
                      <div className="flex justify-between" style={{ background: 'var(--surface-black)', padding: 'var(--s-sm) var(--s-md)', borderRadius: 'var(--r-sm)', margin: 'var(--s-xs) 0' }}>
                        <span className="caption">强平价 ≤{liquidationRatio}%</span>
                        <span className="heading-sm text-loss" style={{ fontSize: 18 }}>
                          {disp.liquidationPrice.toFixed(disp.digits)}
                        </span>
                      </div>
                    )}
                    {disp.targetPnl !== null && (
                      <div className="flex justify-between">
                        <span className="caption">目标盈亏</span>
                        <span className="heading-sm" style={{ color: disp.targetPnl >= 0 ? 'var(--green)' : 'var(--loss)' }}>
                          {disp.targetPnl >= 0 ? '+' : ''}{fmt(disp.targetPnl)}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* 品种设置编辑弹层 */}
      {editingSymbol && (
        <div className="modal-overlay">
          <div className="modal-box" style={{ width: 400 }}>
            <div className="heading-lg mb-md">编辑品种 · {editingSymbol.name}</div>
            <div className="flex-col gap-md">
              <div>
                <label className="caption mb-sm" style={{ display: 'block' }}>合约大小（1 手 = ? 单位）</label>
                <input type="number" className="input" value={editingSymbol.contract_size}
                  onChange={e => setEditingSymbol({ ...editingSymbol, contract_size: e.target.value })} />
              </div>
              <div>
                <label className="caption mb-sm" style={{ display: 'block' }}>杠杆（1:?）</label>
                <input type="number" className="input" value={editingSymbol.leverage}
                  onChange={e => setEditingSymbol({ ...editingSymbol, leverage: e.target.value })} />
              </div>
              <div>
                <label className="caption mb-sm" style={{ display: 'block' }}>价格小数位</label>
                <input type="number" className="input" value={editingSymbol.digits}
                  onChange={e => setEditingSymbol({ ...editingSymbol, digits: e.target.value })} />
              </div>
            </div>
            <div className="flex gap-md mt-lg">
              <button className="btn btn-ghost" onClick={() => setEditingSymbol(null)} style={{ flex: 1 }}>取消</button>
              <button className="btn btn-primary" onClick={handleSaveSymbol} style={{ flex: 1 }}>保存</button>
            </div>
          </div>
        </div>
      )}

      {/* 品种管理入口 */}
      <div className="mt-lg">
        <div className="heading-sm mb-md">品种参数管理</div>
        <div className="flex gap-sm" style={{ flexWrap: 'wrap' }}>
          {symbols.map(s => (
            <button
              key={s.id}
              className="btn btn-ghost"
              onClick={() => setEditingSymbol({ ...s })}
              style={{ fontSize: 12 }}
            >
              {s.name} · {s.contract_size}/{s.leverage}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
