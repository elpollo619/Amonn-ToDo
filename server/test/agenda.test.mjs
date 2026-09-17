// Pruebas de las citas y del calendario suscribible.
// Lo delicado del iCalendar es el formato: si una línea va mal, Google no
// dice nada — simplemente no enseña el evento.
import { initDb, query, pool } from '../src/db.js'
import { processMessage } from '../src/inbound.js'
import { createAppointment, eventosDelCalendario, construirIcs } from '../src/agenda.js'

const CRIS = '+41765683445'
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

await initDb()
for (const t of ['appointments','shopping_items','attachments','comments','subtasks','aliases','wa_conversations','tasks']) await query(`delete from ${t}`)
await query('delete from users')
await query(`insert into users (email, password_hash, full_name, phone, language)
  values ('cris@x.com','x','Cristian Amaya',$1,'es')`, [CRIS])

console.log('\n1. APUNTAR UNA CITA HABLANDO')
const r = check('cita con hora y sitio', await processMessage(CRIS, 'cita con Baumgartner el martes a las 14:00 en la obra G60'),
  ['Cita apuntada', 'Baumgartner', '14:00'])
check('recoge el sitio', r, ['G60'])
const cita = (await query('select * from appointments order by created_at desc limit 1')).rows[0]
checkIgual('queda guardada con hora', new Date(cita.starts_at).getHours(), 14)
check('y con el sitio en su campo', cita.place ?? '', 'G60')
check('sin hora pregunta la hora', await processMessage(CRIS, 'cita con Baumgartner el martes'), ['¿A qué hora?'])

console.log('\n2. VER LAS CITAS')
check('las lista', await processMessage(CRIS, 'mis citas'), ['Próximas citas', 'Baumgartner'])

console.log('\n3. EL CALENDARIO PARA SUSCRIBIRSE')
await createAppointment({
  title: 'Abnahme Küche', withWhom: 'Frau Jeker', place: 'Gurtenweg 60',
  startsAt: new Date(Date.now() + 86400000).toISOString(), minutes: 90, notes: 'Schlüssel mitnehmen',
})
await processMessage(CRIS, 'crea una tarea a Cris: revisar la caldera, para el viernes')
const ics = construirIcs(await eventosDelCalendario())
check('empieza y acaba como manda el formato', ics, ['BEGIN:VCALENDAR', 'END:VCALENDAR', 'VERSION:2.0'])
check('lleva la cita', ics, ['Abnahme Küche', 'Frau Jeker', 'Gurtenweg 60'])
check('la tarea aparece como día completo', ics, ['DTSTART;VALUE=DATE:', 'Revisar la caldera'])
check('avisa una hora antes de las citas', ics, ['BEGIN:VALARM', 'TRIGGER:-PT1H'])
checkIgual('todas las líneas acaban en CRLF', ics.split('\r\n').length > 20 && !ics.includes('\n\n'), true)
const eventos = (ics.match(/BEGIN:VEVENT/g) ?? []).length
checkIgual('hay tres eventos (dos citas y una tarea)', eventos, 3)
// Los caracteres especiales deben ir escapados o el calendario se rompe.
await createAppointment({ title: 'Prueba; con, comas', startsAt: new Date().toISOString() })
const ics2 = construirIcs(await eventosDelCalendario())
check('escapa comas y puntos y coma', ics2, ['Prueba\; con\\, comas'])

await pool.end()
console.log(fallos === 0 ? '\n✅ todas las pruebas de agenda pasan\n' : `\n❌ ${fallos} fallo(s)\n`)
process.exit(fallos === 0 ? 0 : 1)
