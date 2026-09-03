// Operaciones sobre tareas compartidas por la API (routes/tasks.js) y el
// asistente de WhatsApp (assistant.js). Aquí viven los avisos al asignar.
import { query } from './db.js'
import { resolveState, defaultStateFor } from './states.service.js'
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
  const priority = PRIORITIES.includes(input.priority) ? input.priority : 'medium'
  // El estado y el status se resuelven juntos para que nunca se separen.
  const { state_id: stateId, status } = await resolveState({
    state_id: input.state_id,
    status: STATUSES.includes(input.status) ? input.status : 'open',
  })
  const { rows } = await query(
    `insert into tasks (title, description, status, state_id, priority, assignee_id, created_by,
                        due_date, start_date, work_days, source)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning *`,
    [
      title,
      input.description?.trim?.() || null,
      status,
      stateId,
      priority,
      input.assignee_id || null,
      createdBy || null,
      input.due_date || null,
      input.start_date || null,
      input.work_days ?? null,
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

/**
 * Pone una tarea en un estado concreto. Mantiene `status` alineado con la
 * clase del estado y limpia (o pone) `completed_at` en consecuencia, para que
 * el asistente, los recordatorios y el tablero cuenten lo mismo.
 */
export async function setTaskState(id, state) {
  const { rows } = await query(
    `update tasks
        set state_id = $2,
            status = $3,
            completed_at = case when $3 = 'done' then now() else null end,
            updated_at = now()
      where id = $1 returning *`,
    [id, state.id, state.kind],
  )
  broadcast()
  return rows[0] ?? null
}

/**
 * Marca una tarea como completada. Mueve TAMBIÉN el estado al de tipo 'done',
 * porque si no, una tarea cerrada por WhatsApp seguiría apareciendo en la
 * columna "Esperando material" del tablero.
 */
export async function completeTask(id) {
  const hecho = await defaultStateFor('done')
  const { rows } = await query(
    `update tasks set status='done', state_id=$2, completed_at=now(), updated_at=now()
      where id=$1 returning *`,
    [id, hecho?.id ?? null],
  )
  broadcast()
  return rows[0] ?? null
}

/** Tareas abiertas (open/in_progress) de una persona, ordenadas por fecha. */
export async function openTasksFor(userId) {
  const { rows } = await query(
    `select t.*, s.name as state_name, s.color as state_color, s.kind as state_kind,
            s.is_default as state_is_default
       from tasks t left join task_states s on s.id = t.state_id
      where t.assignee_id = $1 and t.status in ('open','in_progress')
      order by t.due_date asc nulls last, t.start_date asc nulls last, t.created_at asc`,
    [userId],
  )
  return rows
}

/** Todas las tareas abiertas del equipo con el nombre del responsable. */
export async function openTasksAll() {
  const { rows } = await query(
    `select t.*, u.full_name as assignee_name,
            s.name as state_name, s.color as state_color, s.kind as state_kind,
            s.is_default as state_is_default
       from tasks t
       left join users u on u.id = t.assignee_id
       left join task_states s on s.id = t.state_id
      where t.status in ('open','in_progress')
      order by t.due_date asc nulls last, t.start_date asc nulls last, t.created_at asc`,
  )
  return rows
}
