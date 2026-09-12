import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { Avatar } from './Avatar'
import { IconX } from './Icons'
import * as api from '../lib/api'
import type { Comment } from '../lib/types'
import './Comments.css'

const CUANDO = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

/**
 * Comentarios de una tarea, con fotos si el servidor tiene dónde guardarlas.
 * Se pregunta al servidor ANTES de ofrecer el botón de foto: sin volumen en
 * el contenedor los ficheros se perderían en el siguiente despliegue, así que
 * es mejor no ofrecerlo que perder material de obra.
 */
export function Comments({ taskId }: { taskId: string }) {
  const { user } = useAuth()
  const { show } = useToast()
  const [lista, setLista] = useState<Comment[]>([])
  const [texto, setTexto] = useState('')
  const [almacen, setAlmacen] = useState<api.EstadoAdjuntos | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const fichero = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let vivo = true
    api.listCommentsOf(taskId).then((r) => { if (vivo) setLista(r.comments) }).catch(() => {})
    api.attachmentsStatus().then((e) => { if (vivo) setAlmacen(e) }).catch(() => {})
    return () => { vivo = false }
  }, [taskId])

  const recargar = () => api.listCommentsOf(taskId).then((r) => setLista(r.comments))

  async function enviar() {
    if (!texto.trim() || ocupado) return
    const cuerpo = texto.trim()
    setTexto('')
    setOcupado(true)
    try {
      await api.createCommentOn(taskId, cuerpo, user)
      await recargar()
    } catch (err) {
      show(err instanceof Error ? err.message : 'No se pudo comentar', 'error')
      setTexto(cuerpo)
    } finally { setOcupado(false) }
  }

  async function subir(f: File | undefined) {
    if (!f) return
    setOcupado(true)
    try {
      await api.uploadAttachment(taskId, f)
      await recargar()
      show('Foto añadida', 'success')
    } catch (err) {
      show(err instanceof Error ? err.message : 'No se pudo subir', 'error')
    } finally { setOcupado(false) }
  }

  return (
    <div className="field comentarios">
      <label>Comentarios {lista.length > 0 && <span className="muted" style={{ fontWeight: 400 }}>{lista.length}</span>}</label>

      {lista.map((c) => (
        <div className="com" key={c.id}>
          <Avatar profile={{ full_name: c.author_name ?? null, avatar_color: c.author_color ?? '#6b7280' }} size={28} />
          <div className="com-cuerpo">
            <div className="com-meta">
              <b>{c.author_name?.split(' ')[0] ?? 'Alguien'}</b>
              <span>{CUANDO.format(new Date(c.created_at))}</span>
              {c.source === 'whatsapp' && <span className="com-via">por WhatsApp</span>}
            </div>
            <div className="com-txt">{c.body}</div>
            {c.attachments && c.attachments.length > 0 && (
              <div className="com-fotos">
                {c.attachments.map((a) => (
                  <a key={a.id} href={api.attachmentUrl(a.id)} target="_blank" rel="noreferrer">
                    {a.mime.startsWith('image/')
                      ? <img src={api.attachmentUrl(a.id)} alt={a.filename} loading="lazy" />
                      : <span className="com-pdf">{a.filename}</span>}
                  </a>
                ))}
              </div>
            )}
          </div>
          <button type="button" className="btn btn-ghost btn-icon btn-sm" aria-label="Borrar comentario"
            onClick={() => { void api.deleteCommentById(c.id).then(recargar) }}>
            <IconX size={14} />
          </button>
        </div>
      ))}

      {/* Sin <form>: este componente vive dentro del formulario de la tarea. */}
      <div className="com-nuevo">
        <input className="input" value={texto} placeholder="Escribe un comentario…"
          aria-label="Escribe un comentario" onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); void enviar() }
          }} />
        {almacen?.ok && (
          <>
            <input ref={fichero} type="file" hidden accept={almacen.mimes.join(',')}
              onChange={(e) => { void subir(e.target.files?.[0]); e.target.value = '' }} />
            <button type="button" className="btn btn-ghost btn-sm" disabled={ocupado}
              onClick={() => fichero.current?.click()}>Foto</button>
          </>
        )}
        <button type="button" className="btn btn-ghost btn-sm" disabled={!texto.trim() || ocupado}
          onClick={() => void enviar()}>Enviar</button>
      </div>

      {almacen && !almacen.ok && (
        <span className="hint com-aviso">📎 Fotos desactivadas. {almacen.reason}</span>
      )}
      <span className="hint">También por WhatsApp: «comenta en la caldera: falta el diferencial».</span>
    </div>
  )
}
