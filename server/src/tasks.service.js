// Operaciones sobre tareas compartidas por la API (routes/tasks.js) y el
// asistente de WhatsApp (assistant.js). Aquí viven los avisos al asignar.
import { query } from './db.js'
import { resolveState, defaultStateFor } from './states.service.js'
import { SUBTASK_COUNTS_SQL } from './subtasks.service.js'
import { broadcast } from './events.js'
import { notifyTaskAssigned } from './notify.js'
import { crearAufgabe, actualizarAufgabe, workpulseConfigurado } from './workpulse.js'

/** Puente #2: refleja el cambio de estado en la Aufgabe de WorkPulse (best-effort). */
function espejarEstadoWorkpulse(task) {
  if (workpulseConfigurado() && task?.workpulse_id) {
    actualizarAufgabe(task.workpulse_id, { status: task.status })
      .catch((e) => console.error('[workpulse] aufgabe no actualizada:', e.message))
  }
}

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
  // Puente #2: crear la Aufgabe espejo en WorkPulse y guardar su id (para no
  // duplicar). Best-effort y en segundo plano: si falla, la tarea ya está en
  // Amonn y no se pierde.
  if (workpulseConfigurado()) {
    ;(async () => {
      try {
        const assignee = task.assignee_id ? await getUser(task.assignee_id) : null
        const wp = await crearAufgabe({
          title: task.title,
          description: task.description,
          priority: task.priority,
          dueDate: task.due_date,
          assigneeEmail: assignee?.email,
        })
        const wpId = wp?.id ?? wp?.aufgabe?.id
        if (wpId) await query('update tasks set workpulse_id = $2 where id = $1', [task.id, wpId])
      } catch (e) {
        console.error('[workpulse] aufgabe no creada:', e.message)
      }
    })()
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
  espejarEstadoWorkpulse(rows[0])
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
  espejarEstadoWorkpulse(rows[0])
  return rows[0] ?? null
}

/** Tareas abiertas (open/in_progress) de una persona, ordenadas por fecha. */
export async function openTasksFor(userId) {
  const { rows } = await query(
    `select t.*, s.name as state_name, s.color as state_color, s.kind as state_kind,
            s.is_default as state_is_default,
            coalesce(sc.subtasks_total, 0) as subtasks_total,
            coalesce(sc.subtasks_done, 0) as subtasks_done
       from tasks t
       left join task_states s on s.id = t.state_id
       ${SUBTASK_COUNTS_SQL}
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
            s.is_default as state_is_default,
            coalesce(sc.subtasks_total, 0) as subtasks_total,
            coalesce(sc.subtasks_done, 0) as subtasks_done
       from tasks t
       left join users u on u.id = t.assignee_id
       left join task_states s on s.id = t.state_id
       ${SUBTASK_COUNTS_SQL}
      where t.status in ('open','in_progress')
      order by t.due_date asc nulls last, t.start_date asc nulls last, t.created_at asc`,
  )
  return rows
}

// ============================================================
// Cambios sueltos sobre una tarea que ya existe (plazo, responsable,
// prioridad) y consultas más finas. Todo esto se puede pedir por WhatsApp:
// antes había que entrar en la app para cualquier retoque.
// ============================================================

/**
 * Cambia el plazo. `due` es 'YYYY-MM-DD' o null para quitarlo.
 * Si la tarea tenía fecha de inicio posterior al nuevo plazo, se arrastra:
 * un trabajo no puede empezar después de su propia entrega.
 */
export async function setDue(id, due) {
  const { rows } = await query(
    `update tasks
        set due_date = $2,
            start_date = case
              when $2::date is not null and start_date is not null and start_date > $2::date
              then $2::date else start_date end,
            updated_at = now()
      where id = $1 returning *`,
    [id, due],
  )
  broadcast()
  return rows[0] ?? null
}

/** Cambia el responsable. */
export async function reassignTask(id, userId) {
  const { rows } = await query(
    'update tasks set assignee_id = $2, updated_at = now() where id = $1 returning *',
    [id, userId],
  )
  broadcast()
  return rows[0] ?? null
}

/** Cambia la prioridad ('low' | 'medium' | 'high'). */
export async function setPriority(id, priority) {
  const { rows } = await query(
    'update tasks set priority = $2, updated_at = now() where id = $1 returning *',
    [id, priority],
  )
  broadcast()
  return rows[0] ?? null
}

/** Una tarea con su estado y el nombre de su responsable. */
export async function getTask(id) {
  const { rows } = await query(
    `select t.*, u.full_name as assignee_name,
            s.name as state_name, s.kind as state_kind
       from tasks t
       left join users u on u.id = t.assignee_id
       left join task_states s on s.id = t.state_id
      where t.id = $1`,
    [id],
  )
  return rows[0] ?? null
}

/** Tareas abiertas que están en un estado concreto del taller. */
export async function openTasksByState(stateId) {
  const { rows } = await query(
    `select t.*, u.full_name as assignee_name, s.name as state_name
       from tasks t
       left join users u on u.id = t.assignee_id
       left join task_states s on s.id = t.state_id
      where t.state_id = $1 and t.status in ('open','in_progress')
      order by t.due_date asc nulls last, t.created_at asc`,
    [stateId],
  )
  return rows
}

/**
 * Tareas abiertas que vencen hasta una fecha (incluida). Las que no tienen
 * plazo quedan fuera a propósito: si preguntas qué vence esta semana, una
 * tarea sin fecha no vence esta semana.
 */
export async function openTasksDueBy(fecha, userId = null) {
  const { rows } = await query(
    `select t.*, u.full_name as assignee_name, s.name as state_name
       from tasks t
       left join users u on u.id = t.assignee_id
       left join task_states s on s.id = t.state_id
      where t.status in ('open','in_progress')
        and t.due_date is not null and t.due_date <= $1::date
        and ($2::uuid is null or t.assignee_id = $2::uuid)
      order by t.due_date asc, t.created_at asc`,
    [fecha, userId],
  )
  return rows
}
