// Pruebas del vocabulario del equipo (entrega 2): alias de personas y de
// tareas, enseñanza a mano y aprendizaje a partir de las correcciones.
import { initDb, query, pool } from '../src/db.js'
import { processMessage } from '../src/inbound.js'
import { listAliases } from '../src/aliases.js'

const CRIS = '+41765683445'
let fallos = 0
function check(nombre, texto, debeContener) {
  const lista = Array.isArray(debeContener) ? debeContener : [debeContener]
  const faltan = lista.filter((x) => !String(texto).includes(x))
  if (faltan.length) {
    fallos++
    console.log(`  ✘ ${nombre}\n      respuesta: ${JSON.stringify(texto)}\n      faltaba:   ${JSON.stringify(faltan)}`)
  } else console.log(`  ✔ ${nombre}`)
  return texto
}

await initDb()
for (const t of ['aliases', 'wa_conversations', 'tasks', 'users']) await query(`delete from ${t}`)
await query(
  `insert into users (email, password_hash, full_name, phone, language) values
   ('cris@x.com','x','Cristian Amaya',$1,'es'),
   ('isma@x.com','x','Isma Torres','+41784221922','es'),
   ('jas@x.com','x','Jasmina Keller','+41764620822','es')`, [CRIS])

console.log('\n1. ENSEÑAR UN APODO A MANO')
check('lo anota', await processMessage(CRIS, 'Jasmi es Jasmina'), ['Anotado', '«jasmi»', 'Jasmina'])
check('y lo usa al crear', await processMessage(CRIS, 'crea una tarea a Jasmi: pedir cemento, para mañana'),
  ['Tarea creada', 'para Jasmina'])

console.log('\n2. NO CONFUNDE UNA FRASE NORMAL CON UNA ENSEÑANZA')
check('"la caldera es urgente" no se anota', await processMessage(CRIS, 'la caldera es urgente'), '🤔')
const sinBasura = (await listAliases()).find((a) => a.phrase === 'la caldera' || a.phrase === 'caldera')
check('no creó alias basura', String(!sinBasura), 'true')

console.log('\n3. APRENDE DE LA CORRECCIÓN (nombre no reconocido)')
check('pregunta por el nombre raro', await processMessage(CRIS, 'crea una tarea a Chispas: revisar el cuadro eléctrico, para mañana'),
  ['No encuentro', 'hispas', '¿Para quién es?'])
const creada = check('crea y anota el apodo', await processMessage(CRIS, 'Isma'),
  ['¿Creo esta tarea?'])
check('confirma', await processMessage(CRIS, 'sí'), ['Tarea creada', 'para Isma', 'Anotado', '«chispas»'])
check('ya no vuelve a preguntar', await processMessage(CRIS, 'crea una tarea a Chispas: comprar tubos, para mañana'),
  ['Tarea creada', 'para Isma'])

console.log('\n4. TAREAS: PREGUNTA CUÁL Y APRENDE CÓMO LA LLAMÁIS')
await processMessage(CRIS, 'crea una tarea a mí: revisar la caldera del taller, para mañana')
const pregunta = check('no adivina y pregunta con números', await processMessage(CRIS, 'hecha la de calefacción'),
  ['¿Cuál de estas?', '1.'])
// El número se lee de la lista que el propio asistente acaba de enseñar,
// no se adivina: así la prueba comprueba lo que ve el usuario.
const linea = pregunta.split('\n').find((l) => /caldera/i.test(l)) ?? ''
const idx = Number.parseInt(linea, 10)
check('completa la elegida y lo anota', await processMessage(CRIS, String(idx)),
  ['✅', 'completada', 'Anotado', 'calefaccion'])

console.log('\n4b. SI IGNORAS LA PREGUNTA, NO COMPLETA NADA POR SU CUENTA')
await processMessage(CRIS, 'crea una tarea a mí: pintar la valla, para mañana')
await processMessage(CRIS, 'hecha la de algo que no existe')
check('un mensaje nuevo no secuestra la pregunta', await processMessage(CRIS, '¿qué tengo abierto?'),
  'Tus tareas abiertas')
const siguePintar = await query("select 1 from tasks where title ilike '%valla%' and status <> 'done'")
check('no completó nada por su cuenta', String(siguePintar.rowCount), '1')

console.log('\n5. LA PRÓXIMA VEZ YA SABE QUÉ ES «CALEFACCIÓN»')
await processMessage(CRIS, 'crea una tarea a mí: revisar la caldera otra vez, para mañana')
check('acierta directamente', await processMessage(CRIS, 'hecha la de calefacción'),
  ['✅', 'caldera'])

console.log('\n6. EL VOCABULARIO QUEDA GUARDADO Y CONSULTABLE')
const v = await listAliases()
const personas = v.filter((a) => a.kind === 'person').map((a) => a.phrase).sort()
const tareas = v.filter((a) => a.kind === 'task').map((a) => a.phrase)
check('alias de personas', JSON.stringify(personas), ['chispas', 'jasmi'])
check('alias de tareas', JSON.stringify(tareas), 'calefaccion')
check('apunta a la persona correcta', String(v.find((a) => a.phrase === 'chispas')?.target_name), 'Isma Torres')

await pool.end()
console.log(fallos === 0 ? '\n✅ todas las pruebas de vocabulario pasan' : `\n❌ ${fallos} fallos`)
process.exit(fallos === 0 ? 0 : 1)
