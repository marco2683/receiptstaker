import { useState } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Navigation from './components/Navigation'
import Home from './pages/Home'
import Scan from './pages/Scan'
import Manual from './pages/Manual'
import History from './pages/History'
import Toast, { ToastData } from './components/Toast'
import * as Icon from './components/Icons'

export default function App() {
  const [toasts, setToasts] = useState<ToastData[]>([])

  const addToast = (type: 'success' | 'error' | 'info', message: string) => {
    const id = Date.now().toString()
    setToasts(prev => [...prev, { id, type, message }])
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, 4000)
  }

  return (
    <BrowserRouter>
      <div className="app">
        <header className="header">
          <div className="header-inner">
            <div className="header-logo">
              <div className="logo-icon"><Icon.Receipt size={18} color="white" /></div>
              <h1>Receipt Taker</h1>
            </div>
          </div>
        </header>

        <Toast toasts={toasts} />

        <main className="app-content">
          <Routes>
            <Route path="/" element={<Home addToast={addToast} />} />
            <Route path="/scan" element={<Scan addToast={addToast} />} />
            <Route path="/manual" element={<Manual addToast={addToast} />} />
            <Route path="/history" element={<History addToast={addToast} />} />
          </Routes>
        </main>

        <Navigation addToast={addToast} />
      </div>
    </BrowserRouter>
  )
}
