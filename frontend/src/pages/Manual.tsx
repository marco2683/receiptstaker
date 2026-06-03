import { useState, useRef, useEffect } from 'react'
import { manualEntry, fetchCategories, CategoryMap } from '../services/api'
import type { AddToast } from '../components/Toast'

interface Props { addToast: AddToast }

export default function Manual({ addToast }: Props) {
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [categories, setCategories] = useState<CategoryMap>({})
  const fileRef = useRef<HTMLInputElement>(null)
  const today = new Date().toISOString().split('T')[0]

  const [form, setForm] = useState({
    date: today, vendor: '', description: '',
    amountIncGst: '', gst: '',
    category: 'OPERATING_EXPENSE', subCategory: '',
    businessPct: '1', notes: ''
  })

  // Load categories from backend
  useEffect(() => {
    fetchCategories()
      .then(cats => setCategories(cats))
      .catch(() => {
        // Fallback categories if backend not available
        setCategories({
          OPERATING_EXPENSE: ['Materials & Consumables', 'Tools', 'Project Parts', 'Office', 'Software', 'IT Accessories', 'Mobile Bill', 'Insurance', 'Clothing', 'PPE'],
          MOTOR_VEHICLE_EXPENSE: ['Fuel', 'Tolls', 'Vehicle Registration', 'Vehicle Insurance', 'Vehicle Repair & Maintenance', 'Parking'],
          TRAVEL_EXPENSE: ['Flights', 'Accomodation', 'Meals', 'Public Transport', 'Taxis, Uber, hire car'],
          HOME_OFFICE_EXPENSE: ['NBN Internet', 'Electricity', 'Gas', 'Water'],
          HEALTH_RELATED_EXPENSE: ['Private Health Insurance', 'Ambulance Cover'],
          SUPERANNUATION_CONTRIBUTIONS: ['Voluntary Super Contribution'],
        })
      })
  }, [])

  const subCategories = categories[form.category] || []

  // Format category name for display
  function formatCatName(cat: string): string {
    return cat.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
      .replace('Expense', 'Exp.')
      .replace('Contributions', 'Contrib.')
  }

  function update(key: string, value: string) {
    setForm(prev => {
      const next = { ...prev, [key]: value }
      // Auto-calculate GST when total changes (GST = total/11 for Australia)
      if (key === 'amountIncGst' && value) {
        const t = parseFloat(value)
        if (!isNaN(t)) {
          next.gst = (t / 11).toFixed(2)
        }
      }
      // Reset sub-category when category changes
      if (key === 'category') {
        next.subCategory = ''
      }
      return next
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.date || !form.vendor || !form.amountIncGst) {
      addToast('error', 'Date, vendor, and amount are required')
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
      date: today, vendor: '', description: '',
      amountIncGst: '', gst: '',
      category: 'OPERATING_EXPENSE', subCategory: '',
      businessPct: '1', notes: ''
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
          {/* Date & Vendor */}
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Date *</label>
              <input type="date" className="form-input" value={form.date}
                onChange={e => update('date', e.target.value)} required id="manual-date" />
            </div>
            <div className="form-group">
              <label className="form-label">Business %</label>
              <select className="form-select" value={form.businessPct}
                onChange={e => update('businessPct', e.target.value)} id="manual-biz-pct">
                <option value="1">100%</option>
                <option value="0.8">80%</option>
                <option value="0.7">70%</option>
                <option value="0.5">50%</option>
                <option value="0.3">30%</option>
                <option value="0">0%</option>
              </select>
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

          {/* Amount */}
          <div className="form-group">
            <label className="form-label">Amount (inc. GST) *</label>
            <input type="number" step="0.01" className="form-input" value={form.amountIncGst}
              onChange={e => update('amountIncGst', e.target.value)}
              placeholder="0.00" required id="manual-amount"
              style={{ fontSize: '1.2rem', fontWeight: 700 }} />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">GST (auto: ÷11)</label>
              <input type="number" step="0.01" className="form-input"
                value={form.gst}
                onChange={e => update('gst', e.target.value)}
                placeholder="Auto-calculated" id="manual-gst" />
            </div>
            <div className="form-group">
              <label className="form-label" style={{ color: 'var(--text-muted)', fontSize: '0.65rem' }}>
                Deductible: ${form.amountIncGst && form.gst
                  ? ((parseFloat(form.amountIncGst) - parseFloat(form.gst)) * parseFloat(form.businessPct || '1')).toFixed(2)
                  : '0.00'}
              </label>
            </div>
          </div>

          {/* Category & Sub Category — cascading dropdowns */}
          <div className="form-group">
            <label className="form-label">Category</label>
            <select className="form-select" value={form.category}
              onChange={e => update('category', e.target.value)} id="manual-category">
              {Object.keys(categories).map(c => (
                <option key={c} value={c}>{formatCatName(c)}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Sub Category</label>
            <select className="form-select" value={form.subCategory}
              onChange={e => update('subCategory', e.target.value)} id="manual-sub-category">
              <option value="">— Select —</option>
              {subCategories.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {/* Notes */}
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
