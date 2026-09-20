import { useEffect, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { acceptInvitation } from '../services/api'

export default function JoinCompany() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { user, refreshUser, setCurrentCompany } = useAuth()
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [message, setMessage] = useState('')
  const [companyName, setCompanyName] = useState('')
  const token = searchParams.get('token')

  useEffect(() => {
    if (!token) {
      setStatus('error')
      setMessage('No invitation token found in URL')
      return
    }
    if (!user) {
      // Store token for after login
      localStorage.setItem('pending_invite_token', token)
      setStatus('error')
      setMessage('Please sign up or log in first, then re-open the invite link.')
      return
    }

    // Try to accept the invitation
    acceptInvitation(token)
      .then(async (result) => {
        setStatus('success')
        setCompanyName(result.company.name)
        // Refresh companies list and switch to new company
        await refreshUser()
        setCurrentCompany(result.company)
      })
      .catch(err => {
        setStatus('error')
        setMessage(err.message || 'Failed to accept invitation')
      })
  }, [token, user])

  return (
    <div className="auth-page">
      <div className="auth-container">
        <div className="auth-header">
          <div className="auth-logo">🔗</div>
          {status === 'loading' && (
            <>
              <h1 className="auth-title">Joining...</h1>
              <div className="processing-spinner" style={{ margin: '16px auto' }}></div>
            </>
          )}
          {status === 'success' && (
            <>
              <div style={{ fontSize: '3rem', marginBottom: '12px' }}>✅</div>
              <h1 className="auth-title">Welcome to {companyName}!</h1>
              <p className="auth-subtitle">You've joined the team successfully.</p>
              <button className="btn btn-primary btn-block btn-lg" onClick={() => navigate('/')}
                style={{ marginTop: '16px' }}>
                Go to Dashboard
              </button>
            </>
          )}
          {status === 'error' && (
            <>
              <h1 className="auth-title">Invitation</h1>
              <p style={{ color: 'var(--danger)', marginBottom: '16px' }}>{message}</p>
              {!user ? (
                <button className="btn btn-primary btn-block btn-lg" onClick={() => navigate('/login')}>
                  Sign In / Sign Up
                </button>
              ) : (
                <button className="btn btn-primary btn-block btn-lg" onClick={() => navigate('/')}>
                  Go to Dashboard
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
