// Kilometraje y consulta de gasto por comercio.
//
// El kilometraje NO es una tabla nueva: es una fila del Spesen en la columna
// URE FZ (6200) con los km guardados aparte para poder sumarlos. Estas
// pruebas vigilan justamente eso, y que «120 km a Gampelen» no se coma las
// reglas de tareas ni las de gastos.
import { initDb, query, pool } from '../src/db.js'
import { processMessage } from '../src/inbound.js'
import { parseWithRules } from '../src/assistant.js'
import { addKilometraje, kmResumen, kmRappen, gastoPorComercio, chf } from '../src/gastos.js'

const CRIS = '+41765683445'
const USERS = [{ id: '1', full_name: 'Cristian Amaya' }]
const HOY = '2026-09-08'
// Atajo: parsear una frase como si la escribiera Cris.
const parse = (texto, lang = 'es') =>
  parseWithRules(texto, { users: USERS, sender: USERS[0], today: HOY, lang, openTasks: [] })
let fallos = 0
function check(n, real, debe) {
  const l = Array.isArray(debe) ? debe : [debe]
  const f = l.filter((x) => !String(real).includes(x))
  if (f.length) { fallos++; console.log(`  ✘ ${n}\n      obtenido: ${JSON.stringify(String(real).slice(0,260))}\n      faltaba:  ${JSON.stringify(f)}`) }
  else console.log(`  ✔ ${n}`)
  return real
}
function checkIgual(n, real, debe) {
  if (real === debe) console.log(`  ✔ ${n}`)
  else { fallos++; console.log(`  ✘ ${n}\n      obtenido: ${JSON.stringify(real)}\n      esperado: ${JSON.stringify(debe)}`) }
}

console.log('\n1. LA FRASE SE ENTIENDE EN LOS TRES IDIOMAS')
checkIgual('es: "120 km a Gampelen"', parse('120 km a Gampelen', 'es').action, 'km_add')
checkIgual('  y saca los kilómetros', parse('120 km a Gampelen', 'es').km, 120)
checkIgual('  y el destino', parse('120 km a Gampelen', 'es').destino, 'Gampelen')
checkIgual('de: "80 km nach Kerzers"', parse('80 km nach Kerzers', 'de').action, 'km_add')
checkIgual('pt: "45 km para Berna"', parse('45 km para Berna', 'pt').action, 'km_add')
checkIgual('sin destino también vale', parse('30 km', 'es').action, 'km_add')
checkIgual('con decimal', parse('12,5 km a Muri', 'es').km, 12.5)

console.log('\n2. NO SE COME OTRAS REGLAS (el fallo clásico de este asistente)')
checkIgual('crear tarea sigue creando',
  parse('crea una tarea a Rayna: pintar la fachada', 'es').action, 'create_task')
checkIgual('un gasto normal sigue siendo gasto',
  parse('gasto 37.90 Landi Kabelbinder', 'es').action, 'gasto_add')
checkIgual('el contador de la 204 sigue siendo contador',
  parse('luz 204: 4521', 'es').action, 'contador_add')
checkIgual('"gasto en Coop 45.90" se APUNTA, no se consulta',
  parse('gasto en Coop 45.90', 'es').action, 'gasto_add')
checkIgual('"cuánto gastamos en IKEA este año" se consulta',
  parse('cuánto gastamos en IKEA este año', 'es').action, 'gasto_comercio')
checkIgual('  y saca el comercio',
  parse('cuánto gastamos en IKEA este año', 'es').comercio.toUpperCase(), 'IKEA')

console.log('\n3. APUNTARLO POR WHATSAPP')
await initDb()
for (const t of ['expense_exports','expenses','contacts','appointments','shopping_items','attachments','comments','subtasks','aliases','wa_conversations','tasks']) await query(`delete from ${t}`)
await query('delete from users')
await query(`insert into users (email, password_hash, full_name, phone, language)
  values ('cris@x.com','x','Cristian Amaya',$1,'es')`, [CRIS])

check('"120 km a Gampelen"', await processMessage(CRIS, '120 km a Gampelen'),
  ['120 km', 'Gampelen', 'URE FZ', '6200', '84.00'])
check('el código del edificio se respeta', await processMessage(CRIS, '40 km A14 Kerzers'),
  ['A14', '28.00'])

const fila = (await query('select * from expenses where km is not null order by created_at')).rows
checkIgual('quedan dos viajes apuntados', fila.length, 2)
checkIgual('el km se guarda en su columna', Number(fila[0].km), 120)
checkIgual('y cae en la columna del coche', fila[0].category, 'ure_fz')
checkIgual('con la cuenta 6200', fila[0].account, '6200')
checkIgual('el destino sale entero', fila[1].concept, '40 km Kerzers')

console.log('\n4. EL RESUMEN DEL AÑO')
const anno = new Date().getFullYear()
const r = await kmResumen({ desde: `${anno}-01-01`, hasta: `${anno}-12-31` })
checkIgual('suma los kilómetros', r.km, 160)
checkIgual('y los francos', r.total_cents, 11200)
check('"kilómetros" lo cuenta', await processMessage(CRIS, 'kilómetros'), ['160 km', '112.00', String(kmRappen())])

console.log('\n5. CUÁNTO SE GASTÓ EN UN COMERCIO')
await processMessage(CRIS, 'gasto 37.90 Landi Kabelbinder')
await processMessage(CRIS, 'gasto 12.10 Landi Handschuhe')
const c = await gastoPorComercio('landi', { desde: `${anno}-01-01`, hasta: `${anno}-12-31` })
checkIgual('encuentra los dos', c.n, 2)
checkIgual('y los suma', chf(c.total_cents), '50.00')
check('por WhatsApp', await processMessage(CRIS, 'cuánto gastamos en Landi este año'), ['50.00', '2 gasto'])
check('lo que no existe se dice claro', await processMessage(CRIS, 'cuánto gastamos en Manor este año'), ['No encuentro'])

console.log(fallos === 0 ? '\n✅ Kilometraje: todo en verde\n' : `\n❌ ${fallos} fallo(s)\n`)
await pool.end()
process.exit(fallos === 0 ? 0 : 1)
