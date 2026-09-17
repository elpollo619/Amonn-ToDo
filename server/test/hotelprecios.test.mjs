// Precios del hotel en Apaleo.
//
// Aquí lo que se vigila es el fallo caro y silencioso: mandar un precio con
// el nombre de campo equivocado. Apaleo aceptaría el PUT y el precio NO
// cambiaría, sin que nadie se entere hasta ver la factura.
import express from 'express'
import http from 'node:http'
import { config } from '../src/config.js'

let fallos = 0
function checkIgual(n, real, debe) {
  if (JSON.stringify(real) === JSON.stringify(debe)) console.log(`  ✔ ${n}`)
  else { fallos++; console.log(`  ✘ ${n}\n      obtenido: ${JSON.stringify(real)}\n      esperado: ${JSON.stringify(debe)}`) }
}

// ─── Apaleo de mentira ───
let puestas = null
let scopeRates = true
const tarifasFalsas = [
  { from: '2026-10-10T00:00:00Z', to: '2026-10-11T00:00:00Z', price: { grossAmount: 180, currency: 'CHF' }, restrictions: { minLengthOfStay: 2 } },
  { from: '2026-10-11T00:00:00Z', to: '2026-10-12T00:00:00Z', price: { grossAmount: 180, currency: 'CHF' }, restrictions: { minLengthOfStay: 2 } },
]
const app = express()
app.use(express.json())
app.post('/connect/token', (_q, r) => r.json({ access_token: 'tok', expires_in: 3600 }))
app.get('/rateplan/v1/rate-plans', (_q, r) => {
  if (!scopeRates) return r.status(403).json({ message: 'Forbidden' })
  r.json({ ratePlans: [{ id: 'RP-1', name: 'Standard', propertyId: 'NSH' }] })
})
app.get('/rateplan/v1/rate-plans/:id/rates', (_q, r) => r.json({ rates: tarifasFalsas }))
app.put('/rateplan/v1/rate-plans/:id/rates', (q, r) => { puestas = q.body; r.status(204).end() })

const server = http.createServer(app)
await new Promise((r) => server.listen(0, r))
const base = `http://127.0.0.1:${server.address().port}`

// El módulo lee las URLs de constantes internas: se apuntan al falso.
const mod = await import('../src/apaleo.js')
config.apaleo = { clientId: 'x', clientSecret: 'y', propertyId: 'NSH' }
// Redirigir las constantes exige interceptar fetch: es lo más limpio sin
// tocar el código de producción sólo para poder probarlo.
const fetchReal = globalThis.fetch
globalThis.fetch = (url, opts) => fetchReal(String(url).replace('https://api.apaleo.com', base).replace('https://identity.apaleo.com', base), opts)

console.log('\n1. EL IMPORTE SE CAMBIA SIN TOCAR LO DEMÁS')
const p = mod.conNuevoImporte({ grossAmount: 180, currency: 'CHF' }, 240)
checkIgual('cambia el importe', p.grossAmount, 240)
checkIgual('y respeta la moneda', p.currency, 'CHF')

console.log('\n2. SI APALEO USA OTRO NOMBRE, TAMBIÉN')
checkIgual('netAmount', mod.conNuevoImporte({ netAmount: 100 }, 150).netAmount, 150)
checkIgual('amount', mod.conNuevoImporte({ amount: 100, currency: 'CHF' }, 150).amount, 150)

console.log('\n3. UN FORMATO DESCONOCIDO SE DENUNCIA, NO SE IGNORA')
let msg = null
try { mod.conNuevoImporte({ raro: 100 }, 150) } catch (e) { msg = e.message }
checkIgual('avisa en vez de callar', /No reconozco el precio/.test(String(msg)), true)

console.log('\n4. EL ENSAYO NO ESCRIBE NADA')
const ensayo = await mod.fijarPreciosHotel({
  ratePlanId: 'RP-1', cambios: { '2026-10-10': 240, '2026-10-11': 260 }, ensayo: true,
})
checkIgual('dice cuántas cambiaría', ensayo.cambiadas, 2)
checkIgual('sin tocar Apaleo', puestas, null)

console.log('\n5. FIJARLOS DE VERDAD')
const hecho = await mod.fijarPreciosHotel({
  ratePlanId: 'RP-1', cambios: { '2026-10-10': 240, '2026-10-11': 260 },
})
checkIgual('dos noches cambiadas', hecho.cambiadas, 2)
checkIgual('con el importe nuevo', puestas.map((x) => x.price.grossAmount), [240, 260])
checkIgual('conservando las restricciones', puestas[0].restrictions.minLengthOfStay, 2)
checkIgual('y la moneda', puestas[0].price.currency, 'CHF')

console.log('\n6. UNA FECHA SIN TARIFA NO SE INVENTA')
puestas = null
const conHueco = await mod.fijarPreciosHotel({
  ratePlanId: 'RP-1', cambios: { '2026-10-10': 240, '2026-12-31': 900 },
})
checkIgual('solo cambia la que existe', conHueco.cambiadas, 1)
checkIgual('y avisa de la otra', conHueco.sinTarifa, ['2026-12-31'])

console.log('\n7. SIN PERMISO, SE DICE — NO SE REVIENTA')
scopeRates = false
checkIgual('avisa de que falta el scope', await mod.puedeCambiarPrecios(), false)
scopeRates = true
checkIgual('y con permiso, sí', await mod.puedeCambiarPrecios(), true)

globalThis.fetch = fetchReal
server.close()
console.log(fallos === 0 ? '\n✅ Precios del hotel: todo en verde\n' : `\n❌ ${fallos} fallo(s)\n`)
process.exit(fallos === 0 ? 0 : 1)
