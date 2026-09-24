import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { apiFetch, getToken, setToken, isDemo } from '../lib/apiClient'
import { demoStore, ensureSeed } from '../lib/demo'
import type { Profile } from '../lib/types'

interface AuthState {
  user: Profile | null
  loading: boolean
  demoMode: boolean
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string, name: string) => Promise<void>
  signInDemo: (profileId: string) => void
  signOut: () => Promise<void>
  refresh: () => Promise<void>
}

interface AuthResponse {
  token: string
  user: Profile
}

const AuthContext = createContext<AuthState | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    async function init() {
      if (isDemo) {
        ensureSeed()
        const id = demoStore.getSession()
        if (id) {
          setUser(demoStore.getProfiles().find((x) => x.id === id) ?? null)
        }
      } else if (getToken()) {
        try {
          const { user } = await apiFetch<{ user: Profile }>('/auth/me')
          if (active) setUser(user)
        } catch {
          setToken(null)
        }
      }
      if (active) setLoading(false)
    }
    init()
    return () => {
      active = false
    }
  }, [])

  const value: AuthState = {
    user,
    loading,
    demoMode: isDemo,
    async signIn(email, password) {
      const res = await apiFetch<AuthResponse>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      })
      setToken(res.token)
      setUser(res.user)
    },
    async signUp(email, password, name) {
      const res = await apiFetch<AuthResponse>('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ email, password, full_name: name }),
      })
      setToken(res.token)
      setUser(res.user)
    },
    signInDemo(profileId) {
      demoStore.setSession(profileId)
      setUser(demoStore.getProfiles().find((x) => x.id === profileId) ?? null)
    },
    async signOut() {
      if (isDemo) {
        demoStore.setSession(null)
      } else {
        setToken(null)
      }
      setUser(null)
    },
    async refresh() {
      if (isDemo) {
        if (user) {
          setUser(demoStore.getProfiles().find((x) => x.id === user.id) ?? null)
        }
        return
      }
      const { user: fresh } = await apiFetch<{ user: Profile }>('/auth/me')
      setUser(fresh)
    },
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>')
  return ctx
}
