import { useEffect, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { listReceipts, ReceiptRecord } from '../services/api'
import * as Icon from '../components/Icons'
import type { AddToast } from '../components/Toast'

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

interface Props { addToast: AddToast }

export default function History({ addToast }: Props) {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [allReceipts, setAllReceipts] = useState<ReceiptRecord[]>([])
  const [loading, setLoading] = useState(true)

  const filterYear = searchParams.get('year') ? Number(searchParams.get('year')) : null
  const filterMonth = searchParams.get('month') !== null ? Number(searchParams.get('month')) : null

  useEffect(() => {
    listReceipts().then(setAllReceipts).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const filtered = allReceipts.filter(r => {
    const d = new Date(r.date)
    if (filterYear !== null && d.getFullYear() !== filterYear) return false
    if (filterMonth !== null && d.getMonth() !== filterMonth) return false
    return true
  }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  const total = filtered.reduce((s, r) => s + (r.amount_inc_gst || 0), 0)
  const totalGst = filtered.reduce((s, r) => s + (r.gst || 0), 0)
  const uniqueVendors = new Set(filtered.map(r => r.vendor)).size

  const periodLabel = filterYear !== null && filterMonth !== null
    ? `${MONTHS[filterMonth]} ${filterYear}`
    : filterYear !== null ? `${filterYear}` : 'All Time'

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

  return (
    <div className="page-enter">
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
        {(filterYear !== null || filterMonth !== null) && (
          <button className="btn btn-ghost" onClick={() => navigate('/')} style={{ padding: '4px' }}>
            <Icon.ArrowLeft size={20} />
          </button>
        )}
        <h2 style={{ fontSize: '1.1rem', fontWeight: 700 }}>{periodLabel}</h2>
      </div>

      {loading ? (
        <div className="empty-state"><div className="processing-spinner" style={{ margin: '0 auto' }}></div></div>
      ) : !filtered.length ? (
        <div className="empty-state">
          <div className="empty-icon"><Icon.Receipt size={48} /></div>
          <h3>No receipts</h3>
          <p>No receipts found for {periodLabel}</p>
        </div>
      ) : (
        <>
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
  return new Date(dateStr).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
}
