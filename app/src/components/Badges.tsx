import { PRIORITY_LABELS, STATUS_LABELS } from '../lib/constants'
import type { TaskPriority, TaskStatus } from '../lib/types'
import { IconFlag } from './Icons'

const STATUS_CLASS: Record<TaskStatus, string> = {
  open: 'chip-open',
  in_progress: 'chip-progress',
  done: 'chip-done',
}
const PRIORITY_CLASS: Record<TaskPriority, string> = {
  high: 'chip-high',
  medium: 'chip-medium',
  low: 'chip-low',
}

export function StatusBadge({ status }: { status: TaskStatus }) {
  return <span className={`chip ${STATUS_CLASS[status]}`}>{STATUS_LABELS[status]}</span>
}

export function PriorityBadge({ priority }: { priority: TaskPriority }) {
  return (
    <span className={`chip ${PRIORITY_CLASS[priority]}`}>
      {priority === 'high' && <IconFlag />}
      {PRIORITY_LABELS[priority]}
    </span>
  )
}
