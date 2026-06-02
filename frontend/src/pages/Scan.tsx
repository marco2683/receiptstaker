import { useState, useRef } from 'react'
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera'
import { Capacitor } from '@capacitor/core'
import { scanReceipt, confirmReceipt, ReceiptData } from '../services/api'
import type { AddToast } from '../components/Toast'

interface Props { addToast: AddToast }

const CATEGORIES = [
  'Materials & Supplies', 'Tools & Equipment', 'Office Supplies',
  'Travel & Transport', 'Meals & Entertainment', 'Professional Services',
  'Utilities', 'Insurance', 'Rent & Property', 'Vehicle & Fuel', 'Other'
]

type Step = 'capture' | 'processing' | 'confirm' | 'success'

export default function Scan({ addToast }: Props) {
  const [step, setStep] = useState<Step>('capture')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [data, setData] = useState<ReceiptData | null>(null)
  const [tempFile, setTempFile] = useState<string>('')
  const [saving, setSaving] = useState(false)
  const [editData, setEditData] = useState<Record<string, string>>({})
  const fileInputRef = useRef<HTMLInputElement>(null)

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
        amountExGst: d.subtotal?.toString() || '',
        gst: d.gst?.toString() || '',
        total: d.total?.toString() || '',
        category: d.category_guess || d.category || 'Other',
        paymentMethod: d.payment_method || d.paymentMethod || '',
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
        // Convert base64 to File for the existing upload flow
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
    setEditData(prev => ({ ...prev, [key]: value }))
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

          <div className="form-group">
            <label className="form-label">Date</label>
            <input type="date" className="form-input" value={editData.date}
              onChange={e => updateField('date', e.target.value)} id="edit-date" />
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
              <label className="form-label">Amount (ex GST)</label>
              <input type="number" step="0.01" className="form-input"
                value={editData.amountExGst}
                onChange={e => updateField('amountExGst', e.target.value)} id="edit-amount" />
            </div>
            <div className="form-group">
              <label className="form-label">GST</label>
              <input type="number" step="0.01" className="form-input"
                value={editData.gst}
                onChange={e => updateField('gst', e.target.value)} id="edit-gst" />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Total</label>
              <input type="number" step="0.01" className="form-input"
                value={editData.total}
                onChange={e => updateField('total', e.target.value)} id="edit-total" />
            </div>
            <div className="form-group">
              <label className="form-label">Payment</label>
              <input type="text" className="form-input"
                value={editData.paymentMethod}
                onChange={e => updateField('paymentMethod', e.target.value)} id="edit-payment" />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Category</label>
            <select className="form-select" value={editData.category}
              onChange={e => updateField('category', e.target.value)} id="edit-category">
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
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
