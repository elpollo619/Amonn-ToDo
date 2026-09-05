// Pruebas de lo que rodea a la semana de trabajo: ausencias, lecturas de
// contadores, el aviso de cita 1 h antes, el resumen semanal y el mensaje
// del generador de contratos cuando aún no está conectado a Google.
import { initDb, query, pool } from '../src/db.js'
import { processMessage } from '../src/inbound.js'
import { addAbsence } from '../src/ausencias.js'
import { createAppointment } from '../src/agenda.js'
import { runAvisoCitas, runReminders, componerResumenSemanal } from '../src/reminders.js'
import { todayKey } from '../src/dates.js'

const CRIS = '+41765683445'
const RAYNA = '+41760000002'
let fallos = 0
function check(n, real, debe) {
  const l = Array.isArray(debe) ? debe : [debe]
  const f = l.filter((x) => !String(real).includes(x))
  if (f.length) { fallos++; console.log(`  ✘ ${n}\n      obtenido: ${JSON.stringify(String(real).slice(0, 260))}\n      faltaba:  ${JSON.stringify(f)}`) }
  else console.log(`  ✔ ${n}`)
  return real
}
function checkIgual(n, real, debe) {
  if (real === debe) console.log(`  ✔ ${n}`)
  else { fallos++; console.log(`  ✘ ${n}\n      obtenido: ${JSON.stringify(real)}\n      esperado: ${JSON.stringify(debe)}`) }
}

await initDb()
for (const t of ['absences', 'meter_readings', 'appointments', 'expense_exports', 'expenses', 'attachments', 'comments', 'subtasks', 'aliases', 'wa_conversations', 'tasks']) {
  await query(`delete from ${t}`)
}
await query('delete from users')
await query(`insert into users (email, password_hash, full_name, phone, language)
  values ('cris@x.com','x','Cristian Amaya',$1,'es'), ('rayna@x.com','x','Rayna Petrova',$2,'es')`,
  [CRIS, RAYNA])
const rayna = (await query('select id from users where phone = $1', [RAYNA])).rows[0]

console.log('\n1. AUSENCIAS POR WHATSAPP')
check('alta con rango', await processMessage(CRIS, 'Rayna de vacaciones del 10.10 al 15.10'),
  ['Apuntado', 'Rayna', '10/10', '15/10'])
check('la lista la enseña', await processMessage(CRIS, '¿quién está de vacaciones?'),
  ['Rayna Petrova', '10/10', 'vacaciones'])
check('una persona desconocida se dice', await processMessage(CRIS, 'Zoltan de vacaciones del 10.10 al 15.10'),
  ['No encuentro'])

console.log('\n2. EL AUSENTE NO RECIBE EL AVISO DIARIO')
const hoy = todayKey()
await addAbsence({ userId: rayna.id, startsOn: hoy, endsOn: hoy, reason: 'baja' })
await query(`insert into tasks (title, status, assignee_id, due_date)
  values ('pintar la valla', 'open', $1, current_date)`, [rayna.id])
const aviso = await runReminders()
checkIgual('su tarea de hoy no genera candidatos', aviso.candidates, 0)

console.log('\n3. Y AL ASIGNARLE UNA TAREA SE AVISA (PERO SE CREA)')
const creada = check('la tarea se crea', await processMessage(CRIS, 'crea una tarea a Rayna: revisar la caldera, para hoy'),
  ['Rayna'])
check('con el aviso de ausencia', creada, ['⚠️', 'ausente'])

console.log('\n4. CONTADORES')
check('primera lectura', await processMessage(CRIS, 'luz 204: 4521'), ['Apuntado', 'luz 204', '4521'])
check('la segunda enseña la diferencia', await processMessage(CRIS, 'luz 204 4600'), ['+79'])
check('lecturas de la 204', await processMessage(CRIS, 'lecturas de la 204'), ['luz 204: 4600'])
check('en alemán suma a la misma serie', await processMessage(CRIS, 'strom 204 4700'), ['+100'])

console.log('\n5. AVISO DE CITA UNA HORA ANTES')
const enMediaHora = new Date(Date.now() + 30 * 60000).toISOString()
const cita = await createAppointment({ title: 'Baumgartner obra', startsAt: enMediaHora, createdBy: null })
await query('update appointments set created_by = (select id from users where phone = $1) where id = $2', [CRIS, cita.id])
const r1 = await runAvisoCitas()
checkIgual('se avisa una vez', r1.enviados, 1)
const r2 = await runAvisoCitas()
checkIgual('y no dos', r2.candidatas, 0)

console.log('\n6. RESUMEN SEMANAL')
const resumen = await componerResumenSemanal('es')
check('lleva las tareas de la semana', resumen, ['Resumen de la semana', 'Revisar la caldera'])
check('y por WhatsApp responde lo mismo', await processMessage(CRIS, 'resumen semanal'), ['Resumen de la semana'])

console.log('\n7. CONTRATOS SIN GOOGLE, LO DICE CLARO')
check('explica qué falta', await processMessage(CRIS, 'contrato para Max Muster, habitación 204, 850, desde el 1 de octubre'),
  ['no está conectado a Google', 'GOOGLE_SA_KEY'])

await pool.end()
console.log(fallos === 0 ? '\n✅ todas las pruebas de la semana pasan\n' : `\n❌ ${fallos} fallo(s)\n`)
process.exit(fallos === 0 ? 0 : 1)
