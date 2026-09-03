// Operaciones sobre tareas compartidas por la API (routes/tasks.js) y el
// asistente de WhatsApp (assistant.js). Aquí viven los avisos al asignar.
import { query } from './db.js'
import { broadcast } from './events.js'
import { notifyTaskAssigned } from './notify.js'

export const STATUSES = ['open', 'in_progress', 'done']
export const PRIORITIES = ['low', 'medium', 'high']

export async function getUser(id) {
  if (!id) return null
  const { rows } = await query('select * from users where id = $1', [id])
  return rows[0] ?? null
}

export async function listUsers() {
  const { rows } = await query('select * from users order by full_name asc')
  return rows
}

/** Crea una tarea y avisa al responsable (si no es quien la crea). */
export async function createTask(input, createdBy, { source = 'app' } = {}) {
  const title = String(input.title ?? '').trim()
  if (!title) throw Object.assign(new Error('El título es obligatorio'), { status: 400 })
  const status = STATUSES.includes(input.status) ? input.status : 'open'
  const priority = PRIORITIES.includes(input.priority) ? input.priority : 'medium'
  const { rows } = await query(
    `insert into tasks (title, description, status, priority, assignee_id, created_by, due_date, source)
     values ($1,$2,$3,$4,$5,$6,$7,$8) returning *`,
    [
      title,
      input.description?.trim?.() || null,
      status,
      priority,
      input.assignee_id || null,
      createdBy || null,
      input.due_date || null,
      source,
    ],
  )
  const task = rows[0]
  broadcast()
  if (task.assignee_id && task.assignee_id !== createdBy) {
    const [assignee, creator] = await Promise.all([getUser(task.assignee_id), getUser(createdBy)])
    notifyTaskAssigned(task, assignee, creator).catch(() => {})
  }
  return task
}

/** Marca una tarea como completada. */
export async function completeTask(id) {
  const { rows } = await query(
    `update tasks set status='done', completed_at=now(), updated_at=now()
      where id=$1 returning *`,
    [id],
  )
  broadcast()
  return rows[0] ?? null
}

/** Tareas abiertas (open/in_progress) de una persona, ordenadas por fecha. */
export async function openTasksFor(userId) {
  const { rows } = await query(
    `select * from tasks
      where assignee_id = $1 and status in ('open','in_progress')
      order by due_date asc nulls last, created_at asc`,
    [userId],
  )
  return rows
}

/** Todas las tareas abiertas del equipo con el nombre del responsable. */
export async function openTasksAll() {
  const { rows } = await query(
    `select t.*, u.full_name as assignee_name
       from tasks t left join users u on u.id = t.assignee_id
      where t.status in ('open','in_progress')
      order by t.due_date asc nulls last, t.created_at asc`,
  )
  return rows
}
