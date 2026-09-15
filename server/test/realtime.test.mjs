// Pruebas del canal de tiempo real con un Gateway FALSO (sin red), con
// tiempos de milisegundos para no esperar de reloj.
//
// Por qué existe (15.09.2026): tras un reinicio del contenedor el asistente
// se quedó SORDO (ninguna respuesta por WhatsApp) mientras el semáforo del
// Perfil decía «Recibiendo mensajes». realtimeConnected() solo miraba
// socket.connected, y un error del Gateway al suscribir se anotaba en el log
// sin reintentar. Aquí se fija que ya no pueda pasar.
import { EventEmitter } from 'node:events'
import { config } from '../src/config.js'
import { connectRealtime, realtimeConnected, realtimeState, _resetRealtimeForTests } from '../src/realtime.js'

let fallos = 0
const ok = (n, c) => { console.log(`  ${c ? '✔' : '✘'} ${n}`); if (!c) fallos++ }
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

// Socket falso: registra lo que emitimos y deja simular al Gateway.
function fakeSocket() {
  const s = new EventEmitter()
  s.connected = false
  s.emitted = []   // [{msg, ack}]
  s.disconnects = 0; s.connects = 0
  s.emit = function (ev, msg, ack) { if (ev === 'message') { this.emitted.push({ msg, ack }); return true } return EventEmitter.prototype.emit.call(this, ev, msg, ack) }
  s.gw = (ev, ...a) => EventEmitter.prototype.emit.call(s, ev, ...a) // el Gateway nos habla
  s.disconnect = () => { s.disconnects++; s.connected = false; s.gw('disconnect', 'io client disconnect') }
  s.connect = () => { s.connects++; s.connected = true; s.gw('connect') }
  return s
}
const timings = { MIN_DELAY: 30, MAX_DELAY: 200, RATE_LIMIT_DELAY: 50, SUBSCRIBE_DELAY_MIN: 10, SUBSCRIBE_DELAY_MAX: 40, ACK_TIMEOUT: 60, WATCHDOG_EVERY: 40, STUCK_AFTER: 150 }
function arrancar() {
  _resetRealtimeForTests()
  config.whatsapp = { ...config.whatsapp, enabled: true, realtime: true, apiUrl: 'http://gw', apiKey: 'k' }
  const s = fakeSocket()
  connectRealtime({ io: () => s, timings })
  return s
}
const ultimoSubscribe = (s) => [...s.emitted].reverse().find((e) => e.msg?.type === 'subscribe')

console.log('\n1. CONECTAR → SUSCRIBIR → ACUSE OK')
let s = arrancar(); s.connect(); await wait(30)
ok('tras conectar se emite subscribe', s.emitted.some((e) => e.msg.type === 'subscribe'))
ok('conectado pero SIN acuse: realtimeConnected() es false (antes decía true)', s.connected && realtimeConnected() === false)
ultimoSubscribe(s).ack({ type: 'subscribed', sessionId: 'x', events: ['message.received'] })
ok('con acuse: realtimeConnected() es true', realtimeConnected() === true)
ok('realtimeState() lo refleja', realtimeState().subscribed === true && realtimeState().connected === true)

console.log('\n2. LA CARRERA DE LA CLAVE: error «no longer valid» → RESUSCRIBE solo, misma conexión')
s = arrancar(); s.connect(); await wait(30)
const n1 = s.emitted.length
ultimoSubscribe(s).ack({ type: 'error', code: 'UNAUTHORIZED', message: 'API key is no longer valid' })
ok('queda marcado como no suscrito', realtimeConnected() === false)
await wait(80)
ok('vuelve a emitir subscribe sin reconectar', s.emitted.length > n1 && s.disconnects === 0)
ultimoSubscribe(s).ack({ type: 'subscribed', sessionId: 'x' })
ok('y al acusar, vuelve a escuchar', realtimeConnected() === true)

console.log('\n3. OTRO ERROR (FORBIDDEN_SESSION) → RECONEXIÓN LIMPIA con espera (antes: silencio para siempre)')
s = arrancar(); s.connect(); await wait(30)
ultimoSubscribe(s).ack({ type: 'error', code: 'FORBIDDEN_SESSION', message: 'no' })
ok('cierra el socket', s.disconnects === 1)
await wait(120)
ok('y vuelve a conectar por sí solo', s.connects >= 2)

console.log('\n4. SIN ACUSE NUNCA → reintenta por timeout')
s = arrancar(); s.connect(); await wait(30)
const n4 = s.emitted.length
await wait(100)
ok('reemite subscribe al no recibir acuse', s.emitted.length > n4)

console.log('\n5. VIGILANTE: conectado sin suscribir demasiado tiempo → reconexión limpia')
s = arrancar(); s.connect(); await wait(30)
// El Gateway "responde" pero con un ack vacío (ni subscribed ni error): quedamos colgados.
for (let i = 0; i < 12 && s.disconnects === 0; i++) { const u = ultimoSubscribe(s); if (u && !u.done) { u.done = true; u.ack({}) } await wait(30) }
ok('tras STUCK_AFTER el vigilante fuerza una conexión nueva', s.disconnects >= 1)
ok('sigue sin mentir mientras tanto', realtimeConnected() === false)

console.log('\n6. RATE_LIMITED no provoca tormenta: no reconecta en caliente')
s = arrancar(); s.connect(); await wait(30)
ultimoSubscribe(s).ack({ type: 'error', code: 'RATE_LIMITED', message: 'slow down' })
await wait(20)
ok('no cierra el socket por RATE_LIMITED', s.disconnects === 0)

_resetRealtimeForTests()
console.log(fallos ? `\n❌ ${fallos} fallo(s)` : '\n✅ tiempo real: se autorrepara y no miente')
process.exit(fallos ? 1 : 0)
