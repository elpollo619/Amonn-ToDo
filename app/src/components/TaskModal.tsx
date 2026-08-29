import { useState, type FormEvent } from 'react'
import { useData } from '../context/DataContext'
import {
  PRIORITY_LABELS,
  PRIORITY_ORDER,
  STATUS_LABELS,
  STATUS_ORDER,
} from '../lib/constants'
import type { Task, TaskPriority, TaskStatus } from '../lib/types'
import './Modal.css'

interface Props {
  task?: Task | null
  defaultDate?: string | null
  onClose: () => void
}

export function TaskModal({ task, defaultDate, onClose }: Props) {
  const { profiles, addTask, editTask, removeTask } = useData()
  const editing = Boolean(task)

  const [title, setTitle] = useState(task?.title ?? '')
  const [description, setDescription] = useState(task?.description ?? '')
  const [status, setStatus] = useState<TaskStatus>(task?.status ?? 'open')
  const [priority, setPriority] = useState<TaskPriority>(task?.priority ?? 'medium')
  const [assignee, setAssignee] = useState<string>(task?.assignee_id ?? '')
  const [dueDate, setDueDate] = useState<string>(
    task?.due_date ?? defaultDate ?? '',
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!title.trim()) {
      setError('El título es obligatorio')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const payload = {
        title: title.trim(),
        description: description.trim() || null,
        status,
        priority,
        assignee_id: assignee || null,
        due_date: dueDate || null,
      }
      if (editing && task) {
        await editTask(task.id, payload)
      } else {
        await addTask(payload)
      }
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
    try {
      await removeTask(task.id)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al eliminar')
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <form onSubmit={handleSubmit}>
          <div className="modal-header">
            <h2>{editing ? 'Editar tarea' : 'Nueva tarea'}</h2>
            <button type="button" className="close-x" onClick={onClose}>
              ×
            </button>
          </div>

          <div className="modal-body">
            <div className="field">
              <label>Título *</label>
              <input
                className="input"
                autoFocus
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ej. Revisar instalación nave 3"
              />
            </div>

            <div className="field">
              <label>Descripción</label>
              <textarea
                className="textarea"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Detalles, notas, ubicación…"
              />
            </div>

            <div className="form-row">
              <div className="field">
                <label>Responsable</label>
                <select
                  className="select"
                  value={assignee}
                  onChange={(e) => setAssignee(e.target.value)}
                >
                  <option value="">Sin asignar</option>
                  {profiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.full_name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Fecha (calendario)</label>
                <input
                  type="date"
                  className="input"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
              </div>
            </div>

            <div className="form-row">
              <div className="field">
                <label>Estado</label>
                <select
                  className="select"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as TaskStatus)}
                >
                  {STATUS_ORDER.map((s) => (
                    <option key={s} value={s}>
                      {STATUS_LABELS[s]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Prioridad</label>
                <select
                  className="select"
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as TaskPriority)}
                >
                  {PRIORITY_ORDER.map((p) => (
                    <option key={p} value={p}>
                      {PRIORITY_LABELS[p]}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {error && (
              <p style={{ color: 'var(--danger)', fontSize: 13, margin: '4px 0 0' }}>
                {error}
              </p>
            )}
          </div>

          <div className="modal-footer">
            {editing ? (
              <button
                type="button"
                className="btn btn-danger btn-sm"
                onClick={handleDelete}
                disabled={saving}
              >
                🗑 Eliminar
              </button>
            ) : (
              <span />
            )}
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                type="button"
                className="btn"
                onClick={onClose}
                disabled={saving}
              >
                Cancelar
              </button>
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
