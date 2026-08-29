import { PRIORITY_LABELS, STATUS_LABELS } from '../lib/constants'
import type { TaskPriority, TaskStatus } from '../lib/types'

const STATUS_COLORS: Record<TaskStatus, string> = {
  open: '#f59e0b',
  in_progress: '#0ea5e9',
  done: '#10b981',
}

const PRIORITY_COLORS: Record<TaskPriority, string> = {
  low: '#9aa0b4',
  medium: '#0ea5e9',
  high: '#ef4444',
}

export function StatusBadge({ status }: { status: TaskStatus }) {
  const color = STATUS_COLORS[status]
  return (
    <span
      className="badge"
      style={{ background: `${color}1a`, color }}
    >
      <span className="badge-dot" style={{ background: color }} />
      {STATUS_LABELS[status]}
    </span>
  )
}

export function PriorityBadge({ priority }: { priority: TaskPriority }) {
  const color = PRIORITY_COLORS[priority]
  return (
    <span className="badge" style={{ background: `${color}1a`, color }}>
      {PRIORITY_LABELS[priority]}
    </span>
  )
}
