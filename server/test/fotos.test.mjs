// Pruebas de las FOTOS que llegan por WhatsApp (paso 5, parte entrante).
//
// El Gateway mete la foto entera en base64 dentro del propio mensaje
// (metadata.media.data). Aquí se comprueba que la sacamos, que la guardamos
// y que, cuando no se sabe a qué tarea va, se pregunta SIN perderla.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { initDb, query, pool } from '../src/db.js'
import { processMessage, handleInbound } from '../src/inbound.js'
import { config } from '../src/config.js'
import { listComments } from '../src/comments.service.js'
import { extraerFoto, pareceFoto } from '../src/media.js'

const CRIS = '+41765683445'
let fallos = 0
function check(n, real, debe) {
  const l = Array.isArray(debe) ? debe : [debe]
  const f = l.filter((x) => !String(real).includes(x))
  if (f.length) { fallos++; console.log(`  ✘ ${n}\n      obtenido: ${JSON.stringify(String(real).slice(0, 300))}\n      faltaba:  ${JSON.stringify(f)}`) }
  else console.log(`  ✔ ${n}`)
  return real
}
function checkIgual(n, real, debe) {
  if (real === debe) console.log(`  ✔ ${n}`)
  else { fallos++; console.log(`  ✘ ${n}\n      obtenido: ${JSON.stringify(real)}\n      esperado: ${JSON.stringify(debe)}`) }
}

// PNG mínimo válido de 1x1, tal como viajaría por el Gateway.
const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8AAAwAB/AL+cQAAAABJRU5ErkJggg=='
const chatId = `${CRIS.replace('+', '')}@c.us`
const mensajeFoto = (texto, extra = {}) => ({
  from: chatId,
  type: 'image',
  body: texto ?? '',
  metadata: { media: { mimetype: 'image/png', data: PNG_B64 } },
  ...extra,
})

console.log('\n0. EXTRACCIÓN (sin base de datos)')
check('reconoce que es una foto', pareceFoto(mensajeFoto('hola')), 'true')
const sacada = extraerFoto(mensajeFoto('hola'))
check('saca el tipo', sacada?.mime, 'image/png')
checkIgual('saca los bytes', sacada?.buffer?.length, Buffer.from(PNG_B64, 'base64').length)
checkIgual('un mensaje de texto no trae foto', extraerFoto({ from: chatId, body: 'hola', type: 'text' }), null)
// El Gateway podría entregarla con el prefijo de data-URI en vez de pelada.
const conPrefijo = extraerFoto({ metadata: { media: { mimetype: 'image/png', data: `data:image/png;base64,${PNG_B64}` } } })
checkIgual('acepta también el formato data:...base64', conPrefijo?.buffer?.length, Buffer.from(PNG_B64, 'base64').length)

await initDb()
for (const t of ['attachments', 'comments', 'subtasks', 'aliases', 'wa_conversations', 'tasks']) await query(`delete from ${t}`)
await query('delete from users')
await query(
  `insert into users (email, password_hash, full_name, phone, language) values
   ('cris@x.com','x','Cristian Amaya',$1,'es')`, [CRIS])

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'amonn-fotos-'))
config.uploadDir = dir

await processMessage(CRIS, 'crea una tarea a Cris: revisar la caldera del taller, para mañana')
await processMessage(CRIS, 'crea una tarea a Cris: cambiar la ventana Meier, para el viernes')
const caldera = (await query("select id, title from tasks where title ilike '%caldera%'")).rows[0]

console.log('\n1. FOTO CON PIE QUE DICE LA TAREA')
check('la coloca sola', await processMessage(CRIS, 'foto de la caldera', { foto: extraerFoto(mensajeFoto('foto de la caldera')) }),
  ['Foto añadida', 'caldera'])
const tras1 = await listComments(caldera.id)
checkIgual('queda un adjunto en la tarea', tras1.comments[0]?.attachments?.length ?? tras1.loose.length, 1)
check('el pie de foto queda como comentario', JSON.stringify(tras1.comments[0] ?? {}), 'foto de la caldera')
const guardados = fs.readdirSync(dir).filter((f) => !f.startsWith('.') && f !== 'pendientes')
check('y el fichero está en el disco', String(guardados.length > 0), 'true')

console.log('\n2. FOTO SIN PIE: SE GUARDA Y SE PREGUNTA')
const r2 = check('pregunta a qué tarea va', await processMessage(CRIS, '', { foto: extraerFoto(mensajeFoto('')) }),
  ['He guardado la foto', '1.', '2.'])
const pend = (await query('select pending from wa_conversations where phone = $1', [CRIS])).rows[0]?.pending
check('la foto queda guardada mientras espera', JSON.stringify(pend), 'foto_id')
checkIgual('el fichero en espera existe', fs.readdirSync(path.join(dir, 'pendientes')).filter((f) => !f.endsWith('.mime')).length, 1)

console.log('\n3. AL CONTESTAR EL NÚMERO, SE COLOCA')
// El orden de la lista es el de las tareas abiertas; buscamos cuál es la 1.
const numero = r2.split('\n').find((l) => l.trim().startsWith('1.'))
const titulo1 = numero.replace(/^\s*1\.\s*/, '').trim()
check('la pega en la tarea elegida', await processMessage(CRIS, '1'), ['Foto añadida', titulo1])
const idElegida = (await query('select id from tasks where title = $1', [titulo1])).rows[0].id
const tras3 = await listComments(idElegida)
const total = tras3.loose.length + tras3.comments.reduce((n, c) => n + c.attachments.length, 0)
check('la tarea tiene ya su foto', String(total >= 1), 'true')
checkIgual('y no queda nada en espera', fs.readdirSync(path.join(dir, 'pendientes')).filter((f) => !f.endsWith('.mime')).length, 0)

console.log('\n4. UNA FOTO SIN TEXTO YA NO SE DESCARTA')
// handleInbound descartaba todo mensaje sin texto: esa era la razón de fondo
// por la que las fotos nunca llegaban a ninguna parte.
let llamado = false
const original = console.warn
console.warn = () => {}
await handleInbound({ from: chatId, type: 'image', body: '', metadata: { media: { mimetype: 'image/png', data: PNG_B64 } } })
console.warn = original
const enEspera = fs.readdirSync(path.join(dir, 'pendientes')).filter((f) => !f.endsWith('.mime')).length
checkIgual('el mensaje sin texto llegó y se guardó', enEspera, 1)
llamado = true
checkIgual('la prueba se ejecutó', llamado, true)

console.log('\n5. SIN NINGUNA TAREA, LA FOTO NO SE PIERDE')
// El caso que fallaba en producción: con la base recién creada no hay ninguna
// tarea, y la foto se descartaba tras responder amablemente.
await query('delete from attachments')
await query('delete from tasks')
const antes = fs.readdirSync(path.join(dir, 'pendientes')).filter((f) => !f.endsWith('.mime')).length
check('avisa de que no hay tareas', await processMessage(CRIS, '', { foto: extraerFoto(mensajeFoto('')) }),
  ['He guardado la foto', 'no tienes ninguna tarea abierta'])
const despues = fs.readdirSync(path.join(dir, 'pendientes')).filter((f) => !f.endsWith('.mime')).length
checkIgual('pero la guarda igualmente', despues, antes + 1)

fs.rmSync(dir, { recursive: true, force: true })
await pool.end()
console.log(fallos === 0 ? '\n✅ todas las pruebas de fotos pasan\n' : `\n❌ ${fallos} fallo(s)\n`)
process.exit(fallos === 0 ? 0 : 1)
