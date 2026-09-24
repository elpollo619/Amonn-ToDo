// ============================================================
// Base de conocimiento viva (Fase D2).
//
// El equipo le enseña hechos al agente por WhatsApp ("recuerda que la caldera
// de A14 es Viessmann") y esos hechos se inyectan en el dossier que ve Gemini,
// para que la secretaria sepa "cada detalle". Cualquiera del equipo puede
// enseñar; olvidar queda para los admin (se controla en el handler).
//
// ⚠️ El conocimiento VIAJA a la API de Gemini. Por eso NUNCA se guardan
// secretos (contraseñas, claves API, IBAN, tarjetas): se filtran al entrar con
// esSecreto(). Es una barrera dura, no un consejo.
// ============================================================
import { query } from './db.js'
import { broadcast } from './events.js'

/**
 * ¿El texto parece contener un secreto que no debe salir a la API? Detecta
 * IBAN, tarjetas, y menciones de contraseña/clave/token con un valor pegado.
 * Ante la duda, corta: es peor filtrar un secreto que rechazar un hecho.
 */
export function esSecreto(text) {
  const s = String(text ?? '')
  // IBAN (CH…, DE…, cualquier país): 2 letras + 2 dígitos + 10-30 alfanum.
  if (/\b[A-Z]{2}\d{2}[\sA-Z0-9]{10,34}\b/i.test(s.replace(/\s+/g, ' '))) return true
  // Tarjeta o cuenta larga: 13-19 dígitos seguidos (con o sin espacios).
  if (/\b(?:\d[ -]?){13,19}\b/.test(s)) return true
  // Palabras de secreto con un valor detrás (: = o espacio + algo).
  if (/\b(contrase[nñ]a|password|passwort|senha|clave|api[\s_-]?key|apikey|token|secret|geheim|pin|iban)\b\s*[:=]?\s*\S{3,}/i.test(s)) return true
  // Cadena larga tipo clave/token: 20+ caracteres alfanuméricos con dígitos.
  if (/\b(?=[A-Za-z0-9_-]*\d)[A-Za-z0-9_-]{20,}\b/.test(s)) return true
  return false
}

/**
 * Guarda un hecho. Lanza { status:400, code:'secreto' } si parece un secreto,
 * o { status:400 } si viene vacío.
 */
export async function addFact({ text, userId = null }) {
  const limpio = String(text ?? '').trim()
  if (!limpio) throw Object.assign(new Error('Falta el hecho'), { status: 400 })
  if (esSecreto(limpio)) throw Object.assign(new Error('Parece un secreto'), { status: 400, code: 'secreto' })
  const { rows } = await query(
    `insert into company_facts (text, created_by) values ($1,$2) returning *`,
    [limpio, userId || null],
  )
  broadcast()
  return rows[0]
}

/** Lista los hechos activos, más recientes primero. */
export async function listFacts(limite = 30) {
  const { rows } = await query(
    `select f.*, u.full_name as autor
       from company_facts f
       left join users u on u.id = f.created_by
      where f.active
      order by f.created_at desc
      limit $1`,
    [limite],
  )
  return rows
}

/**
 * Desactiva los hechos que casan con el texto dado (búsqueda por substring,
 * insensible a mayúsculas). Devuelve cuántos se olvidaron.
 */
export async function forgetFact(texto) {
  const q = `%${String(texto ?? '').trim().toLowerCase()}%`
  if (q === '%%') return 0
  const { rowCount } = await query(
    `update company_facts set active = false
      where active and lower(text) like $1`,
    [q],
  )
  if (rowCount > 0) broadcast()
  return rowCount
}

/**
 * Bloque de texto con los hechos activos para pegar en el prompt de Gemini.
 * Vacío si no hay ninguno (para no ensuciar el prompt).
 */
export async function factsParaDossier(limite = 40) {
  const rows = await listFacts(limite)
  if (rows.length === 0) return ''
  return 'LO QUE EL EQUIPO TE HA ENSEÑADO (memoria viva):\n' +
    rows.map((f) => `- ${f.text}`).join('\n')
}

/** Cómo se enseña un hecho por WhatsApp. */
export function formatFact(f, lang = 'es') {
  const fecha = new Date(f.created_at).toLocaleDateString(
    lang === 'de' ? 'de-CH' : lang === 'pt' ? 'pt-PT' : 'es-ES',
    { day: '2-digit', month: '2-digit', year: '2-digit' },
  )
  const meta = [fecha, f.autor].filter(Boolean).join(' · ')
  return `• ${f.text}${meta ? `\n   (${meta})` : ''}`
}
