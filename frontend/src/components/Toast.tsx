export interface ToastData {
  id: string
  type: 'success' | 'error' | 'info'
  message: string
}

interface Props {
  toasts: ToastData[]
}

const icons: Record<string, string> = {
  success: '✅',
  error: '❌',
  info: 'ℹ️',
}

export default function Toast({ toasts }: Props) {
  if (toasts.length === 0) return null

  return (
    <div className="toast-container">
      {toasts.map(toast => (
        <div key={toast.id} className={`toast ${toast.type}`}>
          <span className="toast-icon">{icons[toast.type]}</span>
          <span className="toast-message">{toast.message}</span>
        </div>
      ))}
    </div>
  )
}

export type AddToast = (type: 'success' | 'error' | 'info', message: string) => void
