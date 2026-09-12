import { useEffect, useState } from 'react'
import { useData } from '../context/DataContext'
import { useToast } from '../context/ToastContext'
import { IconPlus, IconX } from './Icons'
import * as api from '../lib/api'
import type { Subtask } from '../lib/types'
import './Subtasks.css'

/**
 * Lista de pasos de una tarea. Solo aparece al EDITAR una tarea que ya
 * existe: una tarea nueva todavía no tiene id al que colgar los pasos, y
 * fingir lo contrario (guardarlos en memoria y volcarlos al crear) añadía un
 * camino más que podía fallar a cambio de muy poco.
 */
export function Subtasks({ taskId }: { taskId: string }) {
  const { reload } = useData()
  const { show } = useToast()
  const [pasos, setPasos] = useState<Subtask[]>([])
  const [cargando, setCargando] = useState(true)
  const [texto, setTexto] = useState('')

  useEffect(() => {
    let vivo = true
    api.listSubtasks(taskId)
      .then((p) => { if (vivo) setPasos(p) })
      .catch(() => {})
      .finally(() => { if (vivo) setCargando(false) })
    return () => { vivo = false }
  }, [taskId])

  const hechos = pasos.filter((p) => p.done).length

  async function conAviso(accion: () => Promise<unknown>) {
    try {
      await accion()
      setPasos(await api.listSubtasks(taskId))
      // La tarjeta de la tarea enseña el avance, así que hay que recargar.
      await reload()
    } catch (err) {
      show(err instanceof Error ? err.message : 'No se pudo guardar', 'error')
    }
  }

  async function anadir() {
    if (!texto.trim()) return
    const t = texto.trim()
    setTexto('')
    await conAviso(() => api.createSubtask(taskId, t))
  }

  if (cargando) return null

  return (
    <div className="field pasos">
      <label>
        Pasos{' '}
        {pasos.length > 0 && (
          <span className="muted" style={{ fontWeight: 400 }}>{hechos} de {pasos.length}</span>
        )}
      </label>

      {pasos.length > 0 && (
        <div className="pasos-barra" role="img" aria-label={`${hechos} de ${pasos.length} pasos hechos`}>
          <span style={{ width: `${(hechos / pasos.length) * 100}%` }} />
        </div>
      )}

      <ul className="pasos-lista">
        {pasos.map((paso) => (
          <li key={paso.id} className={paso.done ? 'hecho' : undefined}>
            <button type="button" className={'paso-check' + (paso.done ? ' on' : '')}
              aria-label={paso.done ? `Desmarcar ${paso.title}` : `Marcar ${paso.title}`}
              aria-pressed={paso.done}
              onClick={() => void conAviso(() => api.updateSubtask(paso.id, { done: !paso.done }))} />
            <span className="paso-txt">{paso.title}</span>
            <button type="button" className="btn btn-ghost btn-icon btn-sm"
              aria-label={`Borrar ${paso.title}`}
              onClick={() => void conAviso(() => api.deleteSubtask(paso.id))}>
              <IconX size={14} />
            </button>
          </li>
        ))}
      </ul>

      {/* ⚠️ NO puede ser un <form>: este componente vive DENTRO del formulario
          de la tarea, y anidar formularios no es HTML válido — Enter enviaba
          el de fuera, guardaba la tarea y cerraba el modal sin crear el paso. */}
      <div className="paso-nuevo">
        <input className="input" value={texto} placeholder="Añadir un paso…"
          aria-label="Añadir un paso"
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              e.stopPropagation()
              void anadir()
            }
          }} />
        <button type="button" className="btn btn-ghost btn-sm" disabled={!texto.trim()}
          onClick={() => void anadir()}>
          <IconPlus size={16} /> Añadir
        </button>
      </div>
      <span className="hint">También por WhatsApp: «añade a la caldera: cambiar el diferencial».</span>
    </div>
  )
}
