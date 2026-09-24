// Pruebas de los pasos dentro de una tarea (subtareas, paso 3).
import { initDb, query, pool } from '../src/db.js'
import { processMessage } from '../src/inbound.js'
import {
  listSubtasks, createSubtask, updateSubtask, deleteSubtask, reorderSubtasks,
} from '../src/subtasks.service.js'
import { openTasksAll } from '../src/tasks.service.js'

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
for (const t of ['subtasks', 'aliases', 'wa_conversations', 'tasks']) await query(`delete from ${t}`)
await query('delete from users')
await query('delete from task_states where is_default = false')
await query("update task_states set position = case kind when 'open' then 0 when 'in_progress' then 1 else 2 end")
await query(
  `insert into users (email, password_hash, full_name, phone, language) values
   ('cris@x.com','x','Cristian Amaya',$1,'es'),
   ('isma@x.com','x','Isma Torres','+41784221922','es')`, [CRIS])

await processMessage(CRIS, 'crea una tarea a Isma: revisar la instalación de la nave 3, para mañana')
const { rows: tk } = await query("select id, title from tasks where title ilike '%nave 3%'")
const tarea = tk[0]

console.log('\n1. AÑADIR PASOS POR WHATSAPP')
check('lo añade y dice el avance', await processMessage(CRIS, 'añade a la nave 3: cambiar el diferencial'),
  ['Paso añadido', 'cambiar el diferencial', 'Pasos: 0 de 1'])
check('otro más', await processMessage(CRIS, 'añade a la nave 3: medir el consumo'), 'Pasos: 0 de 2')

console.log('\n2. NO CONFUNDE AÑADIR UN PASO CON CREAR UNA TAREA')
const antes = (await query('select count(*)::int as n from tasks')).rows[0].n
await processMessage(CRIS, 'añade una tarea a Isma: pedir cemento, para mañana')
const despues = (await query('select count(*)::int as n from tasks')).rows[0].n
check('"añade una tarea" crea una tarea', String(despues - antes), '1')
check('y no un paso', String((await listSubtasks(tarea.id)).length), '2')

console.log('\n3. SI LA TAREA NO EXISTE, NO INVENTA NADA')
check('avisa', await processMessage(CRIS, 'añade a la piscina municipal: poner cloro'), 'No encuentro')

console.log('\n4. AVANCE EN LAS LISTAS')
const pasos = await listSubtasks(tarea.id)
await updateSubtask(pasos[0].id, { done: true })
check('la lista del equipo lo enseña', await processMessage(CRIS, 'tareas del equipo'), ['nave 3', '1/2'])
check('una tarea sin pasos no enseña avance', await processMessage(CRIS, 'tareas del equipo'), 'Pedir cemento')
const lineaCemento = (await processMessage(CRIS, 'tareas del equipo'))
  .split('\n').find((l) => l.includes('cemento')) ?? ''
check('sin "0/0" en la de cemento', lineaCemento.includes('/') ? 'mal' : 'ok', 'ok')

console.log('\n5. EL AVANCE VIENE EN LAS CONSULTAS, SIN UNA POR TAREA')
const todas = await openTasksAll()
const conPasos = todas.find((x) => x.id === tarea.id)
check('total y hechos', JSON.stringify({ t: conPasos.subtasks_total, d: conPasos.subtasks_done }), '{"t":2,"d":1}')

console.log('\n6. CREAR, EDITAR, REORDENAR Y BORRAR')
const extra = await createSubtask(tarea.id, { title: 'firmar el certificado' })
check('creado al final', String(extra.position), '2')
const ordenados = await reorderSubtasks(tarea.id, [extra.id, pasos[1].id, pasos[0].id])
check('reordena', String(ordenados[0].id), String(extra.id))
check('renombra', String((await updateSubtask(extra.id, { title: 'firmar con el cliente' })).title), 'firmar con el cliente')
check('borra', String(await deleteSubtask(extra.id)), 'true')
check('quedan dos', String((await listSubtasks(tarea.id)).length), '2')

console.log('\n7. AL BORRAR LA TAREA SE VAN SUS PASOS')
await query('delete from tasks where id = $1', [tarea.id])
check('sin pasos huérfanos', String((await listSubtasks(tarea.id)).length), '0')

console.log('\n8. UN PASO VACÍO NO SE ADMITE')
let err = ''
try { await createSubtask((await query('select id from tasks limit 1')).rows[0].id, { title: '   ' }) }
catch (e) { err = e.message }
check('lo rechaza', err, 'necesita un texto')

await pool.end()
console.log(fallos === 0 ? '\n✅ todas las pruebas de pasos pasan' : `\n❌ ${fallos} fallos`)
process.exit(fallos === 0 ? 0 : 1)
