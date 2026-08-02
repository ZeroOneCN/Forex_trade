import { useState, useEffect, useCallback } from 'react'
import { api } from '../api/client'
import ImportButton from '../components/ImportButton'
import ConfirmDialog from '../components/ConfirmDialog'

export default function Trades() {
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
      message: '确认删除此交易记录？',
      desc: '删除后无法恢复，请确认操作。',
      onConfirm: async () => {
        try {
          await api.deleteTrade(id)
          loadTrades()
        } catch (err) {
          alert('删除失败：' + err.message)
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
  const fmt = (n) => Number(n || 0).toFixed(2)

  return (
    <div className="fade-in">
      {/* 顶部操作栏 */}
      <div className="flex justify-between items-center mb-lg">
        <div className="display-md">交易动态</div>
        <div className="flex gap-md items-center">
          <a href={api.downloadTemplate()} className="btn btn-ghost">下载模板</a>
          <ImportButton onDone={handleImportDone} />
        </div>
      </div>

      {/* 筛选 + 搜索 并列一行 */}
      <div className="flex gap-sm items-center mb-lg" style={{ flexWrap: 'wrap' }}>
        <select className="select" style={{ width: 130 }} value={filters.symbol} onChange={e => { setFilters(f => ({ ...f, symbol: e.target.value })); setPage(1) }}>
          <option value="">全部品种</option>
          {symbols.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
        </select>
        <select className="select" style={{ width: 110 }} value={filters.type} onChange={e => { setFilters(f => ({ ...f, type: e.target.value })); setPage(1) }}>
          <option value="">全部方向</option>
          <option value="buy">买入</option>
          <option value="sell">卖出</option>
        </select>
        <input type="date" className="input" style={{ width: 145 }} value={filters.startDate} onChange={e => { setFilters(f => ({ ...f, startDate: e.target.value })); setPage(1) }} />
        <input type="date" className="input" style={{ width: 145 }} value={filters.endDate} onChange={e => { setFilters(f => ({ ...f, endDate: e.target.value })); setPage(1) }} />
        {/* 搜索框与筛选并列 */}
        <form onSubmit={handleSearchSubmit} className="flex gap-sm items-center" style={{ flex: '1', minWidth: 220 }}>
          <input
            type="text"
            className="input"
            style={{ flex: '1', minWidth: 180 }}
            placeholder="搜索品种、备注、盈亏、仓位ID..."
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
          />
          <button type="submit" className="btn btn-primary" style={{ whiteSpace: 'nowrap' }}>搜索</button>
        </form>
        {search && (
          <span className="body-sm text-muted">
            「{search}」· <button onClick={() => { setSearch(''); setSearchInput('') }} style={{ background: 'none', border: 'none', color: 'var(--link)', cursor: 'pointer' }}>清除</button>
          </span>
        )}
        <button className="btn btn-ghost" onClick={() => { setFilters({ symbol: '', type: '', startDate: '', endDate: '' }); setSearch(''); setSearchInput(''); setPage(1) }}>重置</button>
      </div>

      {/* 交易表格：添加备注列，移除净盈亏列 */}
      <div className="card" style={{ padding: 0, overflow: 'hidden', position: 'relative' }}>
        {/* 加载遮罩（保留旧数据，避免抖动） */}
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
            暂无交易记录，点击右上角导入
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>日期</th>
                  <th>品种</th>
                  <th>方向</th>
                  <th>开仓价</th>
                  <th>平仓价</th>
                  <th>手数</th>
                  <th>盈亏</th>
                  <th>手续费</th>
                  <th>隔夜费</th>
                  <th>持仓</th>
                  <th>备注</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {trades.map(t => (
                  <tr key={t.id}>
                    <td>{t.trade_date}</td>
                    <td className="heading-sm">{t.symbol}</td>
                    <td><span className={`badge ${t.order_type === 'buy' ? 'badge-buy' : 'badge-sell'}`}>{t.order_type === 'buy' ? '买' : '卖'}</span></td>
                    <td>{fmt(t.open_price)}</td>
                    <td>{fmt(t.close_price)}</td>
                    <td>{fmt(t.volume)}</td>
                    <td className={t.profit >= 0 ? 'text-profit' : 'text-loss'}>{fmt(t.profit)}</td>
                    <td className="text-muted">{fmt(t.commission)}</td>
                    <td className="text-muted">{fmt(t.swap_fee)}</td>
                    <td className="text-muted">{t.holding_time}</td>
                    <td className="text-muted" style={{ maxWidth: 180, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={t.remark || ''}>{t.remark || '—'}</td>
                    <td>
                      <button className="btn-icon" onClick={() => handleDelete(t.id)}>删除</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 分页 + 页码跳转 */}
      {total > 0 && (
        <div className="flex justify-between items-center mt-md">
          <span className="body-sm text-muted">共 {total} 条 · 第 {page}/{totalPages} 页</span>
          <div className="flex gap-md items-center">
            <button className="btn btn-ghost" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>上一页</button>
            {/* 页码跳转：加大间距 */}
            <form onSubmit={handlePageJump} className="flex items-center" style={{ gap: 'var(--s-sm)' }}>
              <input
                type="number"
                className="input"
                style={{ width: 72, textAlign: 'center' }}
                placeholder={String(page)}
                value={pageInput}
                onChange={e => setPageInput(e.target.value)}
                min="1"
                max={totalPages}
              />
              <button type="submit" className="btn btn-ghost">跳转</button>
            </form>
            <button className="btn btn-ghost" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>下一页</button>
          </div>
        </div>
      )}

      <ConfirmDialog confirm={confirm} onClose={() => setConfirm(null)} />
    </div>
  )
}
