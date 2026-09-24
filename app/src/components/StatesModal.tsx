import { useState, type FormEvent } from 'react'
import { useData } from '../context/DataContext'
import { useToast } from '../context/ToastContext'
import { IconPlus, IconX } from './Icons'
import * as api from '../lib/api'
import type { TaskState, TaskStatus } from '../lib/types'
import './Modal.css'
import './StatesModal.css'

// Las tres CLASES no se pueden inventar: son las que el resto del sistema
// entiende (el asistente de WhatsApp, los recordatorios, los avisos de
// vencidas). Lo que el equipo define son los nombres.
const CLASES: { kind: TaskStatus; etiqueta: string; ayuda: string }[] = [
  { kind: 'open', etiqueta: 'Por hacer', ayuda: 'Cuenta como pendiente. Entra en los avisos de vencidas.' },
  { kind: 'in_progress', etiqueta: 'En marcha', ayuda: 'Sigue pendiente, pero ya se está haciendo.' },
  { kind: 'done', etiqueta: 'Terminada', ayuda: 'Deja de contar como pendiente y no genera avisos.' },
]

const COLORES = ['slate', 'blue', 'green', 'amber', 'red', 'violet', 'teal']

export function StatesModal({ onClose }: { onClose: () => void }) {
  const { states, reload } = useData()
  const { show } = useToast()
  const [nombre, setNombre] = useState('')
  const [clase, setClase] = useState<TaskStatus>('in_progress')
  const [color, setColor] = useState('blue')
  const [ocupado, setOcupado] = useState(false)
  // Los nombres se editan en local y se guardan al SALIR del campo. Guardar
  // en cada tecla dispararía una petición y una recarga por letra.
  const [nombres, setNombres] = useState<Record<string, string>>({})

  async function conRecarga(accion: () => Promise<unknown>, exito: string): Promise<void> {
    setOcupado(true)
    try {
      await accion()
      await reload()
      show(exito, 'success')
    } catch (err) {
      show(err instanceof Error ? err.message : 'No se pudo guardar', 'error')
    } finally {
      setOcupado(false)
    }
  }

  async function crear(e: FormEvent) {
    e.preventDefault()
    if (!nombre.trim()) return
    await conRecarga(
      () => api.createState({ name: nombre.trim(), kind: clase, color }),
      'Estado creado',
    )
    setNombre('')
  }

  async function mover(estado: TaskState, delta: number) {
    const ids = states.map((e) => e.id)
    const i = ids.indexOf(estado.id)
    const j = i + delta
    if (j < 0 || j >= ids.length) return
    ;[ids[i], ids[j]] = [ids[j], ids[i]]
    await conRecarga(() => api.reorderStates(ids), 'Orden guardado')
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal estados-modal" onClick={(e) => e.stopPropagation()}
        role="dialog" aria-modal="true" aria-label="Estados de las tareas">
        <div className="modal-grip" />
        <div className="modal-header">
          <h2>Estados de las tareas</h2>
          <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={onClose} aria-label="Cerrar">
            <IconX size={18} />
          </button>
        </div>

        <div className="modal-body">
          <p className="hint">
            Estos son los nombres de las columnas del tablero. Cada estado pertenece a una de
            tres clases, y es la clase la que decide si la tarea cuenta como pendiente.
          </p>

          <ul className="estados-lista">
            {states.map((estado, i) => (
              <li key={estado.id}>
                <span className={`punto-color color-${estado.color}`} aria-hidden="true" />
                <input
                  className="input estado-nombre"
                  value={nombres[estado.id] ?? estado.name}
                  aria-label={`Nombre del estado ${estado.name}`}
                  onChange={(e) => setNombres((n) => ({ ...n, [estado.id]: e.target.value }))}
                  onBlur={() => {
                    const name = (nombres[estado.id] ?? estado.name).trim()
                    if (!name || name === estado.name) {
                      setNombres((n) => { const c = { ...n }; delete c[estado.id]; return c })
                      return
                    }
                    void conRecarga(() => api.updateState(estado.id, { name }), 'Nombre guardado')
                      .then(() => setNombres((n) => { const c = { ...n }; delete c[estado.id]; return c }))
                  }}
                  onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                />
                <select
                  className="select estado-clase"
                  value={estado.kind}
                  aria-label={`Clase del estado ${estado.name}`}
                  onChange={(e) =>
                    void conRecarga(
                      () => api.updateState(estado.id, { kind: e.target.value as TaskStatus }),
                      'Clase guardada',
                    )
                  }
                >
                  {CLASES.map((c) => <option key={c.kind} value={c.kind}>{c.etiqueta}</option>)}
                </select>
                <div className="estado-acciones">
                  <button type="button" className="btn btn-ghost btn-icon btn-sm" disabled={i === 0 || ocupado}
                    onClick={() => void mover(estado, -1)} aria-label="Subir">↑</button>
                  <button type="button" className="btn btn-ghost btn-icon btn-sm"
                    disabled={i === states.length - 1 || ocupado}
                    onClick={() => void mover(estado, 1)} aria-label="Bajar">↓</button>
                  <button type="button" className="btn btn-ghost btn-icon btn-sm" disabled={ocupado}
                    onClick={() =>
                      void conRecarga(() => api.deleteState(estado.id), 'Estado borrado')
                    }
                    aria-label={`Borrar ${estado.name}`}>
                    <IconX size={15} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
          <p className="hint">
            Al borrar un estado, sus tareas pasan al primer estado de la misma clase: no se
            pierde ninguna. El último estado de cada clase no se puede borrar.
          </p>

          <form className="estado-nuevo" onSubmit={crear}>
            <input className="input" placeholder="Esperando material" value={nombre}
              onChange={(e) => setNombre(e.target.value)} aria-label="Nombre del estado nuevo" />
            <select className="select" value={clase} aria-label="Clase del estado nuevo"
              onChange={(e) => setClase(e.target.value as TaskStatus)}>
              {CLASES.map((c) => <option key={c.kind} value={c.kind}>{c.etiqueta}</option>)}
            </select>
            <select className="select" value={color} aria-label="Color del estado nuevo"
              onChange={(e) => setColor(e.target.value)}>
              {COLORES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <button type="submit" className="btn btn-primary" disabled={!nombre.trim() || ocupado}>
              <IconPlus size={17} /> Añadir
            </button>
          </form>
          <p className="hint">{CLASES.find((c) => c.kind === clase)?.ayuda}</p>
        </div>

        <div className="modal-footer">
          <button type="button" className="btn btn-primary" onClick={onClose}>Listo</button>
        </div>
      </div>
    </div>
  )
}
