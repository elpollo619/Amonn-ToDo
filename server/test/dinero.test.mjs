// Pruebas de "ver el dinero entrado" (consulta de abonos importados de un camt).
import { initDb, query, pool } from '../src/db.js'
import { processMessage } from '../src/inbound.js'
import { todayKey } from '../src/dates.js'

const CRIS = '+41765683445'
let fallos = 0
function check(n, real, debe) {
  const l = Array.isArray(debe) ? debe : [debe]
  const f = l.filter((x) => !String(real).includes(x))
  if (f.length) { fallos++; console.log(`  ✘ ${n}\n      obtenido: ${JSON.stringify(String(real).slice(0, 220))}\n      faltaba:  ${JSON.stringify(f)}`) }
  else console.log(`  ✔ ${n}`)
  return real
}

await initDb()
for (const t of ['bank_entries', 'permissions', 'wa_conversations', 'tasks']) await query(`delete from ${t}`)
await query('delete from users')
const { rows } = await query(`insert into users (email, password_hash, full_name, phone, language) values ('cris@x.com','x','Cristian Amaya',$1,'es') returning id`, [CRIS])
const uid = rows[0].id
await query(`insert into permissions (user_id, perm) values ($1,'dinero')`, [uid])

// Abonos: dos de este mes, uno del mes pasado.
const [Y, M] = todayKey().split('-')
const esteMes = (d) => `${Y}-${M}-${d}`
const mesPasado = `${Number(M) === 1 ? Number(Y) - 1 : Y}-${String(Number(M) === 1 ? 12 : Number(M) - 1).padStart(2, '0')}-15`
await query(`insert into bank_entries (id, booked_on, amount_cents, reference, payer) values
  ('e1',$1,180000,'QRR 1','Müller Bau AG'),
  ('e2',$2,95050,'QRR 2','Familie Seewer'),
  ('e3',$3,42000,'QRR 3','Alte Miete GmbH')`,
  [esteMes('03'), esteMes('09'), mesPasado])

console.log('\n1. LISTAR ESTE MES (por defecto)')
check('"dinero entrado" → este mes, total y abonos', await processMessage(CRIS, 'dinero entrado'),
  ['Dinero entrado', 'este mes', 'Müller Bau AG', 'Familie Seewer', '2 abonos'])
check('no incluye el del mes pasado', (await processMessage(CRIS, 'dinero entrado')).includes('Alte Miete') ? 'sí' : 'no', 'no')
check('total del mes (1800 + 950.50)', await processMessage(CRIS, '¿qué entró este mes?'), "2'750.50")

console.log('\n2. MES PASADO')
check('"pagos entrados del mes pasado"', await processMessage(CRIS, 'pagos entrados mes pasado'),
  ['Alte Miete GmbH', '420.00'])

console.log('\n3. BUSCAR POR PAGADOR')
check('"¿pagó Müller?"', await processMessage(CRIS, '¿pagó Müller?'), ['Abonos de', 'Müller Bau AG', "1'800.00"])
check('sin coincidencia', await processMessage(CRIS, '¿pagó Nadie SA?'), 'No encuentro abonos')

console.log('\n4. PERMISO')
await query(`delete from permissions where user_id=$1`, [uid])
check('sin permiso dinero → lo dice', await processMessage(CRIS, 'dinero entrado'), ['autorizados'])

await pool.end()
console.log(fallos === 0 ? '\n✅ todas las pruebas de dinero pasan\n' : `\n❌ ${fallos} fallo(s)\n`)
process.exit(fallos === 0 ? 0 : 1)
