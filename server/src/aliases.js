// ============================================================
// Vocabulario del equipo: los apodos y expresiones propias con las que
// hablan entre ellos, para que el asistente los entienda.
//
// Dos tipos:
//  - 'person': "jasmi" → Jasmina. Apunta a un usuario concreto.
//  - 'task':   "la caldera" → las palabras que identifican esa tarea. NO
//    apunta a una tarea concreta a propósito: las tareas se completan y se
//    repiten cada mes, pero la forma de nombrarlas dura.
//
// Se llena de dos maneras, ambas deterministas y revisables:
//  1. Corrigiendo al asistente: si no reconoce "jasmi" y pregunta a quién se
//     refiere, la respuesta se guarda.
//  2. A mano: "jasmi es Jasmina".
// ============================================================
import { query } from './db.js'
import { normalize } from './dates.js'

/** Deja una frase lista para comparar y guardar (sin acentos, sin artículos). */
export function normalizePhrase(text) {
  return normalize(text)
    .replace(/^(la|el|los|las|lo|de|del|die|der|das|den|dem|a|o|as|os|da|do)\s+/g, '')
    .replace(/[.,;:!?]/g, '')
    .trim()
}

/** Todo el vocabulario, para resolverlo en memoria durante un mensaje. */
export async function loadAliases() {
  const { rows } = await query('select * from aliases')
  return rows
}

/** Busca a qué usuario apunta una frase. Devuelve el id o null. */
export function resolvePerson(aliases, text) {
  const p = normalizePhrase(text)
  if (!p) return null
  return aliases.find((a) => a.kind === 'person' && a.phrase === p)?.user_id ?? null
}

/**
 * Busca las palabras clave que el equipo asocia a una frase de tarea.
 * Primero por frase exacta y, si no, por contención de palabras en cualquiera
 * de los dos sentidos: así "calefacción" y "calefacción otra vez" se
 * reconocen entre sí sin tener que enseñar cada variante.
 */
export function resolveTask(aliases, text) {
  const p = normalizePhrase(text)
  if (!p) return null
  const tareas = aliases.filter((a) => a.kind === 'task')
  const exacta = tareas.find((a) => a.phrase === p)
  if (exacta) return exacta.keywords

  const palabras = (x) => x.split(' ').filter((w) => w.length >= 4)
  const mias = palabras(p)
  if (mias.length === 0) return null
  const contiene = (a, b) => a.length > 0 && a.every((w) => b.includes(w))
  const parecida = tareas.find((a) => {
    const suyas = palabras(a.phrase)
    return contiene(suyas, mias) || contiene(mias, suyas)
  })
  return parecida?.keywords ?? null
}

/**
 * Guarda (o refresca) una entrada del vocabulario. Idempotente: si la frase ya
 * existe para ese tipo, se actualiza el destino y se cuenta un uso más.
 * Frases de una sola letra o puramente numéricas se descartan: son ruido
 * ("1", "2") que vendría de responder a una lista numerada.
 */
export async function learn({ kind, phrase, userId = null, keywords = null, createdBy = null }) {
  const p = normalizePhrase(phrase)
  if (!p || p.length < 2 || /^\d+$/.test(p)) return null
  const { rows } = await query(
    `insert into aliases (kind, phrase, user_id, keywords, created_by, hits, last_used_at)
     values ($1, $2, $3, $4, $5, 1, now())
     on conflict (kind, phrase) do update
       set user_id = excluded.user_id,
           keywords = excluded.keywords,
           hits = aliases.hits + 1,
           last_used_at = now()
     returning *`,
    [kind, p, userId, keywords, createdBy],
  )
  console.log(`[vocabulario] aprendido: ${kind} "${p}" → ${userId ?? keywords}`)
  return rows[0]
}

/** Cuenta un uso (para saber qué vocabulario vale la pena y cuál sobra). */
export async function touch(kind, phrase) {
  await query(
    'update aliases set hits = hits + 1, last_used_at = now() where kind = $1 and phrase = $2',
    [kind, normalizePhrase(phrase)],
  )
}

/** Vocabulario con el nombre de la persona a la que apunta, para enseñarlo. */
export async function listAliases() {
  const { rows } = await query(
    `select a.*, u.full_name as target_name
       from aliases a
       left join users u on u.id = a.user_id
      order by a.kind, a.hits desc, a.phrase`,
  )
  return rows
}

/** Olvida una entrada (se equivocó, o ya no se usa). */
export async function forget(id) {
  await query('delete from aliases where id = $1', [id])
}
