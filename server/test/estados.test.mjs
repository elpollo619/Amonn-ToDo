// Pruebas de los estados propios del taller (paso 2).
import { initDb, query, pool } from '../src/db.js'
import { processMessage } from '../src/inbound.js'
import {
  listStates, createState, updateState, deleteState, reorderStates, matchStateByName,
} from '../src/states.service.js'

const CRIS = '+41765683445'
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

await initDb()
for (const t of ['aliases', 'wa_conversations', 'tasks']) await query(`delete from ${t}`)
await query('delete from users')
// Los tres estados de serie se dejan; los inventados en pasadas anteriores no.
// Y se les restablece el orden, porque la prueba 11 los reordena y si no la
// pasada siguiente empezaría con el orden cambiado.
await query('delete from task_states where is_default = false')
await query("update task_states set position = case kind when 'open' then 0 when 'in_progress' then 1 else 2 end")
await query(
  `insert into users (email, password_hash, full_name, phone, language) values
   ('cris@x.com','x','Cristian Amaya',$1,'es'),
   ('isma@x.com','x','Isma Torres','+41784221922','es')`, [CRIS])

console.log('\n1. LOS TRES DE SIEMPRE VIENEN PUESTOS')
const base = await listStates()
check('hay tres', String(base.length), '3')
check('con sus clases', JSON.stringify(base.map((e) => e.kind)), '["open","in_progress","done"]')

console.log('\n2. CREAR ESTADOS DEL TALLER')
const espera = await createState({ name: 'Esperando material', kind: 'in_progress', color: 'blue' })
const cliente = await createState({ name: 'Pendiente de cliente', kind: 'in_progress', color: 'violet' })
const factura = await createState({ name: 'Por facturar', kind: 'open', color: 'amber' })
// Un segundo estado que también empieza por "Pendiente", para poder probar
// que ante la duda pregunta en vez de elegir por su cuenta.
await createState({ name: 'Pendiente de material', kind: 'open', color: 'red' })
check('creado con su clase', JSON.stringify(espera), ['"name":"Esperando material"', '"kind":"in_progress"'])
check('ahora hay siete', String((await listStates()).length), '7')

console.log('\n3. CAMBIAR EL ESTADO POR WHATSAPP')
await processMessage(CRIS, 'crea una tarea a Isma: revisar la caldera del taller, para mañana')
check('lo cambia', await processMessage(CRIS, 'pon la caldera en esperando material'),
  ['✅', 'Esperando material'])
const { rows: t1 } = await query("select status, state_id from tasks where title ilike '%caldera%'")
check('y el status queda alineado', JSON.stringify(t1[0]), '"status":"in_progress"')
check('apunta al estado nuevo', String(t1[0].state_id), String(espera.id))

console.log('\n4. NO INVENTA ESTADOS QUE NO EXISTEN')
check('avisa y enseña los que hay', await processMessage(CRIS, 'pon la caldera en pendiente de pintura'),
  ['No tengo un estado', 'Esperando material'])

console.log('\n5. AMBIGÜEDAD: PREGUNTA EN VEZ DE ADIVINAR')
check('pide precisión', await processMessage(CRIS, 'pon la caldera en pendiente'),
  ['encaja con varios', 'Pendiente de cliente', 'Pendiente de material'])
check('con el nombre completo sí acierta',
  await processMessage(CRIS, 'pon la caldera en pendiente de cliente'),
  ['✅', 'Pendiente de cliente'])

console.log('\n6. MARCAR HECHA MUEVE TAMBIÉN EL ESTADO')
check('completa', await processMessage(CRIS, 'hecha la de la caldera'), '✅')
const { rows: t2 } = await query(
  `select t.status, s.kind from tasks t join task_states s on s.id = t.state_id
    where t.title ilike '%caldera%'`)
check('estado y status en done', JSON.stringify(t2[0]), ['"status":"done"', '"kind":"done"'])

console.log('\n7. LAS LISTAS ENSEÑAN EL ESTADO CUANDO NO ES EL DE POR DEFECTO')
await processMessage(CRIS, 'crea una tarea a mí: pedir tubos, para mañana')
await processMessage(CRIS, 'pon los tubos en por facturar')
const lista = await processMessage(CRIS, '¿qué tengo abierto?')
check('sale el estado', lista, ['Pedir tubos', 'Por facturar'])

console.log('\n8. CAMBIAR LA CLASE DE UN ESTADO ARRASTRA SUS TAREAS')
await updateState(factura.id, { kind: 'done' })
const { rows: t3 } = await query("select status from tasks where title ilike '%tubos%'")
check('la tarea pasó a done', JSON.stringify(t3[0]), '"status":"done"')
await updateState(factura.id, { kind: 'open' })

console.log('\n9. BORRAR UN ESTADO REUBICA SUS TAREAS, NO LAS PIERDE')
await processMessage(CRIS, 'crea una tarea a mí: montar el andamio, para mañana')
await processMessage(CRIS, 'pon el andamio en esperando material')
await deleteState(espera.id)
const { rows: t4 } = await query(
  `select t.state_id, s.name from tasks t left join task_states s on s.id = t.state_id
    where t.title ilike '%andamio%'`)
check('la tarea sigue con un estado', String(t4[0].state_id !== null), 'true')
check('y no es el borrado', String(t4[0].state_id) !== String(espera.id) ? 'ok' : 'mal', 'ok')

console.log('\n10. NO SE PUEDE BORRAR EL ÚLTIMO DE UNA CLASE')
// Solo hay un estado de tipo 'done' (el de serie): intentar borrarlo debe
// fallar, porque dejaría el tablero sin sitio donde caer lo terminado.
const soloDone = (await listStates()).filter((e) => e.kind === 'done')
check('hay exactamente uno', String(soloDone.length), '1')
let error = ''
try { await deleteState(soloDone[0].id) } catch (e) { error = e.message }
check('lo impide', error, 'último estado')

console.log('\n11. REORDENAR')
const orden = (await listStates()).map((e) => e.id).reverse()
const reordenados = await reorderStates(orden)
check('respeta el orden pedido', String(reordenados[0].id), String(orden[0]))

console.log('\n12. EMPAREJAR POR NOMBRE')
const todos = await listStates()
check('exacto', String(matchStateByName(todos, 'Por facturar').state?.name), 'Por facturar')
check('sin coincidencia', String(matchStateByName(todos, 'xyzzy').state), 'null')

await pool.end()
console.log(fallos === 0 ? '\n✅ todas las pruebas de estados pasan' : `\n❌ ${fallos} fallos`)
process.exit(fallos === 0 ? 0 : 1)
