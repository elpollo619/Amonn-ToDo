// ============================================================
// Lista de la compra de la oficina.
//
// El problema que resuelve es concreto: alguien ve que falta café, no lo
// apunta en ningún sitio, y cuando toca comprar nadie se acuerda. Aquí basta
// con decirlo por WhatsApp en el momento en que se ve el hueco.
//
// Es una lista compartida, no una por persona: la oficina es una sola. Se
// guarda quién lo pidió para poder preguntar si hay dudas.
// ============================================================
import { query } from './db.js'
import { broadcast } from './events.js'

/**
 * Mayúscula inicial, hecha en JS a propósito.
 * (En CSS, `text-transform: capitalize` en español produce cosas como
 * "Papel De La Impresora"; ya ha mordido antes en este proyecto.)
 */
function conMayusculaInicial(s) {
  const t = String(s ?? '').trim()
  return t ? t[0].toLocaleUpperCase('es') + t.slice(1) : t
}

export async function addCompra(texto, userId = null) {
  const limpio = conMayusculaInicial(String(texto ?? '').trim())
  if (!limpio) throw Object.assign(new Error('Falta qué hay que comprar'), { status: 400 })
  // Si ya está pedido y nadie lo ha comprado, no se duplica: se devuelve el
  // que había. Que tres personas pidan café no son tres cafés.
  const { rows: ya } = await query(
    'select * from shopping_items where lower(title) = lower($1) and bought_at is null',
    [limpio],
  )
  if (ya.length) return { item: ya[0], repetido: true }
  const { rows } = await query(
    'insert into shopping_items (title, requested_by) values ($1,$2) returning *',
    [limpio, userId],
  )
  broadcast()
  return { item: rows[0], repetido: false }
}

/** Lo que falta por comprar, lo más antiguo primero. */
export async function listCompras() {
  const { rows } = await query(
    `select s.*, u.full_name as requested_by_name
       from shopping_items s
       left join users u on u.id = s.requested_by
      where s.bought_at is null
      order by s.created_at asc`,
  )
  return rows
}

/**
 * Marca como comprado. Sin texto marca TODA la lista (el caso normal: se
 * vuelve del supermercado con todo). Con texto, solo lo que coincida.
 */
export async function markComprado(texto = null, userId = null) {
  if (!texto || !String(texto).trim()) {
    const { rows } = await query(
      'update shopping_items set bought_at = now(), bought_by = $1 where bought_at is null returning *',
      [userId],
    )
    broadcast()
    return rows
  }
  const t = String(texto).trim()
  const { rows } = await query(
    `update shopping_items set bought_at = now(), bought_by = $1
      where bought_at is null and (lower(title) = lower($2) or lower(title) like '%' || lower($2) || '%')
      returning *`,
    [userId, t],
  )
  broadcast()
  return rows
}

/** Quita algo de la lista sin marcarlo como comprado (se pidió por error). */
export async function removeCompra(texto) {
  const { rows } = await query(
    `delete from shopping_items
      where bought_at is null and lower(title) like '%' || lower($1) || '%'
      returning *`,
    [String(texto ?? '').trim()],
  )
  broadcast()
  return rows
}
