import { useState, type FormEvent } from 'react'
import { useAuth } from '../context/AuthContext'
import { demoStore, ensureSeed } from '../lib/demo'
import { Avatar } from '../components/Avatar'

export function Login() {
  const { demoMode, signIn, signUp, signInDemo } = useAuth()
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  ensureSeed()
  const demoProfiles = demoMode ? demoStore.getProfiles() : []

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setInfo(null)
    try {
      if (mode === 'signin') {
        await signIn(email, password)
      } else {
        await signUp(email, password, name.trim() || email.split('@')[0])
        setInfo('Cuenta creada. Si se pide confirmar el email, revisa tu bandeja.')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error de autenticación')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="center-screen" style={{ padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 400 }}>
        <div style={{ textAlign: 'center', marginBottom: 26 }}>
          <div
            style={{
              width: 54,
              height: 54,
              borderRadius: 14,
              background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
              display: 'grid',
              placeItems: 'center',
              color: '#fff',
              fontSize: 26,
              fontWeight: 800,
              margin: '0 auto 12px',
            }}
          >
            A
          </div>
          <h1 style={{ margin: 0, fontSize: 24 }}>Amonn</h1>
          <p style={{ color: 'var(--text-soft)', margin: '6px 0 0', fontSize: 14 }}>
            Tareas del equipo, calendario y avisos por WhatsApp.
          </p>
        </div>

        {demoMode ? (
          <div
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              padding: 22,
              boxShadow: 'var(--shadow)',
            }}
          >
            <div
              className="demo-banner"
              style={{ borderRadius: 8, marginBottom: 16 }}
            >
              🧪 Modo demostración
            </div>
            <p style={{ fontSize: 14, color: 'var(--text-soft)', marginTop: 0 }}>
              Elige con quién entrar para probar la app:
            </p>
            {demoProfiles.map((p) => (
              <button
                key={p.id}
                className="btn"
                style={{
                  width: '100%',
                  justifyContent: 'flex-start',
                  marginBottom: 8,
                }}
                onClick={() => signInDemo(p.id)}
              >
                <Avatar profile={p} size={28} />
                {p.full_name}
              </button>
            ))}
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              padding: 22,
              boxShadow: 'var(--shadow)',
            }}
          >
            {mode === 'signup' && (
              <div className="field">
                <label>Nombre completo</label>
                <input
                  className="input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ana García"
                />
              </div>
            )}
            <div className="field">
              <label>Email</label>
              <input
                className="input"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@empresa.com"
              />
            </div>
            <div className="field">
              <label>Contraseña</label>
              <input
                className="input"
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            {error && (
              <p style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</p>
            )}
            {info && (
              <p style={{ color: 'var(--success)', fontSize: 13 }}>{info}</p>
            )}

            <button
              type="submit"
              className="btn btn-primary"
              style={{ width: '100%', justifyContent: 'center', marginTop: 6 }}
              disabled={loading}
            >
              {loading
                ? 'Un momento…'
                : mode === 'signin'
                ? 'Entrar'
                : 'Crear cuenta'}
            </button>

            <p style={{ textAlign: 'center', fontSize: 13, marginBottom: 0 }}>
              {mode === 'signin' ? '¿No tienes cuenta? ' : '¿Ya tienes cuenta? '}
              <button
                type="button"
                className="btn-ghost"
                style={{
                  border: 'none',
                  color: 'var(--primary)',
                  fontWeight: 600,
                  padding: 0,
                  background: 'none',
                }}
                onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
              >
                {mode === 'signin' ? 'Regístrate' : 'Inicia sesión'}
              </button>
            </p>
          </form>
        )}
      </div>
    </div>
  )
}
