import { useState, useEffect, useMemo } from 'react'
import { api } from '../api/client'
import { useTranslation } from '../i18n/I18nProvider'

const LIQUIDATION_PRESETS = [30, 50, 80, 100]

let posIdCounter = 1

function newPos(symbols, defaultSymbolId) {
  return {
    id: posIdCounter++,
    symbolId: defaultSymbolId || symbols[0]?.id || '',
    direction: 'buy',
    openPrice: '',
    volume: '0.01',
    targetPrice: '',
    stopLossPrice: ''
  }
}

export default function Calculator() {
  const { t, locale } = useTranslation()
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
  const [toast, setToast] = useState(null) // { type: 'success' | 'error', message: string }

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
      setToast({ type: 'success', message: t('calculator.saveSuccess') })
    } catch (err) {
      setToast({ type: 'error', message: t('calculator.saveFailed', { msg: err.message }) })
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
        stopLossPnl: null,
        incomplete: true
      }
    }

    const usedMargin = (vol * contractSize * price) / leverage
    const pipValue = vol * contractSize

    // 保证金不足检测
    const insufficientMargin = summary.totalUsedMargin > effectiveEquity

    // 每个仓位的强平价（基于共享净值的最大可承受亏损）
    let liquidationPrice = null
    if (!insufficientMargin) {
      const maxLoss = effectiveEquity - summary.totalUsedMargin * (liquidationRatio / 100)
      if (p.direction === 'buy') {
        liquidationPrice = price - maxLoss / pipValue
      } else {
        liquidationPrice = price + maxLoss / pipValue
      }
      // 截断浮点精度到品种小数位
      liquidationPrice = Number(liquidationPrice.toFixed(digits))
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

    let stopLossPnl = null
    if (p.stopLossPrice) {
      const sl = Number(p.stopLossPrice)
      if (sl) {
        stopLossPnl = p.direction === 'buy'
          ? (sl - price) * pipValue
          : (price - sl) * pipValue
      }
    }

    return { symbol: sym, digits, usedMargin, pipValue, liquidationPrice, targetPnl, stopLossPnl, incomplete: false, insufficientMargin, price, vol }
  }

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--s-section)' }}><div className="spinner" /></div>
  }

  const fmt = (n) => Number(n).toLocaleString(locale === 'zh-CN' ? 'zh-CN' : 'en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  return (
    <div className="fade-in">
      <div className="display-md mb-lg">{t('calculator.title')}</div>

      {/* 实时净值 + 可覆盖 */}
      <div className="grid mb-lg" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
        <div className="stat-card surface">
          <div className="stat-label">{t('calculator.realEquity')}</div>
          <div className="stat-value" style={{ color: realEquity >= 0 ? 'var(--green)' : 'var(--loss)' }}>{fmt(realEquity)}</div>
        </div>
        <div className="stat-card surface">
          <div className="stat-label">{t('calculator.calcEquity')} {equityOverride && equityOverride !== String(realEquity) ? t('calculator.calcOverride') : ''}</div>
          <div className="stat-value" style={{ color: effectiveEquity >= 0 ? 'var(--green)' : 'var(--loss)' }}>{fmt(effectiveEquity)}</div>
        </div>
        <div className="stat-card surface">
          <div className="stat-label">{t('calculator.totalUsedMargin')}</div>
          <div className="stat-value">{fmt(summary.totalUsedMargin)}</div>
        </div>
      </div>

      {/* 共享设置 */}
      <div className="card mb-lg">
        <div className="heading-lg mb-md">{t('calculator.sharedSettings')}</div>
        <div className="flex gap-md" style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}>
          {/* 默认品种 */}
          <div style={{ flex: '0 0 auto', minWidth: 140 }}>
            <label className="caption mb-sm" style={{ display: 'block' }}>{t('calculator.defaultSymbol')}</label>
            <select className="select" value={defaultSymbolId || ''} onChange={e => setDefaultSymbol(Number(e.target.value))}>
              {symbols.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          {/* 净值覆盖 */}
          <div style={{ flex: '0 0 auto' }}>
            <label className="caption mb-sm" style={{ display: 'block' }}>
              {t('calculator.calcEquityHint')} <span className="text-muted">{t('calculator.calcEquitySub')}</span>
            </label>
            <input type="number" className="input" style={{ width: 140 }} placeholder={fmt(realEquity)} step="100"
              value={equityOverride} onChange={e => setEquityOverride(e.target.value)} />
          </div>
          {/* 强平比例 */}
          <div style={{ flex: '1 1 auto', minWidth: 200 }}>
            <label className="caption mb-sm" style={{ display: 'block' }}>{t('calculator.liquidationRatio')}</label>
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
        <div className="heading-lg">{t('calculator.positionList', { n: positions.length })}</div>
        <button className="btn btn-green" onClick={addPosition}>+ {t('calculator.addPosition')}</button>
      </div>

      {/* 汇总信息 */}
      {summary.totalUsedMargin > 0 && (
        <div className="card-onyx mb-lg" style={{ background: 'var(--surface-onyx)' }}>
          {summary.totalUsedMargin > effectiveEquity && (
            <div className="body-sm" style={{ color: 'var(--loss)', marginBottom: 'var(--s-sm)', padding: 'var(--s-sm) var(--s-md)', background: 'var(--surface-black)', borderRadius: 'var(--r-sm)' }}>
              {t('calculator.insufficientMarginDesc', { margin: fmt(summary.totalUsedMargin), equity: fmt(effectiveEquity) })}
            </div>
          )}
          <div className="flex gap-lg" style={{ flexWrap: 'wrap' }}>
            <div>
              <div className="caption">{t('calculator.marginLevel')}</div>
              <div className="heading-sm" style={{
                color: summary.marginLevel > liquidationRatio * 2 ? 'var(--green)'
                  : summary.marginLevel > liquidationRatio ? 'var(--warn)' : 'var(--loss)'
              }}>
                {summary.marginLevel.toFixed(1)}%
              </div>
            </div>
            <div>
              <div className="caption">{t('calculator.maxLoss')}</div>
              <div className="heading-sm" style={{ color: summary.maxLoss > 0 ? 'var(--ink)' : 'var(--loss)' }}>
                {fmt(summary.maxLoss)}
              </div>
            </div>
            {summary.totalTargetPnl !== 0 && (
              <div>
                <div className="caption">{t('calculator.totalTargetPnl')}</div>
                <div className="heading-sm" style={{ color: summary.totalTargetPnl >= 0 ? 'var(--green)' : 'var(--loss)' }}>
                  {summary.totalTargetPnl >= 0 ? '+' : ''}{fmt(summary.totalTargetPnl)}
                </div>
              </div>
            )}
            <div style={{ marginLeft: 'auto' }}>
              <div className="caption">{t('calculator.availableMargin')}</div>
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
                <span className="heading-sm">{t('calculator.positionNo', { n: idx + 1 })} · {disp.symbol.name}</span>
                <button
                  className="btn-icon"
                  onClick={() => removePosition(p.id)}
                  disabled={positions.length <= 1}
                  style={positions.length <= 1 ? { opacity: 0.3 } : {}}
                >{t('common.delete')}</button>
              </div>

              <div className="flex-col gap-md">
                <div>
                  <div className="flex justify-between items-center mb-sm">
                    <label className="caption">{t('calculator.symbol')}</label>
                    <span className="caption text-muted">
                      {t('calculator.contractInfo', { size: disp.symbol.contract_size, lev: disp.symbol.leverage, digits: disp.symbol.digits })}
                    </span>
                  </div>
                  <select className="select" value={p.symbolId} onChange={e => updatePos(p.id, 'symbolId', e.target.value)}>
                    {symbols.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>

                <div>
                  <label className="caption mb-sm" style={{ display: 'block' }}>{t('calculator.direction')}</label>
                  <div className="flex gap-sm">
                    <button
                      className={`btn ${p.direction === 'buy' ? 'btn-green' : 'btn-ghost'}`}
                      onClick={() => updatePos(p.id, 'direction', 'buy')}
                      style={{ flex: 1, padding: 0 }}
                    >{t('calculator.buy')}</button>
                    <button
                      className={`btn ${p.direction === 'sell' ? 'btn-danger' : 'btn-ghost'}`}
                      onClick={() => updatePos(p.id, 'direction', 'sell')}
                      style={{ flex: 1, padding: 0 }}
                    >{t('calculator.sell')}</button>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--s-sm)' }}>
                  <div>
                    <label className="caption mb-sm" style={{ display: 'block' }}>{t('calculator.openPrice')}</label>
                    <input type="number" className="input" placeholder="0.00" step="0.01"
                      value={p.openPrice} onChange={e => updatePos(p.id, 'openPrice', e.target.value)} />
                  </div>
                  <div>
                    <label className="caption mb-sm" style={{ display: 'block' }}>{t('calculator.volume')}</label>
                    <input type="number" className="input" placeholder="0.01" step="0.01"
                      value={p.volume} onChange={e => updatePos(p.id, 'volume', e.target.value)} />
                  </div>
                </div>

                <div>
                  <label className="caption mb-sm" style={{ display: 'block' }}>{t('calculator.targetPrice')} <span className="text-muted">{t('calculator.targetPriceOptional')}</span></label>
                  <input type="number" className="input" placeholder={t('calculator.targetPricePlaceholder')} step="0.01"
                    value={p.targetPrice} onChange={e => updatePos(p.id, 'targetPrice', e.target.value)} />
                </div>
                <div>
                  <label className="caption mb-sm" style={{ display: 'block' }}>{t('calculator.stopLossPrice')} <span className="text-muted">{t('calculator.stopLossPriceOptional')}</span></label>
                  <input type="number" className="input" placeholder={t('calculator.stopLossPricePlaceholder')} step="0.01"
                    value={p.stopLossPrice} onChange={e => updatePos(p.id, 'stopLossPrice', e.target.value)} />
                </div>

                {disp.incomplete ? (
                  <div className="body-sm text-muted" style={{ padding: 'var(--s-sm)', background: 'var(--surface-onyx)', borderRadius: 'var(--r-sm)', textAlign: 'center' }}>
                    {t('calculator.fillHint')}
                  </div>
                ) : (
                  <div className="flex-col gap-sm">
                    <div className="flex justify-between">
                      <span className="caption">{t('calculator.usedMargin')}</span>
                      <span className="heading-sm">{fmt(disp.usedMargin)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="caption">{t('calculator.pipValue')}</span>
                      <span className="heading-sm">{fmt(disp.pipValue)}</span>
                    </div>
                    {disp.insufficientMargin ? (
                      <div className="body-sm" style={{ color: 'var(--loss)', padding: 'var(--s-sm) var(--s-md)', background: 'var(--surface-black)', borderRadius: 'var(--r-sm)', textAlign: 'center' }}>
                        {t('calculator.insufficientMargin')}
                      </div>
                    ) : disp.liquidationPrice !== null && (
                      <div className="flex justify-between" style={{ background: 'var(--surface-black)', padding: 'var(--s-sm) var(--s-md)', borderRadius: 'var(--r-sm)', margin: 'var(--s-xs) 0' }}>
                        <span className="caption">{t('calculator.liquidationPrice', { ratio: liquidationRatio })}</span>
                        <span className="heading-sm text-loss" style={{ fontSize: 18 }}>
                          {disp.liquidationPrice.toFixed(disp.digits)}
                        </span>
                      </div>
                    )}
                    {disp.targetPnl !== null && (
                      <div className="flex justify-between">
                        <span className="caption">{t('calculator.targetPnl')}</span>
                        <span className="heading-sm" style={{ color: disp.targetPnl >= 0 ? 'var(--green)' : 'var(--loss)' }}>
                          {disp.targetPnl >= 0 ? '+' : ''}{fmt(disp.targetPnl)}
                        </span>
                      </div>
                    )}
                    {disp.stopLossPnl !== null && (
                      <div className="flex justify-between">
                        <span className="caption">{t('calculator.stopLossPnl')}</span>
                        <span className="heading-sm" style={{ color: disp.stopLossPnl >= 0 ? 'var(--green)' : 'var(--loss)' }}>
                          {disp.stopLossPnl >= 0 ? '+' : ''}{fmt(disp.stopLossPnl)}
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
            <div className="heading-lg mb-md">{t('calculator.editSymbol', { name: editingSymbol.name })}</div>
            <div className="flex-col gap-md">
              <div>
                <label className="caption mb-sm" style={{ display: 'block' }}>{t('calculator.contractSize')}</label>
                <input type="number" className="input" value={editingSymbol.contract_size}
                  onChange={e => setEditingSymbol({ ...editingSymbol, contract_size: e.target.value })} />
              </div>
              <div>
                <label className="caption mb-sm" style={{ display: 'block' }}>{t('calculator.leverage')}</label>
                <input type="number" className="input" value={editingSymbol.leverage}
                  onChange={e => setEditingSymbol({ ...editingSymbol, leverage: e.target.value })} />
              </div>
              <div>
                <label className="caption mb-sm" style={{ display: 'block' }}>{t('calculator.digits')}</label>
                <input type="number" className="input" value={editingSymbol.digits}
                  onChange={e => setEditingSymbol({ ...editingSymbol, digits: e.target.value })} />
              </div>
            </div>
            <div className="flex gap-md mt-lg">
              <button className="btn btn-ghost" onClick={() => setEditingSymbol(null)} style={{ flex: 1 }}>{t('common.cancel')}</button>
              <button className="btn btn-primary" onClick={handleSaveSymbol} style={{ flex: 1 }}>{t('common.save')}</button>
            </div>
          </div>
        </div>
      )}

      {/* 品种管理入口 */}
      <div className="mt-lg">
        <div className="heading-sm mb-md">{t('calculator.symbolParams')}</div>
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

      {/* 主题提示弹窗（成功/失败） */}
      {toast && (
        <div className="modal-overlay">
          <div className="modal-box" style={{ width: 380 }}>
            <div className="heading-lg mb-md">{toast.type === 'success' ? t('common.success') : t('common.failed')}</div>
            <div className="body-sm text-muted mb-lg" style={{ lineHeight: 1.6 }}>
              {toast.message}
            </div>
            <div className="flex gap-md">
              <button
                className={toast.type === 'success' ? 'btn btn-primary' : 'btn btn-danger'}
                style={{ flex: 1 }}
                onClick={() => setToast(null)}
              >
                {t('common.close')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
