import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { supabase, isSupabaseConfigured } from '../lib/supabase'
import { demoStore, ensureSeed } from '../lib/demo'
import { AVATAR_COLORS } from '../lib/constants'
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

const AuthContext = createContext<AuthState | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  async function loadSupabaseProfile(userId: string, email?: string | null) {
    if (!supabase) return
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle()
    if (data) {
      setUser(data as Profile)
      return
    }
    // Crea el perfil si aún no existe (primer inicio de sesión).
    const color = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)]
    const { data: created } = await supabase
      .from('profiles')
      .insert({ id: userId, full_name: email?.split('@')[0] ?? 'Usuario', avatar_color: color })
      .select('*')
      .single()
    setUser((created as Profile) ?? null)
  }

  useEffect(() => {
    let active = true
    async function init() {
      if (isSupabaseConfigured && supabase) {
        const { data } = await supabase.auth.getSession()
        if (data.session?.user) {
          await loadSupabaseProfile(data.session.user.id, data.session.user.email)
        }
        supabase.auth.onAuthStateChange((_event, session) => {
          if (session?.user) {
            loadSupabaseProfile(session.user.id, session.user.email)
          } else {
            setUser(null)
          }
        })
      } else {
        ensureSeed()
        const id = demoStore.getSession()
        if (id) {
          const p = demoStore.getProfiles().find((x) => x.id === id) ?? null
          setUser(p)
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
    demoMode: !isSupabaseConfigured,
    async signIn(email, password) {
      if (!supabase) throw new Error('Supabase no configurado')
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
    },
    async signUp(email, password, name) {
      if (!supabase) throw new Error('Supabase no configurado')
      const { data, error } = await supabase.auth.signUp({ email, password })
      if (error) throw error
      if (data.user) {
        const color =
          AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)]
        await supabase
          .from('profiles')
          .upsert({ id: data.user.id, full_name: name, avatar_color: color })
        await loadSupabaseProfile(data.user.id, email)
      }
    },
    signInDemo(profileId) {
      demoStore.setSession(profileId)
      const p = demoStore.getProfiles().find((x) => x.id === profileId) ?? null
      setUser(p)
    },
    async signOut() {
      if (isSupabaseConfigured && supabase) {
        await supabase.auth.signOut()
      } else {
        demoStore.setSession(null)
      }
      setUser(null)
    },
    async refresh() {
      if (isSupabaseConfigured && supabase && user) {
        await loadSupabaseProfile(user.id)
      } else if (user) {
        const p = demoStore.getProfiles().find((x) => x.id === user.id) ?? null
        setUser(p)
      }
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
