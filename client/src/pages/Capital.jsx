import { useState, useEffect, useCallback } from 'react'
import { api } from '../api/client'
import ImportButton from '../components/ImportButton'
import ConfirmDialog from '../components/ConfirmDialog'
import { useTranslation } from '../i18n/I18nProvider'

const CAPITAL_TYPES = [
  { value: 'deposit', key: 'capital.deposit', sign: 1 },
  { value: 'withdrawal', key: 'capital.withdrawal', sign: -1 },
  { value: 'bonus', key: 'capital.bonus', sign: 1 },
  { value: 'bonus_loss', key: 'capital.bonusLoss', sign: -1 },
  { value: 'bonus_expired', key: 'capital.bonusExpired', sign: -1 },
]

const PAGE_SIZE = 15

export default function Capital() {
  const { t, locale } = useTranslation()
  const [flows, setFlows] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [confirm, setConfirm] = useState(null)
  const [overview, setOverview] = useState(null)
  const [jumpInput, setJumpInput] = useState('')
  const [toast, setToast] = useState(null)

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

  const handleDelete = (id) => {
    setConfirm({
      message: t('capital.confirmDelete'),
      desc: t('capital.confirmDeleteDesc'),
      onConfirm: async () => {
        try {
          await api.deleteCapital(id)
          loadFlows()
        } catch (err) {
          setToast({ type: 'error', message: t('capital.deleteFailed', { msg: err.message }) })
        }
      }
    })
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const fmt = (n) => Number(n).toLocaleString(locale === 'zh-CN' ? 'zh-CN' : 'en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

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

  const typeMeta = (t_val) => {
    const found = CAPITAL_TYPES.find(c => c.value === t_val)
    if (found) {
      return { label: t(found.key), sign: found.sign }
    }
    return { label: t_val, sign: 1 }
  }
  const isPositive = (t_val) => typeMeta(t_val).sign > 0

  return (
    <div className="fade-in">
      {/* 顶部 */}
      <div className="flex justify-between items-center mb-lg">
        <div className="display-md">{t('capital.title')}</div>
        <div className="flex gap-md items-center">
          <a href={api.downloadTemplate()} className="btn btn-ghost">{t('capital.downloadTemplate')}</a>
          <ImportButton onDone={handleImportDone} />
        </div>
      </div>

      {/* 资金汇总卡片 */}
      <div className="grid mb-lg" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
        <div className="stat-card surface enter-stagger" style={{ '--i': 0 }}>
          <div className="stat-label">{t('capital.bonusIn')}</div>
          <div className="stat-value text-profit">{fmt(totalBonus)}</div>
        </div>
        <div className="stat-card surface enter-stagger" style={{ '--i': 1 }}>
          <div className="stat-label">{t('capital.remainingBonus')}</div>
          <div className="stat-value" style={{ color: remainingBonus >= 0 ? 'var(--green)' : 'var(--loss)' }}>
            {fmt(remainingBonus)}
          </div>
        </div>
        <div className="stat-card surface enter-stagger" style={{ '--i': 2 }}>
          <div className="stat-label">{t('capital.totalDeposit')}</div>
          <div className="stat-value text-profit">{fmt(totalDeposit)}</div>
        </div>
        <div className="stat-card surface enter-stagger" style={{ '--i': 3 }}>
          <div className="stat-label">{t('capital.totalWithdrawal')}</div>
          <div className="stat-value text-loss">{fmt(totalWithdrawal)}</div>
        </div>
        <div className="stat-card surface enter-stagger" style={{ '--i': 4 }}>
          <div className="stat-label">{t('capital.netDeposit')}</div>
          <div className="stat-value" style={{ color: netCapital >= 0 ? 'var(--green)' : 'var(--loss)' }}>
            {fmt(netCapital)}
          </div>
        </div>
      </div>

      {/* 资金流水列表 */}
        <div className="card enter-stagger" style={{ '--i': 5, padding: 0, overflow: 'hidden' }}>
          {loading ? (
            <div style={{ padding: 'var(--s-section)', display: 'flex', justifyContent: 'center' }}>
              <div className="spinner" />
            </div>
          ) : flows.length === 0 ? (
            <div className="text-center text-muted" style={{ padding: 'var(--s-section)' }}>
              {t('capital.empty')}
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('capital.date')}</th>
                    <th>{t('capital.type')}</th>
                    <th>{t('capital.amount')}</th>
                    <th>{t('capital.remark')}</th>
                    <th>{t('capital.actions')}</th>
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
                        <td className="text-muted">{f.remark || t('capital.noRemark')}</td>
                        <td>
                          <button className="btn-icon" onClick={() => handleDelete(f.id)}>{t('common.delete')}</button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

      {/* 分页 + 跳转 */}
      {total > 0 && (
        <div className="flex justify-between items-center mt-md">
          <span className="body-sm text-muted">{t('capital.countRecords', { n: total })} · {t('capital.pageInfo', { page, totalPages })}</span>
          <div className="flex gap-sm items-center">
            <button className="btn btn-ghost" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>{t('capital.prevPage')}</button>
            <button className="btn btn-ghost" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>{t('capital.nextPage')}</button>
            <form onSubmit={handleJump} className="flex items-center" style={{ gap: 'var(--s-sm)' }}>
              <span className="text-muted" style={{ fontSize: 13 }}>{t('capital.jumpTo')}</span>
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
              <span className="text-muted" style={{ fontSize: 13 }}>{t('capital.page')}</span>
              <button type="submit" className="btn btn-ghost" style={{ padding: '4px 12px' }}>{t('capital.go')}</button>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog confirm={confirm} onClose={() => setConfirm(null)} />

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
