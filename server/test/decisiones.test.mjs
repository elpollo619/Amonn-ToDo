// Pruebas del registro de decisiones (idea del documento del agente interno).
import { initDb, query, pool } from '../src/db.js'
import { processMessage } from '../src/inbound.js'

const CRIS = '+41765683445'
let fallos = 0
function check(n, real, debe) {
  const l = Array.isArray(debe) ? debe : [debe]
  const f = l.filter((x) => !String(real).includes(x))
  if (f.length) { fallos++; console.log(`  ✘ ${n}\n      obtenido: ${JSON.stringify(String(real).slice(0, 200))}\n      faltaba:  ${JSON.stringify(f)}`) }
  else console.log(`  ✔ ${n}`)
  return real
}

await initDb()
for (const t of ['decisions', 'wa_conversations', 'tasks']) await query(`delete from ${t}`)
await query('delete from users')
await query(`insert into users (email, password_hash, full_name, phone, language) values ('cris@x.com','x','Cristian Amaya',$1,'es')`, [CRIS])

console.log('\n1. GUARDAR')
check('"guarda que decidimos …"', await processMessage(CRIS, 'guarda que decidimos la variante B en Seewer'),
  ['Decisión guardada', 'variante B'])
check('"decisión: …"', await processMessage(CRIS, 'decisión: aceptamos la oferta de Wirz para el 770'),
  ['Decisión guardada', 'Wirz'])
check('alemán "wir haben entschieden …"', await processMessage(CRIS, 'wir haben entschieden Variante C in Löwen'),
  ['guardada', 'Variante C'])

console.log('\n2. CONSULTAR')
check('por proyecto (texto) "decisiones de Seewer"', await processMessage(CRIS, 'decisiones de Seewer'),
  ['Decisiones (1)', 'variante B'])
check('recientes "últimas decisiones"', await processMessage(CRIS, 'últimas decisiones'),
  ['Decisiones (3)', 'Wirz', 'Variante C'])
check('sin resultados', await processMessage(CRIS, 'decisiones de Inexistente'), 'No hay decisiones sobre')

console.log('\n3. GUARDA EL AUTOR')
const uno = (await query("select created_by from decisions where text like '%variante B%'")).rows[0]
check('la decisión lleva autor', uno?.created_by ? 'ok' : '', 'ok')

await pool.end()
console.log(fallos === 0 ? '\n✅ todas las pruebas de decisiones pasan\n' : `\n❌ ${fallos} fallo(s)\n`)
process.exit(fallos === 0 ? 0 : 1)
