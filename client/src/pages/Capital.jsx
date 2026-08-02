import { useState, useEffect, useCallback } from 'react'
import { api } from '../api/client'
import ImportButton from '../components/ImportButton'
import ConfirmDialog from '../components/ConfirmDialog'

const CAPITAL_TYPES = [
  { value: 'deposit', label: '入金', sign: 1 },
  { value: 'withdrawal', label: '出金', sign: -1 },
  { value: 'bonus', label: '赠金', sign: 1 },
  { value: 'bonus_loss', label: '赠金亏损', sign: -1 },
  { value: 'bonus_expired', label: '赠金失效', sign: -1 },
]

const PAGE_SIZE = 15

export default function Capital() {
  const [flows, setFlows] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [confirm, setConfirm] = useState(null)
  const [overview, setOverview] = useState(null)
  const [jumpInput, setJumpInput] = useState('')

  // 新增表单
  const [form, setForm] = useState({ flow_date: '', type: 'deposit', amount: '', remark: '' })

  const loadFlows = useCallback(async () => {
    setLoading(true)
    try {
      const [res, ov] = await Promise.all([
        api.getCapital({ page, pageSize: PAGE_SIZE }),
        api.getOverview()
      ])
      setFlows(res.data)
      setTotal(res.total)
      setOverview(ov)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [page])

  useEffect(() => { loadFlows() }, [loadFlows])

  const handleImportDone = () => {
    setPage(1)
    loadFlows()
  }

  const handleAdd = async (e) => {
    e.preventDefault()
    if (!form.flow_date || !form.amount) {
      alert('请填写日期和金额')
      return
    }
    try {
      const res = await api.addCapital(form)
      if (!res.success) {
        alert(res.message || '记录已存在')
      } else {
        setForm({ flow_date: '', type: 'deposit', amount: '', remark: '' })
        loadFlows()
      }
    } catch (err) {
      alert('添加失败：' + err.message)
    }
  }

  const handleDelete = (id) => {
    setConfirm({
      message: '确认删除此资金记录？',
      desc: '删除后无法恢复，请确认操作。',
      onConfirm: async () => {
        try {
          await api.deleteCapital(id)
          loadFlows()
        } catch (err) {
          alert('删除失败：' + err.message)
        }
      }
    })
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const fmt = (n) => Number(n).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  const handleJump = (e) => {
    e.preventDefault()
    const p = Number(jumpInput)
    if (p >= 1 && p <= totalPages) {
      setPage(p)
      setJumpInput('')
    }
  }

  // 资金汇总
  const totalBonus = overview?.total_bonus || 0
  const remainingBonus = overview?.remaining_bonus || 0
  const totalDeposit = overview?.total_deposit || 0
  const totalWithdrawal = overview?.total_withdrawal || 0
  const netCapital = overview?.net_capital || 0

  const typeMeta = (t) => CAPITAL_TYPES.find(c => c.value === t) || { label: t, sign: 1 }
  const isPositive = (t) => typeMeta(t).sign > 0

  return (
    <div className="fade-in">
      {/* 顶部 */}
      <div className="flex justify-between items-center mb-lg">
        <div className="display-md">资金动态</div>
        <div className="flex gap-md items-center">
          <a href={api.downloadTemplate()} className="btn btn-ghost">下载模板</a>
          <ImportButton onDone={handleImportDone} />
        </div>
      </div>

      {/* 资金汇总卡片 */}
      <div className="grid mb-lg" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
        <div className="stat-card surface">
          <div className="stat-label">体验金入金</div>
          <div className="stat-value text-profit">{fmt(totalBonus)}</div>
        </div>
        <div className="stat-card surface">
          <div className="stat-label">剩余体验金</div>
          <div className="stat-value" style={{ color: remainingBonus >= 0 ? 'var(--green)' : 'var(--loss)' }}>
            {fmt(remainingBonus)}
          </div>
        </div>
        <div className="stat-card surface">
          <div className="stat-label">累计入金</div>
          <div className="stat-value text-profit">{fmt(totalDeposit)}</div>
        </div>
        <div className="stat-card surface">
          <div className="stat-label">累计出金</div>
          <div className="stat-value text-loss">{fmt(totalWithdrawal)}</div>
        </div>
        <div className="stat-card surface">
          <div className="stat-label">净入金</div>
          <div className="stat-value" style={{ color: netCapital >= 0 ? 'var(--green)' : 'var(--loss)' }}>
            {fmt(netCapital)}
          </div>
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: '320px 1fr' }}>
        {/* 左：新增表单 */}
        <div className="card">
          <div className="heading-lg mb-md">新增资金记录</div>
          <form onSubmit={handleAdd} className="flex-col gap-md">
            <div>
              <label className="caption mb-sm" style={{ display: 'block' }}>日期</label>
              <input type="date" className="input" value={form.flow_date}
                onChange={e => setForm(f => ({ ...f, flow_date: e.target.value }))} required />
            </div>
            <div>
              <label className="caption mb-sm" style={{ display: 'block' }}>类型</label>
              <select className="select" value={form.type}
                onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                {CAPITAL_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="caption mb-sm" style={{ display: 'block' }}>金额</label>
              <input type="number" className="input" placeholder="0.00" step="0.01"
                value={form.amount}
                onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} required />
            </div>
            <div>
              <label className="caption mb-sm" style={{ display: 'block' }}>备注</label>
              <input type="text" className="input" placeholder="可选"
                value={form.remark}
                onChange={e => setForm(f => ({ ...f, remark: e.target.value }))} />
            </div>
            <button type="submit" className="btn btn-primary w-full">添加记录</button>
          </form>
        </div>

        {/* 右：资金流水列表 */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {loading ? (
            <div style={{ padding: 'var(--s-section)', display: 'flex', justifyContent: 'center' }}>
              <div className="spinner" />
            </div>
          ) : flows.length === 0 ? (
            <div className="text-center text-muted" style={{ padding: 'var(--s-section)' }}>
              暂无资金记录，可手动添加或导入 Excel
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>日期</th>
                    <th>类型</th>
                    <th>金额</th>
                    <th>备注</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {flows.map(f => {
                    const meta = typeMeta(f.type)
                    const positive = isPositive(f.type)
                    return (
                      <tr key={f.id}>
                        <td>{f.flow_date}</td>
                        <td>
                          <span className={`badge ${positive ? 'badge-buy' : 'badge-sell'}`}>
                            {meta.label}
                          </span>
                        </td>
                        <td className={`${positive ? 'text-profit' : 'text-loss'} heading-sm`}>
                          {positive ? '+' : '-'}{fmt(f.amount)}
                        </td>
                        <td className="text-muted">{f.remark || '—'}</td>
                        <td>
                          <button className="btn-icon" onClick={() => handleDelete(f.id)}>删除</button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* 分页 + 跳转 */}
      {total > 0 && (
        <div className="flex justify-between items-center mt-md">
          <span className="body-sm text-muted">共 {total} 条 · 第 {page}/{totalPages} 页</span>
          <div className="flex gap-sm items-center">
            <button className="btn btn-ghost" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>上一页</button>
            <button className="btn btn-ghost" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>下一页</button>
            <form onSubmit={handleJump} className="flex items-center" style={{ gap: 'var(--s-sm)' }}>
              <span className="text-muted" style={{ fontSize: 13 }}>跳至</span>
              <input
                type="number"
                className="input"
                style={{ width: 60, textAlign: 'center', padding: '4px 8px' }}
                min="1"
                max={totalPages}
                value={jumpInput}
                onChange={e => setJumpInput(e.target.value)}
                placeholder={page}
              />
              <span className="text-muted" style={{ fontSize: 13 }}>页</span>
              <button type="submit" className="btn btn-ghost" style={{ padding: '4px 12px' }}>GO</button>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog confirm={confirm} onClose={() => setConfirm(null)} />
    </div>
  )
}
