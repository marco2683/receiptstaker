import { useState, useRef, useEffect } from 'react'
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera'
import { Capacitor } from '@capacitor/core'
import { scanReceipt, confirmReceipt, ReceiptData, fetchCategories, CategoryMap } from '../services/api'
import type { AddToast } from '../components/Toast'

interface Props { addToast: AddToast }

type Step = 'capture' | 'processing' | 'confirm' | 'success'

function formatCatName(cat: string): string {
  return cat.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
    .replace('Expense', 'Exp.')
    .replace('Contributions', 'Contrib.')
}

export default function Scan({ addToast }: Props) {
  const [step, setStep] = useState<Step>('capture')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [data, setData] = useState<ReceiptData | null>(null)
  const [tempFile, setTempFile] = useState<string>('')
  const [saving, setSaving] = useState(false)
  const [editData, setEditData] = useState<Record<string, string>>({})
  const [categories, setCategories] = useState<CategoryMap>({})
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetchCategories().then(setCategories).catch(() => {})
  }, [])

  const subCategories = categories[editData.category] || []

  async function handleFile(f: File) {
    setFile(f)
    setPreview(URL.createObjectURL(f))
    setStep('processing')

    try {
      const result = await scanReceipt(f)
      const d = result.data
      setData(d)
      setTempFile(result.tempFile)
      setEditData({
        date: d.date || '',
        vendor: d.vendor || '',
        description: d.description || '',
        amountIncGst: d.amountIncGst?.toString() || '',
        gst: d.gst?.toString() || '',
        category: d.category || 'OPERATING_EXPENSE',
        subCategory: d.subCategory || '',
        businessPct: d.businessPct?.toString() || '1',
        notes: '',
      })
      setStep('confirm')
    } catch (err: any) {
      addToast('error', err.message || 'Failed to scan receipt')
      setStep('capture')
    }
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (f) handleFile(f)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    const f = e.dataTransfer.files[0]
    if (f) handleFile(f)
  }

  // Native camera capture via Capacitor
  async function handleNativeCamera() {
    try {
      const photo = await Camera.getPhoto({
        quality: 90,
        allowEditing: false,
        resultType: CameraResultType.Base64,
        source: CameraSource.Camera,
        correctOrientation: true,
      })

      if (photo.base64String) {
        const byteString = atob(photo.base64String)
        const ab = new ArrayBuffer(byteString.length)
        const ia = new Uint8Array(ab)
        for (let i = 0; i < byteString.length; i++) {
          ia[i] = byteString.charCodeAt(i)
        }
        const blob = new Blob([ab], { type: `image/${photo.format || 'jpeg'}` })
        const capturedFile = new File([blob], `receipt_${Date.now()}.${photo.format || 'jpg'}`, {
          type: `image/${photo.format || 'jpeg'}`,
        })
        handleFile(capturedFile)
      }
    } catch (err: any) {
      if (err.message !== 'User cancelled photos app') {
        addToast('error', 'Camera error: ' + (err.message || 'Unknown'))
      }
    }
  }

  const isNative = Capacitor.isNativePlatform()

  async function handleConfirm() {
    setSaving(true)
    try {
      await confirmReceipt({ ...editData, tempFile }, file || undefined)
      setStep('success')
      addToast('success', `Receipt saved: ${editData.vendor}`)
    } catch (err: any) {
      addToast('error', err.message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  function reset() {
    setStep('capture')
    setFile(null)
    setPreview(null)
    setData(null)
    setEditData({})
    setTempFile('')
  }

  function updateField(key: string, value: string) {
    setEditData(prev => {
      const next = { ...prev, [key]: value }
      if (key === 'category') next.subCategory = ''
      return next
    })
  }

  return (
    <div className="page-enter">
      {step === 'capture' && (
        <>
          {isNative && (
            <button className="btn btn-primary btn-block btn-lg"
              onClick={handleNativeCamera}
              style={{ marginBottom: '16px', padding: '24px' }}
              id="btn-native-camera">
              <span style={{ fontSize: '1.5rem', marginRight: '8px' }}>📸</span>
              Take Photo
            </button>
          )}

          <div
            className="scan-zone"
            onDragOver={e => e.preventDefault()}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            id="scan-zone"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture={isNative ? undefined : 'environment'}
              onChange={handleFileInput}
              id="file-input"
            />
            <span className="scan-zone-icon">{isNative ? '🖼️' : '📸'}</span>
            <p className="scan-zone-title">
              {isNative ? 'Choose from Gallery' : 'Snap or Upload Receipt'}
            </p>
            <p className="scan-zone-subtitle">
              {isNative ? 'Select an existing receipt image' : 'Tap to take a photo or drag & drop an image'}
            </p>
          </div>

          <div style={{ marginTop: '16px', textAlign: 'center' }}>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Supports JPG, PNG, WebP, HEIC • Max 20MB
            </p>
          </div>
        </>
      )}

      {step === 'processing' && (
        <div className="processing">
          {preview && (
            <div className="scan-preview">
              <img src={preview} alt="Receipt" />
            </div>
          )}
          <div className="processing-spinner"></div>
          <p className="processing-text">Analysing receipt...</p>
          <p className="processing-sub">AI is extracting the details</p>
        </div>
      )}

      {step === 'confirm' && (
        <div className="confirm-card">
          <div className="confirm-header">
            <div className="check-icon">✨</div>
            <div>
              <h3>Receipt Scanned</h3>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Review and edit before saving
              </p>
            </div>
          </div>

          {preview && (
            <div className="scan-preview" style={{ marginBottom: '16px' }}>
              <img src={preview} alt="Receipt" style={{ maxHeight: '150px' }} />
            </div>
          )}

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Date</label>
              <input type="date" className="form-input" value={editData.date}
                onChange={e => updateField('date', e.target.value)} id="edit-date" />
            </div>
            <div className="form-group">
              <label className="form-label">Business %</label>
              <select className="form-select" value={editData.businessPct}
                onChange={e => updateField('businessPct', e.target.value)} id="edit-biz-pct">
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
            <label className="form-label">Vendor</label>
            <input type="text" className="form-input" value={editData.vendor}
              onChange={e => updateField('vendor', e.target.value)} id="edit-vendor" />
          </div>

          <div className="form-group">
            <label className="form-label">Description</label>
            <input type="text" className="form-input" value={editData.description}
              onChange={e => updateField('description', e.target.value)} id="edit-desc" />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Amount (inc GST)</label>
              <input type="number" step="0.01" className="form-input"
                value={editData.amountIncGst}
                onChange={e => updateField('amountIncGst', e.target.value)} id="edit-amount" />
            </div>
            <div className="form-group">
              <label className="form-label">GST</label>
              <input type="number" step="0.01" className="form-input"
                value={editData.gst}
                onChange={e => updateField('gst', e.target.value)} id="edit-gst" />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Category</label>
            <select className="form-select" value={editData.category}
              onChange={e => updateField('category', e.target.value)} id="edit-category">
              {Object.keys(categories).map(c => (
                <option key={c} value={c}>{formatCatName(c)}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Sub Category</label>
            <select className="form-select" value={editData.subCategory}
              onChange={e => updateField('subCategory', e.target.value)} id="edit-sub-category">
              <option value="">— Select —</option>
              {subCategories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Notes</label>
            <textarea className="form-textarea" value={editData.notes}
              onChange={e => updateField('notes', e.target.value)}
              placeholder="Optional notes..." id="edit-notes" />
          </div>

          <div className="confirm-actions">
            <button className="btn btn-secondary" onClick={reset} id="btn-cancel">
              ✕ Cancel
            </button>
            <button className="btn btn-primary" onClick={handleConfirm}
              disabled={saving} id="btn-confirm">
              {saving ? '⏳ Saving...' : '✓ Save Receipt'}
            </button>
          </div>
        </div>
      )}

      {step === 'success' && (
        <div className="success-anim">
          <div className="success-check">✅</div>
          <h2 className="success-title">Receipt Saved!</h2>
          <p className="success-detail">
            Added to spreadsheet and stored in receipts folder
          </p>
          <button className="btn btn-primary btn-lg" onClick={reset} id="btn-another">
            📸 Scan Another
          </button>
        </div>
      )}
    </div>
  )
}
