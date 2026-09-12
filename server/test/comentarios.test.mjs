// Pruebas de comentarios y adjuntos (paso 5).
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { initDb, query, pool } from '../src/db.js'
import { processMessage } from '../src/inbound.js'
import {
  listComments, createComment, deleteComment, storageStatus,
  createAttachment, getAttachment, deleteAttachment,
} from '../src/comments.service.js'

const CRIS = '+41765683445'
let fallos = 0
function check(n, real, debe) {
  const l = Array.isArray(debe) ? debe : [debe]
  const f = l.filter((x) => !String(real).includes(x))
  if (f.length) { fallos++; console.log(`  ✘ ${n}\n      obtenido: ${JSON.stringify(real)}\n      faltaba:  ${JSON.stringify(f)}`) }
  else console.log(`  ✔ ${n}`)
  return real
}
// PNG mínimo válido de 1x1.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8AAAwAB/AL+cQAAAABJRU5ErkJggg==', 'base64')

await initDb()
for (const t of ['attachments', 'comments', 'subtasks', 'aliases', 'wa_conversations', 'tasks']) await query(`delete from ${t}`)
await query('delete from users')
await query(
  `insert into users (email, password_hash, full_name, phone, language) values
   ('cris@x.com','x','Cristian Amaya',$1,'es'),
   ('isma@x.com','x','Isma Torres','+41784221922','es')`, [CRIS])
await processMessage(CRIS, 'crea una tarea a Isma: revisar la caldera del taller, para mañana')
const tarea = (await query("select id, title from tasks where title ilike '%caldera%'")).rows[0]
const cris = (await query('select id from users where phone = $1', [CRIS])).rows[0]

console.log('\n1. COMENTAR POR WHATSAPP')
check('lo anota', await processMessage(CRIS, 'comenta en la caldera: falta el diferencial de 40A'),
  ['Anotado', 'falta el diferencial'])
const c1 = await listComments(tarea.id)
check('queda guardado', JSON.stringify(c1.comments[0]), ['"source":"whatsapp"', 'diferencial'])
check('con su autor', String(c1.comments[0].author_name), 'Cristian Amaya')

console.log('\n2. COMENTAR DESDE LA APP')
const c = await createComment(tarea.id, { body: '  Aviso al cliente  ', userId: cris.id })
check('recorta los espacios', c.body, 'Aviso al cliente')
check('origen app', c.source, 'app')
let err = ''
try { await createComment(tarea.id, { body: '   ' }) } catch (e) { err = e.message }
check('rechaza uno vacío', err, 'vacío')

console.log('\n3. SIN ALMACENAMIENTO, LOS ADJUNTOS ESTÁN DESACTIVADOS (a propósito)')
check('lo dice claramente', storageStatus().reason, ['Sin almacenamiento configurado', 'no perderlas'])
let err2 = ''
try { await createAttachment(tarea.id, { buffer: PNG, mime: 'image/png', filename: 'a.png' }) }
catch (e) { err2 = e.message }
check('y no acepta la foto', err2, 'Sin almacenamiento configurado')

console.log('\n4. CON ALMACENAMIENTO, LOS ADJUNTOS FUNCIONAN')
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'amonn-subidas-'))
const { config } = await import('../src/config.js')
config.uploadDir = dir
check('el estado pasa a ok', String(storageStatus().ok), 'true')
const a = await createAttachment(tarea.id, { buffer: PNG, mime: 'image/png', filename: 'cuadro.png', userId: cris.id })
check('guarda el registro', JSON.stringify(a), ['"mime":"image/png"', 'cuadro.png'])
check('el fichero existe en disco', String(fs.existsSync(path.join(dir, a.path))), 'true')
check('lo organiza por año-mes', a.path, `${new Date().getFullYear()}-`)
check('el nombre en disco NO es el del cliente', a.path.includes('cuadro') ? 'mal' : 'ok', 'ok')
const leido = await getAttachment(a.id)
check('se puede recuperar', String(leido !== null && fs.existsSync(leido.abs)), 'true')

console.log('\n5. LÍMITES')
let e3 = ''
try { await createAttachment(tarea.id, { buffer: PNG, mime: 'application/x-sh', filename: 'x.sh' }) } catch (e) { e3 = e.message }
check('rechaza tipos raros', e3, 'no admitido')
let e4 = ''
try { await createAttachment(tarea.id, { buffer: Buffer.alloc(13 * 1024 * 1024), mime: 'image/png' }) } catch (e) { e4 = e.message }
check('rechaza lo demasiado grande', e4, 'pasa de 12 MB')

console.log('\n6. BORRAR LIMPIA EL DISCO')
const b = await createAttachment(tarea.id, { buffer: PNG, mime: 'image/png', comentario: null })
const rutaB = path.join(dir, b.path)
await deleteAttachment(b.id)
check('borra el fichero', String(fs.existsSync(rutaB)), 'false')
const conFoto = await createComment(tarea.id, { body: 'con foto', userId: cris.id })
const c2 = await createAttachment(tarea.id, { buffer: PNG, mime: 'image/png', commentId: conFoto.id })
await deleteComment(conFoto.id)
check('borrar el comentario se lleva su foto', String(fs.existsSync(path.join(dir, c2.path))), 'false')

console.log('\n7. BORRAR LA TAREA SE LLEVA TODO')
await query('delete from tasks where id = $1', [tarea.id])
const vacio = await listComments(tarea.id)
check('sin comentarios huérfanos', String(vacio.comments.length), '0')

fs.rmSync(dir, { recursive: true, force: true })
await pool.end()
console.log(fallos === 0 ? '\n✅ todas las pruebas de comentarios pasan' : `\n❌ ${fallos} fallos`)
process.exit(fallos === 0 ? 0 : 1)
