import { useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { autoScan } from '../services/api'
import * as Icon from './Icons'
import type { AddToast } from './Toast'

interface Props { addToast: AddToast }

export default function Navigation({ addToast }: Props) {
  const location = useLocation()
  const navigate = useNavigate()
  const cameraRef = useRef<HTMLInputElement>(null)
  const uploadRef = useRef<HTMLInputElement>(null)

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    e.target.value = ''
    addToast('info', 'Uploading receipt...')
    try {
      await autoScan(f)
      addToast('success', 'Got it — analysing in background')
    } catch (err: any) {
      addToast('error', err.message || 'Upload failed')
    }
  }

  return (
    <nav className="bottom-nav" id="main-nav">
      {/* Camera input — opens camera directly */}
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" onChange={handleFile}
        style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }} />
      {/* Upload input — shows gallery/files picker */}
      <input ref={uploadRef} type="file" accept="image/*,image/heic" onChange={handleFile}
        style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }} />

      <div className="bottom-nav-inner">
        <button
          className={`nav-item ${location.pathname === '/' ? 'active' : ''}`}
          onClick={() => navigate('/')}
        >
          <span className="nav-icon"><Icon.Home size={22} /></span>
          <span>Home</span>
        </button>

        <button
          className={`nav-item ${location.pathname === '/history' ? 'active' : ''}`}
          onClick={() => navigate('/history')}
        >
          <span className="nav-icon"><Icon.History size={22} /></span>
          <span>History</span>
        </button>

        {/* Main camera button — large, center, opens camera directly */}
        <button
          className="nav-item scan-btn"
          onClick={() => cameraRef.current?.click()}
        >
          <span className="nav-icon"><Icon.Camera size={26} /></span>
        </button>

        {/* Upload button — smaller, opens gallery/files */}
        <button
          className="nav-item upload-btn"
          onClick={() => uploadRef.current?.click()}
        >
          <span className="nav-icon"><Icon.File size={22} /></span>
          <span>Upload</span>
        </button>

        <button
          className={`nav-item ${location.pathname === '/manual' ? 'active' : ''}`}
          onClick={() => navigate('/manual')}
        >
          <span className="nav-icon"><Icon.Edit size={22} /></span>
          <span>Manual</span>
        </button>
      </div>
    </nav>
  )
}
