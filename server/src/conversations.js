// ============================================================
// Conversación a medias con el asistente de WhatsApp.
//
// Hasta ahora cada mensaje se procesaba solo, sin memoria: por eso el
// asistente no podía preguntar "¿para quién?" y entender la respuesta. Aquí
// se guarda el borrador de tarea mientras se completa lo que falta.
//
// Se guarda UNA fila por teléfono y caduca a los 10 minutos, para que un "sí"
// escrito mañana no se enganche a la pregunta de hoy.
// ============================================================
import { query } from './db.js'

export const CADUCIDAD_MS = 10 * 60_000

/**
 * Devuelve la conversación a medias de ese teléfono, o null si no hay o si ya
 * caducó. Cuando ha caducado la borra y devuelve { caducada: true } para que
 * quien llama pueda avisar de que se empieza de nuevo.
 */
export async function getPending(phone) {
  const { rows } = await query('select * from wa_conversations where phone = $1', [phone])
  const row = rows[0]
  if (!row) return null
  const edad = Date.now() - new Date(row.updated_at).getTime()
  if (edad > CADUCIDAD_MS) {
    await clearPending(phone)
    return { caducada: true }
  }
  return row.pending
}

/** Guarda (o reemplaza) la conversación a medias. */
export async function setPending(phone, userId, pending) {
  await query(
    `insert into wa_conversations (phone, user_id, pending, updated_at)
     values ($1, $2, $3, now())
     on conflict (phone) do update
       set pending = excluded.pending, user_id = excluded.user_id, updated_at = now()`,
    [phone, userId, JSON.stringify(pending)],
  )
}

/** Olvida la conversación a medias (tarea creada, cancelada o caducada). */
export async function clearPending(phone) {
  await query('delete from wa_conversations where phone = $1', [phone])
}

// ─── Memoria conversacional ligera (Fase C) ───────────────────
// A diferencia del pending de arriba, esto NO es un flujo a medias: es solo
// "de qué íbamos hablando", para resolver frases elípticas ("créame uno de
// muestra"). Caduca igual (10 min) para que un "otro" de mañana no se
// enganche al tema de hoy.

/** Devuelve el contexto reciente de ese teléfono, o null si no hay o caducó. */
export async function getContext(phone) {
  const { rows } = await query('select * from wa_context where phone = $1', [phone])
  const row = rows[0]
  if (!row) return null
  if (Date.now() - new Date(row.updated_at).getTime() > CADUCIDAD_MS) {
    await query('delete from wa_context where phone = $1', [phone])
    return null
  }
  return { tema: row.tema, tipo: row.tipo, ultimoBot: row.ultimo_bot }
}

/** Guarda (o reemplaza) el contexto reciente. Campos opcionales. */
export async function setContext(phone, userId, { tema = null, tipo = null, ultimoBot = null } = {}) {
  await query(
    `insert into wa_context (phone, user_id, tema, tipo, ultimo_bot, updated_at)
     values ($1, $2, $3, $4, $5, now())
     on conflict (phone) do update
       set tema = excluded.tema, tipo = excluded.tipo,
           ultimo_bot = excluded.ultimo_bot, user_id = excluded.user_id,
           updated_at = now()`,
    [phone, userId, tema, tipo, ultimoBot ? String(ultimoBot).slice(0, 500) : null],
  )
}
