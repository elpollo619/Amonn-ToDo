// La hoja de precios de la web.
//
// Fijar un precio acaba en Beds24, así que lo que más se vigila aquí es
// quién puede y qué se rechaza ANTES de enviarlo a PreisPilot.
import { initDb, query, pool } from '../src/db.js'
import { signToken } from '../src/auth.js'
import { hashPassword } from '../src/auth.js'
import { darPermiso } from '../src/permisos.js'
import { preciosRouter } from '../src/routes/precios.js'
import { config } from '../src/config.js'
import express from 'express'
import http from 'node:http'

let fallos = 0
function checkIgual(n, real, debe) {
  if (real === debe) console.log(`  ✔ ${n}`)
  else { fallos++; console.log(`  ✘ ${n}\n      obtenido: ${JSON.stringify(real)}\n      esperado: ${JSON.stringify(debe)}`) }
}

// PreisPilot de mentira: ni se llama al de verdad ni se toca Beds24.
const guardado = []
const dashboard = {
  status: { base: 300, min: 180, max: 720, avg: 317 },
  calendar: [
    { d: '2099-01-01', p: 260, w: 'Fr', br: [{ t: 'Grundpreis', v: 300, f: null }, { t: 'Wochentag', v: 282, f: 0.94 }] },
    { d: '2099-01-02', p: 310, w: 'Sa', we: 1, ev: 'Fiesta', br: [] },
  ],
  overrides: {},
  lastApply: { at: '2099-01-01T04:15:00Z', ok: true },
}
const falso = express()
falso.use(express.json())
falso.get('/dashboard', (_q, r) => r.json(dashboard))
falso.post('/seed', (q, r) => {
  if (q.body?.pin !== '2470') return r.json({ ok: false, error: 'PIN incorrecto' })
  guardado.push(q.body.value)
  dashboard.overrides = q.body.value
  r.json({ ok: true })
})
const fake = http.createServer(falso)
await new Promise((r) => fake.listen(0, r))
const baseFalsa = `http://127.0.0.1:${fake.address().port}`
config.preispilot.dashboardUrl = `${baseFalsa}/dashboard`
config.preispilot.baseUrl = baseFalsa
config.preispilot.pin = '2470'

await initDb()
for (const t of ['user_permissions', 'aliases', 'wa_conversations', 'tasks']) {
  await query(`delete from ${t}`).catch(() => {})
}
await query('delete from users')
const { rows } = await query(
  `insert into users (email, password_hash, full_name) values
   ('jefa@x.com',$1,'Jefa'), ('peon@x.com',$1,'Peon') returning id, email`,
  [await hashPassword('x'.repeat(10))],
)
const jefa = rows.find((r) => r.email === 'jefa@x.com')
const peon = rows.find((r) => r.email === 'peon@x.com')
await darPermiso(jefa.id, 'dinero')

const app = express()
app.use(express.json())
app.use('/api/precios', preciosRouter)
const server = http.createServer(app)
await new Promise((r) => server.listen(0, r))
const base = `http://127.0.0.1:${server.address().port}/api/precios`

const get = async (token) => {
  const r = await fetch(base, { headers: { Authorization: `Bearer ${token}` } })
  return { status: r.status, body: await r.json().catch(() => ({})) }
}
const post = async (token, body) => {
  const r = await fetch(`${base}/override`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })
  return { status: r.status, body: await r.json().catch(() => ({})) }
}
const tJefa = signToken(jefa.id)
const tPeon = signToken(peon.id)

console.log('\n1. VER LA HOJA')
checkIgual('sin sesión, 401', (await (await fetch(base)).status), 401)
const vistaPeon = await get(tPeon)
checkIgual('cualquiera del equipo puede mirar', vistaPeon.status, 200)
checkIgual('  pero sin permiso no puede editar', vistaPeon.body.puedeEditar, false)
checkIgual('quien lleva el dinero sí', (await get(tJefa)).body.puedeEditar, true)
checkIgual('trae el calendario', vistaPeon.body.calendario.length, 2)
checkIgual('y el análisis', vistaPeon.body.analisis.base, 300)

console.log('\n2. QUIÉN PUEDE FIJAR PRECIOS')
checkIgual('sin el permiso «dinero», 403',
  (await post(tPeon, { fecha: '2099-01-01', precio: 400 })).status, 403)
checkIgual('y no se guardó nada', guardado.length, 0)

console.log('\n3. LO QUE SE RECHAZA ANTES DE MANDARLO A BEDS24')
checkIgual('una fecha mal escrita', (await post(tJefa, { fecha: '01/01/2099', precio: 400 })).status, 400)
checkIgual('un precio negativo', (await post(tJefa, { fecha: '2099-01-01', precio: -5 })).status, 400)
checkIgual('por debajo del mínimo del motor',
  (await post(tJefa, { fecha: '2099-01-01', precio: 20 })).status, 400)
checkIgual('por encima del máximo',
  (await post(tJefa, { fecha: '2099-01-01', precio: 5000 })).status, 400)
checkIgual('nada de eso llegó a PreisPilot', guardado.length, 0)

console.log('\n4. FIJARLO DE VERDAD')
const ok = await post(tJefa, { fecha: '2099-01-01', precio: 400, nota: 'boda' })
checkIgual('se guarda, 200', ok.status, 200)
checkIgual('con el precio puesto', ok.body.overrides['2099-01-01'].price, 400)
checkIgual('y deja constancia de quién fue',
  ok.body.overrides['2099-01-01'].note.includes('Jefa'), true)
checkIgual('llegó a PreisPilot una vez', guardado.length, 1)

console.log('\n5. QUITARLO')
const quitado = await post(tJefa, { fecha: '2099-01-01', precio: null })
checkIgual('se quita, 200', quitado.status, 200)
checkIgual('y la fecha ya no está fijada', quitado.body.overrides['2099-01-01'], undefined)

server.close(); fake.close()
console.log(fallos === 0 ? '\n✅ Hoja de precios: todo en verde\n' : `\n❌ ${fallos} fallo(s)\n`)
await pool.end()
process.exit(fallos === 0 ? 0 : 1)
