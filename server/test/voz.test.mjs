// Pruebas de la transcripción de notas de voz.
// El transcriptor real vive en el NAS, así que aquí se simula su respuesta
// con un servidor local: lo que se prueba es NUESTRA parte — que un audio
// entendido se ejecuta como una orden, y que si falla no se pierde nada.
import http from 'node:http'
import { initDb, query, pool } from '../src/db.js'
import { config } from '../src/config.js'
import { handleInbound } from '../src/inbound.js'
import { transcribir, transcripcionDisponible } from '../src/transcribe.js'

let fallos = 0
function check(n, real, debe) {
  const l = Array.isArray(debe) ? debe : [debe]
  const f = l.filter((x) => !String(real).includes(x))
  if (f.length) { fallos++; console.log(`  ✘ ${n}\n      obtenido: ${JSON.stringify(String(real).slice(0,200))}\n      faltaba:  ${JSON.stringify(f)}`) }
  else console.log(`  ✔ ${n}`)
}
function checkIgual(n, real, debe) {
  if (real === debe) console.log(`  ✔ ${n}`)
  else { fallos++; console.log(`  ✘ ${n}\n      obtenido: ${JSON.stringify(real)}\n      esperado: ${JSON.stringify(debe)}`) }
}

// Transcriptor de mentira: devuelve lo que le digamos, o falla a propósito.
let respuesta = 'crea una tarea a Cris: revisar el tejado, para el viernes'
let fallar = false
const srv = http.createServer((req, res) => {
  if (fallar) { res.writeHead(500); res.end('boom'); return }
  res.writeHead(200, { 'content-type': 'text/plain' })
  res.end(respuesta)
})
await new Promise((ok) => srv.listen(0, '127.0.0.1', ok))
config.whisperUrl = `http://127.0.0.1:${srv.address().port}`

console.log('\n1. EL MÓDULO DE TRANSCRIPCIÓN')
checkIgual('se activa al configurar la dirección', transcripcionDisponible(), true)
checkIgual('devuelve el texto', await transcribir(Buffer.from('x'), 'audio/ogg'), respuesta)
fallar = true
checkIgual('si el servicio falla devuelve null, no lanza', await transcribir(Buffer.from('x'), 'audio/ogg'), null)
fallar = false

await initDb()
for (const t of ['attachments','comments','subtasks','aliases','wa_conversations','tasks']) await query(`delete from ${t}`)
await query('delete from users')
const CRIS = '+41765683445'
await query(`insert into users (email, password_hash, full_name, phone, language)
  values ('cris@x.com','x','Cristian Amaya',$1,'es')`, [CRIS])
const dir = (await import('node:fs')).mkdtempSync('/tmp/amonn-voz-')
config.uploadDir = dir

const OGG = 'T2dnUwACAAAAAAAAAAA='
const audio = (texto = '') => ({
  from: `${CRIS.replace('+','')}@c.us`, type: 'audio', body: texto,
  metadata: { media: { mimetype: 'audio/ogg', data: OGG } },
})

console.log('\n2. HABLAR PARA CREAR UNA TAREA')
await handleInbound(audio())
const creada = (await query("select title, due_date from tasks where title ilike '%tejado%'")).rows[0]
check('la nota de voz creó la tarea', creada?.title ?? 'ninguna', 'tejado')
checkIgual('con su plazo', Boolean(creada?.due_date), true)

console.log('\n3. SI NO SE PUEDE TRANSCRIBIR, NO SE PIERDE EL AUDIO')
fallar = true
const antes = (await query('select count(*) from attachments')).rows[0].count
await handleInbound(audio())
const despues = (await query('select count(*) from attachments')).rows[0].count
const pendientes = (await import('node:fs')).readdirSync(`${dir}/pendientes`).filter((f) => !f.endsWith('.mime')).length
checkIgual('el audio queda guardado', Number(despues) > Number(antes) || pendientes > 0, true)
fallar = false

srv.close()
;(await import('node:fs')).rmSync(dir, { recursive: true, force: true })
await pool.end()
console.log(fallos === 0 ? '\n✅ todas las pruebas de voz pasan\n' : `\n❌ ${fallos} fallo(s)\n`)
process.exit(fallos === 0 ? 0 : 1)
