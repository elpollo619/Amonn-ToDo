import { useMemo, useState } from 'react'
import { useData } from '../context/DataContext'
import { TaskCard } from '../components/TaskCard'
import { TaskModal } from '../components/TaskModal'
import { STATUS_LABELS, STATUS_ORDER } from '../lib/constants'
import type { Task } from '../lib/types'
import './Board.css'

export function Board() {
  const { tasks, profiles, loading } = useData()
  const [modalOpen, setModalOpen] = useState(false)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [filterAssignee, setFilterAssignee] = useState('')
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return tasks.filter((t) => {
      if (filterAssignee && t.assignee_id !== filterAssignee) return false
      if (q && !t.title.toLowerCase().includes(q) &&
        !(t.description ?? '').toLowerCase().includes(q))
        return false
      return true
    })
  }, [tasks, filterAssignee, search])

  const byStatus = useMemo(() => {
    const groups: Record<string, Task[]> = { open: [], in_progress: [], done: [] }
    const rank = { high: 0, medium: 1, low: 2 }
    for (const t of filtered) groups[t.status]?.push(t)
    for (const key of Object.keys(groups)) {
      groups[key].sort((a, b) => rank[a.priority] - rank[b.priority])
    }
    return groups
  }, [filtered])

  function openNew() {
    setEditingTask(null)
    setModalOpen(true)
  }
  function openEdit(task: Task) {
    setEditingTask(task)
    setModalOpen(true)
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Tareas del equipo</h1>
          <div className="subtitle">
            Todas las tareas abiertas de la empresa en un solo sitio.
          </div>
        </div>
        <button className="btn btn-primary" onClick={openNew}>
          + Nueva tarea
        </button>
      </div>

      <div className="toolbar">
        <input
          className="input search"
          placeholder="🔍 Buscar tarea…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="select"
          value={filterAssignee}
          onChange={(e) => setFilterAssignee(e.target.value)}
        >
          <option value="">Todo el equipo</option>
          {profiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.full_name}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div style={{ display: 'grid', placeItems: 'center', padding: 60 }}>
          <div className="spinner" />
        </div>
      ) : tasks.length === 0 ? (
        <div className="empty">
          <div className="empty-icon">📋</div>
          <p>No hay tareas todavía. ¡Crea la primera!</p>
          <button className="btn btn-primary" onClick={openNew}>
            + Nueva tarea
          </button>
        </div>
      ) : (
        <div className="board">
          {STATUS_ORDER.map((status) => (
            <div className="column" key={status}>
              <div className="column-head">
                <span>{STATUS_LABELS[status]}</span>
                <span className="column-count">{byStatus[status].length}</span>
              </div>
              {byStatus[status].length === 0 ? (
                <div className="col-empty">Sin tareas</div>
              ) : (
                byStatus[status].map((t) => (
                  <TaskCard key={t.id} task={t} onOpen={openEdit} />
                ))
              )}
            </div>
          ))}
        </div>
      )}

      {modalOpen && (
        <TaskModal task={editingTask} onClose={() => setModalOpen(false)} />
      )}
    </>
  )
}
