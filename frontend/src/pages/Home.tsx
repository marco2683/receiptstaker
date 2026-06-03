import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { listReceipts, ReceiptRecord } from '../services/api'
import type { AddToast } from '../components/Toast'

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

interface Props { addToast: AddToast }

export default function Home({ addToast }: Props) {
  const navigate = useNavigate()
  const [receipts, setReceipts] = useState<ReceiptRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [year, setYear] = useState(new Date().getFullYear())

  useEffect(() => { loadReceipts() }, [])

  async function loadReceipts() {
    try {
      const data = await listReceipts()
      setReceipts(data)
    } catch { /* server offline */ }
    finally { setLoading(false) }
  }

  // Group by month for the selected year
  const monthData = MONTHS.map((name, idx) => {
    const items = receipts.filter(r => {
      const d = new Date(r.date)
      return d.getFullYear() === year && d.getMonth() === idx
    })
    const total = items.reduce((s, r) => s + (r.amount_inc_gst || 0), 0)
    return { name, month: idx, count: items.length, total }
  })

  const yearReceipts = receipts.filter(r => new Date(r.date).getFullYear() === year)
  const yearTotal = yearReceipts.reduce((s, r) => s + (r.amount_inc_gst || 0), 0)
  const now = new Date()

  return (
    <div className="page-enter">
      {/* Year stats */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-value">{yearReceipts.length}</div>
          <div className="stat-label">Receipts ({year})</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">${yearTotal.toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</div>
          <div className="stat-label">Total Spend</div>
        </div>
      </div>

      {/* Year selector */}
      <div className="year-selector">
        <button onClick={() => setYear(y => y - 1)}>‹</button>
        <span className="year-label">{year}</span>
        <button onClick={() => setYear(y => y + 1)} disabled={year >= now.getFullYear()}>›</button>
      </div>

      {/* Month grid */}
      <div className="month-grid">
        {monthData.map(m => {
          const isCurrent = year === now.getFullYear() && m.month === now.getMonth()
          const hasData = m.count > 0
          return (
            <div
              key={m.month}
              className={`month-card ${isCurrent ? 'current' : ''} ${hasData ? 'has-data' : 'empty'}`}
              onClick={() => {
                if (hasData) {
                  navigate(`/history?year=${year}&month=${m.month}`)
                }
              }}
            >
              <div className="month-name">{m.name}</div>
              {hasData ? (
                <>
                  <div className="month-count">{m.count} receipt{m.count !== 1 ? 's' : ''}</div>
                  <div className="month-total">${m.total.toFixed(0)}</div>
                </>
              ) : (
                <div className="month-count">—</div>
              )}
            </div>
          )
        })}
      </div>

      {/* Recent receipts */}
      <p className="section-title">Recent</p>
      {loading ? (
        <div className="empty-state">
          <div className="processing-spinner" style={{ margin: '0 auto' }}></div>
        </div>
      ) : receipts.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🧾</div>
          <h3>No receipts yet</h3>
          <p>Tap the camera button to get started</p>
        </div>
      ) : (
        <div className="receipt-list">
          {receipts.slice(0, 5).map(r => (
            <div key={r.id} className="receipt-item" onClick={() => navigate(`/history?year=${new Date(r.date).getFullYear()}&month=${new Date(r.date).getMonth()}`)}>
              <div className="receipt-icon">🧾</div>
              <div className="receipt-info">
                <div className="receipt-vendor">{r.vendor}</div>
                <div className="receipt-meta">{formatDate(r.date)} · {r.sub_category || r.category}</div>
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
