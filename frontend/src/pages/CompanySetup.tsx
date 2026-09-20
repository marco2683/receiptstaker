import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { acceptInvitation } from '../services/api'
import * as Icon from '../components/Icons'

export default function CompanySetup() {
  const navigate = useNavigate()
  const { user, companies, createCompany, refreshUser } = useAuth()
  const [companyName, setCompanyName] = useState('')
  const [inviteToken, setInviteToken] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [mode, setMode] = useState<'create' | 'join'>('create')

  async function handleCreateCompany(e: React.FormEvent) {
    e.preventDefault()
    if (!companyName.trim()) {
      setError('Company name is required')
      return
    }
    setError('')
    setLoading(true)

    try {
      await createCompany(companyName.trim())
      navigate('/')
    } catch (err: any) {
      setError(err.message || 'Failed to create company')
    } finally {
      setLoading(false)
    }
  }

  async function handleJoinCompany(e: React.FormEvent) {
    e.preventDefault()
    if (!inviteToken.trim()) {
      setError('Invitation token is required')
      return
    }
    setError('')
    setLoading(true)

    try {
      await acceptInvitation(inviteToken.trim())
      await refreshUser()
      navigate('/')
    } catch (err: any) {
      setError(err.message || 'Failed to join company')
    } finally {
      setLoading(false)
    }
  }

  // If user already has companies, show option to continue or create new
  if (companies.length > 0) {
    return (
      <div className="auth-page">
        <div className="auth-container">
          <div className="auth-logo">
            <div className="auth-logo-icon">
              <Icon.Receipt size={28} color="white" />
            </div>
            <h1 className="auth-brand">Welcome back, {user?.name}!</h1>
            <p className="auth-tagline">Select a company or create a new one</p>
          </div>

          <div className="auth-card">
            <p className="section-title">Your Companies</p>
            <div className="company-list">
              {companies.map(c => (
                <button
                  key={c.id}
                  className="company-card"
                  onClick={() => {
                    localStorage.setItem('current_company_id', c.id)
                    navigate('/')
                  }}
                >
                  <div className="company-icon">
                    <Icon.Home size={20} />
                  </div>
                  <div className="company-info">
                    <div className="company-name">{c.name}</div>
                    <div className="company-role">{c.role}</div>
                  </div>
                  <Icon.ChevronRight size={16} />
                </button>
              ))}
            </div>

            <div className="auth-divider">
              <span>or</span>
            </div>

            <form onSubmit={handleCreateCompany}>
              <div className="form-group">
                <label className="form-label">Create New Company</label>
                <input
                  type="text"
                  className="form-input"
                  value={companyName}
                  onChange={e => setCompanyName(e.target.value)}
                  placeholder="Company name"
                  id="setup-company-name"
                />
              </div>

              {error && (
                <div className="auth-error">
                  <Icon.AlertTriangle size={14} /> {error}
                </div>
              )}

              <button
                type="submit"
                className="btn btn-primary btn-block"
                disabled={loading || !companyName.trim()}
                id="btn-create-company"
              >
                {loading ? '⏳ Creating...' : '+ Create Company'}
              </button>
            </form>
          </div>
        </div>
      </div>
    )
  }

  // New user — create or join
  return (
    <div className="auth-page">
      <div className="auth-container">
        <div className="auth-logo">
          <div className="auth-logo-icon">
            <Icon.Receipt size={28} color="white" />
          </div>
          <h1 className="auth-brand">Welcome, {user?.name}!</h1>
          <p className="auth-tagline">Set up your company to get started</p>
        </div>

        <div className="auth-card">
          <div className="auth-tabs">
            <button
              className={`auth-tab ${mode === 'create' ? 'active' : ''}`}
              onClick={() => { setMode('create'); setError('') }}
              type="button"
            >
              Create Company
            </button>
            <button
              className={`auth-tab ${mode === 'join' ? 'active' : ''}`}
              onClick={() => { setMode('join'); setError('') }}
              type="button"
            >
              Join Company
            </button>
          </div>

          {mode === 'create' ? (
            <form onSubmit={handleCreateCompany} className="auth-form">
              <div className="form-group">
                <label className="form-label">Company Name</label>
                <input
                  type="text"
                  className="form-input"
                  value={companyName}
                  onChange={e => setCompanyName(e.target.value)}
                  placeholder="e.g. Ynot Innovate Pty Ltd"
                  required
                  id="setup-company-name"
                />
              </div>

              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '16px' }}>
                You'll be the admin of this company and can invite staff members later.
              </p>

              {error && (
                <div className="auth-error">
                  <Icon.AlertTriangle size={14} /> {error}
                </div>
              )}

              <button
                type="submit"
                className="btn btn-primary btn-block btn-lg"
                disabled={loading || !companyName.trim()}
                id="btn-create-company"
              >
                {loading ? '⏳ Creating...' : 'Create Company'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleJoinCompany} className="auth-form">
              <div className="form-group">
                <label className="form-label">Invitation Token</label>
                <input
                  type="text"
                  className="form-input"
                  value={inviteToken}
                  onChange={e => setInviteToken(e.target.value)}
                  placeholder="Paste your invitation token here"
                  required
                  id="setup-invite-token"
                />
              </div>

              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '16px' }}>
                Ask your company admin for an invitation token to join their team.
              </p>

              {error && (
                <div className="auth-error">
                  <Icon.AlertTriangle size={14} /> {error}
                </div>
              )}

              <button
                type="submit"
                className="btn btn-primary btn-block btn-lg"
                disabled={loading || !inviteToken.trim()}
                id="btn-join-company"
              >
                {loading ? '⏳ Joining...' : 'Join Company'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
