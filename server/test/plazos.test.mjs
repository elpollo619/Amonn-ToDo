// Pruebas de los plazos de inicio a fin y de los días de trabajo (paso 1).
import { initDb, query, pool } from '../src/db.js'
import { processMessage } from '../src/inbound.js'
import { parseRange, parseWorkDays, describeRange } from '../src/dates.js'

const CRIS = '+41765683445'
const HOY = '2026-09-03' // jueves
let fallos = 0
function check(nombre, real, debeContener) {
  const lista = Array.isArray(debeContener) ? debeContener : [debeContener]
  const faltan = lista.filter((x) => !String(real).includes(x))
  if (faltan.length) {
    fallos++
    console.log(`  ✘ ${nombre}\n      obtenido: ${JSON.stringify(real)}\n      faltaba:  ${JSON.stringify(faltan)}`)
  } else console.log(`  ✔ ${nombre}`)
  return real
}

console.log('\n1. ENTENDER EL PLAZO (sin base de datos)')
check('del lunes al jueves', JSON.stringify(parseRange('del lunes al jueves', HOY, 'es')), ['"start":"2026-09-07"', '"end":"2026-09-10"'])
check('vom Montag bis Donnerstag', JSON.stringify(parseRange('vom montag bis donnerstag', HOY, 'de')), ['"start":"2026-09-07"'])
check('de segunda a quinta', JSON.stringify(parseRange('de segunda a quinta', HOY, 'pt')), ['"start":"2026-09-07"'])
check('una sola fecha no es plazo', String(parseRange('para el viernes', HOY, 'es')), 'null')
check('3 días de trabajo', JSON.stringify(parseWorkDays('son 3 dias de trabajo')), '"days":3')
check('texto del plazo', describeRange('2026-09-07', '2026-09-10', HOY, 'es'), '→')
check('un solo día no lleva flecha', describeRange(null, '2026-09-04', HOY, 'es'), 'mañana')

await initDb()
for (const t of ['aliases', 'wa_conversations', 'tasks', 'users']) await query(`delete from ${t}`)
await query(
  `insert into users (email, password_hash, full_name, phone, language) values
   ('cris@x.com','x','Cristian Amaya',$1,'es'),
   ('isma@x.com','x','Isma Torres','+41784221922','es')`, [CRIS])

console.log('\n2. CREAR CON PLAZO POR WHATSAPP')
check('crea con plazo', await processMessage(CRIS, 'crea una tarea a Isma: revisar la caldera, del lunes al jueves'),
  ['Tarea creada', 'para Isma', '📅 Plazo:', '→'])
const { rows } = await query("select title, start_date, due_date, work_days from tasks order by created_at desc limit 1")
// Las fechas se calculan desde HOY DE VERDAD (processMessage no acepta una
// fecha fija): clavarlas aquí hacía que la prueba se rompiera sola al pasar
// de semana. Lo que se comprueba es la FORMA: lunes → jueves, tres días.
const dia = (k) => new Date(`${k}T00:00:00Z`).getUTCDay()
check('empieza en lunes', String(dia(String(rows[0].start_date).slice(0, 10))), '1')
check('acaba en jueves', String(dia(String(rows[0].due_date).slice(0, 10))), '4')
check('y no se lleva las palabras del plazo al título', String(rows[0].title).toLowerCase(), 'revisar la caldera')
check('sin conectores huérfanos', String(rows[0].title).toLowerCase().includes('del al'), 'false')

console.log('\n3. DÍAS DE TRABAJO')
await processMessage(CRIS, 'crea una tarea a Isma: pintar la nave, para el viernes, 3 dias de trabajo')
const { rows: r2 } = await query("select title, work_days, due_date from tasks order by created_at desc limit 1")
check('guarda los días de trabajo', JSON.stringify(r2[0]), '"work_days":"3.0"')
check('y no se los come del título', String(r2[0].title).toLowerCase(), 'pintar la nave')

console.log('\n4. EL PLAZO TAMBIÉN VALE COMO RESPUESTA A «¿PARA CUÁNDO?»')
check('pregunta', await processMessage(CRIS, 'crea una tarea: montar el andamio'), '¿Para quién es')
await processMessage(CRIS, 'Isma')
check('acepta un plazo', await processMessage(CRIS, 'del lunes al jueves'), ['¿Creo esta tarea?', '→'])
check('confirma', await processMessage(CRIS, 'sí'), 'Tarea creada')
const { rows: r3 } = await query("select start_date, due_date from tasks where title ilike '%andamio%'")
check('guardado con plazo: empieza en lunes', String(dia(String(r3[0].start_date).slice(0, 10))), '1')
check('guardado con plazo: acaba en jueves', String(dia(String(r3[0].due_date).slice(0, 10))), '4')

console.log('\n5. LO DE ANTES SIGUE FUNCIONANDO')
check('fecha suelta', await processMessage(CRIS, 'crea una tarea a Isma: llamar al cliente, para mañana'),
  ['Tarea creada', '📅 Plazo:'])

await pool.end()
console.log(fallos === 0 ? '\n✅ todas las pruebas de plazos pasan' : `\n❌ ${fallos} fallos`)
process.exit(fallos === 0 ? 0 : 1)
