import { useEffect, useState } from 'react'
import { listReceipts, deleteReceipt, getReceiptImageUrl, ReceiptRecord } from '../services/api'
import type { AddToast } from '../components/Toast'

interface Props { addToast: AddToast }

export default function History({ addToast }: Props) {
  const [receipts, setReceipts] = useState<ReceiptRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<ReceiptRecord | null>(null)

  useEffect(() => { load() }, [])

  async function load() {
    try {
      const data = await listReceipts()
      setReceipts(data)
    } catch {
      addToast('error', 'Failed to load receipts')
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this receipt?')) return
    try {
      await deleteReceipt(id)
      setReceipts(prev => prev.filter(r => r.id !== id))
      setSelected(null)
      addToast('success', 'Receipt deleted')
    } catch {
      addToast('error', 'Failed to delete')
    }
  }

  function formatDate(d: string): string {
    return new Date(d).toLocaleDateString('en-AU', {
      day: 'numeric', month: 'short', year: 'numeric'
    })
  }

  if (loading) {
    return (
      <div className="page-enter">
        <div className="empty-state">
          <div className="processing-spinner" style={{ margin: '0 auto' }}></div>
        </div>
      </div>
    )
  }

  // Detail view
  if (selected) {
    return (
      <div className="page-enter">
        <button className="btn btn-ghost" onClick={() => setSelected(null)}
          style={{ marginBottom: '12px' }} id="btn-back">
          ← Back to list
        </button>

        <div className="card" style={{ marginBottom: '16px' }}>
          {selected.receipt_filename && (
            <div className="scan-preview" style={{ marginBottom: '16px' }}>
              <img src={getReceiptImageUrl(selected.id)} alt="Receipt" />
            </div>
          )}

          <h2 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '4px' }}>
            {selected.vendor}
          </h2>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '16px' }}>
            {formatDate(selected.date)} · {selected.sub_category || selected.category}
          </p>

          <div className="confirm-summary">
            {selected.description && (
              <div className="confirm-row">
                <span className="label">Description</span>
                <span className="value">{selected.description}</span>
              </div>
            )}
            <div className="confirm-row">
              <span className="label">Category</span>
              <span className="value">{selected.category?.replace(/_/g, ' ')}</span>
            </div>
            {selected.sub_category && (
              <div className="confirm-row">
                <span className="label">Sub Category</span>
                <span className="value">{selected.sub_category}</span>
              </div>
            )}
            <div className="confirm-row total">
              <span className="label">Amount (inc GST)</span>
              <span className="value">${selected.amount_inc_gst.toFixed(2)}</span>
            </div>
            {selected.gst !== null && (
              <div className="confirm-row">
                <span className="label">GST</span>
                <span className="value">${selected.gst?.toFixed(2)}</span>
              </div>
            )}
            <div className="confirm-row">
              <span className="label">Business %</span>
              <span className="value">{((selected.business_pct || 1) * 100).toFixed(0)}%</span>
            </div>
            <div className="confirm-row">
              <span className="label">Deductible</span>
              <span className="value">${((selected.amount_inc_gst - (selected.gst || selected.amount_inc_gst/11)) * (selected.business_pct || 1)).toFixed(2)}</span>
            </div>
            {selected.notes && (
              <div className="confirm-row">
                <span className="label">Notes</span>
                <span className="value">{selected.notes}</span>
              </div>
            )}
            <div className="confirm-row">
              <span className="label">ID</span>
              <span className="value" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>
                {selected.id}
              </span>
            </div>
          </div>

          <button className="btn btn-danger btn-block" onClick={() => handleDelete(selected.id)}
            id="btn-delete">
            🗑 Delete Receipt
          </button>
        </div>
      </div>
    )
  }

  // List view
  return (
    <div className="page-enter">
      <p className="section-title">All Receipts ({receipts.length})</p>

      {receipts.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📋</div>
          <h3>No receipts yet</h3>
          <p>Your receipt history will appear here</p>
        </div>
      ) : (
        <div className="receipt-list">
          {receipts.map(r => (
            <div key={r.id} className="receipt-item" onClick={() => setSelected(r)}>
              <div className="receipt-icon">
                {r.receipt_filename ? '📸' : '✏️'}
              </div>
              <div className="receipt-info">
                <div className="receipt-vendor">{r.vendor}</div>
                <div className="receipt-meta">
                  {formatDate(r.date)} · <span className="badge">{r.sub_category || r.category}</span>
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
