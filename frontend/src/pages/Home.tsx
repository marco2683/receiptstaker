import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { listReceipts, ReceiptRecord } from '../services/api'
import type { AddToast } from '../components/Toast'

interface Props { addToast: AddToast }

export default function Home({ addToast }: Props) {
  const navigate = useNavigate()
  const [receipts, setReceipts] = useState<ReceiptRecord[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadReceipts()
  }, [])

  async function loadReceipts() {
    try {
      const data = await listReceipts()
      setReceipts(data)
    } catch {
      // Server might not be running yet — that's OK
    } finally {
      setLoading(false)
    }
  }

  const totalSpend = receipts.reduce((sum, r) => sum + (r.amount_inc_gst || 0), 0)
  const thisMonth = receipts.filter(r => {
    const d = new Date(r.date)
    const now = new Date()
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
  })
  const monthlySpend = thisMonth.reduce((sum, r) => sum + (r.amount_inc_gst || 0), 0)

  return (
    <div className="page-enter">
      {/* Stats */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-value">{receipts.length}</div>
          <div className="stat-label">Total Receipts</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">${totalSpend.toFixed(0)}</div>
          <div className="stat-label">Total Spend</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{thisMonth.length}</div>
          <div className="stat-label">This Month</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">${monthlySpend.toFixed(0)}</div>
          <div className="stat-label">Monthly Spend</div>
        </div>
      </div>

      {/* Quick Actions */}
      <p className="section-title">Quick Actions</p>
      <div className="quick-actions">
        <button className="quick-action" onClick={() => navigate('/scan')} id="quick-scan">
          <span className="action-icon">📸</span>
          <span className="action-label">Scan Receipt</span>
          <span className="action-desc">Take a photo & auto-fill</span>
        </button>
        <button className="quick-action" onClick={() => navigate('/manual')} id="quick-manual">
          <span className="action-icon">✏️</span>
          <span className="action-label">Manual Entry</span>
          <span className="action-desc">Enter details by hand</span>
        </button>
        <button className="quick-action" onClick={() => {
          const apiBase = import.meta.env.VITE_API_URL || '/api'
          window.open(`${apiBase}/spreadsheet/download`, '_blank')
        }} id="quick-download">
          <span className="action-icon">📊</span>
          <span className="action-label">Download Spreadsheet</span>
          <span className="action-desc">Get your Excel file</span>
        </button>
      </div>

      {/* Recent receipts */}
      <p className="section-title">Recent Receipts</p>
      {loading ? (
        <div className="empty-state">
          <div className="processing-spinner" style={{ margin: '0 auto' }}></div>
        </div>
      ) : receipts.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🧾</div>
          <h3>No receipts yet</h3>
          <p>Snap your first receipt to get started!</p>
        </div>
      ) : (
        <div className="receipt-list">
          {receipts.slice(0, 5).map(r => (
            <div key={r.id} className="receipt-item" onClick={() => navigate('/history')}>
              <div className="receipt-icon">🧾</div>
              <div className="receipt-info">
                <div className="receipt-vendor">{r.vendor}</div>
                <div className="receipt-meta">
                  {formatDate(r.date)} · {r.sub_category || r.category}
                </div>
              </div>
              <div className="receipt-amount">${r.amount_inc_gst.toFixed(2)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
}
