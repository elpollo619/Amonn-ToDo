// ============================================================
// Búsqueda inteligente interna (Fase 1 del asistente).
//
// El usuario pregunta en lenguaje natural ("busca la caldera", "qué sabemos de
// Seewer") y el asistente rebusca en los registros internos y responde CITANDO
// la fuente y la fecha de cada resultado.
//
// PRIVACIDAD: la búsqueda global SOLO cubre datos NO sensibles —tareas,
// decisiones y contactos—. Los datos financieros (gastos, contratos, impagos)
// tienen sus propias intenciones con control de permisos y NO se filtran aquí.
// ============================================================
import { query } from './db.js'
import { t } from './i18n.js'

/**
 * Busca "a lo ancho" un término en tareas, decisiones y contactos. Tres
 * consultas ILIKE ('%término%'), como mucho `limitePorTipo` de cada tipo, las
 * más recientes primero. Devuelve { tareas, decisiones, contactos } con los
 * campos clave + la fecha de cada uno.
 */
export async function buscarGlobal(q, limitePorTipo = 4) {
  const termino = String(q ?? '').trim()
  if (!termino) return { tareas: [], decisiones: [], contactos: [] }
  const like = `%${termino}%`
  const [tareas, decisiones, contactos] = await Promise.all([
    query(
      `select id, title, status, due_date, created_at
         from tasks
        where title ilike $1 or coalesce(description,'') ilike $1
        order by created_at desc
        limit $2`,
      [like, limitePorTipo],
    ).then((r) => r.rows),
    query(
      `select id, text, project, created_at
         from decisions
        where text ilike $1 or coalesce(project,'') ilike $1
        order by created_at desc
        limit $2`,
      [like, limitePorTipo],
    ).then((r) => r.rows),
    query(
      `select id, name, company, role, project, created_at
         from contacts
        where name ilike $1 or coalesce(company,'') ilike $1
           or coalesce(role,'') ilike $1 or coalesce(project,'') ilike $1
        order by (case when company is not null then 0 else 1 end), length(name)
        limit $2`,
      [like, limitePorTipo],
    ).then((r) => r.rows),
  ])
  return { tareas, decisiones, contactos }
}

const LOCALE = { de: 'de-CH', pt: 'pt-PT', es: 'es-ES' }
// Estado de la tarea en palabras, por idioma.
const ESTADO = {
  es: { open: 'abierta', in_progress: 'en curso', done: 'hecha' },
  de: { open: 'offen', in_progress: 'in Arbeit', done: 'erledigt' },
  pt: { open: 'aberta', in_progress: 'em curso', done: 'concluída' },
}
// Cuántos resultados se muestran como mucho (el resto se resume en "… y N más").
const MAX_MOSTRADOS = 10

function fmtFecha(v, lang) {
  if (!v) return ''
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString(LOCALE[lang] ?? LOCALE.es, {
    day: '2-digit', month: '2-digit', year: '2-digit',
  })
}

/**
 * Arma el mensaje agrupado por tipo. Cada resultado en una línea, citando la
 * fuente (tarea/decisión/contacto) y la fecha. Si no hay nada, devuelve el
 * aviso `search_none`.
 */
export function formatBusqueda(res, termino, lang = 'es') {
  const { tareas = [], decisiones = [], contactos = [] } = res ?? {}
  const total = tareas.length + decisiones.length + contactos.length
  if (total === 0) return t(lang, 'search_none', { q: termino })

  const estados = ESTADO[lang] ?? ESTADO.es
  const partes = []
  for (const x of tareas) {
    const meta = [estados[x.status] ?? x.status, fmtFecha(x.created_at, lang)].filter(Boolean).join(', ')
    partes.push(`${t(lang, 'search_task_label')}: ${x.title}${meta ? ` (${meta})` : ''}`)
  }
  for (const x of decisiones) {
    const meta = [x.project, fmtFecha(x.created_at, lang)].filter(Boolean).join(', ')
    partes.push(`${t(lang, 'search_decision_label')}: ${x.text}${meta ? ` (${meta})` : ''}`)
  }
  for (const x of contactos) {
    const detalle = [x.company, x.role, x.project].filter(Boolean).join(' · ')
    partes.push(`${t(lang, 'search_contact_label')}: ${x.name}${detalle ? ` — ${detalle}` : ''}`)
  }

  const mostradas = partes.slice(0, MAX_MOSTRADOS)
  let salida = t(lang, 'search_head', { q: termino }) + mostradas.join('\n')
  if (partes.length > MAX_MOSTRADOS) {
    salida += '\n' + t(lang, 'search_more', { n: partes.length - MAX_MOSTRADOS })
  }
  return salida
}
