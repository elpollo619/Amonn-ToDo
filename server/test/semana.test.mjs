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
for (const t of ['absences', 'meter_readings', 'appointments', 'expense_exports', 'expenses', 'mietvertraege', 'qr_bills', 'bank_entries', 'attachments', 'comments', 'subtasks', 'aliases', 'wa_conversations', 'tasks']) {
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

console.log('\n6b. CONSULTA DE CONTRATOS (FOTO DE LA LISTE)')
await query(`insert into mietvertraege (objgrp, objcode, m1vname, m1name, mbeginn, total, depot, objekt)
  values ('A4','A4-11.1','Kamal','Koubaa','2021-08-01',2798,5596,'5½-Zimmerwohnung EG links'),
         ('B22','B22-035','Aymen','Zaghouani','2025-12-01',800,500,'Zimmer Nr. 35 DG')`)
check('por unidad', await processMessage(CRIS, 'contrato de la 35'), ['Zaghouani', '800', 'Zimmer Nr. 35'])
check('por apellido', await processMessage(CRIS, 'contrato de Koubaa'), ['Koubaa', '2798', 'A4-11.1'])
check('avisa de que es una foto', await processMessage(CRIS, 'contrato de Koubaa'), ['el Excel manda'])
check('suma por edificio', await processMessage(CRIS, 'alquileres de B22'), ['1 contrato', '800'])
check('no encontrado se dice', await processMessage(CRIS, 'contrato de la 999'), ['No encuentro'])

console.log('\n7b. HUÉSPEDES: SIN CONFIGURAR LO DICE, Y SIN PERMISO NO SALE NADA')
check('sin configurar', await processMessage(CRIS, 'mensajes de los huéspedes'),
  ['aún no está encendido'])
// Se enciende de mentira (sin red): la puerta de permisos se comprueba
// ANTES de hablar con Beds24, así que quien no tiene permiso nunca llega
// a la red.
const { config: cfgSemana } = await import('../src/config.js')
cfgSemana.huespedes.pin = 'pin-de-prueba'
check('Rayna sin permiso no puede responder a huéspedes',
  await processMessage(RAYNA, 'responde al huésped 123: hola'), ['NO se ha enviado'])
cfgSemana.huespedes.pin = ''

console.log('\n7c. LOS ACCESOS LOS REPARTE EL ADMIN, POR WHATSAPP')
await query('delete from permissions')
check('sin ser admin, nadie reparte', await processMessage(CRIS, 'dale acceso al dinero a Rayna'),
  ['solo los reparte el administrador'])
const cris = (await query('select id from users where phone = $1', [CRIS])).rows[0]
await query("insert into permissions (user_id, perm) values ($1, 'admin')", [cris.id])
check('el admin da acceso', await processMessage(CRIS, 'dale acceso al dinero a Rayna'),
  ['Rayna', 'dinero'])
check('y Rayna ya puede preguntar impagos', await processMessage(RAYNA, '¿quién no ha pagado?'),
  ['extracto'])
check('el admin lo quita', await processMessage(CRIS, 'quita el acceso al dinero a Rayna'),
  ['ya no tiene acceso'])
check('y Rayna vuelve a estar fuera', await processMessage(RAYNA, '¿quién no ha pagado?'),
  ['autorizados'])
check('la lista de accesos', await processMessage(CRIS, 'accesos'), ['Cristian', 'admin'])
check('un acceso inventado se rechaza', await processMessage(CRIS, 'dale acceso al chocolate a Rayna'),
  ['No conozco ese acceso'])
check('el admin puede repartir "todo" (admin)', await processMessage(CRIS, 'dale acceso a todo a Rayna'),
  ['Rayna', 'admin'])
await query('delete from permissions')

console.log('\n7d. MAHNUNG, MIETERTRAG Y BACKUP')
const cris2 = (await query('select id from users where phone = $1', [CRIS])).rows[0]
await query("insert into permissions (user_id, perm) values ($1, 'dinero') on conflict do nothing", [cris2.id])
const { config: cfgQr } = await import('../src/config.js')
cfgQr.qr.iban = 'CH44 3199 9123 0008 8901 2'
check('la mahnung sale con contrato e importe',
  await processMessage(CRIS, 'mahnung a la 35'), ['1. Mahnung', 'B22-035', '800'])
check('la 2.ª suma el recargo de 50',
  await processMessage(CRIS, '2. mahnung a Koubaa'), ['2. Mahnung', '2848'])
check('el mietertrag suma los contratos', await processMessage(CRIS, 'mietertrag 2026-09'),
  ['2 contratos', '3’598'])
await query(`insert into mietvertraege (objgrp, objcode, m1vname, m1name, total)
  values ('B22','B22-036','Rita','Exemplo',750)`)
check('ambigua pide el código', await processMessage(CRIS, 'mahnung a la B22'), ['código exacto', 'B22-035'])
cfgQr.qr.iban = ''
await query(`insert into expenses (code, spent_on, concept, amount_cents, vat, category)
  values ('HAAG','2026-09-01','Landi Test',10810,'8.1','ure_allg')`)
check('la Vorsteuer del trimestre se calcula', await processMessage(CRIS, 'mwst 2026 q3'),
  ['Vorsteuer 2026 Q3', '8.10', 'Treuhänder'])
const { volcarBackup } = await import('../src/backup.js')
const fsB = await import('node:fs')
const dirB = fsB.mkdtempSync('/tmp/amonn-backup-')
const b = await volcarBackup(dirB)
checkIgual('el backup escribe un fichero', b.ok, true)
checkIgual('con filas de verdad', b.filas > 0, true)
fsB.rmSync(dirB, { recursive: true, force: true })
await query('delete from permissions')

console.log('\n7. CONTRATOS SIN GOOGLE, LO DICE CLARO')
check('explica qué falta', await processMessage(CRIS, 'contrato para Max Muster, habitación 204, 850, desde el 1 de octubre'),
  ['no está conectado a Google', 'GOOGLE_SA_KEY'])

await pool.end()
console.log(fallos === 0 ? '\n✅ todas las pruebas de la semana pasan\n' : `\n❌ ${fallos} fallo(s)\n`)
process.exit(fallos === 0 ? 0 : 1)
