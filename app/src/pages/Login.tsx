import { useState, type FormEvent } from 'react'
import { useAuth } from '../context/AuthContext'
import { demoStore, ensureSeed } from '../lib/demo'
import { Avatar } from '../components/Avatar'
import { IconEye, IconEyeOff } from '../components/Icons'
import './Login.css'

export function Login() {
  const { demoMode, signIn, signUp, signInDemo } = useAuth()
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (demoMode) ensureSeed()
  const demoProfiles = demoMode ? demoStore.getProfiles() : []

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setLoading(true); setError(null)
    try {
      if (mode === 'signin') await signIn(email, password)
      else await signUp(email, password, name.trim() || email.split('@')[0])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo entrar')
    } finally { setLoading(false) }
  }

  return (
    <div className="login-screen">
      <div className="login-box">
        <div className="login-brand">
          <div className="login-logo">A</div>
          <h1>Amonn</h1>
          <p>Tareas del equipo, calendario y avisos por WhatsApp.</p>
        </div>

        {demoMode ? (
          <div className="card">
            <div className="demo-banner" style={{ marginBottom: 14 }}>Modo demostración</div>
            <p className="card-sub">Elige con quién entrar para probar la app:</p>
            {demoProfiles.map((p) => (
              <button key={p.id} className="btn btn-block" style={{ justifyContent: 'flex-start', marginBottom: 8 }}
                onClick={() => signInDemo(p.id)}>
                <Avatar profile={p} size={28} />{p.full_name}
              </button>
            ))}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="card login-card">
            <div className="segmented" style={{ marginBottom: 20 }}>
              <button type="button" className={mode === 'signin' ? 'active' : ''} onClick={() => setMode('signin')}>Entrar</button>
              <button type="button" className={mode === 'signup' ? 'active' : ''} onClick={() => setMode('signup')}>Crear cuenta</button>
            </div>

            {mode === 'signup' && (
              <div className="field">
                <label>Nombre completo</label>
                <input className="input" value={name} onChange={(e) => setName(e.target.value)}
                  placeholder="Nombre y apellidos" autoComplete="name" />
              </div>
            )}
            <div className="field">
              <label>Email</label>
              <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@empresa.com" autoComplete="email" inputMode="email" />
            </div>
            <div className="field">
              <label>Contraseña</label>
              <div className="input-wrap">
                <input className="input" style={{ paddingLeft: 14, paddingRight: 44 }}
                  type={showPw ? 'text' : 'password'} required minLength={6} value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} />
                <button type="button" className="input-action" onClick={() => setShowPw((v) => !v)}
                  aria-label={showPw ? 'Ocultar contraseña' : 'Mostrar contraseña'}>
                  {showPw ? <IconEyeOff size={18} /> : <IconEye size={18} />}
                </button>
              </div>
              {mode === 'signup' && <span className="hint">Mínimo 6 caracteres.</span>}
            </div>

            {error && <div className="error-box">{error}</div>}

            <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
              {loading ? 'Un momento…' : mode === 'signin' ? 'Entrar' : 'Crear cuenta'}
            </button>
          </form>
        )}

        <p className="login-foot">Tus datos se guardan en el servidor de tu empresa, no en la nube.</p>
      </div>
    </div>
  )
}
