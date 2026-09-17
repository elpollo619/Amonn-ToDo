// Pruebas de las órdenes nuevas: plazos, reasignar, ver detalle y listar.
//
// El riesgo de todas ellas es el mismo: comparten verbos con "crear tarea"
// ("pon", "pasa", "cambia", "asigna"). Por eso aquí no solo se comprueba que
// funcionan, sino que NO se tragan las frases de crear.
import { initDb, query, pool } from '../src/db.js'
import { processMessage } from '../src/inbound.js'
import { listStates } from '../src/states.service.js'

const CRIS = '+41765683445'
const RAYNA = '+41764330116'
let fallos = 0
function check(n, real, debe) {
  const l = Array.isArray(debe) ? debe : [debe]
  const f = l.filter((x) => !String(real).includes(x))
  if (f.length) { fallos++; console.log(`  ✘ ${n}\n      obtenido: ${JSON.stringify(String(real).slice(0, 240))}\n      faltaba:  ${JSON.stringify(f)}`) }
  else console.log(`  ✔ ${n}`)
  return real
}
function checkNo(n, real, noDebe) {
  if (String(real).includes(noDebe)) { fallos++; console.log(`  ✘ ${n}\n      NO debía contener: ${noDebe}\n      obtenido: ${JSON.stringify(String(real).slice(0, 200))}`) }
  else console.log(`  ✔ ${n}`)
}

await initDb()
for (const t of ['attachments', 'comments', 'subtasks', 'aliases', 'wa_conversations', 'tasks']) await query(`delete from ${t}`)
await query('delete from users')
await query(
  `insert into users (email, password_hash, full_name, phone, language) values
   ('cris@x.com','x','Cristian Amaya Orrego',$1,'es'),
   ('rayna@x.com','x','Rayna Mridha',$2,'es'),
   ('beatriz@x.com','x','Beatriz Araujo Soares','+41767611055','es')`, [CRIS, RAYNA])

await processMessage(CRIS, 'crea una tarea a Cris: revisar la caldera del taller, para mañana')
await processMessage(CRIS, 'crea una tarea a Cris: cambiar la ventana Meier, para el lunes')

console.log('\n1. CAMBIAR EL PLAZO')
check('cambia el plazo', await processMessage(CRIS, 'cambia el plazo de la caldera al viernes'), ['Plazo', 'caldera'])
const conPlazo = (await query("select due_date from tasks where title ilike '%caldera%'")).rows[0]
check('queda guardado en la base', String(conPlazo.due_date), '-')
check('atajo: mueve X al viernes', await processMessage(CRIS, 'mueve la ventana Meier al viernes'), ['Plazo', 'Meier'])
check('quitar el plazo', await processMessage(CRIS, 'cambia el plazo de la caldera a sin fecha'), 'quitado')
check('fecha que no se entiende', await processMessage(CRIS, 'cambia el plazo de la caldera a chuzo'), 'No he entendido la fecha')

console.log('\n2. REASIGNAR')
check('pásale la caldera a Rayna', await processMessage(CRIS, 'pásale la caldera a Rayna'), ['ahora es de', 'Rayna'])
const deQuien = (await query("select u.full_name from tasks t join users u on u.id=t.assignee_id where t.title ilike '%caldera%'")).rows[0]
check('cambia de responsable en la base', deQuien.full_name, 'Rayna')
check('persona desconocida', await processMessage(CRIS, 'pásale la caldera a Fulanito'), ['No encuentro a', 'fulanito'])

console.log('\n3. VER EL DETALLE')
await processMessage(CRIS, 'añade a la ventana Meier: pedir el herraje')
await processMessage(CRIS, 'comenta en la ventana Meier: falta medir el hueco')
const det = check('¿cómo va la ventana Meier?', await processMessage(CRIS, '¿cómo va la ventana Meier?'), ['📌', 'Meier'])
check('muestra los pasos', det, ['Pasos', 'pedir el herraje'])
check('muestra los comentarios', det, ['comentarios', 'falta medir el hueco'])
check('muestra el responsable', det, 'Responsable')

console.log('\n4. LISTAR POR ESTADO Y POR VENCIMIENTO')
const estados = await listStates()
const primero = estados[0]
check('qué hay en un estado', await processMessage(CRIS, `qué hay en ${primero.name}`), [primero.name])
check('lo que no es un estado cae en el listado normal', await processMessage(CRIS, 'qué hay en inventado'), 'tareas abiertas')
check('qué vence esta semana', await processMessage(CRIS, 'qué vence esta semana'), ['📅'])

console.log('\n5. NO SE TRAGAN LAS FRASES DE CREAR')
const crear1 = await processMessage(CRIS, 'crea una tarea a Rayna: pintar la fachada, para el lunes')
check('crear con "a Rayna" sigue creando', crear1, '📌')
checkNo('no lo lee como reasignar', crear1, 'ahora es de')
const crear2 = await processMessage(CRIS, 'asigna una tarea a Beatriz: limpiar el almacén, para el martes')
check('crear con "asigna" sigue creando', crear2, ['📌'])
checkNo('tampoco lo lee como reasignar', crear2, 'ahora es de')
const crear3 = await processMessage(CRIS, 'pon una tarea a Cris: cambiar la fecha del contrato, para el jueves')
check('crear con "pon" y la palabra fecha sigue creando', crear3, '📌')
checkNo('no lo lee como cambio de plazo', crear3, 'Plazo de')

await pool.end()
console.log(fallos === 0 ? '\n✅ todas las pruebas de órdenes pasan\n' : `\n❌ ${fallos} fallo(s)\n`)
process.exit(fallos === 0 ? 0 : 1)
