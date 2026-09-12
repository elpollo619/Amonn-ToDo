// ============================================================
// Averías / mantenimiento (sección 7 del documento del asistente).
//
// "Hay agua bajo la ducha de la 203" → queda un ticket con ubicación,
// descripción, urgencia, estado, responsable e historial. Luego "¿qué averías
// hay abiertas?" o "avería de la 203 resuelta". Transversal a hotel, viviendas,
// oficinas y obra: la memoria de las reparaciones deja de vivir en llamadas y
// mensajes sueltos.
// ============================================================
import { query } from './db.js'
import { broadcast } from './events.js'

export const URGENCIAS = ['normal', 'urgente', 'emergencia']
export const ESTADOS = ['nueva', 'asignada', 'en_curso', 'resuelta']

export async function addAveria({ ubicacion, descripcion, urgencia = 'normal', proyecto = null, reportedBy = null }) {
  const ub = String(ubicacion ?? '').trim()
  const desc = String(descripcion ?? '').trim()
  if (!desc) throw Object.assign(new Error('Falta la descripción de la avería'), { status: 400 })
  const urg = URGENCIAS.includes(urgencia) ? urgencia : 'normal'
  const { rows } = await query(
    `insert into averias (ubicacion, descripcion, urgencia, proyecto, reported_by)
     values ($1,$2,$3,$4,$5) returning *`,
    [ub || '—', desc, urg, proyecto || null, reportedBy || null],
  )
  broadcast()
  return rows[0]
}

/**
 * Lista averías. Por defecto solo las abiertas (no resueltas). Con `busqueda`
 * filtra por ubicación, descripción o proyecto.
 */
export async function listAverias({ soloAbiertas = true, busqueda = null, limite = 15 } = {}) {
  const q = busqueda ? `%${String(busqueda).trim().toLowerCase()}%` : null
  const { rows } = await query(
    `select a.*, u.full_name as responsable
       from averias a
       left join users u on u.id = a.assignee_id
      where ($1::boolean is false or a.estado <> 'resuelta')
        and ($2::text is null
             or lower(a.ubicacion) like $2
             or lower(a.descripcion) like $2
             or lower(coalesce(a.proyecto,'')) like $2)
      order by
        case a.urgencia when 'emergencia' then 0 when 'urgente' then 1 else 2 end,
        a.created_at desc
      limit $3`,
    [soloAbiertas, q, limite],
  )
  return rows
}

/** Encuentra una avería abierta por una pista de texto (ubicación/descripción). */
export async function findAveriaByHint(hint) {
  const abiertas = await listAverias({ soloAbiertas: true, busqueda: hint, limite: 5 })
  return abiertas
}

/** Asigna la avería a una persona (pasa a 'asignada' si estaba 'nueva'). */
export async function asignarAveria(id, userId) {
  const { rows } = await query(
    `update averias
        set assignee_id = $2,
            estado = case when estado = 'nueva' then 'asignada' else estado end
      where id = $1 returning *`,
    [id, userId],
  )
  broadcast()
  return rows[0] ?? null
}

/** Marca una avería como resuelta. */
export async function resolverAveria(id) {
  const { rows } = await query(
    `update averias set estado = 'resuelta', resolved_at = now() where id = $1 returning *`,
    [id],
  )
  broadcast()
  return rows[0] ?? null
}

const EMOJI = { emergencia: '🚨', urgente: '⚠️', normal: '🔧' }

/** Cómo se enseña una avería por WhatsApp. */
export function formatAveria(a, lang = 'es') {
  const icono = EMOJI[a.urgencia] ?? '🔧'
  const l = [`${icono} ${a.ubicacion !== '—' ? a.ubicacion + ': ' : ''}${a.descripcion}`]
  const meta = []
  if (a.urgencia !== 'normal') meta.push(a.urgencia)
  if (a.estado && a.estado !== 'nueva') meta.push(a.estado.replace('_', ' '))
  if (a.responsable) meta.push(a.responsable)
  if (a.proyecto) meta.push(a.proyecto)
  if (meta.length) l.push(`   (${meta.join(' · ')})`)
  return l.join('\n')
}
