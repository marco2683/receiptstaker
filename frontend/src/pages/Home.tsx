import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { listReceipts, ReceiptRecord } from '../services/api'
import * as Icon from '../components/Icons'
import type { AddToast } from '../components/Toast'

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

// Parse date string safely without timezone issues
function parseYM(dateStr: string): [number, number] {
  const parts = dateStr.split('T')[0].split('-')
  return [parseInt(parts[0]), parseInt(parts[1]) - 1] // [year, monthIndex]
}

interface Props { addToast: AddToast }

export default function Home({ addToast }: Props) {
  const navigate = useNavigate()
  const [receipts, setReceipts] = useState<ReceiptRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [year, setYear] = useState(new Date().getFullYear())
  const [categoryFilter, setCategoryFilter] = useState<string>('')

  useEffect(() => { loadReceipts() }, [])

  async function loadReceipts() {
    try { setReceipts(await listReceipts()) }
    catch { /* offline */ }
    finally { setLoading(false) }
  }

  // Get unique categories
  const categories = [...new Set(receipts.map(r => r.sub_category || r.category).filter(Boolean))].sort()

  // Apply category filter
  const filtered = categoryFilter
    ? receipts.filter(r => (r.sub_category || r.category) === categoryFilter)
    : receipts

  const now = new Date()
  const nowYear = now.getFullYear()
  const nowMonth = now.getMonth()

  const thisMonthReceipts = filtered.filter(r => {
    const [y, m] = parseYM(r.date)
    return y === nowYear && m === nowMonth
  })
  const thisMonthTotal = thisMonthReceipts.reduce((s, r) => s + (r.amount_inc_gst || 0), 0)
  const thisMonthGst = thisMonthReceipts.reduce((s, r) => s + (r.gst || 0), 0)

  const monthData = MONTHS.map((name, idx) => {
    const items = filtered.filter(r => {
      const [y, m] = parseYM(r.date)
      return y === year && m === idx
    })
    return {
      name, month: idx,
      count: items.length,
      total: items.reduce((s, r) => s + (r.amount_inc_gst || 0), 0)
    }
  })

  return (
    <div className="page-enter home-split">
      {/* TOP — Current month stats */}
      <div className="home-top">
        {/* Filter bar */}
        <div className="filter-bar">
          <select
            className="filter-select"
            value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value)}
          >
            <option value="">All Categories</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        <p className="section-title">{MONTHS[nowMonth]} {nowYear}</p>
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
            <div className="stat-value">{filtered.length}</div>
            <div className="stat-label">All Time</div>
          </div>
        </div>
      </div>

      {/* BOTTOM — Month selector */}
      <div className="home-bottom">
        <div className="year-selector">
          <button onClick={() => setYear(y => y - 1)}>
            <Icon.ChevronLeft size={16} />
          </button>
          <span className="year-label">{year}</span>
          <button onClick={() => setYear(y => y + 1)} disabled={year >= nowYear}>
            <Icon.ChevronRight size={16} />
          </button>
        </div>

        <div className="month-grid">
          {monthData.map(m => {
            const isCurrent = year === nowYear && m.month === nowMonth
            const hasData = m.count > 0
            return (
              <div
                key={m.month}
                className={`month-card ${isCurrent ? 'current' : ''} ${hasData ? 'has-data' : 'empty'}`}
                onClick={() => hasData && navigate(`/history?year=${year}&month=${m.month}${categoryFilter ? `&category=${encodeURIComponent(categoryFilter)}` : ''}`)}
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
