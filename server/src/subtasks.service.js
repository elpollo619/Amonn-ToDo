// ============================================================
// Pasos dentro de una tarea (subtareas).
//
// Decisión deliberada: un paso NO es una tarea. No se asigna a nadie, no
// tiene plazo y no genera avisos. Es una lista de comprobación dentro de la
// tarea, y lo que aporta es el avance del conjunto ("2 de 5"). Hacerlos
// tareas de verdad habría duplicado media aplicación para nada.
// ============================================================
import { query } from './db.js'
import { broadcast } from './events.js'

export async function listSubtasks(taskId) {
  const { rows } = await query(
    'select * from subtasks where task_id = $1 order by position asc, created_at asc',
    [taskId],
  )
  return rows
}

export async function createSubtask(taskId, { title, createdBy = null }) {
  const limpio = String(title ?? '').trim()
  if (!limpio) throw Object.assign(new Error('El paso necesita un texto'), { status: 400 })
  const { rows: max } = await query(
    'select coalesce(max(position), -1) + 1 as pos from subtasks where task_id = $1',
    [taskId],
  )
  const { rows } = await query(
    'insert into subtasks (task_id, title, position, created_by) values ($1,$2,$3,$4) returning *',
    [taskId, limpio, max[0].pos, createdBy],
  )
  broadcast()
  return rows[0]
}

export async function updateSubtask(id, patch) {
  const campos = []
  const valores = []
  let i = 1
  const set = (col, val) => { campos.push(`${col} = $${i++}`); valores.push(val) }
  if (patch.title !== undefined) {
    const limpio = String(patch.title).trim()
    if (!limpio) throw Object.assign(new Error('El paso no puede quedar vacío'), { status: 400 })
    set('title', limpio)
  }
  if (patch.done !== undefined) set('done', Boolean(patch.done))
  if (patch.position !== undefined) set('position', Number(patch.position))
  if (campos.length === 0) return null
  valores.push(id)
  const { rows } = await query(
    `update subtasks set ${campos.join(', ')} where id = $${i} returning *`,
    valores,
  )
  broadcast()
  return rows[0] ?? null
}

export async function deleteSubtask(id) {
  const { rowCount } = await query('delete from subtasks where id = $1', [id])
  broadcast()
  return rowCount > 0
}

/** Reordena los pasos de una tarea: recibe los ids en el orden deseado. */
export async function reorderSubtasks(taskId, ids) {
  if (!Array.isArray(ids)) throw Object.assign(new Error('Se esperaba una lista de ids'), { status: 400 })
  for (const [pos, id] of ids.entries()) {
    await query('update subtasks set position = $2 where id = $1 and task_id = $3', [id, pos, taskId])
  }
  broadcast()
  return listSubtasks(taskId)
}

/**
 * Fragmento SQL con el avance de los pasos, para añadirlo a las consultas de
 * tareas sin hacer una consulta por tarea (que era el riesgo evidente aquí).
 */
export const SUBTASK_COUNTS_SQL = `
  left join (
    select task_id,
           count(*)::int as subtasks_total,
           count(*) filter (where done)::int as subtasks_done
      from subtasks group by task_id
  ) sc on sc.task_id = t.id`
