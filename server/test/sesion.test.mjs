// Elección de la sesión de WhatsApp y su re-elección por el vigilante.
//
// Por qué existe (15.09.2026): tras un reinicio el asistente quedó suscrito a
// una sesión que no recibía nada (Gateway: «suscrito»; teléfono: silencio).
// La elección se hacía una vez al arrancar, cogiendo la primera sesión que
// pareciera conectada —o la primera a secas—, y nadie volvía a mirar.
import { config } from '../src/config.js'
import { pickSession, startSessionWatch, whenSessionChanges, waState } from '../src/whatsapp.js'

let fallos = 0
const ok = (n, c) => { console.log(`  ${c ? '✔' : '✘'} ${n}`); if (!c) fallos++ }
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

console.log('\n1. pickSession: criterio explicable')
const A = { id: 'antigua', status: 'failed' }, B = { id: 'buena', status: 'connected' }, C = { id: 'otra', status: 'working' }
let r = pickSession([A, B])
ok('con una sola conectada, la elige aunque no sea la primera', r.chosen === B && r.connected && !r.ambigua)
r = pickSession([A, B, C], 'otra')
ok('si la que ya usábamos sigue conectada, la mantiene (no cambia de número por un empate)', r.chosen === C && !r.ambigua)
r = pickSession([B, C])
ok('varias conectadas sin preferida → la primera, pero marcada como ambigua', r.chosen === B && r.ambigua)
r = pickSession([A, { id: 'qr', status: 'qr_ready' }])
ok('ninguna conectada → sigue con la primera y lo dice (connected:false)', r.chosen === A && r.connected === false)
r = pickSession([A, { id: 'qr', status: 'qr_ready' }], 'qr')
ok('ninguna conectada pero había preferida → mantiene la preferida', r.chosen.id === 'qr' && r.connected === false)

console.log('\n2. El vigilante RE-ELIGE y avisa cuando la sesión correcta aparece')
// Arranque "malo": el Gateway solo enseña la sesión rota → nos quedamos con ella.
config.whatsapp = { ...config.whatsapp, enabled: true, apiUrl: 'http://gw', apiKey: 'k', sessionId: 'auto' }
waState.sessionId = 'antigua'; waState.sessionStatus = 'failed'
let lista = [A]
globalThis.fetch = async (url) => {
  if (String(url).endsWith('/api/sessions')) return new Response(JSON.stringify({ sessions: lista }), { status: 200, headers: { 'content-type': 'application/json' } })
  return new Response('{}', { status: 404 })
}
const cambios = []
whenSessionChanges((id) => cambios.push(id))
startSessionWatch(60) // cada 60 ms (la primera pasada tarda 20 s de reloj; nos apoyamos en el intervalo)
await wait(150)
ok('mientras solo existe la rota, no cambia', cambios.length === 0 && waState.sessionId === 'antigua')
lista = [A, B] // aparece la sesión buena, conectada
await wait(150)
ok('en cuanto aparece la buena, cambia a ella', waState.sessionId === 'buena')
ok('y avisa a quien está registrado (el tiempo real resuscribe)', cambios.includes('buena'))
ok('guarda el estado para /api/health', waState.sessionStatus === 'connected')

console.log(fallos ? `\n❌ ${fallos} fallo(s)` : '\n✅ sesión: elección explicable y autocorregible')
process.exit(fallos ? 1 : 0)
