import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import {
  fetchEmailAccounts, addEmailAccount, testEmailConnection,
  triggerEmailScan, triggerEmailRescan, deleteEmailAccount,
  EmailAccount, ScanResult
} from '../services/api'
import * as Icon from '../components/Icons'
import type { AddToast } from '../components/Toast'

interface Props { addToast: AddToast }

// Preset IMAP configs for known providers
const PRESETS: Record<string, { host: string; port: number }> = {
  'gmail.com': { host: 'imap.gmail.com', port: 993 },
  'googlemail.com': { host: 'imap.gmail.com', port: 993 },
  'outlook.com': { host: 'outlook.office365.com', port: 993 },
  'hotmail.com': { host: 'outlook.office365.com', port: 993 },
  'live.com': { host: 'outlook.office365.com', port: 993 },
  'yahoo.com': { host: 'imap.mail.yahoo.com', port: 993 },
  'icloud.com': { host: 'imap.mail.me.com', port: 993 },
}

export default function EmailSettings({ addToast }: Props) {
  const navigate = useNavigate()
  const { currentCompany } = useAuth()
  const [accounts, setAccounts] = useState<EmailAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [testing, setTesting] = useState(false)
  const [adding, setAdding] = useState(false)
  const [scanning, setScanning] = useState<string | null>(null)
  const [scanResult, setScanResult] = useState<ScanResult | null>(null)

  const [form, setForm] = useState({
    label: '', email: '', imapHost: '', imapPort: '993', imapUser: '', imapPass: ''
  })

  useEffect(() => { loadAccounts() }, [currentCompany])

  async function loadAccounts() {
    try {
      const data = await fetchEmailAccounts()
      setAccounts(data)
    } catch (err: any) {
      addToast('error', err.message)
    } finally {
      setLoading(false)
    }
  }

  function updateForm(key: string, value: string) {
    setForm(prev => {
      const next = { ...prev, [key]: value }
      // Auto-fill IMAP settings from email domain
      if (key === 'email' && value.includes('@')) {
        const domain = value.split('@')[1]?.toLowerCase()
        const preset = PRESETS[domain]
        if (preset) {
          next.imapHost = preset.host
          next.imapPort = String(preset.port)
        }
        if (!next.imapUser) next.imapUser = value
        if (!next.label) next.label = value
      }
      return next
    })
  }

  async function handleTest() {
    setTesting(true)
    try {
      const result = await testEmailConnection({
        imapHost: form.imapHost,
        imapPort: parseInt(form.imapPort),
        imapUser: form.imapUser,
        imapPass: form.imapPass,
      })
      if (result.success) {
        addToast('success', '✅ Connection successful!')
      } else {
        addToast('error', `Connection failed: ${result.error}`)
      }
    } catch (err: any) {
      addToast('error', err.message)
    } finally {
      setTesting(false)
    }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!form.email || !form.imapHost || !form.imapUser || !form.imapPass) {
      addToast('error', 'All fields are required')
      return
    }
    setAdding(true)
    try {
      await addEmailAccount({
        label: form.label || form.email,
        email: form.email,
        imapHost: form.imapHost,
        imapPort: parseInt(form.imapPort),
        imapUser: form.imapUser,
        imapPass: form.imapPass,
      })
      addToast('success', 'Email account connected!')
      setForm({ label: '', email: '', imapHost: '', imapPort: '993', imapUser: '', imapPass: '' })
      setShowForm(false)
      await loadAccounts()
    } catch (err: any) {
      addToast('error', err.message)
    } finally {
      setAdding(false)
    }
  }

  async function handleScan(accountId: string) {
    setScanning(accountId)
    setScanResult(null)
    try {
      await triggerEmailScan(accountId)
      addToast('info', '🔍 Email scan running in background — receipts will appear automatically!')
      await loadAccounts()
    } catch (err: any) {
      addToast('error', err.message)
    } finally {
      setTimeout(() => setScanning(null), 3000)
    }
  }

  async function handleRescan(accountId: string) {
    if (!confirm('This will clear scan history and re-process all emails from the last 30 days. Continue?')) return
    setScanning(accountId)
    setScanResult(null)
    try {
      await triggerEmailRescan(accountId)
      addToast('info', '🔄 Email rescan running in background — check back in a moment!')
      await loadAccounts()
    } catch (err: any) {
      addToast('error', err.message)
    } finally {
      setTimeout(() => setScanning(null), 3000)
    }
  }

  async function handleDelete(accountId: string, label: string) {
    if (!confirm(`Remove "${label}" and all its scan history?`)) return
    try {
      await deleteEmailAccount(accountId)
      addToast('success', 'Email account removed')
      await loadAccounts()
    } catch (err: any) {
      addToast('error', err.message)
    }
  }

  return (
    <div className="page-enter">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
        <button className="btn btn-ghost" onClick={() => navigate('/settings')} style={{ padding: '4px' }}>
          <Icon.ArrowLeft size={20} />
        </button>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 700, flex: 1 }}>Email Scanner</h2>
      </div>

      {/* Info card */}
      <div className="card" style={{ marginBottom: '12px', padding: '12px', background: 'var(--accent-light)' }}>
        <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          📧 Connect your email to automatically find receipts and invoices.
          We search for emails with subjects like "receipt", "invoice", "order confirmation" and extract the data.
        </p>
      </div>

      {/* Connected Accounts */}
      {loading ? (
        <div className="processing-spinner" style={{ margin: '24px auto' }}></div>
      ) : (
        <>
          {accounts.length > 0 && (
            <div className="card settings-card" style={{ marginBottom: '12px' }}>
              <p className="section-title" style={{ marginBottom: '8px' }}>
                Connected Accounts ({accounts.length})
              </p>
              <div className="member-list">
                {accounts.map(acc => (
                  <div key={acc.id} className="email-account-item">
                    <div className="email-account-info">
                      <div className="email-account-label">{acc.label}</div>
                      <div className="email-account-meta">
                        {acc.email} · {acc.imapHost}
                        {acc.lastScanAt && (
                          <> · Last scan: {new Date(acc.lastScanAt).toLocaleDateString('en-AU')}</>
                        )}
                      </div>
                    </div>
                    <div className="email-account-actions">
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => handleScan(acc.id)}
                        disabled={scanning === acc.id}
                        style={{ fontSize: '0.68rem', padding: '4px 10px' }}
                      >
                        {scanning === acc.id ? '⏳ Scanning...' : '🔍 Scan'}
                      </button>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => handleRescan(acc.id)}
                        disabled={scanning === acc.id}
                        style={{ fontSize: '0.68rem', padding: '4px 8px' }}
                        title="Clear history and re-scan with screenshots"
                      >
                        🔄
                      </button>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => handleDelete(acc.id, acc.label)}
                        style={{ fontSize: '0.68rem', padding: '4px 6px', color: 'var(--danger)' }}
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Scan Results */}
          {scanResult && (
            <div className="card settings-card" style={{ marginBottom: '12px' }}>
              <p className="section-title" style={{ marginBottom: '8px' }}>
                Scan Results
              </p>
              <div className="scan-summary">
                <div className="scan-stat">
                  <span className="scan-stat-value">{scanResult.total_emails_checked}</span>
                  <span className="scan-stat-label">Checked</span>
                </div>
                <div className="scan-stat">
                  <span className="scan-stat-value">{scanResult.receipts_found}</span>
                  <span className="scan-stat-label">Found</span>
                </div>
                <div className="scan-stat accent">
                  <span className="scan-stat-value">{scanResult.receipts_saved}</span>
                  <span className="scan-stat-label">Saved</span>
                </div>
              </div>

              {scanResult.details.length > 0 && (
                <div className="scan-details">
                  {scanResult.details.map((d, i) => (
                    <div key={i} className={`scan-detail-item ${d.status}`}>
                      <div className="scan-detail-status">
                        {d.status === 'saved' ? '✅' : d.status === 'skipped' ? '⏭️' : '❌'}
                      </div>
                      <div className="scan-detail-info">
                        <div className="scan-detail-subject">{d.subject}</div>
                        <div className="scan-detail-from">{d.from}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {scanResult.errors.length > 0 && (
                <div style={{ marginTop: '8px', fontSize: '0.68rem', color: 'var(--danger)' }}>
                  {scanResult.errors.map((e, i) => <p key={i}>⚠️ {e}</p>)}
                </div>
              )}
            </div>
          )}

          {/* Add Account Form */}
          {showForm ? (
            <div className="card settings-card" style={{ marginBottom: '12px' }}>
              <p className="section-title" style={{ marginBottom: '8px' }}>Add Email Account</p>
              <form onSubmit={handleAdd}>
                <div className="form-group">
                  <label className="form-label">Email Address *</label>
                  <input type="email" className="form-input" value={form.email}
                    onChange={e => updateForm('email', e.target.value)}
                    placeholder="your@email.com" required />
                  <p style={{ fontSize: '0.6rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                    Gmail, Outlook, Yahoo, and most providers supported
                  </p>
                </div>

                <div className="form-group">
                  <label className="form-label">Label</label>
                  <input type="text" className="form-input" value={form.label}
                    onChange={e => updateForm('label', e.target.value)}
                    placeholder="e.g. Work Gmail, Personal" />
                </div>

                <div className="form-row">
                  <div className="form-group" style={{ flex: 2 }}>
                    <label className="form-label">IMAP Server *</label>
                    <input type="text" className="form-input" value={form.imapHost}
                      onChange={e => updateForm('imapHost', e.target.value)}
                      placeholder="imap.gmail.com" required />
                  </div>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label className="form-label">Port</label>
                    <input type="number" className="form-input" value={form.imapPort}
                      onChange={e => updateForm('imapPort', e.target.value)} />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Username *</label>
                  <input type="text" className="form-input" value={form.imapUser}
                    onChange={e => updateForm('imapUser', e.target.value)}
                    placeholder="Usually your email address" required />
                </div>

                <div className="form-group">
                  <label className="form-label">App Password *</label>
                  <input type="password" className="form-input" value={form.imapPass}
                    onChange={e => updateForm('imapPass', e.target.value)}
                    placeholder="App-specific password" required />
                  <p style={{ fontSize: '0.6rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                    For Gmail: Google Account → Security → App Passwords.
                    For Outlook: Account Settings → Security → App Passwords.
                  </p>
                </div>

                <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                  <button type="button" className="btn btn-secondary" onClick={handleTest}
                    disabled={testing || !form.imapHost || !form.imapUser || !form.imapPass}
                    style={{ flex: 1 }}>
                    {testing ? '⏳ Testing...' : '🔌 Test Connection'}
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={adding}
                    style={{ flex: 1 }}>
                    {adding ? '⏳ Adding...' : '✓ Connect'}
                  </button>
                </div>

                <button type="button" className="btn btn-ghost btn-block"
                  onClick={() => setShowForm(false)} style={{ marginTop: '8px', fontSize: '0.72rem' }}>
                  Cancel
                </button>
              </form>
            </div>
          ) : (
            <button className="btn btn-primary btn-block" onClick={() => setShowForm(true)}>
              + Add Email Account
            </button>
          )}
        </>
      )}
    </div>
  )
}
