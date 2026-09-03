import { apiFetch, eventsUrl, isDemo } from './apiClient'
import { demoStore } from './demo'
import type { Profile, Subtask, Task, TaskInput, TaskState, TaskStatus } from './types'

/**
 * API unificada. Habla con el backend del NAS cuando está disponible, o con el
 * almacén local de demostración si la app corre en modo demo (VITE_DEMO=true).
 * Las páginas solo usan este módulo, así que el resto del código no cambia.
 */

// ─── Tareas ──────────────────────────────────────────────────────────

export async function listTasks(): Promise<Task[]> {
  if (isDemo) {
    // En el servidor el avance de los pasos viene calculado en la consulta;
    // aquí se calcula igual para que el modo demo se comporte como el real.
    const pasos = demoStore.getSubtasks()
    return demoStore.getTasks().map((t) => {
      const suyos = pasos.filter((p) => p.task_id === t.id)
      return { ...t, subtasks_total: suyos.length, subtasks_done: suyos.filter((p) => p.done).length }
    })
  }
  return apiFetch<Task[]>('/tasks')
}

export async function createTask(
  input: TaskInput,
  createdBy: string | null,
): Promise<Task> {
  if (!isDemo) {
    return apiFetch<Task>('/tasks', {
      method: 'POST',
      body: JSON.stringify(input),
    })
  }
  const now = new Date().toISOString()
  const task: Task = {
    id: demoStore.uid(),
    title: input.title,
    description: input.description ?? null,
    status: input.status ?? 'open',
    priority: input.priority ?? 'medium',
    assignee_id: input.assignee_id ?? null,
    created_by: createdBy,
    due_date: input.due_date ?? null,
    start_date: input.start_date ?? null,
    work_days: input.work_days ?? null,
    completed_at: null,
    last_reminder_at: null,
    created_at: now,
    updated_at: now,
  }
  demoStore.saveTasks([task, ...demoStore.getTasks()])
  return task
}

