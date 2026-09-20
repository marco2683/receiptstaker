import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { fetchCompanyMembers, inviteMember, removeMember, uploadCompanyLogo, updateLogoShape, getCompanyLogoUrl, Member, Invitation } from '../services/api'
import * as Icon from '../components/Icons'
import type { AddToast } from '../components/Toast'

interface Props { addToast: AddToast }

export default function CompanySettings({ addToast }: Props) {
  const navigate = useNavigate()
  const { currentCompany, user, companies, setCurrentCompany, logout } = useAuth()
  const [members, setMembers] = useState<Member[]>([])
  const [pendingInvitations, setPendingInvitations] = useState<Invitation[]>([])
  const [loading, setLoading] = useState(true)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<'staff' | 'admin'>('staff')
  const [inviting, setInviting] = useState(false)
  const [copiedToken, setCopiedToken] = useState<string | null>(null)

  const isAdmin = currentCompany?.role === 'admin'

  useEffect(() => {
    if (currentCompany) loadMembers()
  }, [currentCompany])

  async function loadMembers() {
    if (!currentCompany) return
    setLoading(true)
    try {
      const data = await fetchCompanyMembers(currentCompany.id)
      setMembers(data.members)
      setPendingInvitations(data.pendingInvitations)
    } catch (err: any) {
      addToast('error', err.message || 'Failed to load members')
    } finally {
      setLoading(false)
    }
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    if (!inviteEmail.trim() || !currentCompany) return
    setInviting(true)
    try {
      const result = await inviteMember(currentCompany.id, inviteEmail.trim(), inviteRole)
      addToast('success', `Invitation created for ${inviteEmail}`)
      setInviteEmail('')

      // Show the token for copying
      if (result.invitation?.token) {
        setCopiedToken(result.invitation.token)
        // Auto-copy to clipboard
        try {
          await navigator.clipboard.writeText(result.invitation.token)
          addToast('info', 'Token copied to clipboard!')
        } catch {
          // clipboard might fail on mobile
        }
      }

      await loadMembers()
    } catch (err: any) {
      addToast('error', err.message || 'Failed to invite')
    } finally {
      setInviting(false)
    }
  }

  async function handleRemoveMember(memberId: string, memberName: string) {
    if (!currentCompany) return
    if (!confirm(`Remove ${memberName} from ${currentCompany.name}?`)) return
    try {
      await removeMember(currentCompany.id, memberId)
      addToast('success', `${memberName} removed`)
      await loadMembers()
    } catch (err: any) {
      addToast('error', err.message || 'Failed to remove member')
    }
  }

  async function handleCopyToken(token: string) {
    try {
      await navigator.clipboard.writeText(token)
      setCopiedToken(token)
      addToast('success', 'Token copied!')
      setTimeout(() => setCopiedToken(null), 3000)
    } catch {
      addToast('error', 'Failed to copy')
    }
  }

  if (!currentCompany) {
    return (
      <div className="page-enter">
        <div className="empty-state">
          <h3>No Company Selected</h3>
          <p>Create or join a company to get started</p>
          <button className="btn btn-primary" onClick={() => navigate('/setup')}>
            Set Up Company
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="page-enter">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
        <button className="btn btn-ghost" onClick={() => navigate('/')} style={{ padding: '4px' }}>
          <Icon.ArrowLeft size={20} />
        </button>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 700, flex: 1 }}>Company Settings</h2>
      </div>

      {/* Company Info + Logo */}
      <div className="card settings-card">
        <div className="settings-company-header">
          <div className="settings-company-icon">
            <Icon.Home size={24} />
          </div>
          <div style={{ flex: 1 }}>
            <h3 className="settings-company-name">{currentCompany.name}</h3>
            <span className={`role-badge ${currentCompany.role}`}>
              {currentCompany.role}
            </span>
          </div>
        </div>
        {isAdmin && (
          <div className="logo-upload-area">
            {currentCompany.logoFilename ? (
              <img src={getCompanyLogoUrl(currentCompany.id)} className={`logo-preview logo-${currentCompany.logoShape || 'square'}`} alt="Logo" />
            ) : (
              <div className="logo-placeholder">🏢</div>
            )}
            <div style={{ flex: 1 }}>
              <label className="btn btn-secondary btn-sm" style={{ fontSize: '0.7rem', cursor: 'pointer' }}>
                {currentCompany.logoFilename ? '🔄 Change Logo' : '📷 Upload Logo'}
                <input type="file" accept="image/*" hidden onChange={async (e) => {
                  const file = e.target.files?.[0]
                  if (!file) return
                  try {
                    await uploadCompanyLogo(currentCompany.id, file)
                    addToast('success', 'Logo uploaded!')
                    window.location.reload()
                  } catch (err: any) {
                    addToast('error', err.message)
                  }
                }} />
              </label>
              {currentCompany.logoFilename && (
                <div className="logo-shape-selector">
                  {(['landscape', 'square', 'portrait'] as const).map(shape => (
                    <button
                      key={shape}
                      className={`logo-shape-btn ${(currentCompany.logoShape || 'square') === shape ? 'active' : ''}`}
                      onClick={async () => {
                        try {
                          await updateLogoShape(currentCompany.id, shape)
                          addToast('success', `Logo shape: ${shape}`)
                          window.location.reload()
                        } catch (err: any) { addToast('error', err.message) }
                      }}
                      title={shape}
                    >
                      <span className={`shape-icon shape-${shape}`} />
                    </button>
                  ))}
                </div>
              )}
              <p style={{ fontSize: '0.58rem', color: 'var(--text-muted)', marginTop: '4px' }}>Max 5MB · PNG, JPG</p>
            </div>
          </div>
        )}
      </div>

      {/* Company Selector */}
      {companies.length > 1 && (
        <div className="card settings-card" style={{ marginTop: '12px' }}>
          <p className="section-title" style={{ marginBottom: '8px' }}>Select Company</p>
          <select
            className="form-select"
            value={currentCompany.id}
            onChange={e => {
              const selected = companies.find(c => c.id === e.target.value)
              if (selected) {
                setCurrentCompany(selected)
                addToast('info', `Switched to ${selected.name}`)
              }
            }}
            style={{ fontSize: '0.88rem', fontWeight: 600 }}
          >
            {companies.map(c => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.role})
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Email Scanner Link */}
      <div className="card settings-card" style={{ marginTop: '12px' }}>
        <button
          className="email-scanner-link"
          onClick={() => navigate('/email-settings')}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
            <span style={{ fontSize: '1.4rem' }}>📧</span>
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>Email Scanner</div>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                Auto-find receipts from connected email accounts
              </div>
            </div>
          </div>
          <Icon.ChevronRight size={16} />
        </button>
      </div>

      {/* Members List */}
      <div className="card settings-card" style={{ marginTop: '12px' }}>
        <p className="section-title" style={{ marginBottom: '8px' }}>
          Team Members ({members.length})
        </p>

        {loading ? (
          <div className="processing-spinner" style={{ margin: '16px auto' }}></div>
        ) : (
          <div className="member-list">
            {members.map(m => (
              <div key={m.id} className="member-item">
                <div className="member-avatar">{m.name[0]?.toUpperCase() || '?'}</div>
                <div className="member-info">
                  <div className="member-name">
                    {m.name}
                    {m.id === user?.id && <span className="member-you"> (you)</span>}
                  </div>
                  <div className="member-email">{m.email}</div>
                </div>
                <span className={`role-badge ${m.role}`}>{m.role}</span>
                {isAdmin && m.id !== user?.id && (
                  <button
                    className="btn btn-ghost member-remove"
                    onClick={() => handleRemoveMember(m.id, m.name)}
                    title="Remove member"
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pending Invitations */}
      {pendingInvitations.length > 0 && (
        <div className="card settings-card" style={{ marginTop: '12px' }}>
          <p className="section-title" style={{ marginBottom: '8px' }}>
            Pending Invitations ({pendingInvitations.length})
          </p>
          <div className="member-list">
            {pendingInvitations.map(inv => (
              <div key={inv.id} className="member-item pending">
                <div className="member-avatar pending">✉</div>
                <div className="member-info">
                  <div className="member-name">{inv.email}</div>
                  <div className="member-email">Invited · {inv.role}</div>
                </div>
                <span className={`role-badge ${inv.role}`}>{inv.role}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Invite Form (admin only) */}
      {isAdmin && (
        <div className="card settings-card" style={{ marginTop: '12px' }}>
          <p className="section-title" style={{ marginBottom: '8px' }}>Invite Team Member</p>
          <form onSubmit={handleInvite}>
            <div className="form-group">
              <input
                type="email"
                className="form-input"
                value={inviteEmail}
                onChange={e => setInviteEmail(e.target.value)}
                placeholder="colleague@company.com"
                required
                id="invite-email"
              />
            </div>
            <div className="form-row" style={{ marginBottom: '12px' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <select
                  className="form-select"
                  value={inviteRole}
                  onChange={e => setInviteRole(e.target.value as 'staff' | 'admin')}
                  id="invite-role"
                >
                  <option value="staff">Staff</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={inviting || !inviteEmail.trim()}
                style={{ marginBottom: 0, whiteSpace: 'nowrap' }}
                id="btn-invite"
              >
                {inviting ? '⏳' : '🔗 Create Invite'}
              </button>
            </div>
          </form>

          {copiedToken && (() => {
            const inviteLink = `${window.location.origin}/join?token=${copiedToken}`
            return (
              <div className="invite-token-box">
                <p className="token-label">✅ Invite created! Share this link with the invitee:</p>
                <div className="token-value" style={{ flexDirection: 'column', gap: '8px' }}>
                  <code style={{ wordBreak: 'break-all', fontSize: '0.68rem', lineHeight: 1.4 }}>
                    {inviteLink}
                  </code>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      className="btn btn-primary"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(inviteLink)
                          addToast('success', 'Link copied!')
                        } catch {
                          addToast('error', 'Failed to copy')
                        }
                      }}
                      style={{ padding: '6px 12px', fontSize: '0.72rem', flex: 1 }}
                    >
                      📋 Copy Link
                    </button>
                    {navigator.share && (
                      <button
                        className="btn btn-secondary"
                        onClick={() => {
                          navigator.share({
                            title: `Join ${currentCompany.name} on Receipt Taker`,
                            text: `You've been invited to join ${currentCompany.name}. Open this link to accept:`,
                            url: inviteLink
                          }).catch(() => {})
                        }}
                        style={{ padding: '6px 12px', fontSize: '0.72rem', flex: 1 }}
                      >
                        📤 Share
                      </button>
                    )}
                  </div>
                </div>
                <p style={{ fontSize: '0.62rem', color: 'var(--text-muted)', marginTop: '6px' }}>
                  The invitee must sign up first, then open this link to join.
                </p>
              </div>
            )
          })()}
        </div>
      )}

      {/* Account Section */}
      <div className="card settings-card" style={{ marginTop: '12px' }}>
        <p className="section-title" style={{ marginBottom: '8px' }}>Account</p>
        <div className="member-item">
          <div className="member-avatar">{user?.name[0]?.toUpperCase() || '?'}</div>
          <div className="member-info">
            <div className="member-name">{user?.name}</div>
            <div className="member-email">{user?.email}</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
          <button
            className="btn btn-secondary"
            onClick={() => navigate('/setup')}
            style={{ flex: 1 }}
          >
            + New Company
          </button>
          <button
            className="btn btn-secondary"
            onClick={logout}
            style={{ flex: 1, color: 'var(--danger)' }}
            id="btn-logout"
          >
            Sign Out
          </button>
        </div>
      </div>
    </div>
  )
}
