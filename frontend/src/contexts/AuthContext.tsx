import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'
import { AuthUser, Company, fetchCurrentUser, login as apiLogin, signup as apiSignup, createCompany as apiCreateCompany } from '../services/api'

interface AuthContextType {
  user: AuthUser | null
  companies: Company[]
  currentCompany: Company | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  signup: (email: string, password: string, name: string) => Promise<{ pendingInvites: any[] }>
  logout: () => void
  setCurrentCompany: (company: Company) => void
  createCompany: (name: string) => Promise<Company>
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | null>(null)

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

interface Props { children: ReactNode }

export function AuthProvider({ children }: Props) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [companies, setCompanies] = useState<Company[]>([])
  const [currentCompany, setCurrentCompanyState] = useState<Company | null>(null)
  const [loading, setLoading] = useState(true)

  const refreshUser = useCallback(async () => {
    try {
      const token = localStorage.getItem('auth_token')
      if (!token) {
        setLoading(false)
        return
      }
      const data = await fetchCurrentUser()
      setUser(data.user)
      setCompanies(data.companies)

      // Restore current company from localStorage
      const savedCompanyId = localStorage.getItem('current_company_id')
      if (savedCompanyId) {
        const company = data.companies.find(c => c.id === savedCompanyId)
        if (company) {
          setCurrentCompanyState(company)
        } else if (data.companies.length > 0) {
          setCurrentCompanyState(data.companies[0])
          localStorage.setItem('current_company_id', data.companies[0].id)
        }
      } else if (data.companies.length > 0) {
        setCurrentCompanyState(data.companies[0])
        localStorage.setItem('current_company_id', data.companies[0].id)
      }
    } catch {
      localStorage.removeItem('auth_token')
      localStorage.removeItem('current_company_id')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { refreshUser() }, [refreshUser])

  const login = async (email: string, password: string) => {
    const data = await apiLogin(email, password)
    localStorage.setItem('auth_token', data.token)
    setUser(data.user)
    setCompanies(data.companies)
    if (data.companies.length > 0) {
      setCurrentCompanyState(data.companies[0])
      localStorage.setItem('current_company_id', data.companies[0].id)
    }
  }

  const signup = async (email: string, password: string, name: string) => {
    const data = await apiSignup(email, password, name)
    localStorage.setItem('auth_token', data.token)
    setUser(data.user)
    setCompanies([])
    return { pendingInvites: data.pendingInvites }
  }

  const logout = () => {
    localStorage.removeItem('auth_token')
    localStorage.removeItem('current_company_id')
    setUser(null)
    setCompanies([])
    setCurrentCompanyState(null)
  }

  const setCurrentCompany = (company: Company) => {
    setCurrentCompanyState(company)
    localStorage.setItem('current_company_id', company.id)
  }

  const createCompany = async (name: string): Promise<Company> => {
    const data = await apiCreateCompany(name)
    const newCompany = data.company
    setCompanies(prev => [...prev, newCompany])
    setCurrentCompanyState(newCompany)
    localStorage.setItem('current_company_id', newCompany.id)
    return newCompany
  }

  return (
    <AuthContext.Provider value={{
      user, companies, currentCompany, loading,
      login, signup, logout, setCurrentCompany, createCompany, refreshUser
    }}>
      {children}
    </AuthContext.Provider>
  )
}
