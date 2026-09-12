import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useData } from '../context/DataContext'
import { TaskCard } from '../components/TaskCard'
import { TaskModal } from '../components/TaskModal'
import { StatesModal } from '../components/StatesModal'
import { IconPlus, IconSearch, IconTasks, IconX } from '../components/Icons'
import { todayKey } from '../lib/dates'
import type { Task, TaskStatus } from '../lib/types'
import './Board.css'

export function Board() {
  const { tasks, profiles, states, loading, profileById } = useData()
  const [params, setParams] = useSearchParams()
  const [modalOpen, setModalOpen] = useState(false)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState<string>('')
  const [editandoEstados, setEditandoEstados] = useState(false)
  const filterAssignee = params.get('persona') ?? ''

  function setFilterAssignee(id: string) {
    const next = new URLSearchParams(params)
    if (id) next.set('persona', id)
    else next.delete('persona')
    setParams(next, { replace: true })
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return tasks.filter((t) => {
      if (filterAssignee && t.assignee_id !== filterAssignee) return false
      if (q && !t.title.toLowerCase().includes(q) && !(t.description ?? '').toLowerCase().includes(q))
        return false
      return true
    })
  }, [tasks, filterAssignee, search])

  // Las columnas ya no son los tres estados fijos: son los que el equipo haya
  // definido. Una tarea sin estado (creada antes de esta función) cae en el
  // estado por defecto de su clase, así que nunca desaparece del tablero.
  const columnas = useMemo(() => {
    if (states.length === 0) return []
    const porDefecto = (kind: TaskStatus) =>
      states.find((e) => e.kind === kind && e.is_default) ?? states.find((e) => e.kind === kind)
    const grupos = new Map<string, Task[]>(states.map((e) => [e.id, []]))
    const rank = { high: 0, medium: 1, low: 2 }
    for (const t of filtered) {
      const destino = (t.state_id && grupos.has(t.state_id) ? t.state_id : porDefecto(t.status)?.id) ?? null
      if (destino) grupos.get(destino)!.push(t)
    }
    for (const lista of grupos.values()) {
      lista.sort((a, b) => {
        const r = rank[a.priority] - rank[b.priority]
        if (r !== 0) return r
        return (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999')
      })
    }
    return states.map((estado) => ({ estado, tareas: grupos.get(estado.id) ?? [] }))
  }, [filtered, states])

  const tabActiva = tab || columnas[0]?.estado.id || ''

  const stats = useMemo(() => {
    const today = todayKey()
    const pending = tasks.filter((t) => t.status !== 'done')
    return {
      pending: pending.length,
      overdue: pending.filter((t) => t.due_date && t.due_date < today).length,
      today: pending.filter((t) => t.due_date === today).length,
    }
  }, [tasks])

  function openNew() { setEditingTask(null); setModalOpen(true) }
  function openEdit(task: Task) { setEditingTask(task); setModalOpen(true) }

  const filteredPerson = filterAssignee ? profileById(filterAssignee) : undefined

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Tareas</h1>
          <div className="subtitle">
            {stats.pending === 0
              ? 'Todo al día. Sin tareas pendientes.'
              : `${stats.pending} pendiente${stats.pending === 1 ? '' : 's'}`}
            {stats.overdue > 0 && (
              <span className="chip chip-danger" style={{ marginLeft: 8 }}>{stats.overdue} vencida{stats.overdue === 1 ? '' : 's'}</span>
            )}
            {stats.today > 0 && (
              <span className="chip chip-primary" style={{ marginLeft: 6 }}>{stats.today} para hoy</span>
            )}
          </div>
        </div>
        <div className="page-actions desktop-only">
          <button className="btn btn-primary" onClick={openNew}><IconPlus size={18} /> Nueva tarea</button>
        </div>
      </div>

      <div className="toolbar">
        <div className="input-wrap search">
          <IconSearch size={18} />
          <input className="input" placeholder="Buscar tarea…" value={search}
            onChange={(e) => setSearch(e.target.value)} />
          {search && (
            <button className="input-action" onClick={() => setSearch('')} aria-label="Limpiar búsqueda">
              <IconX size={16} />
            </button>
          )}
        </div>
        <select className="select" value={filterAssignee} onChange={(e) => setFilterAssignee(e.target.value)}>
          <option value="">Todo el equipo</option>
          {profiles.map((p) => (
            <option key={p.id} value={p.id}>{p.full_name}</option>
          ))}
        </select>
        <button className="btn btn-ghost btn-sm" onClick={() => setEditandoEstados(true)}>
          Editar estados
        </button>
      </div>

      {filteredPerson && (
        <div className="filter-note">
          Mostrando solo las tareas de <b>{filteredPerson.full_name}</b>
          <button className="btn btn-ghost btn-sm" onClick={() => setFilterAssignee('')}>Quitar filtro</button>
        </div>
      )}

      <div className="segmented mobile-only board-tabs">
        {columnas.map(({ estado, tareas }) => (
          <button key={estado.id} className={tabActiva === estado.id ? 'active' : ''}
            onClick={() => setTab(estado.id)}>
            {estado.name} <span className="count">{tareas.length}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="board">
          {[0, 1, 2].map((i) => (
            <div className={'column' + (i === 0 ? ' is-active' : '')} key={i}>
              <div className="skeleton" style={{ height: 88, marginBottom: 10 }} />
              <div className="skeleton" style={{ height: 88 }} />
            </div>
          ))}
        </div>
      ) : tasks.length === 0 ? (
        <div className="empty">
          <div className="empty-icon"><IconTasks size={30} /></div>
          <h3>Aún no hay tareas</h3>
          <p>Crea la primera tarea y asígnala a alguien del equipo.</p>
          <button className="btn btn-primary" onClick={openNew}><IconPlus size={18} /> Nueva tarea</button>
        </div>
      ) : (
        <div className="board">
          {columnas.map(({ estado, tareas }) => (
            <section className={'column' + (tabActiva === estado.id ? ' is-active' : '')} key={estado.id}>
              <div className="column-head">
                <span className={`chip chip-estado color-${estado.color}`}>{estado.name}</span>
                <span className="column-count">{tareas.length}</span>
              </div>
              {tareas.length === 0 ? (
                <div className="col-empty">
                  {search || filterAssignee ? 'Nada que coincida con el filtro.' : 'Sin tareas aquí.'}
                </div>
              ) : (
                tareas.map((t) => <TaskCard key={t.id} task={t} onOpen={openEdit} />)
              )}
            </section>
          ))}
        </div>
      )}

      <button className="fab" onClick={openNew} aria-label="Nueva tarea"><IconPlus size={26} /></button>

      {modalOpen && <TaskModal task={editingTask} onClose={() => setModalOpen(false)} />}
      {editandoEstados && <StatesModal onClose={() => setEditandoEstados(false)} />}
    </>
  )
}
