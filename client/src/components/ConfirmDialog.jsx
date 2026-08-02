/**
 * 二次确认弹窗
 * 用法：
 *   const [confirm, setConfirm] = useState(null)
 *   <ConfirmDialog confirm={confirm} onClose={() => setConfirm(null)} />
 *   setConfirm({ message: '确认删除？', onConfirm: () => doDelete() })
 */
export default function ConfirmDialog({ confirm, onClose }) {
  if (!confirm) return null

  const { message, onConfirm, confirmText = '确认', cancelText = '取消', danger = true } = confirm

  const handleConfirm = () => {
    onConfirm?.()
    onClose()
  }

  return (
    <div className="modal-overlay">
      <div className="modal-box">
        <div className="heading-lg mb-md">{message}</div>
        <div className="body-sm text-muted mb-lg" style={{ lineHeight: 1.6 }}>
          {confirm.desc || '此操作不可撤销，请确认是否继续。'}
        </div>
        <div className="flex gap-md">
          <button className="btn btn-ghost" style={{ flex: 1 }} onClick={onClose}>
            {cancelText}
          </button>
          <button
            className={danger ? 'btn btn-danger' : 'btn btn-primary'}
            style={{ flex: 1 }}
            onClick={handleConfirm}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}
