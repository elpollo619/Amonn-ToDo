import { useState, type FormEvent } from 'react'
import { useAuth } from '../context/AuthContext'
import { useData } from '../context/DataContext'
import { Avatar } from '../components/Avatar'
import { AVATAR_COLORS } from '../lib/constants'
import * as api from '../lib/api'

export function Profile() {
  const { user, refresh } = useAuth()
  const { reload } = useData()
  const [name, setName] = useState(user?.full_name ?? '')
  const [phone, setPhone] = useState(user?.phone ?? '')
  const [color, setColor] = useState(user?.avatar_color ?? AVATAR_COLORS[0])
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ candidates: number; sent: number } | null>(null)
  const [testError, setTestError] = useState<string | null>(null)

  if (!user) return null

  async function handleTestReminders() {
    setTesting(true)
    setTestResult(null)
    setTestError(null)
    try {
      setTestResult(await api.runReminders())
    } catch (err) {
      setTestError(err instanceof Error ? err.message : 'No se pudo enviar')
    } finally {
      setTesting(false)
    }
  }

  function testMessage() {
    if (!testResult) return null
    const { candidates, sent } = testResult
    if (sent > 0) {
      return (
        <span style={{ color: 'var(--success)', fontWeight: 600 }}>
          ✓ Enviado{sent > 1 ? 's' : ''} {sent} aviso{sent > 1 ? 's' : ''}. Mira tu WhatsApp y
          responde <b>SÍ</b> o <b>NO</b>: la tarea se actualizará sola.
        </span>
      )
    }
    if (candidates === 0) {
      return (
        <span>
          No había nada que avisar. Se avisa de tareas <b>abiertas o en curso</b>, con fecha de{' '}
          <b>hoy o anterior</b>, asignadas a alguien <b>con teléfono</b> en su perfil, y como mucho
          una vez cada 20 horas por tarea.
        </span>
      )
    }
    return (
      <span style={{ color: 'var(--danger)' }}>
        Había {candidates} tarea{candidates > 1 ? 's' : ''} pendiente{candidates > 1 ? 's' : ''} de
        aviso pero no se pudo enviar. Revisa el registro del servidor (conexión con el Gateway de
        WhatsApp).
      </span>
    )
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setSaved(false)
    setError(null)
    try {
      await api.updateProfile(user!.id, {
        full_name: name.trim() || null,
        phone: phone.trim() || null,
        avatar_color: color,
      })
      await refresh()
      await reload()
      setSaved(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Mi perfil</h1>
          <div className="subtitle">
            Tu nombre, color y el teléfono para recibir avisos de WhatsApp.
          </div>
        </div>
      </div>

      <form
        onSubmit={handleSubmit}
        style={{
          maxWidth: 460,
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          padding: 24,
          boxShadow: 'var(--shadow)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            marginBottom: 22,
          }}
        >
          <Avatar profile={{ full_name: name, avatar_color: color }} size={56} />
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
            {AVATAR_COLORS.map((c) => (
              <button
                type="button"
                key={c}
                onClick={() => setColor(c)}
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: '50%',
                  background: c,
                  border: color === c ? '3px solid var(--text)' : '2px solid transparent',
                  cursor: 'pointer',
                }}
                aria-label={`Color ${c}`}
              />
            ))}
          </div>
        </div>

        <div className="field">
          <label>Nombre completo</label>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div className="field">
          <label>Teléfono WhatsApp (formato internacional)</label>
          <input
            className="input"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+34600111222"
          />
          <span style={{ fontSize: 12, color: 'var(--text-soft)' }}>
            Incluye el prefijo del país, ej. +34 para España.
          </span>
        </div>

        {error && (
          <p style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</p>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Guardando…' : 'Guardar cambios'}
          </button>
          {saved && (
            <span style={{ color: 'var(--success)', fontSize: 13, fontWeight: 600 }}>
              ✓ Guardado
            </span>
          )}
        </div>
      </form>

      <section
        style={{
          maxWidth: 460,
          marginTop: 18,
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          padding: 24,
          boxShadow: 'var(--shadow)',
        }}
      >
        <h2 style={{ fontSize: 16, margin: '0 0 6px' }}>Probar los avisos de WhatsApp</h2>
        <p style={{ fontSize: 13, color: 'var(--text-soft)', margin: '0 0 14px' }}>
          Normalmente los avisos salen solos (de lunes a viernes a las 9:00). Con este botón los
          envías <b>ahora mismo</b> para comprobar que todo funciona. Antes: guarda tu teléfono
          arriba y crea una tarea con fecha de hoy asignada a ti.
        </p>
        <button
          type="button"
          className="btn btn-primary"
          onClick={handleTestReminders}
          disabled={testing}
        >
          {testing ? 'Enviando…' : 'Enviar avisos de WhatsApp ahora'}
        </button>
        {(testResult || testError) && (
          <p style={{ fontSize: 13, marginTop: 12, marginBottom: 0 }}>
            {testError ? (
              <span style={{ color: 'var(--danger)' }}>{testError}</span>
            ) : (
              testMessage()
            )}
          </p>
        )}
      </section>
    </>
  )
}
