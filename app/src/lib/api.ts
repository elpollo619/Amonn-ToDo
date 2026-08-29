import { apiFetch, eventsUrl, isDemo } from './apiClient'
import { demoStore } from './demo'
import type { Profile, Task, TaskInput } from './types'

/**
 * API unificada. Habla con el backend del NAS cuando está disponible, o con el
 * almacén local de demostración si la app corre en modo demo (VITE_DEMO=true).
 * Las páginas solo usan este módulo, así que el resto del código no cambia.
 */

// ─── Tareas ──────────────────────────────────────────────────────────

export async function listTasks(): Promise<Task[]> {
  if (isDemo) return demoStore.getTasks()
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
