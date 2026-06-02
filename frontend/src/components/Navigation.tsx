import { useLocation, useNavigate } from 'react-router-dom'

const navItems = [
  { path: '/', icon: '🏠', label: 'Home' },
  { path: '/history', icon: '📋', label: 'History' },
  { path: '/scan', icon: '📸', label: '', isScan: true },
  { path: '/manual', icon: '✏️', label: 'Manual' },
]

export default function Navigation() {
  const location = useLocation()
  const navigate = useNavigate()

  return (
    <nav className="bottom-nav" id="main-nav">
      <div className="bottom-nav-inner">
        {navItems.map(item => (
          <button
            key={item.path}
            id={`nav-${item.path.replace('/', '') || 'home'}`}
            className={`nav-item ${item.isScan ? 'scan-btn' : ''} ${location.pathname === item.path ? 'active' : ''}`}
            onClick={() => navigate(item.path)}
          >
            <span className="nav-icon">{item.icon}</span>
            {item.label && <span>{item.label}</span>}
          </button>
        ))}
      </div>
    </nav>
  )
}
