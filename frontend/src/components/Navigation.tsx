import { useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { autoScan } from '../services/api'
import * as Icon from './Icons'
import type { AddToast } from './Toast'

interface Props { addToast: AddToast }

export default function Navigation({ addToast }: Props) {
  const location = useLocation()
  const navigate = useNavigate()
  const fileRef = useRef<HTMLInputElement>(null)

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

  const navItems = [
    { path: '/', icon: <Icon.Home size={22} />, label: 'Home' },
    { path: '/history', icon: <Icon.History size={22} />, label: 'History' },
    { path: 'camera', icon: <Icon.Camera size={24} />, label: '', isScan: true },
    { path: '/manual', icon: <Icon.Edit size={22} />, label: 'Manual' },
  ]

  return (
    <nav className="bottom-nav" id="main-nav">
      <input ref={fileRef} type="file" accept="image/*,image/heic" onChange={handleFile}
        style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }} />
      <div className="bottom-nav-inner">
        {navItems.map(item => (
          <button
            key={item.path}
            className={`nav-item ${item.isScan ? 'scan-btn' : ''} ${location.pathname === item.path ? 'active' : ''}`}
            onClick={() => item.isScan ? fileRef.current?.click() : navigate(item.path)}
          >
            <span className="nav-icon">{item.icon}</span>
            {item.label && <span>{item.label}</span>}
          </button>
        ))}
      </div>
    </nav>
  )
}
