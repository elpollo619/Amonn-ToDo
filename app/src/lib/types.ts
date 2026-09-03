export type TaskStatus = 'open' | 'in_progress' | 'done'
export type TaskPriority = 'low' | 'medium' | 'high'

export interface Profile {
  id: string
  email?: string | null
  full_name: string | null
  phone: string | null
  avatar_color: string
  created_at: string
  /** Recibir avisos por WhatsApp (por defecto sí). */
  notify_whatsapp?: boolean
  /** Recibir avisos por email (por defecto sí). */
  notify_email?: boolean
  /** Idioma en el que le habla el asistente de WhatsApp. */
  language?: 'es' | 'de' | 'pt'
  /** false cuando la persona lo eligió a mano (ya no se autodetecta). */
  language_auto?: boolean
}

/** Estado de una tarea, definido por el equipo (las columnas del tablero). */
export interface TaskState {
  id: string
  name: string
  /** Clase del estado: es lo que mantiene compatible el resto del sistema. */
  kind: TaskStatus
  color: string
  position: number
  is_default: boolean
}

/** Un paso dentro de una tarea. No se asigna ni tiene plazo: es una lista
 *  de comprobación, y su valor está en el avance del conjunto. */
export interface Subtask {
  id: string
  task_id: string
  title: string
  done: boolean
  position: number
}

export interface Task {
  id: string
  title: string
  description: string | null
  status: TaskStatus
  priority: TaskPriority
  assignee_id: string | null
  created_by: string | null
  /** Fecha de FIN del plazo (YYYY-MM-DD). */
  due_date: string | null
  /** Fecha de inicio del plazo. Si falta, la tarea es de un solo día. */
  start_date?: string | null
  /** Días de trabajo que lleva. Es lo que mide la carga real del equipo. */
  work_days?: number | string | null
  /** Estado elegido por el equipo. */
  state_id?: string | null
  state_name?: string | null
  state_color?: string | null
  state_is_default?: boolean | null
  /** Avance de los pasos, que viene calculado en la consulta. */
  subtasks_total?: number | null
  subtasks_done?: number | null
  completed_at: string | null
  last_reminder_at: string | null
  created_at: string
  updated_at: string
}

export interface TaskInput {
  title: string
  description?: string | null
  status?: TaskStatus
  priority?: TaskPriority
  assignee_id?: string | null
  due_date?: string | null
  start_date?: string | null
  work_days?: number | null
  state_id?: string | null
}
