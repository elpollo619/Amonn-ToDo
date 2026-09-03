// ============================================================
// Fotos que llegan por WhatsApp.
//
// El Gateway NO guarda los medios como ficheros: su carpeta `media/` está
// vacía y `STORAGE_TYPE` ni siquiera está definida. Lo que hace es meter la
// foto ENTERA, en base64, dentro del propio mensaje —en la base de datos se
// ve en `metadata.media.data`, junto a `metadata.media.mimetype`—. Por eso
// aquí no se descarga nada: se decodifica lo que ya viene.
//
// Como el Gateway no documenta la forma exacta del evento en vivo, se busca
// en varias rutas posibles y, si el mensaje parece una foto pero no aparecen
// los bytes, se deja constancia en el registro con las claves recibidas (sin
// volcar el base64, que son cientos de miles de caracteres).
// ============================================================
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { config } from './config.js'
import { MIMES, MAX_BYTES } from './comments.service.js'

/** Rutas donde puede venir el bloque de la foto, de más a menos probable. */
const RUTAS = [
  (m) => m?.metadata?.media,
  (m) => m?.media,
  (m) => m?.data?.media,
  (m) => m?.message?.media,
  (m) => m?.metadata,
]

/** ¿El mensaje se presenta como una foto? */
export function pareceFoto(msg) {
  const tipo = String(msg?.type ?? msg?.messageType ?? '').toLowerCase()
  if (tipo === 'image' || tipo === 'photo') return true
  return RUTAS.some((r) => String(r(msg)?.mimetype ?? '').startsWith('image/'))
}

/**
 * Saca la foto del mensaje. Devuelve { buffer, mime } o null si no viene.
 * No lanza: un mensaje raro no debe tumbar el procesado del texto.
 */
export function extraerFoto(msg) {
  for (const ruta of RUTAS) {
    const bloque = ruta(msg)
    const datos = bloque?.data ?? bloque?.base64 ?? bloque?.body
    // Sin umbrales caprichosos: basta con que sea texto y decodifique a algo.
    // (Un mínimo alto descartaba imágenes pequeñas pero perfectamente válidas.)
    if (typeof datos !== 'string' || datos.length < 16) continue
    // Puede venir como "data:image/jpeg;base64,XXXX" o como base64 pelado.
    const limpio = datos.includes(',') && datos.slice(0, 40).includes('base64')
      ? datos.slice(datos.indexOf(',') + 1)
      : datos
    let buffer
    try {
      buffer = Buffer.from(limpio, 'base64')
    } catch {
      continue
    }
    if (buffer.length === 0) continue
    const mime = String(bloque?.mimetype ?? bloque?.mime ?? 'image/jpeg').split(';')[0].trim()
    return { buffer, mime }
  }
  return null
}

/**
 * Para diagnosticar cuando el mensaje parece foto pero no trae los bytes:
 * describe la forma del objeto sin volcar su contenido.
 */
export function describirForma(valor, prefijo = '', profundidad = 0) {
  if (profundidad > 3 || valor === null || typeof valor !== 'object') {
    const desc = typeof valor === 'string' ? `string(${valor.length})` : typeof valor
    return [`${prefijo || '(raíz)'}:${desc}`]
  }
  if (Array.isArray(valor)) return [`${prefijo}:array(${valor.length})`]
  return Object.entries(valor).flatMap(([k, v]) =>
    describirForma(v, prefijo ? `${prefijo}.${k}` : k, profundidad + 1),
  )
}

/** Motivo por el que una foto no se puede aceptar, o null si todo bien. */
export function motivoRechazo({ buffer, mime }) {
  if (!MIMES[mime]) return 'tipo'
  if (buffer.length > MAX_BYTES) return 'tamaño'
  return null
}

// ---------- Fotos en espera de saber a qué tarea van ----------
// Se guardan en disco EN CUANTO llegan, antes de preguntar nada: si el
// usuario no contesta, o contesta mañana, la foto sigue estando. Perder
// material de obra por una pregunta sin responder no es aceptable.

function dirPendientes() {
  if (!config.uploadDir) return null
  return path.join(config.uploadDir, 'pendientes')
}

export function guardarPendiente(buffer, mime) {
  const dir = dirPendientes()
  if (!dir) return null
  fs.mkdirSync(dir, { recursive: true })
  const id = crypto.randomUUID()
  fs.writeFileSync(path.join(dir, id), buffer)
  fs.writeFileSync(path.join(dir, `${id}.mime`), mime)
  return id
}

export function leerPendiente(id) {
  const dir = dirPendientes()
  if (!dir || !id || !/^[0-9a-f-]{36}$/i.test(id)) return null
  try {
    return {
      buffer: fs.readFileSync(path.join(dir, id)),
      mime: fs.readFileSync(path.join(dir, `${id}.mime`), 'utf8').trim(),
    }
  } catch {
    return null
  }
}

export function borrarPendiente(id) {
  const dir = dirPendientes()
  if (!dir || !id) return
  for (const f of [id, `${id}.mime`]) {
    try { fs.unlinkSync(path.join(dir, f)) } catch { /* ya no estaba */ }
  }
}
