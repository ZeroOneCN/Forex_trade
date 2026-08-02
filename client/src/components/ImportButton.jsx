import { useRef, useState } from 'react'
import { api } from '../api/client'

export default function ImportButton({ onDone, label = '导入 Excel' }) {
  const inputRef = useRef(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [showModal, setShowModal] = useState(false)

  const handleFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const res = await api.importTrades(file)
      setResult(res)
      setShowModal(true)
      onDone?.(res)
    } catch (err) {
      setError(err.message)
      setShowModal(true)
    } finally {
      setLoading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls"
        onChange={handleFile}
        style={{ display: 'none' }}
      />
      <button
        className="btn btn-green"
        disabled={loading}
        onClick={() => inputRef.current?.click()}
      >
        {loading ? <><span className="spinner" style={{ width: 16, height: 16 }} /> 导入中...</> : label}
      </button>

      {/* 导入结果弹窗 */}
      {showModal && (result || error) && (
        <div className="modal-overlay">
          <div className="modal-box" style={{ width: 440 }}>
            <div className="heading-lg mb-md">{error ? '导入失败' : '导入结果'}</div>
            {error && (
              <div className="body-sm text-loss mb-lg" style={{ padding: 'var(--s-md)', background: 'var(--surface-onyx)', borderRadius: 'var(--r-sm)' }}>
                {error}
              </div>
            )}
            {result && (
              <>
                {result.sheets?.map((s, i) => (
                  <div key={i} className="body-sm text-muted mb-sm">
                    Sheet「{s.name}」→ {s.type === 'trade' ? '交易' : s.type === 'capital' ? '资金' : '未知'}（{s.rowCount} 行）
                  </div>
                ))}
                <div style={{ height: 1, background: 'var(--border)', margin: 'var(--s-md) 0' }} />
                {result.trades && (
                  <div className="flex justify-between mb-xs">
                    <span className="text-muted">交易</span>
                    <span className="body-sm">
                      新增 <span className="text-profit">{result.trades.inserted}</span>
                      {' / '}重复 <span className="text-muted">{result.trades.skipped}</span>
                      {' / '}共 {result.trades.total}
                    </span>
                  </div>
                )}
                {result.capital && result.capital.total > 0 && (
                  <div className="flex justify-between mb-xs">
                    <span className="text-muted">资金</span>
                    <span className="body-sm">
                      新增 <span className="text-profit">{result.capital.inserted}</span>
                      {' / '}重复 <span className="text-muted">{result.capital.skipped}</span>
                      {' / '}共 {result.capital.total}
                    </span>
                  </div>
                )}
              </>
            )}
            <div className="flex gap-md mt-lg">
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => setShowModal(false)}>
                确定
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
