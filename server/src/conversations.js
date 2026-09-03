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
