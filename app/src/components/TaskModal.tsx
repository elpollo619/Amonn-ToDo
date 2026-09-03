import { useEffect, useState, type FormEvent } from 'react'
import { useData } from '../context/DataContext'
import { useToast } from '../context/ToastContext'
import { PRIORITY_LABELS, PRIORITY_ORDER } from '../lib/constants'
import type { Task, TaskPriority } from '../lib/types'
import { IconTrash, IconX } from './Icons'
import './Modal.css'

interface Props {
  task?: Task | null
  defaultDate?: string | null
  onClose: () => void
}

const PRIORITY_DOT: Record<TaskPriority, string> = { high: '#dc2626', medium: '#0284c7', low: '#9aa1b4' }

export function TaskModal({ task, defaultDate, onClose }: Props) {
  const { profiles, states, addTask, editTask, removeTask } = useData()
  const { show } = useToast()
  const editing = Boolean(task)

  const [title, setTitle] = useState(task?.title ?? '')
  const [description, setDescription] = useState(task?.description ?? '')
  // El estado sustituye al viejo trío fijo. Si la tarea no tiene ninguno
  // (creada antes de esta función), se elige el de serie de su clase.
  const [stateId, setStateId] = useState<string>(task?.state_id ?? '')
  const [priority, setPriority] = useState<TaskPriority>(task?.priority ?? 'medium')
  const [assignee, setAssignee] = useState<string>(task?.assignee_id ?? '')
  const [dueDate, setDueDate] = useState<string>(task?.due_date ?? defaultDate ?? '')
  const [startDate, setStartDate] = useState<string>(task?.start_date ?? '')
  const [workDays, setWorkDays] = useState<string>(
    task?.work_days === null || task?.work_days === undefined ? '' : String(Number(task.work_days)),
  )
  // Si la tarea no traía estado, se usa el de serie de su clase: así el
  // selector nunca aparece sin nada marcado.
  const estadoElegido =
    stateId ||
    states.find((e) => e.kind === (task?.status ?? 'open') && e.is_default)?.id ||
    states.find((e) => e.kind === (task?.status ?? 'open'))?.id ||
    ''
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey) }
  }, [onClose])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!title.trim()) { setError('Escribe un título para la tarea'); return }
    setSaving(true); setError(null)
    try {
      const payload = {
        title: title.trim(),
        description: description.trim() || null,
        state_id: estadoElegido || null, priority,
        assignee_id: assignee || null,
        due_date: dueDate || null,
        start_date: startDate || null,
        work_days: workDays.trim() === '' ? null : Number(workDays.replace(',', '.')),
      }
      if (editing && task) { await editTask(task.id, payload); show('Tarea guardada', 'success') }
      else { await addTask(payload); show('Tarea creada', 'success') }
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar')
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!task) return
    if (!confirm('¿Eliminar esta tarea? No se puede deshacer.')) return
    setSaving(true)
    try { await removeTask(task.id); show('Tarea eliminada'); onClose() }
    catch (err) { setError(err instanceof Error ? err.message : 'Error al eliminar'); setSaving(false) }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <form onSubmit={handleSubmit}>
          <div className="modal-grip" />
          <div className="modal-header">
            <h2>{editing ? 'Editar tarea' : 'Nueva tarea'}</h2>
            <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={onClose} aria-label="Cerrar">
              <IconX size={20} />
            </button>
          </div>

          <div className="modal-body">
            <div className="field">
              <label>Título</label>
              <input className="input" autoFocus value={title} onChange={(e) => setTitle(e.target.value)}
                placeholder="Ej. Revisar instalación nave 3" />
            </div>

            <div className="field">
              <label>Descripción <span className="muted" style={{ fontWeight: 400 }}>(opcional)</span></label>
              <textarea className="textarea" value={description} onChange={(e) => setDescription(e.target.value)}
                placeholder="Detalles, notas, ubicación…" rows={3} />
            </div>

            <div className="form-row">
              <div className="field">
                <label>Responsable</label>
                <select className="select" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
                  <option value="">Sin asignar</option>
                  {profiles.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
                </select>
              </div>
              <div className="field">
                <label htmlFor="tm-fin">Fecha de fin</label>
                <input id="tm-fin" type="date" className="input" value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)} />
              </div>
            </div>

            {/* Plazo: una tarea puede ocupar varios días, no solo vencer uno.
                Es lo que alimenta la carga en días y la línea de tiempo. */}
            <div className="form-row">
              <div className="field">
                <label htmlFor="tm-inicio">
                  Empieza <span className="muted" style={{ fontWeight: 400 }}>(opcional)</span>
                </label>
                <input id="tm-inicio" type="date" className="input" value={startDate}
                  max={dueDate || undefined}
                  onChange={(e) => setStartDate(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="tm-dias">
                  Días de trabajo <span className="muted" style={{ fontWeight: 400 }}>(opcional)</span>
                </label>
                <input id="tm-dias" type="number" step="0.5" min="0" className="input"
                  placeholder="p. ej. 2" value={workDays}
                  onChange={(e) => setWorkDays(e.target.value)} />
              </div>
            </div>

            <div className="field">
              <label>Prioridad</label>
              <div className="choice-group">
                {PRIORITY_ORDER.map((p) => (
                  <button type="button" key={p} className="choice" aria-pressed={priority === p}
                    onClick={() => setPriority(p)}>
                    <span className="dot" style={{ background: PRIORITY_DOT[p] }} />{PRIORITY_LABELS[p]}
                  </button>
                ))}
              </div>
            </div>

            <div className="field">
              <label>Estado</label>
              <div className="choice-group choice-wrap">
                {states.map((e) => (
                  <button type="button" key={e.id} className="choice" aria-pressed={estadoElegido === e.id}
                    onClick={() => setStateId(e.id)}>
                    <span className={`dot punto-color color-${e.color}`} />{e.name}
                  </button>
                ))}
              </div>
            </div>

            {error && <div className="error-box">{error}</div>}
          </div>

          <div className="modal-footer">
            {editing ? (
              <button type="button" className="btn btn-danger btn-sm" onClick={handleDelete} disabled={saving}>
                <IconTrash size={16} /> Eliminar
              </button>
            ) : <span />}
            <div className="row">
              <button type="button" className="btn" onClick={onClose} disabled={saving}>Cancelar</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? 'Guardando…' : editing ? 'Guardar' : 'Crear tarea'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
