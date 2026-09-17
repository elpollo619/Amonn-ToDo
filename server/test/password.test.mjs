// Cambio de contraseña desde la web.
//
// Lo que se vigila aquí no es el "camino feliz" sino las negativas: que no
// se pueda cambiar la de otro, que exija la actual (aunque la sesión esté
// abierta) y que la vieja deje de servir en cuanto se cambia.
import { initDb, query, pool } from '../src/db.js'
import { hashPassword, signToken } from '../src/auth.js'
import { authRouter } from '../src/routes/auth.js'
import { profilesRouter } from '../src/routes/profiles.js'
import express from 'express'
import http from 'node:http'

// Se monta un Express mínimo con las dos rutas que hacen falta en vez de
// importar src/index.js: ese arranca los crons y WhatsApp al cargarse.
const app = express()
app.use(express.json())
app.use('/api/auth', authRouter)
app.use('/api/profiles', profilesRouter)

let fallos = 0
function checkIgual(n, real, debe) {
  if (real === debe) console.log(`  ✔ ${n}`)
  else { fallos++; console.log(`  ✘ ${n}\n      obtenido: ${JSON.stringify(real)}\n      esperado: ${JSON.stringify(debe)}`) }
}

await initDb()
for (const t of ['aliases', 'wa_conversations', 'tasks']) await query(`delete from ${t}`)
await query('delete from users')
const { rows } = await query(
  `insert into users (email, password_hash, full_name) values
   ('ana@x.com', $1, 'Ana'), ('leo@x.com', $2, 'Leo') returning id, email`,
  [await hashPassword('clave-vieja-123'), await hashPassword('otra-clave-456')],
)
const ana = rows.find((r) => r.email === 'ana@x.com')
const leo = rows.find((r) => r.email === 'leo@x.com')

const server = http.createServer(app)
await new Promise((r) => server.listen(0, r))
const base = `http://127.0.0.1:${server.address().port}/api`

const post = async (ruta, token, body) => {
  const res = await fetch(base + ruta, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })
  return { status: res.status, body: await res.json().catch(() => ({})) }
}

const tokenAna = signToken(ana.id)

console.log('\n1. LO QUE NO SE DEBE PODER HACER')
checkIgual('sin sesión, 401',
  (await (await fetch(`${base}/profiles/${ana.id}/password`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ current_password: 'clave-vieja-123', new_password: 'la-nueva-999' }),
  })).status), 401)
checkIgual('cambiar la de OTRA persona, 403',
  (await post(`/profiles/${leo.id}/password`, tokenAna,
    { current_password: 'otra-clave-456', new_password: 'la-nueva-999' })).status, 403)
checkIgual('con la actual equivocada, 400',
  (await post(`/profiles/${ana.id}/password`, tokenAna,
    { current_password: 'me-la-invento', new_password: 'la-nueva-999' })).status, 400)
checkIgual('una contraseña corta, 400',
  (await post(`/profiles/${ana.id}/password`, tokenAna,
    { current_password: 'clave-vieja-123', new_password: 'corta' })).status, 400)
checkIgual('la misma de antes, 400',
  (await post(`/profiles/${ana.id}/password`, tokenAna,
    { current_password: 'clave-vieja-123', new_password: 'clave-vieja-123' })).status, 400)

console.log('\n2. CAMBIARLA DE VERDAD')
checkIgual('con los datos buenos, 200',
  (await post(`/profiles/${ana.id}/password`, tokenAna,
    { current_password: 'clave-vieja-123', new_password: 'la-nueva-999' })).status, 200)

const login = async (email, password) => (await fetch(`${base}/auth/login`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password }),
})).status

checkIgual('la nueva sirve para entrar', await login('ana@x.com', 'la-nueva-999'), 200)
checkIgual('la vieja YA NO sirve', await login('ana@x.com', 'clave-vieja-123'), 401)
checkIgual('a Leo no le han tocado la suya', await login('leo@x.com', 'otra-clave-456'), 200)

server.close()
console.log(fallos === 0 ? '\n✅ Contraseña: todo en verde\n' : `\n❌ ${fallos} fallo(s)\n`)
await pool.end()
process.exit(fallos === 0 ? 0 : 1)
