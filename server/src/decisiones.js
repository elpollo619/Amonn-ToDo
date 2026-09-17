// ============================================================
// Registro de decisiones (idea del documento del agente interno).
//
// "Guarda que aceptamos la variante B en Seewer" → queda escrito quién decidió
// qué, cuándo y para qué proyecto. Luego "¿qué decisiones hay de Seewer?".
// La memoria de las decisiones deja de vivir solo en la cabeza de cada uno.
// ============================================================
import { query } from './db.js'
import { broadcast } from './events.js'

export async function addDecision({ text, project = null, userId = null }) {
  const limpio = String(text ?? '').trim()
  if (!limpio) throw Object.assign(new Error('Falta la decisión'), { status: 400 })
  const { rows } = await query(
    `insert into decisions (text, project, created_by) values ($1,$2,$3) returning *`,
    [limpio, project || null, userId || null],
  )
  broadcast()
  return rows[0]
}

/**
 * Lista decisiones. Con `busqueda` filtra por proyecto O por texto (así
 * "decisiones de Seewer" encuentra tanto las etiquetadas con ese proyecto
 * como las que lo mencionan). Sin búsqueda, las más recientes.
 */
export async function listDecisions(busqueda = null, limite = 10) {
  const q = busqueda ? `%${String(busqueda).trim().toLowerCase()}%` : null
  const { rows } = await query(
    `select d.*, u.full_name as autor
       from decisions d
       left join users u on u.id = d.created_by
      where $1::text is null
         or lower(coalesce(d.project,'')) like $1
         or lower(d.text) like $1
      order by d.created_at desc
      limit $2`,
    [q, limite],
  )
  return rows
}

/** Cómo se enseña una decisión por WhatsApp. */
export function formatDecision(d, lang = 'es') {
  const fecha = new Date(d.created_at).toLocaleDateString(
    lang === 'de' ? 'de-CH' : lang === 'pt' ? 'pt-PT' : 'es-ES',
    { day: '2-digit', month: '2-digit', year: '2-digit' },
  )
  const meta = [fecha, d.autor, d.project].filter(Boolean).join(' · ')
  return `• ${d.text}${meta ? `\n   (${meta})` : ''}`
}
