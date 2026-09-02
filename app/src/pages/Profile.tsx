import { useState, type FormEvent } from 'react'
import { useAuth } from '../context/AuthContext'
import { useData } from '../context/DataContext'
import { useToast } from '../context/ToastContext'
import { Avatar } from '../components/Avatar'
import { IconLogout, IconWhatsApp } from '../components/Icons'
import { AVATAR_COLORS } from '../lib/constants'
import * as api from '../lib/api'

export function Profile() {
  const { user, refresh, signOut } = useAuth()
  const { reload } = useData()
  const { show } = useToast()
  const [name, setName] = useState(user?.full_name ?? '')
  const [phone, setPhone] = useState(user?.phone ?? '')
  const [color, setColor] = useState(user?.avatar_color ?? AVATAR_COLORS[0])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ candidates: number; sent: number } | null>(null)
  const [testError, setTestError] = useState<string | null>(null)

  if (!user) return null

  const phoneTrim = phone.trim()
  const phoneLooksOk = phoneTrim === '' || /^\+\d{8,15}$/.test(phoneTrim.replace(/[\s-]/g, ''))

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!phoneLooksOk) { setError('El teléfono debe empezar por + y el prefijo del país, ej. +34600111222'); return }
    setSaving(true); setError(null)
    try {
      await api.updateProfile(user!.id, {
        full_name: name.trim() || null,
        phone: phoneTrim.replace(/[\s-]/g, '') || null,
        avatar_color: color,
      })
      await refresh(); await reload()
      show('Perfil guardado', 'success')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar')
    } finally { setSaving(false) }
  }

  async function handleTestReminders() {
    setTesting(true); setTestResult(null); setTestError(null)
    try { setTestResult(await api.runReminders()) }
    catch (err) { setTestError(err instanceof Error ? err.message : 'No se pudo enviar') }
    finally { setTesting(false) }
  }

  function testMessage() {
    if (!testResult) return null
    const { candidates, sent } = testResult
    if (sent > 0) {
      return <span style={{ color: 'var(--success)', fontWeight: 600 }}>
        ✓ Enviado{sent > 1 ? 's' : ''} {sent} aviso{sent > 1 ? 's' : ''}. Mira tu WhatsApp y responde <b>SÍ</b> o <b>NO</b>: la tarea se actualizará sola.
      </span>
    }
    if (candidates === 0) {
      return <span>No había nada que avisar. Se avisa de tareas <b>abiertas o en curso</b>, con fecha de <b>hoy o anterior</b>, asignadas a alguien <b>con teléfono</b> en su perfil, y como mucho una vez cada 20 horas por tarea.</span>
    }
    return <span style={{ color: 'var(--danger)' }}>
      Había {candidates} tarea{candidates > 1 ? 's' : ''} pendiente{candidates > 1 ? 's' : ''} de aviso pero no se pudo enviar. Revisa el registro del servidor (conexión con el Gateway de WhatsApp).
    </span>
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Mi perfil</h1>
          <div className="subtitle">Tu nombre, tu color y el teléfono para los avisos de WhatsApp.</div>
        </div>
      </div>

      <div className="profile-stack">
        <form onSubmit={handleSubmit} className="card">
          <div className="row" style={{ gap: 16, marginBottom: 20 }}>
            <Avatar profile={{ full_name: name, avatar_color: color }} size={64} />
            <div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>{name || 'Tu nombre'}</div>
              <div className="row" style={{ gap: 5, flexWrap: 'wrap', marginTop: 8 }}>
                {AVATAR_COLORS.map((c) => (
                  <button type="button" key={c} onClick={() => setColor(c)} aria-label={`Color ${c}`}
                    style={{
                      width: 24, height: 24, borderRadius: '50%', background: c, padding: 0,
                      border: color === c ? '3px solid var(--text)' : '2px solid transparent',
                      outline: color === c ? '2px solid var(--surface)' : 'none', outlineOffset: -4,
                    }} />
                ))}
              </div>
            </div>
          </div>

          <div className="field">
            <label>Nombre completo</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre y apellidos" />
          </div>

          <div className="field">
            <label>Teléfono para WhatsApp</label>
            <div className="input-wrap">
              <IconWhatsApp size={18} />
              <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)}
                placeholder="+34600111222" inputMode="tel" autoComplete="tel"
                style={!phoneLooksOk ? { borderColor: 'var(--danger)' } : undefined} />
            </div>
            <span className="hint">Con el prefijo del país (España: +34). Sin él, los avisos no llegan.</span>
          </div>

          {error && <div className="error-box">{error}</div>}

          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </form>

        <section className="card">
          <h2 className="card-title">Probar los avisos de WhatsApp</h2>
          <p className="card-sub">
            Los avisos salen solos de lunes a viernes a las 9:00. Con este botón los envías <b>ahora</b> para comprobar
            que todo funciona. Antes: guarda tu teléfono y crea una tarea con fecha de hoy asignada a ti.
          </p>
          <button type="button" className="btn btn-primary" onClick={handleTestReminders} disabled={testing}>
            <IconWhatsApp size={18} /> {testing ? 'Enviando…' : 'Enviar avisos ahora'}
          </button>
          {(testResult || testError) && (
            <p style={{ fontSize: 13.5, marginTop: 12, marginBottom: 0 }}>
              {testError ? <span style={{ color: 'var(--danger)' }}>{testError}</span> : testMessage()}
            </p>
          )}
        </section>

        <section className="card" style={{ padding: 14 }}>
          <button type="button" className="btn btn-danger btn-block" onClick={() => signOut()}>
            <IconLogout size={18} /> Cerrar sesión
          </button>
        </section>
      </div>
    </>
  )
}
