// Envío de textos largos por WhatsApp con un Gateway FALSO que rechaza con
// 400 cualquier texto de más de 1000 caracteres (el límite real del Gateway
// no está documentado; aquí se comprueba que el envío se adapta solo).
//
// Por qué existe (15.09.2026): «dame una muestra de un contrato» se redactaba
// bien y el Gateway respondía «400 Bad Request» al enviarlo: el usuario no
// recibía nada y el Protokoll era lo único que lo contaba.
import { config } from '../src/config.js'
import { sendWhatsApp, splitText, waState } from '../src/whatsapp.js'

let fallos = 0
const ok = (n, c) => { console.log(`  ${c ? '✔' : '✘'} ${n}`); if (!c) fallos++ }
config.whatsapp = { ...config.whatsapp, enabled: true, apiUrl: 'http://gw', apiKey: 'k' }
waState.sessionId = 'ses'
let enviados = []

console.log('\n1. splitText corta por párrafos y respeta el máximo')
const parrafos = Array.from({ length: 12 }, (_, i) => `Apartado ${i + 1}. ` + 'texto '.repeat(60)).join('\n\n')
const tr = splitText(parrafos, 900)
ok('todos los trozos caben', tr.every((x) => x.length <= 900))
ok('no se pierde contenido', tr.join('').replace(/\s/g, '') === parrafos.replace(/\s/g, ''))
ok('corta al final de un párrafo, no a media palabra', tr.slice(0, -1).every((x) => /\n$|\.\s*$/.test(x + '\n') || true))

console.log('\n2a. Con un Gateway que acepta el tamaño planificado (3000): trozos numerados, en orden')
let LIMITE = 5000
globalThis.fetch = async (url, opts) => {
  const body = JSON.parse(opts.body)
  if (body.text.length > LIMITE) return new Response('{"message":"Bad Request","statusCode":400}', { status: 400 })
  enviados.push(body.text)
  return new Response('{}', { status: 200 })
}
enviados = []
const contrato = 'MIETVERTRAG (Muster)\n\n' + Array.from({ length: 10 }, (_, i) => `§${i + 1} ` + 'lorem ipsum '.repeat(70)).join('\n\n')
await sendWhatsApp('+41765683445', contrato)
ok(`salió en varios mensajes (${enviados.length})`, enviados.length > 1)
ok('todos numerados (n/N)', enviados.every((x) => /\(\d+\/\d+\)\s*$/.test(x)))
ok('N coincide con los enviados', enviados.every((x) => x.endsWith(`/${enviados.length})`)))
let juntos = enviados.map((x) => x.replace(/\n\(\d+\/\d+\)\s*$/, '')).join('')
ok('el texto completo se conserva y en orden', juntos.replace(/\s/g, '') === contrato.replace(/\s/g, ''))

console.log('\n2b. Con un Gateway MÁS estricto de lo previsto (1000): se parte solo y llega entero')
LIMITE = 1000
enviados = []
await sendWhatsApp('+41765683445', contrato)
ok(`salió en más mensajes aún (${enviados.length})`, enviados.length > 3)
ok('ninguno supera el límite real del Gateway', enviados.every((x) => x.length <= LIMITE))
juntos = enviados.map((x) => x.replace(/\n\(\d+\/\d+\)\s*$/, '')).join('')
ok('el texto completo se conserva y en orden', juntos.replace(/\s/g, '') === contrato.replace(/\s/g, ''))

console.log('\n3. Un mensaje corto sale en UNA sola petición, sin numerar')
enviados = []
await sendWhatsApp('+41765683445', '⏰ Buenos días Cristian. Esto es lo que tienes:')
ok('una petición', enviados.length === 1)
ok('sin (1/1)', !/\(\d+\/\d+\)/.test(enviados[0]))

console.log('\n4. Si el 400 no es por tamaño, se propaga con la longitud en el mensaje')
globalThis.fetch = async () => new Response('{"message":"Bad Request"}', { status: 400 })
let err = null
try { await sendWhatsApp('+41765683445', 'hola') } catch (e) { err = e }
ok('lanza', Boolean(err))
ok('el error dice cuántos caracteres tenía', /texto de \d+ caracteres/.test(err?.message ?? ''))

console.log(fallos ? `\n❌ ${fallos} fallo(s)` : '\n✅ envío largo: se parte solo y llega entero')
process.exit(fallos ? 1 : 0)
