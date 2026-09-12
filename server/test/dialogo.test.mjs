// Prueba de extremo a extremo del asistente contra un Postgres de usar y tirar.
// Comprueba el diálogo con preguntas, el cambio de idioma y la caducidad.
// WA_ENABLED=false hace que no se envíe nada por WhatsApp de verdad.
import { initDb, query, pool } from '../src/db.js'
import { processMessage } from '../src/inbound.js'
import { clearPending } from '../src/conversations.js'
import { notifyTaskAssigned } from '../src/notify.js'

// Con WA_ENABLED=false, whatsapp.js solo registra el mensaje: lo capturamos
// para poder comprobar en qué idioma habría salido.
let ultimoEnviado = ''
const logOriginal = console.log
console.log = (...a) => {
  const linea = a.join(' ')
  if (linea.startsWith('[wa] (desactivado)')) ultimoEnviado = linea
  logOriginal(...a)
}

const CRIS = '+41765683445'
const ISMA = '+41784221922'
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
await query('delete from tasks'); await query('delete from wa_conversations'); await query('delete from users')
await query(
  `insert into users (email, password_hash, full_name, phone, language) values
   ('cris@x.com','x','Cristian Amaya',$1,'es'),
   ('isma@x.com','x','Isma Torres',$2,'es')`, [CRIS, ISMA])

console.log('\n1. MENSAJE COMPLETO → crea sin preguntar')
check('crea directamente', await processMessage(CRIS, 'crea una tarea a Isma: revisar la caldera, para el viernes'),
  ['Tarea creada', 'para Isma', 'Revisar la caldera'])

console.log('\n2. MENSAJE INCOMPLETO → pregunta paso a paso')
check('pregunta para quién', await processMessage(CRIS, 'crea una tarea: llamar al fontanero'), '¿Para quién es')
check('pregunta para cuándo', await processMessage(CRIS, 'Isma'), '¿Para cuándo?')
const conf = check('pide confirmación', await processMessage(CRIS, 'mañana'), ['¿Creo esta tarea?', 'Responde SÍ o NO'])
check('el resumen lleva la fecha', conf, '📅')
check('confirma y crea', await processMessage(CRIS, 'sí'), 'Tarea creada')

console.log('\n3. DECIR QUE NO CANCELA')
await processMessage(CRIS, 'crea una tarea: pedir cemento')
await processMessage(CRIS, 'Isma')
await processMessage(CRIS, 'sin fecha')
check('cancela con NO', await processMessage(CRIS, 'no'), 'no la creo')

console.log('\n4. CANCELAR A MEDIAS')
await processMessage(CRIS, 'crea una tarea: pintar la valla')
check('cancela a mitad', await processMessage(CRIS, 'cancela'), 'no la creo')

console.log('\n5. CAMBIO DE IDIOMA')
check('cambia a alemán', await processMessage(CRIS, 'habla en alemán'), 'auf Deutsch')
check('ahora responde en alemán', await processMessage(CRIS, 'Hilfe'), ['Amonn-Assistent', 'Aufgabe'])
check('pregunta en alemán', await processMessage(CRIS, 'Erstelle eine Aufgabe: Heizung prüfen'), 'Für wen ist')
await processMessage(CRIS, 'Isma')
check('confirma en alemán', await processMessage(CRIS, 'morgen'), ['Soll ich diese Aufgabe erstellen?', 'JA oder NEIN'])
check('crea en alemán', await processMessage(CRIS, 'ja'), 'Aufgabe erstellt')
check('vuelve a español', await processMessage(CRIS, 'habla en español'), 'en español')

console.log('\n6. AUTODETECCIÓN DE IDIOMA (Isma escribe en portugués)')
check('detecta portugués', await processMessage(ISMA, 'Preciso de criar uma tarefa mas não sei bem como'), ['🤔', 'tarefa'])
const { rows } = await query('select language, language_auto from users where phone = $1', [ISMA])
check('idioma guardado como pt', JSON.stringify(rows[0]), '"language":"pt"')

console.log('\n7. NO PISA UN IDIOMA ELEGIDO A MANO')
const { rows: r2 } = await query('select language, language_auto from users where phone = $1', [CRIS])
check('Cris quedó en es y a mano', JSON.stringify(r2[0]), ['"language":"es"', '"language_auto":false'])
check('sigue en español pese a escribir alemán', await processMessage(CRIS, 'Kannst du bitte die Heizung morgen prüfen'), ['tarea', 'Isma'].slice(0, 1))

console.log('\n8. CADUCIDAD DE LA CONVERSACIÓN')
await processMessage(CRIS, 'crea una tarea: revisar el andamio')
await query("update wa_conversations set updated_at = now() - interval '20 minutes' where phone = $1", [CRIS])
check('avisa de que empieza de nuevo', await processMessage(CRIS, '¿qué tengo abierto?'), 'ha pasado mucho rato')

console.log('\n9. LISTAR Y COMPLETAR')
check('lista las suyas', await processMessage(CRIS, '¿qué tengo abierto?'), 'Tus tareas abiertas')
check('lista del equipo', await processMessage(CRIS, 'tareas del equipo'), 'Tareas abiertas del equipo')
check('completa por pista', await processMessage(CRIS, 'hecha la de la caldera'), ['✅', 'completada'])

console.log('\n10. EL AVISO AL ASIGNAR VA EN EL IDIOMA DE QUIEN LO RECIBE')
await query("update users set language = 'de', language_auto = false where phone = $1", [ISMA])
{
  const { rows: u } = await query('select * from users where phone = $1', [ISMA])
  const { rows: c } = await query('select * from users where phone = $1', [CRIS])
  const aviso = await notifyTaskAssigned(
    { id: '0', title: 'Heizung prüfen', due_date: null, priority: 'high' }, u[0], c[0])
  check('se intentó avisar', JSON.stringify(aviso), 'whatsapp')
  check('el texto salió en alemán', ultimoEnviado, ['Hallo Isma', 'zugewiesen', 'Priorität'])
}

console.log('\n11. PERSONA DESCONOCIDA')
check('teléfono no registrado', await processMessage('+34600000000', 'hola qué tal, quiero crear una tarea'), 'No te reconozco')

await clearPending(CRIS)
await pool.end()
console.log(fallos === 0 ? '\n✅ todas las pruebas del diálogo pasan' : `\n❌ ${fallos} fallos`)
process.exit(fallos === 0 ? 0 : 1)
