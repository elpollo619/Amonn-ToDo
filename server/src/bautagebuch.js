// ============================================================
// Bautagebuch / diario de obra (sección 6 del documento del asistente).
//
// "Informe de obra de Seewer: hoy hormigonamos el sótano, estuvo Böhlen, llovió
// por la tarde." → queda un parte fechado por obra. Luego "¿qué pasó en Seewer
// esta semana?". El diario de obra deja de depender de la libreta de cada uno.
// El texto libre (a menudo un audio transcrito) se guarda tal cual en `trabajos`;
// personal/clima/incidencias son opcionales para no obligar a rellenar campos.
// ============================================================
import { query } from './db.js'
import { broadcast } from './events.js'

export async function addReporte({ proyecto, trabajos, fecha = null, personal = null, clima = null, incidencias = null, userId = null }) {
  const proj = String(proyecto ?? '').trim()
  const txt = String(trabajos ?? '').trim()
  if (!proj) throw Object.assign(new Error('Falta la obra/proyecto'), { status: 400 })
  if (!txt) throw Object.assign(new Error('Falta lo que se hizo'), { status: 400 })
  const { rows } = await query(
    `insert into bautagebuch (proyecto, fecha, trabajos, personal, clima, incidencias, created_by)
     values ($1, coalesce($2::date, current_date), $3, $4, $5, $6, $7) returning *`,
    [proj, fecha || null, txt, personal || null, clima || null, incidencias || null, userId || null],
  )
  broadcast()
  return rows[0]
}

/**
 * Lista partes de obra. Con `proyecto` filtra por obra (o cualquier texto que
 * la mencione); sin él, los más recientes de todas las obras.
 */
export async function listReportes({ proyecto = null, limite = 10 } = {}) {
  const q = proyecto ? `%${String(proyecto).trim().toLowerCase()}%` : null
  const { rows } = await query(
    `select b.*, u.full_name as autor
       from bautagebuch b
       left join users u on u.id = b.created_by
      where $1::text is null or lower(b.proyecto) like $1 or lower(b.trabajos) like $1
      order by b.fecha desc, b.created_at desc
      limit $2`,
    [q, limite],
  )
  return rows
}

/** Cómo se enseña un parte de obra por WhatsApp. */
export function formatReporte(b, lang = 'es') {
  const fecha = new Date(b.fecha).toLocaleDateString(
    lang === 'de' ? 'de-CH' : lang === 'pt' ? 'pt-PT' : 'es-ES',
    { day: '2-digit', month: '2-digit', year: '2-digit' },
  )
  const l = [`🏗️ ${b.proyecto} — ${fecha}`, b.trabajos]
  const extra = []
  if (b.personal) extra.push(`👷 ${b.personal}`)
  if (b.clima) extra.push(`🌦️ ${b.clima}`)
  if (b.incidencias) extra.push(`⚠️ ${b.incidencias}`)
  if (extra.length) l.push(extra.join('  ·  '))
  return l.join('\n')
}
