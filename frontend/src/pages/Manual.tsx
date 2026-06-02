import { useState, useRef } from 'react'
import { manualEntry } from '../services/api'
import type { AddToast } from '../components/Toast'

interface Props { addToast: AddToast }

const CATEGORIES = [
  'Materials & Supplies', 'Tools & Equipment', 'Office Supplies',
  'Travel & Transport', 'Meals & Entertainment', 'Professional Services',
  'Utilities', 'Insurance', 'Rent & Property', 'Vehicle & Fuel', 'Other'
]

export default function Manual({ addToast }: Props) {
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const today = new Date().toISOString().split('T')[0]

  const [form, setForm] = useState({
    date: today, vendor: '', description: '', amountExGst: '',
    gst: '', total: '', category: 'Other', paymentMethod: '', notes: ''
  })

  function update(key: string, value: string) {
    setForm(prev => {
      const next = { ...prev, [key]: value }
      // Auto-calculate GST when total changes
      if (key === 'total' && value) {
        const t = parseFloat(value)
        if (!isNaN(t)) {
          next.gst = (t / 11).toFixed(2)
          next.amountExGst = (t - t / 11).toFixed(2)
        }
      }
      return next
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.date || !form.vendor || !form.total) {
      addToast('error', 'Date, vendor, and total are required')
      return
    }
    setSaving(true)
    try {
      await manualEntry(form, file || undefined)
      addToast('success', `Receipt saved: ${form.vendor}`)
      setSuccess(true)
    } catch (err: any) {
      addToast('error', err.message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  function reset() {
    setForm({
      date: today, vendor: '', description: '', amountExGst: '',
      gst: '', total: '', category: 'Other', paymentMethod: '', notes: ''
    })
    setFile(null)
    setSuccess(false)
  }

  if (success) {
    return (
      <div className="page-enter">
        <div className="success-anim">
          <div className="success-check">✅</div>
          <h2 className="success-title">Entry Saved!</h2>
          <p className="success-detail">Added to spreadsheet</p>
          <button className="btn btn-primary btn-lg" onClick={reset} id="btn-add-more">
            ✏️ Add Another
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="page-enter">
      <p className="section-title">Manual Receipt Entry</p>

      <form onSubmit={handleSubmit}>
        <div className="card" style={{ marginBottom: '16px' }}>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Date *</label>
              <input type="date" className="form-input" value={form.date}
                onChange={e => update('date', e.target.value)} required id="manual-date" />
            </div>
            <div className="form-group">
              <label className="form-label">Payment Method</label>
              <input type="text" className="form-input" value={form.paymentMethod}
                onChange={e => update('paymentMethod', e.target.value)}
                placeholder="VISA, Cash..." id="manual-payment" />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Vendor / Store *</label>
            <input type="text" className="form-input" value={form.vendor}
              onChange={e => update('vendor', e.target.value)}
              placeholder="e.g. Bunnings, Officeworks" required id="manual-vendor" />
          </div>

          <div className="form-group">
            <label className="form-label">Description</label>
            <input type="text" className="form-input" value={form.description}
              onChange={e => update('description', e.target.value)}
              placeholder="Brief summary of purchase" id="manual-desc" />
          </div>

          <div className="form-group">
            <label className="form-label">Total Amount (inc. GST) *</label>
            <input type="number" step="0.01" className="form-input" value={form.total}
              onChange={e => update('total', e.target.value)}
              placeholder="0.00" required id="manual-total"
              style={{ fontSize: '1.2rem', fontWeight: 700 }} />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Amount (ex GST)</label>
              <input type="number" step="0.01" className="form-input"
                value={form.amountExGst}
                onChange={e => update('amountExGst', e.target.value)}
                placeholder="Auto-calculated" id="manual-ex-gst" />
            </div>
            <div className="form-group">
              <label className="form-label">GST</label>
              <input type="number" step="0.01" className="form-input"
                value={form.gst}
                onChange={e => update('gst', e.target.value)}
                placeholder="Auto-calculated" id="manual-gst" />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Category</label>
            <select className="form-select" value={form.category}
              onChange={e => update('category', e.target.value)} id="manual-category">
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Notes</label>
            <textarea className="form-textarea" value={form.notes}
              onChange={e => update('notes', e.target.value)}
              placeholder="Optional notes..." id="manual-notes" />
          </div>

          {/* Optional receipt attachment */}
          <div className="form-group">
            <label className="form-label">Attach Receipt (optional)</label>
            <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }}
              onChange={e => setFile(e.target.files?.[0] || null)} id="manual-file" />
            <button type="button" className="btn btn-secondary btn-block"
              onClick={() => fileRef.current?.click()}>
              {file ? `📎 ${file.name}` : '📎 Attach Photo'}
            </button>
          </div>
        </div>

        <button type="submit" className="btn btn-primary btn-block btn-lg"
          disabled={saving} id="btn-save-manual">
          {saving ? '⏳ Saving...' : '✓ Save Receipt'}
        </button>
      </form>
    </div>
  )
}
