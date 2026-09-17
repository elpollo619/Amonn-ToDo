// ============================================================
// Estados de las tareas, definidos por el equipo.
//
// La pieza importante es `kind`: cada estado pertenece a una de las tres
// clases que el resto del sistema ya entendía ('open', 'in_progress',
// 'done'). Cuando una tarea cambia de estado, el servidor pone también
// tasks.status = kind del estado. Así el asistente de WhatsApp, los
// recordatorios y las listas siguen funcionando sin cambios, y no hay dos
// verdades que puedan separarse.
// ============================================================
import { query } from './db.js'

export const KINDS = ['open', 'in_progress', 'done']
export const COLORS = ['slate', 'blue', 'green', 'amber', 'red', 'violet', 'teal']

export async function listStates() {
  const { rows } = await query('select * from task_states order by position asc, created_at asc')
  return rows
}

export async function getState(id) {
  const { rows } = await query('select * from task_states where id = $1', [id])
  return rows[0] ?? null
}

/** El estado al que van las tareas de una clase cuando no se dice otro. */
export async function defaultStateFor(kind) {
  const { rows } = await query(
    `select * from task_states
      where kind = $1 order by is_default desc, position asc limit 1`,
    [kind],
  )
  return rows[0] ?? null
}

export async function createState({ name, kind, color = 'slate' }) {
  const limpio = String(name ?? '').trim()
  if (!limpio) throw Object.assign(new Error('El nombre es obligatorio'), { status: 400 })
  if (!KINDS.includes(kind)) throw Object.assign(new Error('Clase de estado no válida'), { status: 400 })
  const { rows: max } = await query('select coalesce(max(position), -1) + 1 as pos from task_states')
  const { rows } = await query(
    `insert into task_states (name, kind, color, position) values ($1,$2,$3,$4) returning *`,
    [limpio, kind, COLORS.includes(color) ? color : 'slate', max[0].pos],
  )
  return rows[0]
}

export async function updateState(id, patch) {
  const campos = []
  const valores = []
  let i = 1
  const set = (col, val) => { campos.push(`${col} = $${i++}`); valores.push(val) }
  if (patch.name !== undefined) {
    const limpio = String(patch.name).trim()
    if (!limpio) throw Object.assign(new Error('El nombre no puede quedar vacío'), { status: 400 })
    set('name', limpio)
  }
  if (patch.kind !== undefined) {
    if (!KINDS.includes(patch.kind)) throw Object.assign(new Error('Clase no válida'), { status: 400 })
    set('kind', patch.kind)
  }
  if (patch.color !== undefined) set('color', COLORS.includes(patch.color) ? patch.color : 'slate')
  if (patch.position !== undefined) set('position', Number(patch.position))
  if (campos.length === 0) return getState(id)
  valores.push(id)
  const { rows } = await query(
    `update task_states set ${campos.join(', ')} where id = $${i} returning *`,
    valores,
  )
  const estado = rows[0]
  // Si cambió la clase, las tareas que lo tienen deben cambiar de status con
  // él: si no, una tarea marcada "Hecha" seguiría contando como abierta.
  if (estado && patch.kind !== undefined) {
    await query('update tasks set status = $2, updated_at = now() where state_id = $1', [id, estado.kind])
  }
  return estado
}

/**
 * Borra un estado y reubica sus tareas en el estado por defecto de la misma
 * clase. Nunca deja tareas huérfanas, y no permite borrar el último estado de
 * una clase (dejaría el tablero sin esa columna y sin sitio donde caer).
 */
export async function deleteState(id) {
  const estado = await getState(id)
  if (!estado) return { deleted: false }
  const { rows: hermanos } = await query(
    'select id from task_states where kind = $1 and id <> $2 order by is_default desc, position asc',
    [estado.kind, id],
  )
  if (hermanos.length === 0) {
    throw Object.assign(
      new Error(`No puedes borrar el último estado de tipo "${estado.kind}"`),
      { status: 400 },
    )
  }
  await query('update tasks set state_id = $2, updated_at = now() where state_id = $1', [id, hermanos[0].id])
  await query('delete from task_states where id = $1', [id])
  return { deleted: true, movedTo: hermanos[0].id }
}

/** Reordena: recibe la lista de ids en el orden deseado. */
export async function reorderStates(ids) {
  if (!Array.isArray(ids)) throw Object.assign(new Error('Se esperaba una lista de ids'), { status: 400 })
  for (const [pos, id] of ids.entries()) {
    await query('update task_states set position = $2 where id = $1', [id, pos])
  }
  return listStates()
}

/**
 * Resuelve el estado que hay que guardar en una tarea y el status que le
 * corresponde. Acepta `state_id` (nuevo) o `status` (lo de antes, y lo que
 * sigue usando el asistente de WhatsApp).
 */
export async function resolveState({ state_id: stateId, status }) {
  if (stateId) {
    const estado = await getState(stateId)
    if (!estado) throw Object.assign(new Error('Ese estado no existe'), { status: 400 })
    return { state_id: estado.id, status: estado.kind }
  }
  const kind = KINDS.includes(status) ? status : 'open'
  const estado = await defaultStateFor(kind)
  return { state_id: estado?.id ?? null, status: kind }
}

/**
 * Encuentra un estado por cómo lo ha escrito la persona ("esperando
 * material", "por facturar"). Exige que TODAS las palabras significativas de
 * lo escrito estén en el nombre del estado, y que haya un único candidato:
 * poner una tarea en el estado equivocado es peor que preguntar.
 */
export function matchStateByName(states, text) {
  const norm = (x) =>
    String(x ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
  const q = norm(text)
  if (!q) return { state: null, candidates: [] }
  const exacto = states.find((e) => norm(e.name) === q)
  if (exacto) return { state: exacto, candidates: [] }
  const palabras = q.split(/\s+/).filter((w) => w.length >= 3)
  if (palabras.length === 0) return { state: null, candidates: [] }
  const candidatos = states.filter((e) => {
    const nombre = norm(e.name)
    return palabras.every((w) => nombre.includes(w))
  })
  if (candidatos.length === 1) return { state: candidatos[0], candidates: [] }
  return { state: null, candidates: candidatos }
}
