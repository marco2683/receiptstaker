import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { listReceipts, ReceiptRecord } from '../services/api'
import * as Icon from '../components/Icons'
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
    try { setReceipts(await listReceipts()) }
    catch { /* offline */ }
    finally { setLoading(false) }
  }

  const now = new Date()
  const thisMonthReceipts = receipts.filter(r => {
    const d = new Date(r.date)
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
  })
  const thisMonthTotal = thisMonthReceipts.reduce((s, r) => s + (r.amount_inc_gst || 0), 0)
  const thisMonthGst = thisMonthReceipts.reduce((s, r) => s + (r.gst || 0), 0)

  const monthData = MONTHS.map((name, idx) => {
    const items = receipts.filter(r => {
      const d = new Date(r.date)
      return d.getFullYear() === year && d.getMonth() === idx
    })
    return { name, month: idx, count: items.length, total: items.reduce((s, r) => s + (r.amount_inc_gst || 0), 0) }
  })

  return (
    <div className="page-enter home-split">
      {/* TOP 50% — Current month stats */}
      <div className="home-top">
        <p className="section-title">{MONTHS[now.getMonth()]} {now.getFullYear()}</p>
        <div className="stats-grid">
          <div className="stat-card highlight">
            <div className="stat-value">${thisMonthTotal.toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</div>
            <div className="stat-label">This Month</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{thisMonthReceipts.length}</div>
            <div className="stat-label">Receipts</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">${thisMonthGst.toFixed(0)}</div>
            <div className="stat-label">GST Claimed</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{receipts.length}</div>
            <div className="stat-label">All Time</div>
          </div>
        </div>
      </div>

      {/* BOTTOM 50% — Month selector */}
      <div className="home-bottom">
        <div className="year-selector">
          <button onClick={() => setYear(y => y - 1)}>
            <Icon.ChevronLeft size={16} />
          </button>
          <span className="year-label">{year}</span>
          <button onClick={() => setYear(y => y + 1)} disabled={year >= now.getFullYear()}>
            <Icon.ChevronRight size={16} />
          </button>
        </div>

        <div className="month-grid">
          {monthData.map(m => {
            const isCurrent = year === now.getFullYear() && m.month === now.getMonth()
            const hasData = m.count > 0
            return (
              <div
                key={m.month}
                className={`month-card ${isCurrent ? 'current' : ''} ${hasData ? 'has-data' : 'empty'}`}
                onClick={() => hasData && navigate(`/history?year=${year}&month=${m.month}`)}
              >
                <div className="month-name">{m.name}</div>
                {hasData ? (
                  <>
                    <div className="month-count">{m.count}</div>
                    <div className="month-total">${m.total.toFixed(0)}</div>
                  </>
                ) : (
                  <div className="month-count">—</div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
