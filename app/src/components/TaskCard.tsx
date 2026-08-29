import { useData } from '../context/DataContext'
import { Avatar } from './Avatar'
import { PriorityBadge } from './Badges'
import type { Task } from '../lib/types'

function formatDue(due: string): { label: string; overdue: boolean } {
  const [y, m, d] = due.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diff = Math.round((date.getTime() - today.getTime()) / 86400000)
  const overdue = diff < 0
  let label: string
  if (diff === 0) label = 'Hoy'
  else if (diff === 1) label = 'Mañana'
  else if (diff === -1) label = 'Ayer'
  else
    label = date.toLocaleDateString('es-ES', {
      day: 'numeric',
      month: 'short',
    })
  return { label, overdue }
}

export function TaskCard({
  task,
  onOpen,
}: {
  task: Task
  onOpen: (task: Task) => void
}) {
  const { profileById, editTask } = useData()
  const assignee = profileById(task.assignee_id)
  const isDone = task.status === 'done'
  const due = task.due_date ? formatDue(task.due_date) : null

  function toggleDone(e: React.MouseEvent) {
    e.stopPropagation()
    editTask(task.id, { status: isDone ? 'open' : 'done' })
  }

  return (
    <div
      className={'task-card' + (isDone ? ' done' : '')}
      onClick={() => onOpen(task)}
    >
      <div className="task-top">
        <span className="task-title">{task.title}</span>
        <button
          className={'check-btn' + (isDone ? ' checked' : '')}
          onClick={toggleDone}
          title={isDone ? 'Marcar como abierta' : 'Marcar como completada'}
        >
          ✓
        </button>
      </div>
      {task.description && <p className="task-desc">{task.description}</p>}
      <div className="task-meta">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Avatar profile={assignee} size={24} />
          <PriorityBadge priority={task.priority} />
        </div>
        {due && (
          <span className={'task-due' + (due.overdue && !isDone ? ' overdue' : '')}>
            📅 {due.label}
          </span>
        )}
      </div>
    </div>
  )
}
