import type { Profile, Subtask, Task, TaskState } from './types'

/**
 * Modo demo: guarda todo en el navegador (localStorage) con datos de ejemplo.
 * Sirve para probar la app antes de conectar Supabase. Los datos NO se
 * comparten entre personas ni dispositivos hasta que configures la nube.
 */

const PROFILES_KEY = 'amonn.demo.profiles'
const TASKS_KEY = 'amonn.demo.tasks'
const SESSION_KEY = 'amonn.demo.session'
const STATES_KEY = 'amonn.demo.states'
const SUBTASKS_KEY = 'amonn.demo.subtasks'

// Identificador único. No depende de crypto.randomUUID (que solo existe en
// contexto seguro: https o localhost); usa getRandomValues como respaldo, que
// sí está disponible al abrir la app por http://IP en la red local.
function uid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  const b = new Uint8Array(16)
  crypto.getRandomValues(b)
  b[6] = (b[6] & 0x0f) | 0x40 // versión 4
  b[8] = (b[8] & 0x3f) | 0x80 // variante RFC 4122
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

function today(offsetDays = 0): string {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return d.toISOString().slice(0, 10)
}

const seedProfiles: Profile[] = [
  {
    id: 'demo-ana',
    full_name: 'Ana García',
    phone: '+34600111222',
    avatar_color: '#6366f1',
    created_at: new Date().toISOString(),
  },
  {
    id: 'demo-luis',
    full_name: 'Luis Pérez',
    phone: '+34600333444',
    avatar_color: '#10b981',
    created_at: new Date().toISOString(),
  },
  {
    id: 'demo-marta',
    full_name: 'Marta Ruiz',
    phone: '+34600555666',
    avatar_color: '#f59e0b',
    created_at: new Date().toISOString(),
  },
]

function seedTasks(): Task[] {
  const now = new Date().toISOString()
  const base = {
    completed_at: null,
    last_reminder_at: null,
    created_at: now,
    updated_at: now,
  }
  return [
    {
      ...base,
      id: uid(),
      title: 'Revisar instalación eléctrica nave 3',
      description: 'Comprobar cuadro y tomas de corriente antes de la entrega.',
      status: 'open',
      priority: 'high',
      assignee_id: 'demo-luis',
      created_by: 'demo-ana',
      due_date: today(1),
    },
    {
      ...base,
      id: uid(),
      title: 'Llamar al proveedor de material',
      description: 'Confirmar pedido de tubería y fecha de entrega.',
      status: 'in_progress',
      priority: 'medium',
      assignee_id: 'demo-ana',
      created_by: 'demo-ana',
      due_date: today(0),
    },
    {
      ...base,
      id: uid(),
      title: 'Preparar presupuesto cliente Gómez',
      description: null,
      status: 'open',
      priority: 'medium',
      assignee_id: 'demo-marta',
      created_by: 'demo-luis',
      due_date: today(3),
    },
    {
      ...base,
      id: uid(),
      title: 'Enviar factura del mes',
      description: 'Facturación de agosto a administración.',
      status: 'done',
      priority: 'low',
      assignee_id: 'demo-marta',
      created_by: 'demo-ana',
      due_date: today(-2),
      completed_at: now,
    },
  ]
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function write<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* almacenamiento no disponible */
  }
}

// Los tres de serie, igual que en el servidor.
const seedStates: TaskState[] = [
  { id: 'st-open', name: 'Abierta', kind: 'open', color: 'slate', position: 0, is_default: true },
  { id: 'st-doing', name: 'En curso', kind: 'in_progress', color: 'blue', position: 1, is_default: true },
  { id: 'st-done', name: 'Hecha', kind: 'done', color: 'green', position: 2, is_default: true },
]

export function ensureSeed(): void {
  if (!localStorage.getItem(PROFILES_KEY)) write(PROFILES_KEY, seedProfiles)
  if (!localStorage.getItem(TASKS_KEY)) write(TASKS_KEY, seedTasks())
  if (!localStorage.getItem(STATES_KEY)) write(STATES_KEY, seedStates)
}

export const demoStore = {
  getSubtasks(): Subtask[] {
    return read<Subtask[]>(SUBTASKS_KEY, [])
  },
  saveSubtasks(list: Subtask[]): void {
    write(SUBTASKS_KEY, list)
  },
  getStates(): TaskState[] {
    return read<TaskState[]>(STATES_KEY, seedStates)
  },
  saveStates(list: TaskState[]): void {
    write(STATES_KEY, list)
  },
  getProfiles(): Profile[] {
    return read<Profile[]>(PROFILES_KEY, seedProfiles)
  },
  saveProfiles(list: Profile[]): void {
    write(PROFILES_KEY, list)
  },
  getTasks(): Task[] {
    return read<Task[]>(TASKS_KEY, [])
  },
  saveTasks(list: Task[]): void {
    write(TASKS_KEY, list)
  },
  getSession(): string | null {
    return read<string | null>(SESSION_KEY, null)
  },
  setSession(id: string | null): void {
    write(SESSION_KEY, id)
  },
  uid,
}
