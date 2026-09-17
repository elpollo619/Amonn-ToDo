import type { TaskPriority, TaskStatus } from './types'

export const STATUS_LABELS: Record<TaskStatus, string> = {
  open: 'Abierta',
  in_progress: 'En curso',
  done: 'Completada',
}

export const STATUS_ORDER: TaskStatus[] = ['open', 'in_progress', 'done']

export const PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: 'Baja',
  medium: 'Media',
  high: 'Alta',
}

export const PRIORITY_ORDER: TaskPriority[] = ['high', 'medium', 'low']

export const AVATAR_COLORS = [
  '#6366f1',
  '#0ea5e9',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#ec4899',
  '#8b5cf6',
  '#14b8a6',
]

export function initials(name: string | null | undefined): string {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}
