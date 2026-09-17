import type { MouseEvent } from 'react'
import { useData } from '../context/DataContext'
import { Avatar } from './Avatar'
import { PriorityBadge } from './Badges'
import { IconCheck, IconClock } from './Icons'
import { describeDue } from '../lib/dates'
import type { Task } from '../lib/types'

export function TaskCard({ task, onOpen }: { task: Task; onOpen: (task: Task) => void }) {
  const { profileById, editTask } = useData()
  const assignee = profileById(task.assignee_id)
  const isDone = task.status === 'done'
  const due = task.due_date ? describeDue(task.due_date) : null
  const firstName = assignee?.full_name?.split(' ')[0] ?? 'Sin asignar'

  function toggleDone(e: MouseEvent) {
    e.stopPropagation()
    editTask(task.id, { status: isDone ? 'open' : 'done' })
  }

  return (
    <article
      className={`task-card prio-${task.priority}${isDone ? ' done' : ''}`}
      onClick={() => onOpen(task)}
    >
      <button
        className={'check' + (isDone ? ' checked' : '')}
        onClick={toggleDone}
        aria-label={isDone ? 'Marcar como abierta' : 'Marcar como completada'}
      >
        <IconCheck />
      </button>
      <div className="task-body">
        <div className="task-title">{task.title}</div>
        {task.description && <p className="task-desc">{task.description}</p>}
        <div className="task-meta">
          <span className="task-who">
            <Avatar profile={assignee} size={20} />
            <span className="truncate">{firstName}</span>
          </span>
          <PriorityBadge priority={task.priority} />
          {/* El estado propio del equipo, si no es uno de los de serie. */}
          {Number(task.subtasks_total) > 0 && (
            <span className="chip chip-muted">{task.subtasks_done}/{task.subtasks_total}</span>
          )}
          {task.state_name && !task.state_is_default && (
            <span className={`chip-estado-min color-${task.state_color ?? 'slate'}`}>
              {task.state_name}
            </span>
          )}
          {due && (
            <span
              className={
                'chip ' +
                (isDone ? 'chip-muted' : due.overdue ? 'chip-danger' : due.today ? 'chip-primary' : 'chip-muted')
              }
            >
              <IconClock />
              {due.label}
            </span>
          )}
        </div>
      </div>
    </article>
  )
}
