import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { fetchReceipt, updateReceipt, deleteReceipt, fetchCategories, fetchReceiptImageUrl, CategoryMap, ReceiptRecord } from '../services/api'
import * as Icon from '../components/Icons'
import type { AddToast } from '../components/Toast'

interface Props { addToast: AddToast }

export default function ReceiptDetail({ addToast }: Props) {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [receipt, setReceipt] = useState<ReceiptRecord | null>(null)
  const [categories, setCategories] = useState<CategoryMap>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState(false)
  const [showImage, setShowImage] = useState(false)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [imageLoading, setImageLoading] = useState(false)

  // Editable form state
  const [form, setForm] = useState({
    date: '', vendor: '', description: '',
    category: '', subCategory: '',
    amountIncGst: '', gst: '', businessPct: '', notes: ''
  })

  useEffect(() => {
    if (!id) return
    Promise.all([
      fetchReceipt(id),
      fetchCategories()
    ]).then(([r, cats]) => {
      setReceipt(r)
      setCategories(cats)
      setForm({
        date: r.date?.split('T')[0] || '',
        vendor: r.vendor || '',
        description: r.description || '',
        category: r.category || 'OPERATING_EXPENSE',
        subCategory: r.sub_category || '',
        amountIncGst: String(r.amount_inc_gst || 0),
        gst: r.gst !== null ? String(r.gst) : '',
        businessPct: String(r.business_pct ?? 1),
        notes: r.notes || ''
      })
    }).catch(err => {
      addToast('error', err.message || 'Failed to load receipt')
    }).finally(() => setLoading(false))
  }, [id])

  const subCategories = categories[form.category] || []

  function formatCatName(cat: string): string {
    return cat.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
      .replace('Expense', 'Exp.').replace('Contributions', 'Contrib.')
  }

  function update(key: string, value: string) {
    setForm(prev => {
      const next = { ...prev, [key]: value }
      if (key === 'amountIncGst' && value) {
        const t = parseFloat(value)
        if (!isNaN(t)) next.gst = (t / 11).toFixed(2)
      }
      if (key === 'category') next.subCategory = ''
      return next
    })
  }

  async function handleSave() {
    if (!id || !form.date || !form.vendor || !form.amountIncGst) {
      addToast('error', 'Date, vendor, and amount are required')
      return
    }
    setSaving(true)
    try {
      await updateReceipt(id, form)
      addToast('success', 'Receipt updated')
      setEditing(false)
      // Refresh data
      const updated = await fetchReceipt(id)
      setReceipt(updated)
    } catch (err: any) {
      addToast('error', err.message || 'Failed to update')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!id) return
    if (!confirm('Delete this receipt permanently?')) return
    try {
      await deleteReceipt(id)
      addToast('success', 'Receipt deleted')
      navigate('/history')
    } catch (err: any) {
      addToast('error', err.message || 'Failed to delete')
    }
  }

  if (loading) {
    return (
      <div className="page-enter">
        <div className="empty-state"><div className="processing-spinner" style={{ margin: '0 auto' }}></div></div>
      </div>
    )
  }

  if (!receipt) {
    return (
      <div className="page-enter">
        <div className="empty-state">
          <h3>Receipt not found</h3>
          <button className="btn btn-primary" onClick={() => navigate('/history')}>← Back</button>
        </div>
      </div>
    )
  }

  const deductible = form.amountIncGst && form.gst
    ? ((parseFloat(form.amountIncGst) - parseFloat(form.gst)) * parseFloat(form.businessPct || '1')).toFixed(2)
    : '0.00'

  return (
    <div className="page-enter">
      {/* Header */}
      <div className="detail-header">
        <button className="btn btn-ghost" onClick={() => navigate(-1)} style={{ padding: '4px' }}>
          <Icon.ArrowLeft size={20} />
        </button>
        <h2 className="detail-title">Receipt Details</h2>
        <div className="detail-actions-top">
          {!editing ? (
            <button className="btn btn-ghost" onClick={() => setEditing(true)} title="Edit">
              <Icon.Edit size={18} />
            </button>
          ) : (
            <button className="btn btn-ghost" onClick={() => setEditing(false)} title="Cancel editing"
              style={{ color: 'var(--text-muted)' }}>
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Receipt Image */}
      {receipt.receipt_filename && (
        <div className="detail-image-section">
          {showImage ? (
            <div className="detail-image-container">
              {imageLoading && (
                <div style={{ textAlign: 'center', padding: '24px' }}>
                  <div className="processing-spinner" style={{ margin: '0 auto' }}></div>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '8px' }}>Loading image...</p>
                </div>
              )}
              {imageUrl && (
                <img src={imageUrl} alt="Receipt" className="detail-image" />
              )}
              {!imageLoading && !imageUrl && (
                <div style={{ textAlign: 'center', padding: '12px', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                  Image could not be loaded
                </div>
              )}
              <button className="btn btn-ghost btn-sm" onClick={() => setShowImage(false)}
                style={{ width: '100%', marginTop: '4px', fontSize: '0.72rem' }}>
                Hide Image
              </button>
            </div>
          ) : (
            <button className="btn btn-secondary btn-block" onClick={async () => {
              setShowImage(true)
              if (!imageUrl) {
                setImageLoading(true)
                const url = await fetchReceiptImageUrl(receipt.id)
                setImageUrl(url)
                setImageLoading(false)
              }
            }}>
              📷 View Receipt Image
            </button>
          )}
        </div>
      )}

      {/* Amount Hero */}
      <div className="detail-amount-hero">
        {editing ? (
          <input
            type="number" step="0.01" className="detail-amount-input"
            value={form.amountIncGst}
            onChange={e => update('amountIncGst', e.target.value)}
          />
        ) : (
          <div className="detail-amount">${parseFloat(form.amountIncGst).toFixed(2)}</div>
        )}
        <div className="detail-amount-label">Amount (inc. GST)</div>
      </div>

      {/* Form Fields */}
      <div className="card detail-card">
        {/* Vendor */}
        <div className="detail-field">
          <label className="form-label">Vendor</label>
          {editing ? (
            <input type="text" className="form-input" value={form.vendor}
              onChange={e => update('vendor', e.target.value)} />
          ) : (
            <div className="detail-value">{form.vendor || '—'}</div>
          )}
        </div>

        {/* Date */}
        <div className="detail-field">
          <label className="form-label">Date</label>
          {editing ? (
            <input type="date" className="form-input" value={form.date}
              onChange={e => update('date', e.target.value)} />
          ) : (
            <div className="detail-value">
              {form.date ? new Date(form.date + 'T00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' }) : '—'}
            </div>
          )}
        </div>

        {/* Description */}
        <div className="detail-field">
          <label className="form-label">Description</label>
          {editing ? (
            <input type="text" className="form-input" value={form.description}
              onChange={e => update('description', e.target.value)} placeholder="Brief description" />
          ) : (
            <div className="detail-value">{form.description || '—'}</div>
          )}
        </div>

        {/* Category */}
        <div className="detail-field">
          <label className="form-label">Category</label>
          {editing ? (
            <select className="form-select" value={form.category}
              onChange={e => update('category', e.target.value)}>
              {Object.keys(categories).map(c => (
                <option key={c} value={c}>{formatCatName(c)}</option>
              ))}
            </select>
          ) : (
            <div className="detail-value">{formatCatName(form.category)}</div>
          )}
        </div>

        {/* Sub Category */}
        <div className="detail-field">
          <label className="form-label">Sub Category</label>
          {editing ? (
            <select className="form-select" value={form.subCategory}
              onChange={e => update('subCategory', e.target.value)}>
              <option value="">— Select —</option>
              {subCategories.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          ) : (
            <div className="detail-value">{form.subCategory || '—'}</div>
          )}
        </div>

        {/* GST */}
        <div className="detail-field-row">
          <div className="detail-field" style={{ flex: 1 }}>
            <label className="form-label">GST</label>
            {editing ? (
              <input type="number" step="0.01" className="form-input" value={form.gst}
                onChange={e => update('gst', e.target.value)} placeholder="Auto: ÷11" />
            ) : (
              <div className="detail-value">${form.gst ? parseFloat(form.gst).toFixed(2) : '—'}</div>
            )}
          </div>
          <div className="detail-field" style={{ flex: 1 }}>
            <label className="form-label">Business %</label>
            {editing ? (
              <select className="form-select" value={form.businessPct}
                onChange={e => update('businessPct', e.target.value)}>
                <option value="1">100%</option>
                <option value="0.8">80%</option>
                <option value="0.7">70%</option>
                <option value="0.5">50%</option>
                <option value="0.3">30%</option>
                <option value="0">0%</option>
              </select>
            ) : (
              <div className="detail-value">{Math.round(parseFloat(form.businessPct) * 100)}%</div>
            )}
          </div>
        </div>

        {/* Deductible (calculated, read-only) */}
        <div className="detail-field">
          <label className="form-label">Deductible Amount</label>
          <div className="detail-value detail-value-accent">${deductible}</div>
        </div>

        {/* Notes */}
        <div className="detail-field">
          <label className="form-label">Notes</label>
          {editing ? (
            <textarea className="form-textarea" value={form.notes}
              onChange={e => update('notes', e.target.value)} placeholder="Optional notes..." />
          ) : (
            <div className="detail-value">{form.notes || '—'}</div>
          )}
        </div>

        {/* Meta info */}
        <div className="detail-meta">
          <span>ID: {receipt.id}</span>
          <span>Row: {receipt.spreadsheet_row}</span>
          <span>Created: {receipt.created_at ? new Date(receipt.created_at).toLocaleDateString('en-AU') : '—'}</span>
        </div>
      </div>

      {/* Action Buttons */}
      {editing ? (
        <div className="detail-bottom-actions">
          <button className="btn btn-primary btn-block btn-lg" onClick={handleSave} disabled={saving}>
            {saving ? '⏳ Saving...' : '✓ Save Changes'}
          </button>
          <button className="btn btn-secondary btn-block" onClick={() => setEditing(false)}>
            Cancel
          </button>
        </div>
      ) : (
        <div className="detail-bottom-actions">
          <button className="btn btn-primary btn-block" onClick={() => setEditing(true)}>
            <Icon.Edit size={16} /> Edit Receipt
          </button>
          <button className="btn btn-secondary btn-block" onClick={handleDelete}
            style={{ color: 'var(--danger)' }}>
            🗑️ Delete
          </button>
        </div>
      )}
    </div>
  )
}
