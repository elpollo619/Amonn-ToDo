// ============================================================
// Comentarios de una tarea y sus ficheros adjuntos.
//
// ⚠️ EL ALMACENAMIENTO ES DELIBERADAMENTE OPCIONAL.
// El contenedor de Amonn no tiene ningún volumen: cualquier fichero escrito
// dentro se pierde cuando Watchtower lo recrea, o sea, en cada despliegue.
// Guardar fotos ahí sería perder material de obra sin avisar. Por eso los
// adjuntos SOLO se aceptan si existe UPLOAD_DIR y es escribible; si no, la
// API lo dice con claridad y la app oculta el botón. Los comentarios de
// texto, que van en la base de datos (que sí es persistente), funcionan
// siempre.
// ============================================================
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { query } from './db.js'
import { config } from './config.js'
import { broadcast } from './events.js'

/** Tipos que se aceptan. Nada de ejecutables ni de cualquier cosa. */
export const MIMES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'application/pdf': 'pdf',
}
export const MAX_BYTES = 12 * 1024 * 1024

/**
 * ¿Se pueden guardar adjuntos? Devuelve { ok, reason }. Se comprueba de
 * verdad escribiendo un fichero: que la variable esté puesta no significa
 * que el directorio exista ni que se pueda escribir en él.
 */
export function storageStatus() {
  const dir = config.uploadDir
  if (!dir) {
    return {
      ok: false,
      reason: 'Sin almacenamiento configurado: falta UPLOAD_DIR y un volumen en el contenedor. ' +
        'Los comentarios de texto funcionan; las fotos quedan desactivadas para no perderlas.',
    }
  }
  try {
    fs.mkdirSync(dir, { recursive: true })
    const prueba = path.join(dir, '.escritura')
    fs.writeFileSync(prueba, 'ok')
    fs.unlinkSync(prueba)
    return { ok: true, dir }
  } catch (err) {
    return { ok: false, reason: `No puedo escribir en ${dir}: ${err.message}` }
  }
}

export async function listComments(taskId) {
  const { rows } = await query(
    `select c.*, u.full_name as author_name, u.avatar_color as author_color
       from comments c left join users u on u.id = c.user_id
      where c.task_id = $1 order by c.created_at asc`,
    [taskId],
  )
  const { rows: adjuntos } = await query(
    'select * from attachments where task_id = $1 order by created_at asc',
    [taskId],
  )
  // Cada comentario lleva los suyos; los sueltos (sin comentario) van aparte.
  return {
    comments: rows.map((c) => ({
      ...c,
      attachments: adjuntos.filter((a) => a.comment_id === c.id),
    })),
    loose: adjuntos.filter((a) => !a.comment_id),
  }
}

export async function createComment(taskId, { body, userId = null, source = 'app' }) {
  const limpio = String(body ?? '').trim()
  if (!limpio) throw Object.assign(new Error('El comentario está vacío'), { status: 400 })
  const { rows } = await query(
    'insert into comments (task_id, user_id, body, source) values ($1,$2,$3,$4) returning *',
    [taskId, userId, limpio, source === 'whatsapp' ? 'whatsapp' : 'app'],
  )
  broadcast()
  return rows[0]
}

export async function deleteComment(id) {
  // Los adjuntos del comentario se van con él (cascade), pero sus ficheros
  // hay que borrarlos a mano: la base de datos no sabe de disco.
  const { rows } = await query('select path from attachments where comment_id = $1', [id])
  const { rowCount } = await query('delete from comments where id = $1', [id])
  borrarFicheros(rows.map((r) => r.path))
  broadcast()
  return rowCount > 0
}

function borrarFicheros(relativos) {
  const dir = config.uploadDir
  if (!dir) return
  for (const rel of relativos) {
    try { fs.unlinkSync(path.join(dir, rel)) } catch { /* ya no estaba */ }
  }
}

/**
 * Guarda un fichero adjunto. `buffer` es el cuerpo crudo de la petición.
 * El nombre en disco lo genera el servidor: nunca se usa el que envía el
 * cliente, que es la vía clásica para escribir fuera del directorio.
 */
export async function createAttachment(taskId, { buffer, mime, filename, userId = null, commentId = null }) {
  const estado = storageStatus()
  if (!estado.ok) throw Object.assign(new Error(estado.reason), { status: 503 })
  const ext = MIMES[mime]
  if (!ext) {
    throw Object.assign(
      new Error(`Tipo de fichero no admitido (${mime}). Se aceptan: ${Object.keys(MIMES).join(', ')}`),
      { status: 415 },
    )
  }
  if (!buffer || buffer.length === 0) throw Object.assign(new Error('Fichero vacío'), { status: 400 })
  if (buffer.length > MAX_BYTES) {
    throw Object.assign(new Error(`El fichero pasa de ${MAX_BYTES / 1024 / 1024} MB`), { status: 413 })
  }
  // Un subdirectorio por año-mes: un solo directorio con miles de fotos de
  // obra se vuelve incómodo de mirar y de respaldar.
  const ahora = new Date()
  const sub = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}`
  fs.mkdirSync(path.join(estado.dir, sub), { recursive: true })
  const rel = path.join(sub, `${crypto.randomUUID()}.${ext}`)
  fs.writeFileSync(path.join(estado.dir, rel), buffer)
  const { rows } = await query(
    `insert into attachments (task_id, comment_id, filename, mime, bytes, path, user_id)
     values ($1,$2,$3,$4,$5,$6,$7) returning *`,
    [taskId, commentId, String(filename ?? `foto.${ext}`).slice(0, 120), mime, buffer.length, rel, userId],
  )
  broadcast()
  return rows[0]
}

export async function getAttachment(id) {
  const { rows } = await query('select * from attachments where id = $1', [id])
  const a = rows[0]
  if (!a) return null
  const dir = config.uploadDir
  if (!dir) return null
  // Defensa aunque el path venga de nuestra propia base de datos: se resuelve
  // y se comprueba que sigue dentro del directorio de subidas.
  const abs = path.resolve(dir, a.path)
  if (!abs.startsWith(path.resolve(dir) + path.sep)) return null
  if (!fs.existsSync(abs)) return null
  return { ...a, abs }
}

export async function deleteAttachment(id) {
  const { rows } = await query('select path from attachments where id = $1', [id])
  if (rows.length === 0) return false
  await query('delete from attachments where id = $1', [id])
  borrarFicheros([rows[0].path])
  broadcast()
  return true
}
