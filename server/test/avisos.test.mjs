// Pruebas del aviso diario: agrupado por persona y separado en atrasadas,
// hoy y mañana. Antes se mandaba un mensaje por tarea, que se lee como spam.
import { initDb, query, pool } from '../src/db.js'
import { runReminders, componerAviso } from '../src/reminders.js'

let fallos = 0
function check(n, real, debe) {
  const l = Array.isArray(debe) ? debe : [debe]
  const f = l.filter((x) => !String(real).includes(x))
  if (f.length) { fallos++; console.log(`  ✘ ${n}\n      obtenido: ${JSON.stringify(String(real).slice(0,240))}\n      faltaba:  ${JSON.stringify(f)}`) }
  else console.log(`  ✔ ${n}`)
}
function checkIgual(n, real, debe) {
  if (real === debe) console.log(`  ✔ ${n}`)
  else { fallos++; console.log(`  ✘ ${n}\n      obtenido: ${JSON.stringify(real)}\n      esperado: ${JSON.stringify(debe)}`) }
}

console.log('\n1. CÓMO SE COMPONE EL AVISO (sin base de datos)')
const aviso = componerAviso([
  { title: 'Revisar la caldera', dias_retraso: 3 },
  { title: 'Cambiar la ventana', dias_retraso: 0 },
  { title: 'Pintar la fachada', dias_retraso: -1 },
], 'es')
check('separa las atrasadas', aviso, ['Atrasadas', 'Revisar la caldera', 'hace 3 día'])
check('separa las de hoy', aviso, ['Vence hoy', 'Cambiar la ventana'])
check('separa las de mañana', aviso, ['Para mañana', 'Pintar la fachada'])
checkIgual('el orden es atrasadas → hoy → mañana',
  aviso.indexOf('Atrasadas') < aviso.indexOf('Vence hoy') && aviso.indexOf('Vence hoy') < aviso.indexOf('Para mañana'), true)
const soloHoy = componerAviso([{ title: 'Una sola', dias_retraso: 0 }], 'es')
check('sin atrasadas no aparece ese bloque', !soloHoy.includes('Atrasadas') ? 'ok' : soloHoy, 'ok')
check('también en alemán', componerAviso([{ title: 'X', dias_retraso: 2 }], 'de'), ['Überfällig', 'seit 2 Tag'])

console.log('\n2. UN SOLO MENSAJE POR PERSONA')
await initDb()
for (const t of ['attachments','comments','subtasks','aliases','wa_conversations','tasks']) await query(`delete from ${t}`)
await query('delete from users')
await query(`insert into users (email, password_hash, full_name, phone, language, notify_whatsapp)
  values ('a@x.com','x','Ana Uno','+41760000001','es',true), ('b@x.com','x','Bea Dos','+41760000002','es',true)`)
const ana = (await query("select id from users where email='a@x.com'")).rows[0].id
const bea = (await query("select id from users where email='b@x.com'")).rows[0].id
// Ana: tres tareas que la vieja versión habría convertido en tres mensajes.
await query(`insert into tasks (title, assignee_id, created_by, due_date) values
  ('Caldera', $1, $1, current_date - 3),
  ('Ventana', $1, $1, current_date),
  ('Fachada', $1, $1, current_date + 1),
  ('Tejado',  $2, $2, current_date - 1)`, [ana, bea])
const r = await runReminders()
checkIgual('cuatro tareas candidatas', r.candidates, 4)
checkIgual('pero solo dos avisos, uno por persona', r.sent, 2)
const marcadas = (await query('select count(*) from tasks where last_reminder_at is not null')).rows[0].count
checkIgual('las cuatro quedan marcadas para no repetir', Number(marcadas), 4)
const segunda = await runReminders()
checkIgual('no se repite el aviso al momento', segunda.sent, 0)

await pool.end()
console.log(fallos === 0 ? '\n✅ todas las pruebas de avisos pasan\n' : `\n❌ ${fallos} fallo(s)\n`)
process.exit(fallos === 0 ? 0 : 1)