export async function updateTask(
  id: string,
  patch: Partial<Task>,
): Promise<Task> {
  if (!isDemo) {
    return apiFetch<Task>(`/tasks/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    })
  }
  const withMeta: Partial<Task> = { ...patch, updated_at: new Date().toISOString() }
  if (patch.status === 'done') withMeta.completed_at = new Date().toISOString()
  if (patch.status && patch.status !== 'done') withMeta.completed_at = null
  const tasks = demoStore.getTasks()
  const idx = tasks.findIndex((t) => t.id === id)
  if (idx === -1) throw new Error('Tarea no encontrada')
  tasks[idx] = { ...tasks[idx], ...withMeta }
  demoStore.saveTasks(tasks)
  return tasks[idx]
}

export async function deleteTask(id: string): Promise<void> {
  if (!isDemo) {
    await apiFetch(`/tasks/${id}`, { method: 'DELETE' })
    return
  }
  demoStore.saveTasks(demoStore.getTasks().filter((t) => t.id !== id))
}

// ─── Pasos de una tarea (subtareas) ──────────────────────────────────

export async function listSubtasks(taskId: string): Promise<Subtask[]> {
  if (isDemo) return demoStore.getSubtasks().filter((p) => p.task_id === taskId)
  return apiFetch<Subtask[]>(`/tasks/${taskId}/subtasks`)
}

export async function createSubtask(taskId: string, title: string): Promise<Subtask> {
  if (!isDemo) {
    return apiFetch<Subtask>(`/tasks/${taskId}/subtasks`, {
      method: 'POST', body: JSON.stringify({ title }),
    })
  }
  const todos = demoStore.getSubtasks()
  const paso: Subtask = {
    id: demoStore.uid(),
    task_id: taskId,
    title: title.trim(),
    done: false,
    position: todos.filter((p) => p.task_id === taskId).length,
  }
  demoStore.saveSubtasks([...todos, paso])
  return paso
}

export async function updateSubtask(id: string, patch: Partial<Subtask>): Promise<Subtask> {
  if (!isDemo) {
    return apiFetch<Subtask>(`/subtasks/${id}`, { method: 'PATCH', body: JSON.stringify(patch) })
  }
  const todos = demoStore.getSubtasks()
  const i = todos.findIndex((p) => p.id === id)
  if (i === -1) throw new Error('Ese paso no existe')
  todos[i] = { ...todos[i], ...patch }
  demoStore.saveSubtasks(todos)
  return todos[i]
}

export async function deleteSubtask(id: string): Promise<void> {
  if (!isDemo) {
    await apiFetch(`/subtasks/${id}`, { method: 'DELETE' })
    return
  }
  demoStore.saveSubtasks(demoStore.getSubtasks().filter((p) => p.id !== id))
}

// ─── Estados de las tareas ───────────────────────────────────────────

export async function listStates(): Promise<TaskState[]> {
  if (isDemo) return demoStore.getStates()
  const r = await apiFetch<{ states: TaskState[] }>('/states')
  return r.states
}

export async function createState(input: { name: string; kind: TaskStatus; color?: string }): Promise<TaskState> {
  if (!isDemo) {
    return apiFetch<TaskState>('/states', { method: 'POST', body: JSON.stringify(input) })
  }
  const lista = demoStore.getStates()
  const estado: TaskState = {
    id: demoStore.uid(),
    name: input.name.trim(),
    kind: input.kind,
    color: input.color ?? 'slate',
    position: lista.length,
    is_default: false,
  }
  demoStore.saveStates([...lista, estado])
  return estado
}

export async function updateState(id: string, patch: Partial<TaskState>): Promise<TaskState> {
  if (!isDemo) {
    return apiFetch<TaskState>(`/states/${id}`, { method: 'PATCH', body: JSON.stringify(patch) })
  }
  const lista = demoStore.getStates()
  const i = lista.findIndex((e) => e.id === id)
  if (i === -1) throw new Error('Ese estado no existe')
  lista[i] = { ...lista[i], ...patch }
  demoStore.saveStates(lista)
  return lista[i]
}

export async function deleteState(id: string): Promise<void> {
  if (!isDemo) {
    await apiFetch(`/states/${id}`, { method: 'DELETE' })
    return
  }
  const lista = demoStore.getStates()
  const estado = lista.find((e) => e.id === id)
  if (!estado) return
  const hermano = lista.find((e) => e.kind === estado.kind && e.id !== id)
  if (!hermano) throw new Error('No puedes borrar el último estado de ese tipo')
  demoStore.saveTasks(
    demoStore.getTasks().map((t) => (t.state_id === id ? { ...t, state_id: hermano.id } : t)),
  )
  demoStore.saveStates(lista.filter((e) => e.id !== id))
}

export async function reorderStates(ids: string[]): Promise<TaskState[]> {
  if (!isDemo) {
    return apiFetch<TaskState[]>('/states/reorder', { method: 'POST', body: JSON.stringify({ ids }) })
  }
  const lista = demoStore.getStates()
  const ordenada = ids.map((id, pos) => ({ ...lista.find((e) => e.id === id)!, position: pos }))
  demoStore.saveStates(ordenada)
  return ordenada
}

// ─── Personas / equipo ───────────────────────────────────────────────

export async function listProfiles(): Promise<Profile[]> {
  if (isDemo) return demoStore.getProfiles()
  return apiFetch<Profile[]>('/profiles')
}

export async function updateProfile(
  id: string,
  patch: Partial<Profile>,
): Promise<Profile> {
  if (!isDemo) {
    return apiFetch<Profile>(`/profiles/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    })
  }
  const profiles = demoStore.getProfiles()
  const idx = profiles.findIndex((p) => p.id === id)
  if (idx === -1) throw new Error('Perfil no encontrado')
  profiles[idx] = { ...profiles[idx], ...patch }
  demoStore.saveProfiles(profiles)
  return profiles[idx]
}

// ─── Recordatorios de WhatsApp ───────────────────────────────────────

/** Dispara ahora los recordatorios de WhatsApp (para probar sin esperar al cron). */
export async function runReminders(): Promise<{ candidates: number; sent: number }> {
  if (isDemo) return { candidates: 0, sent: 0 }
  return apiFetch<{ candidates: number; sent: number }>('/reminders/run', { method: 'POST' })
}

// ─── Estado de WhatsApp / avisos ─────────────────────────────────────

export interface WhatsAppStatus {
  enabled: boolean
  connected: boolean
  status: string
  realtime: boolean
  assistant: 'gemini' | 'reglas'
  email: boolean
  sessionId?: string
  error?: string
}

/** ¿Sigue vinculado el número de WhatsApp en el Gateway? */
export async function whatsappStatus(): Promise<WhatsAppStatus> {
  if (isDemo) return { enabled: true, connected: true, status: 'demo', realtime: true, assistant: 'reglas', email: false }
  return apiFetch<WhatsAppStatus>('/whatsapp/status')
}

// ─── Tiempo real ─────────────────────────────────────────────────────

/** Se suscribe a cambios en tareas. Devuelve una función para cancelar. */
export function subscribeTasks(onChange: () => void): () => void {
  if (!isDemo) {
    const source = new EventSource(eventsUrl())
    source.onmessage = () => onChange()
    source.onerror = () => {
      /* EventSource reintenta la conexión automáticamente */
    }
    return () => source.close()
  }
  // Modo demo: escuchamos cambios de otras pestañas del mismo navegador.
  const handler = (e: StorageEvent) => {
    if (e.key === 'amonn.demo.tasks') onChange()
  }
  window.addEventListener('storage', handler)
  return () => window.removeEventListener('storage', handler)
}
