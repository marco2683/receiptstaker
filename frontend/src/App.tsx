import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import Navigation from './components/Navigation'
import Login from './pages/Login'
import CompanySetup from './pages/CompanySetup'
import CompanySettings from './pages/CompanySettings'
import Home from './pages/Home'
import Scan from './pages/Scan'
import Manual from './pages/Manual'
import History from './pages/History'
import ReceiptDetail from './pages/ReceiptDetail'
import JoinCompany from './pages/JoinCompany'
import EmailSettings from './pages/EmailSettings'
import Toast, { ToastData } from './components/Toast'
import * as Icon from './components/Icons'

function AppContent() {
  const [toasts, setToasts] = useState<ToastData[]>([])
  const { user, currentCompany, loading } = useAuth()

  const addToast = (type: 'success' | 'error' | 'info', message: string) => {
    const id = Date.now().toString()
    setToasts(prev => [...prev, { id, type, message }])
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, 4000)
  }

  if (loading) {
    return (
      <div className="auth-page">
        <div className="auth-container">
          <div className="auth-logo">
            <div className="auth-logo-icon">
              <Icon.Receipt size={28} color="white" />
            </div>
            <div className="processing-spinner" style={{ margin: '24px auto' }}></div>
          </div>
        </div>
      </div>
    )
  }

  // Not logged in — show login/signup
  if (!user) {
    return (
      <>
        <Toast toasts={toasts} />
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/join" element={<Login />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </>
    )
  }

  // Logged in but no company — show setup
  if (!currentCompany) {
    return (
      <>
        <Toast toasts={toasts} />
        <Routes>
          <Route path="/setup" element={<CompanySetup />} />
          <Route path="/join" element={<JoinCompany />} />
          <Route path="*" element={<Navigate to="/setup" replace />} />
        </Routes>
      </>
    )
  }

  // Fully authenticated with company
  return (
    <div className="app">
      <AppHeader companyName={currentCompany.name} />
      <Toast toasts={toasts} />

      <main className="app-content">
        <Routes>
          <Route path="/" element={<Home addToast={addToast} />} />
          <Route path="/scan" element={<Scan addToast={addToast} />} />
          <Route path="/manual" element={<Manual addToast={addToast} />} />
          <Route path="/history" element={<History addToast={addToast} />} />
          <Route path="/receipt/:id" element={<ReceiptDetail addToast={addToast} />} />
          <Route path="/join" element={<JoinCompany />} />
          <Route path="/settings" element={<CompanySettings addToast={addToast} />} />
          <Route path="/email-settings" element={<EmailSettings addToast={addToast} />} />
          <Route path="/setup" element={<CompanySetup />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      <NavigationWrapper addToast={addToast} />
    </div>
  )
}

function AppHeader({ companyName }: { companyName: string }) {
  const location = useLocation()
  const { companies, currentCompany, setCurrentCompany } = useAuth()
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [showSwitcher, setShowSwitcher] = useState(false)

  // Load logo via authenticated fetch
  useEffect(() => {
    if (!currentCompany?.logoFilename) { setLogoUrl(null); return }
    let cancelled = false
    ;(async () => {
      try {
        const { authFetch } = await import('./services/api')
        const res = await authFetch(`/api/companies/${currentCompany.id}/logo`)
        if (!res.ok || cancelled) return
        const blob = await res.blob()
        if (!cancelled) setLogoUrl(URL.createObjectURL(blob))
      } catch { /* ignore */ }
    })()
    return () => { cancelled = true }
  }, [currentCompany?.id, currentCompany?.logoFilename])

  // Hide header on settings/email-settings page (they have own headers)
  if (['/settings', '/email-settings'].includes(location.pathname)) return null

  return (
    <header className="header">
      <div className="header-inner">
        <div className="header-logo" style={{ flex: 1 }}>
          <div className="logo-icon"><Icon.Receipt size={18} color="white" /></div>
          <div style={{ flex: 1 }}>
            <h1>Receipt Taker</h1>
            {companies.length > 1 ? (
              <div style={{ position: 'relative' }}>
                <button
                  className="header-company-switcher"
                  onClick={() => setShowSwitcher(!showSwitcher)}
                >
                  {companyName} <Icon.ChevronRight size={10} />
                </button>
                {showSwitcher && (
                  <>
                    <div className="header-switcher-backdrop" onClick={() => setShowSwitcher(false)} />
                    <div className="header-switcher-dropdown">
                      {companies.map(c => (
                        <button
                          key={c.id}
                          className={`header-switcher-item ${c.id === currentCompany?.id ? 'active' : ''}`}
                          onClick={() => {
                            setCurrentCompany(c)
                            setShowSwitcher(false)
                          }}
                        >
                          {c.name}
                          {c.id === currentCompany?.id && <span style={{ marginLeft: 'auto', fontSize: '0.7rem' }}>✓</span>}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div className="header-company">{companyName}</div>
            )}
          </div>
        </div>
        {logoUrl && (
          <img
            src={logoUrl}
            alt="Company logo"
            className={`header-company-logo logo-${currentCompany?.logoShape || 'square'}`}
          />
        )}
      </div>
    </header>
  )
}

function NavigationWrapper({ addToast }: { addToast: (type: 'success' | 'error' | 'info', message: string) => void }) {
  const location = useLocation()
  // Hide nav on setup page
  if (location.pathname === '/setup') return null
  return <Navigation addToast={addToast} />
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </BrowserRouter>
  )
}
