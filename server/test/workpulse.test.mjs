// El puente con WorkPulse.
//
// No se llama al WorkPulse de verdad: se levanta uno de mentira que responde
// como el suyo. Lo que se vigila es lo que de verdad rompe un puente así —
// que el token se renueve solo y que un token caducado antes de tiempo no
// pierda el gasto de nadie.
import express from 'express'
import http from 'node:http'
import { config } from '../src/config.js'
import { crearGasto, listarGastos, workpulseConfigurado, _olvidarSesion } from '../src/workpulse.js'

let fallos = 0
function checkIgual(n, real, debe) {
  if (JSON.stringify(real) === JSON.stringify(debe)) console.log(`  ✔ ${n}`)
  else { fallos++; console.log(`  ✘ ${n}\n      obtenido: ${JSON.stringify(real)}\n      esperado: ${JSON.stringify(debe)}`) }
}

// ─── WorkPulse de mentira ───
let logins = 0, refrescos = 0, tokenValido = 'tok-1'
const gastos = []
const app = express()
app.use(express.json())
app.post('/api/auth/app-login', (q, r) => {
  if (q.body?.email !== 'asistente@x.ch' || q.body?.password !== 'secreta') {
    return r.status(401).json({ error: 'Ungültige Anmeldedaten' })
  }
  logins++
  r.json({ accessToken: tokenValido, refreshToken: 'ref-1' })
})
app.post('/api/auth/app-refresh', (q, r) => {
  if (q.body?.refreshToken !== 'ref-1') return r.status(401).json({ error: 'token' })
  refrescos++
  r.json({ accessToken: tokenValido })
})
const exigeToken = (q, r, next) => {
  if (q.headers.authorization !== `Bearer ${tokenValido}`) {
    return r.status(401).json({ error: 'token inválido' })
  }
  next()
}
app.post('/api/spesen', exigeToken, (q, r) => { gastos.push(q.body); r.json({ id: `sp-${gastos.length}`, ...q.body }) })
app.get('/api/spesen', exigeToken, (_q, r) => r.json(gastos))

const server = http.createServer(app)
await new Promise((r) => server.listen(0, r))
config.workpulse.url = `http://127.0.0.1:${server.address().port}`
config.workpulse.email = 'asistente@x.ch'
config.workpulse.password = 'secreta'

console.log('\n1. ENTRAR CON EL USUARIO DE SERVICIO')
checkIgual('está configurado', workpulseConfigurado(), true)
const g1 = await crearGasto({
  concepto: 'Landi Kabelbinder', categoria: 'MATERIAL',
  importeCents: 3790, fecha: '2026-09-09',
})
checkIgual('el gasto se crea', g1.id, 'sp-1')
checkIgual('entró una sola vez', logins, 1)

console.log('\n2. LOS CÉNTIMOS SE VUELVEN FRANCOS')
checkIgual('37.90, no 3790', gastos[0].amount, 37.90)
checkIgual('en francos', gastos[0].currency, 'CHF')
checkIgual('con la fecha tal cual', gastos[0].date, '2026-09-09')

console.log('\n3. EL KILOMETRAJE VA EN SU CAMPO')
await crearGasto({
  concepto: '120 km Gampelen', categoria: 'KILOMETER',
  importeCents: 9600, fecha: '2026-09-09', km: 120,
})
checkIgual('los km, aparte del importe', gastos[1].kilometers, 120)
checkIgual('y el importe en francos', gastos[1].amount, 96)

console.log('\n4. NO SE VUELVE A ENTRAR SI NO HACE FALTA')
await listarGastos()
checkIgual('sigue una sola entrada', logins, 1)

console.log('\n5. SI EL TOKEN CADUCA ANTES DE TIEMPO, NO SE PIERDE EL GASTO')
// WorkPulse se reinicia y su token deja de valer sin avisar.
tokenValido = 'tok-2'
const g3 = await crearGasto({
  concepto: 'Coop Kaffee', categoria: 'MAHLZEIT',
  importeCents: 1250, fecha: '2026-09-09',
})
checkIgual('el gasto entra igual', g3.id, 'sp-3')
checkIgual('volviendo a entrar', logins, 2)
checkIgual('y quedan los tres', gastos.length, 3)

console.log('\n6. UNA CONTRASEÑA MALA SE DICE CLARO')
_olvidarSesion()
config.workpulse.password = 'equivocada'
let mensaje = null
try { await listarGastos() } catch (e) { mensaje = e.message }
checkIgual('avisa en vez de callar', /Anmeldedaten|401/.test(String(mensaje)), true)

server.close()
console.log(fallos === 0 ? '\n✅ Puente con WorkPulse: todo en verde\n' : `\n❌ ${fallos} fallo(s)\n`)
process.exit(fallos === 0 ? 0 : 1)
