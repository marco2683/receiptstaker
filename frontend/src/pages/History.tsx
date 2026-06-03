import { useEffect, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { listReceipts, ReceiptRecord } from '../services/api'
import * as Icon from '../components/Icons'
import type { AddToast } from '../components/Toast'

const MONTHS_FULL = ['January','February','March','April','May','June','July','August','September','October','November','December']

function parseYM(dateStr: string): [number, number] {
  const parts = dateStr.split('T')[0].split('-')
  return [parseInt(parts[0]), parseInt(parts[1]) - 1]
}

interface Props { addToast: AddToast }

export default function History({ addToast }: Props) {
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const [allReceipts, setAllReceipts] = useState<ReceiptRecord[]>([])
  const [loading, setLoading] = useState(true)

  const filterYear = searchParams.get('year') ? Number(searchParams.get('year')) : null
  const filterMonth = searchParams.get('month') !== null ? Number(searchParams.get('month')) : null
  const filterCategory = searchParams.get('category') || ''

  useEffect(() => {
    listReceipts().then(setAllReceipts).catch(() => {}).finally(() => setLoading(false))
  }, [])

  // Get unique categories from all data
  const categories = [...new Set(allReceipts.map(r => r.sub_category || r.category).filter(Boolean))].sort()

  // Apply all filters
  const filtered = allReceipts.filter(r => {
    const [y, m] = parseYM(r.date)
    if (filterYear !== null && y !== filterYear) return false
    if (filterMonth !== null && m !== filterMonth) return false
    if (filterCategory && (r.sub_category || r.category) !== filterCategory) return false
    return true
  }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  const total = filtered.reduce((s, r) => s + (r.amount_inc_gst || 0), 0)
  const totalGst = filtered.reduce((s, r) => s + (r.gst || 0), 0)
  const uniqueVendors = new Set(filtered.map(r => r.vendor)).size

  const periodLabel = filterYear !== null && filterMonth !== null
    ? `${MONTHS_FULL[filterMonth]} ${filterYear}`
    : filterYear !== null ? `${filterYear}` : 'All Time'

  function updateFilter(key: string, value: string) {
    const params = new URLSearchParams(searchParams)
    if (value) params.set(key, value)
    else params.delete(key)
    setSearchParams(params)
  }

  function exportCSV() {
    if (!filtered.length) return
    const headers = ['Date','Vendor','Description','Category','Sub Category','Amount (inc GST)','GST','Business %','Notes']
    const rows = filtered.map(r => [
      r.date, `"${r.vendor}"`, `"${r.description}"`, r.category, r.sub_category,
      r.amount_inc_gst.toFixed(2), (r.gst || 0).toFixed(2),
      ((r.business_pct || 0) * 100).toFixed(0) + '%',
      `"${(r.notes || '').replace(/"/g, '""')}"`
    ])
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `receipts_${periodLabel.replace(/\s/g, '_')}.csv`; a.click()
    URL.revokeObjectURL(url)
    addToast('success', `Exported ${filtered.length} receipts`)
  }

  function emailCSV() {
    if (!filtered.length) return
    const subject = `Receipts — ${periodLabel}`
    const body = filtered.map(r =>
      `${r.date} | ${r.vendor} | $${r.amount_inc_gst.toFixed(2)} | ${r.sub_category || r.category}`
    ).join('%0A')
    window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${body}`
    addToast('info', 'Opening email...')
  }

  // Build unique years from data
  const years = [...new Set(allReceipts.map(r => parseYM(r.date)[0]))].sort((a, b) => b - a)

  return (
    <div className="page-enter">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
        <button className="btn btn-ghost" onClick={() => navigate('/')} style={{ padding: '4px' }}>
          <Icon.ArrowLeft size={20} />
        </button>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 700, flex: 1 }}>{periodLabel}</h2>
      </div>

      {/* Filters */}
      <div className="filter-bar" style={{ marginBottom: '14px' }}>
        <select
          className="filter-select"
          value={filterYear !== null && filterMonth !== null ? `${filterYear}-${filterMonth}` : filterYear !== null ? `${filterYear}` : ''}
          onChange={e => {
            const val = e.target.value
            const params = new URLSearchParams(searchParams)
            if (!val) {
              params.delete('year'); params.delete('month')
            } else if (val.includes('-')) {
              const [y, m] = val.split('-')
              params.set('year', y); params.set('month', m)
            } else {
              params.set('year', val); params.delete('month')
            }
            setSearchParams(params)
          }}
        >
          <option value="">All Dates</option>
          {years.map(y => (
            <optgroup key={y} label={String(y)}>
              {MONTHS_FULL.map((mName, mIdx) => {
                const count = allReceipts.filter(r => { const [ry, rm] = parseYM(r.date); return ry === y && rm === mIdx }).length
                if (!count) return null
                return <option key={`${y}-${mIdx}`} value={`${y}-${mIdx}`}>{mName} {y} ({count})</option>
              })}
            </optgroup>
          ))}
        </select>
        <select
          className="filter-select"
          value={filterCategory}
          onChange={e => updateFilter('category', e.target.value)}
        >
          <option value="">All Categories</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="empty-state"><div className="processing-spinner" style={{ margin: '0 auto' }}></div></div>
      ) : !filtered.length ? (
        <div className="empty-state">
          <div className="empty-icon"><Icon.Receipt size={48} /></div>
          <h3>No receipts</h3>
          <p>No receipts match the current filters</p>
        </div>
      ) : (
        <>
          {/* Totals */}
          <div className="history-totals">
            <div className="totals-row">
              <span className="label">Receipts</span>
              <span className="value">{filtered.length}</span>
            </div>
            <div className="totals-row">
              <span className="label">Vendors</span>
              <span className="value">{uniqueVendors}</span>
            </div>
            <div className="totals-row">
              <span className="label">GST Claimed</span>
              <span className="value">${totalGst.toFixed(2)}</span>
            </div>
            <div className="totals-row grand">
              <span className="label">Total (inc GST)</span>
              <span className="value">${total.toFixed(2)}</span>
            </div>
          </div>

          {/* Receipt list */}
          <p className="section-title">{filtered.length} receipt{filtered.length !== 1 ? 's' : ''}</p>
          <div className="receipt-list">
            {filtered.map(r => (
              <div key={r.id} className={`receipt-item ${r.notes?.includes('LOW CONFIDENCE') ? 'needs-review' : ''}`}>
                <div className="receipt-icon"><Icon.Receipt size={18} /></div>
                <div className="receipt-info">
                  <div className="receipt-vendor">{r.vendor}</div>
                  <div className="receipt-meta">{formatDate(r.date)} · {r.sub_category || r.category}</div>
                </div>
                <div className="receipt-amount">${r.amount_inc_gst.toFixed(2)}</div>
              </div>
            ))}
          </div>

          {/* Export */}
          <div className="history-actions">
            <button className="btn btn-primary" onClick={exportCSV}>
              <Icon.Download size={16} /> Export CSV
            </button>
            <button className="btn btn-secondary" onClick={emailCSV}>
              <Icon.Mail size={16} /> Email
            </button>
          </div>
        </>
      )}
    </div>
  )
}

function formatDate(dateStr: string): string {
  const parts = dateStr.split('T')[0].split('-')
  const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]))
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
}
