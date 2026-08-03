import { useState, useEffect, useCallback } from 'react'
import { api } from '../api/client'
import ImportButton from '../components/ImportButton'
import ConfirmDialog from '../components/ConfirmDialog'
import { useTranslation } from '../i18n/I18nProvider'

export default function Trades() {
  const { t, locale } = useTranslation()
  const [trades, setTrades] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const pageSize = 15
  const [filters, setFilters] = useState({ symbol: '', type: '', startDate: '', endDate: '' })
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [symbols, setSymbols] = useState([])
  const [confirm, setConfirm] = useState(null)
  const [pageInput, setPageInput] = useState('')
  const [toast, setToast] = useState(null)

  const loadTrades = useCallback(async () => {
    setLoading(true)
    try {
      const params = { ...filters, search, page, pageSize }
      Object.keys(params).forEach(k => !params[k] && delete params[k])
      const res = await api.getTrades(params)
      setTrades(res.data)
      setTotal(res.total)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [filters, search, page])

  const loadSymbols = async () => {
    try {
      const syms = await api.getSymbols()
      setSymbols(syms)
    } catch (err) {
      console.error(err)
    }
  }

  useEffect(() => { loadTrades() }, [loadTrades])
  useEffect(() => { loadSymbols() }, [])

  const handleImportDone = () => {
    setPage(1)
    loadTrades()
    loadSymbols()
  }

  const handleDelete = (id) => {
    setConfirm({
      message: t('trades.confirmDelete'),
      desc: t('trades.confirmDeleteDesc'),
      onConfirm: async () => {
        try {
          await api.deleteTrade(id)
          loadTrades()
          setToast({ type: 'success', message: t('trades.deleteSuccess') })
        } catch (err) {
          setToast({ type: 'error', message: t('trades.deleteFailed', { msg: err.message }) })
        }
      }
    })
  }

  const handleSearchSubmit = (e) => {
    e.preventDefault()
    setSearch(searchInput)
    setPage(1)
  }

  const handlePageJump = (e) => {
    e.preventDefault()
    const p = Number(pageInput)
    if (p >= 1 && p <= totalPages) {
      setPage(p)
      setPageInput('')
    }
  }

  const totalPages = Math.ceil(total / pageSize)
  const fmt = (n) => Number(n || 0).toLocaleString(locale === 'zh-CN' ? 'zh-CN' : 'en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  return (
    <div className="fade-in">
      <div className="flex justify-between items-center mb-lg">
        <div className="display-md">{t('trades.title')}</div>
        <div className="flex gap-md items-center">
          <a href={api.exportData()} className="btn btn-ghost" download>{t('trades.export')}</a>
          <a href={api.downloadTemplate()} className="btn btn-ghost">{t('trades.downloadTemplate')}</a>
          <ImportButton onDone={handleImportDone} />
        </div>
      </div>

      <div className="flex gap-sm items-center mb-lg" style={{ flexWrap: 'wrap' }}>
        <select className="select" style={{ width: 130 }} value={filters.symbol} onChange={e => { setFilters(f => ({ ...f, symbol: e.target.value })); setPage(1) }}>
          <option value="">{t('trades.allSymbols')}</option>
          {symbols.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
        </select>
        <select className="select" style={{ width: 110 }} value={filters.type} onChange={e => { setFilters(f => ({ ...f, type: e.target.value })); setPage(1) }}>
          <option value="">{t('trades.allTypes')}</option>
          <option value="buy">{t('trades.buy')}</option>
          <option value="sell">{t('trades.sell')}</option>
        </select>
        <input type="date" className="input" style={{ width: 145 }} value={filters.startDate} onChange={e => { setFilters(f => ({ ...f, startDate: e.target.value })); setPage(1) }} />
        <input type="date" className="input" style={{ width: 145 }} value={filters.endDate} onChange={e => { setFilters(f => ({ ...f, endDate: e.target.value })); setPage(1) }} />
        <form onSubmit={handleSearchSubmit} className="flex gap-sm items-center" style={{ flex: '1', minWidth: 220 }}>
          <input
            type="text"
            className="input"
            style={{ flex: '1', minWidth: 180 }}
            placeholder={t('trades.searchPlaceholder')}
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
          />
          <button type="submit" className="btn btn-primary" style={{ whiteSpace: 'nowrap' }}>{t('common.search')}</button>
        </form>
        {search && (
          <span className="body-sm text-muted">
            {t('trades.searchDesc', { kw: search })} · <button onClick={() => { setSearch(''); setSearchInput('') }} style={{ background: 'none', border: 'none', color: 'var(--link)', cursor: 'pointer' }}>{t('trades.searchClear')}</button>
          </span>
        )}
        <button className="btn btn-ghost" onClick={() => { setFilters({ symbol: '', type: '', startDate: '', endDate: '' }); setSearch(''); setSearchInput(''); setPage(1) }}>{t('common.reset')}</button>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden', position: 'relative' }}>
        {loading && trades.length > 0 && (
          <div style={{
            position: 'absolute', inset: 0,
            background: 'var(--surface-indigo)', opacity: 0.5, zIndex: 5,
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <div className="spinner" />
          </div>
        )}
        {loading && trades.length === 0 ? (
          <div style={{ padding: 'var(--s-section)', display: 'flex', justifyContent: 'center' }}>
            <div className="spinner" />
          </div>
        ) : trades.length === 0 ? (
          <div className="text-center text-muted" style={{ padding: 'var(--s-section)' }}>
            {t('trades.empty')}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>{t('trades.date')}</th>
                  <th>{t('trades.symbol')}</th>
                  <th>{t('trades.direction')}</th>
                  <th>{t('trades.openPrice')}</th>
                  <th>{t('trades.closePrice')}</th>
                  <th>{t('trades.volume')}</th>
                  <th>{t('trades.profit')}</th>
                  <th>{t('trades.commission')}</th>
                  <th>{t('trades.swapFee')}</th>
                  <th>{t('trades.holdingTime')}</th>
                  <th>{t('trades.remark')}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {trades.map(trade => (
                  <tr key={trade.id}>
                    <td>{trade.trade_date}</td>
                    <td className="heading-sm">{trade.symbol}</td>
                    <td><span className={`badge ${trade.order_type === 'buy' ? 'badge-buy' : 'badge-sell'}`}>{trade.order_type === 'buy' ? t('trades.buyShort') : t('trades.sellShort')}</span></td>
                    <td>{fmt(trade.open_price)}</td>
                    <td>{fmt(trade.close_price)}</td>
                    <td>{fmt(trade.volume)}</td>
                    <td className={trade.profit >= 0 ? 'text-profit' : 'text-loss'}>{fmt(trade.profit)}</td>
                    <td className="text-muted">{fmt(trade.commission)}</td>
                    <td className="text-muted">{fmt(trade.swap_fee)}</td>
                    <td className="text-muted">{trade.holding_time}</td>
                    <td className="text-muted" style={{ maxWidth: 180, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={trade.remark || ''}>{trade.remark || t('trades.noRemark')}</td>
                    <td>
                      <button className="btn-icon" onClick={() => handleDelete(trade.id)}>{t('trades.delete')}</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {total > 0 && (
        <div className="flex justify-between items-center mt-md">
          <span className="body-sm text-muted">{t('trades.total', { total, page, totalPages })}</span>
          <div className="flex gap-md items-center">
            <button className="btn btn-ghost" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>{t('trades.pagePrev')}</button>
            <form onSubmit={handlePageJump} className="flex items-center" style={{ gap: 'var(--s-sm)' }}>
              <input
                type="number"
                className="input"
                style={{ width: 72, textAlign: 'center' }}
                placeholder={t('trades.pagePlaceholder')}
                value={pageInput}
                onChange={e => setPageInput(e.target.value)}
                min="1"
                max={totalPages}
              />
              <button type="submit" className="btn btn-ghost">{t('trades.pageJump')}</button>
            </form>
            <button className="btn btn-ghost" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>{t('trades.pageNext')}</button>
          </div>
        </div>
      )}

      <ConfirmDialog confirm={confirm} onClose={() => setConfirm(null)} />

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
