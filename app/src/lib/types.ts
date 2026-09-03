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
}
