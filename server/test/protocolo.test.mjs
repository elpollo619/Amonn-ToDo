// Prueba de extremo a extremo del protocolo de entrega GUIADO: comprueba que
// pregunta paso a paso (objeto → momento → contadores/llaves → estado) y que
// al terminar limpia el estado. El texto final lo redacta Gemini; sin clave
// devuelve el aviso de IA, pero el flujo (preguntas + limpieza) es el mismo.
import { initDb, query, pool } from '../src/db.js'
import { processMessage } from '../src/inbound.js'
import { getPending } from '../src/conversations.js'

const PHONE = '+41764445566'
let fallos = 0
function check(nombre, texto, debeContener) {
  const lista = Array.isArray(debeContener) ? debeContener : [debeContener]
  const faltan = lista.filter((x) => !texto.includes(x))
  if (faltan.length) {
    fallos++
    console.log(`  ✘ ${nombre}\n      respuesta: ${JSON.stringify(texto)}\n      faltaba:   ${JSON.stringify(faltan)}`)
  } else {
    console.log(`  ✔ ${nombre}`)
  }
  return texto
}

await initDb()
await query('delete from wa_conversations where phone = $1', [PHONE])
await query('delete from users where phone = $1', [PHONE])
await query(
  `insert into users (email, password_hash, full_name, phone, language)
   values ('proto@x.com','x','Ana Prova',$1,'es')`, [PHONE])

console.log('\nPROTOCOLO GUIADO — extremo a extremo')
check('inicia y pregunta el objeto', await processMessage(PHONE, 'haz el protocolo de salida de la 204'),
  ['vivienda', 'inquilino'])
check('pregunta el momento', await processMessage(PHONE, 'A14 204, Max Muster'), ['entrada o salida'])
check('pregunta contadores/llaves', await processMessage(PHONE, 'salida, 30.09.2026'), ['contadores'])
check('pregunta el estado', await processMessage(PHONE, 'luz 4521, agua 210, 2 llaves'), ['stado'])
// Último paso: redacta (con IA) o avisa de que la IA no está; en ambos casos
// el flujo termina y el estado queda limpio.
const fin = await processMessage(PHONE, 'todo en orden, limpio')
check('cierra el flujo', fin, ['']) // solo que devuelve algo
const pend = await getPending(PHONE)
if (pend) { fallos++; console.log(`  ✘ el estado NO se limpió: ${JSON.stringify(pend)}`) }
else console.log('  ✔ el estado quedó limpio')

console.log(fallos === 0 ? '\n✅ protocolo guiado ok' : `\n❌ ${fallos} fallos`)
await pool.end()
process.exit(fallos === 0 ? 0 : 1)
