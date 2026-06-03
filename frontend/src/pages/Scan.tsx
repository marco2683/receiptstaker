import { useState, useRef } from 'react'
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera'
import { Capacitor } from '@capacitor/core'
import { autoScan } from '../services/api'
import type { AddToast } from '../components/Toast'

interface Props { addToast: AddToast }

type Step = 'capture' | 'uploading' | 'done'

export default function Scan({ addToast }: Props) {
  const [step, setStep] = useState<Step>('capture')
  const [preview, setPreview] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function handleFile(f: File) {
    console.log('📸 handleFile:', f.name, f.size, f.type)
    setPreview(URL.createObjectURL(f))
    setStep('uploading')

    try {
      await autoScan(f)
      setStep('done')
      addToast('success', '📸 Receipt uploaded — analysing in background')
    } catch (err: any) {
      console.error('❌ Upload error:', err)
      addToast('error', err.message || 'Failed to upload')
      setStep('capture')
    }
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    console.log('📎 File input changed:', e.target.files?.length)
    const f = e.target.files?.[0]
    if (f) handleFile(f)
    // Reset input so same file can be re-selected
    e.target.value = ''
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

  function reset() {
    setStep('capture')
    setPreview(null)
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
            onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
            onClick={() => fileInputRef.current?.click()}
            id="scan-zone"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,image/heic"
              onChange={handleFileInput}
              style={{ position: 'absolute', opacity: 0, width: 0, height: 0, overflow: 'hidden' }}
              id="file-input"
            />
            <span className="scan-zone-icon">📸</span>
            <p className="scan-zone-title">Snap or Upload Receipt</p>
            <p className="scan-zone-subtitle">
              Tap to take a photo or select from gallery
            </p>
          </div>

          <div style={{ marginTop: '16px', textAlign: 'center' }}>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Just snap and go — AI processes in the background
            </p>
          </div>
        </>
      )}

      {step === 'uploading' && (
        <div className="processing">
          {preview && (
            <div className="scan-preview">
              <img src={preview} alt="Receipt" />
            </div>
          )}
          <div className="processing-spinner"></div>
          <p className="processing-text">Uploading...</p>
        </div>
      )}

      {step === 'done' && (
        <div className="success-anim">
          <div className="success-check">✅</div>
          <h2 className="success-title">Got it!</h2>
          <p className="success-detail">
            AI is reading the receipt in the background.<br/>
            It'll be added to your spreadsheet automatically.
          </p>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '20px' }}>
            Unclear receipts get an orange row for you to review later.
          </p>
          <button className="btn btn-primary btn-lg" onClick={reset} id="btn-another">
            📸 Scan Another
          </button>
        </div>
      )}
    </div>
  )
}
