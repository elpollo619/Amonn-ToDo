import { supabase, isSupabaseConfigured } from './supabase'
import { demoStore } from './demo'
import type { Profile, Task, TaskInput } from './types'

/**
 * API unificada. Funciona contra Supabase cuando está configurado, y contra
 * el almacén local de demostración en caso contrario. Las páginas de la app
 * solo hablan con este módulo, así que el resto del código no cambia.
 */

// ─── Tareas ──────────────────────────────────────────────────────────

export async function listTasks(): Promise<Task[]> {
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) throw error
    return data as Task[]
  }
  return demoStore.getTasks()
}

export async function createTask(
  input: TaskInput,
  createdBy: string | null,
): Promise<Task> {
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase
      .from('tasks')
      .insert({ ...input, created_by: createdBy })
      .select('*')
      .single()
    if (error) throw error
    return data as Task
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
  const withMeta: Partial<Task> = { ...patch, updated_at: new Date().toISOString() }
  if (patch.status === 'done' && !patch.completed_at) {
    withMeta.completed_at = new Date().toISOString()
  }
  if (patch.status && patch.status !== 'done') {
    withMeta.completed_at = null
  }

  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase
      .from('tasks')
      .update(withMeta)
      .eq('id', id)
      .select('*')
      .single()
    if (error) throw error
    return data as Task
  }
  const tasks = demoStore.getTasks()
  const idx = tasks.findIndex((t) => t.id === id)
  if (idx === -1) throw new Error('Tarea no encontrada')
  tasks[idx] = { ...tasks[idx], ...withMeta }
  demoStore.saveTasks(tasks)
  return tasks[idx]
}

export async function deleteTask(id: string): Promise<void> {
  if (isSupabaseConfigured && supabase) {
    const { error } = await supabase.from('tasks').delete().eq('id', id)
    if (error) throw error
    return
  }
  demoStore.saveTasks(demoStore.getTasks().filter((t) => t.id !== id))
}

// ─── Personas / equipo ───────────────────────────────────────────────

export async function listProfiles(): Promise<Profile[]> {
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('full_name', { ascending: true })
    if (error) throw error
    return data as Profile[]
  }
  return demoStore.getProfiles()
}

export async function updateProfile(
  id: string,
  patch: Partial<Profile>,
): Promise<Profile> {
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase
      .from('profiles')
      .update(patch)
      .eq('id', id)
      .select('*')
      .single()
    if (error) throw error
    return data as Profile
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
  if (isSupabaseConfigured && supabase) {
    const sb = supabase
    const channel = sb
      .channel('tasks-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tasks' },
        () => onChange(),
      )
      .subscribe()
    return () => {
      sb.removeChannel(channel)
    }
  }
  // En modo demo escuchamos cambios de otras pestañas del mismo navegador.
  const handler = (e: StorageEvent) => {
    if (e.key === 'amonn.demo.tasks') onChange()
  }
  window.addEventListener('storage', handler)
  return () => window.removeEventListener('storage', handler)
}
