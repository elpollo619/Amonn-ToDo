// Pruebas del calendario de residuos de Muri 2026.
// Los datos salen del folleto oficial; lo que se comprueba aquí es que las
// fechas caen en el día de la semana que el propio folleto anuncia, y que
// preguntar por WhatsApp devuelve lo correcto.
import { initDb, query, pool } from '../src/db.js'
import { processMessage } from '../src/inbound.js'
import { RECOGIDAS, recogidasDe, proximaDe, proximas, masDias } from '../src/entsorgung.js'

let fallos = 0
function check(n, real, debe) {
  const l = Array.isArray(debe) ? debe : [debe]
  const f = l.filter((x) => !String(real).includes(x))
  if (f.length) { fallos++; console.log(`  ✘ ${n}\n      obtenido: ${JSON.stringify(String(real).slice(0,200))}\n      faltaba:  ${JSON.stringify(f)}`) }
  else console.log(`  ✔ ${n}`)
}
function checkIgual(n, real, debe) {
  if (real === debe) console.log(`  ✔ ${n}`)
  else { fallos++; console.log(`  ✘ ${n}\n      obtenido: ${JSON.stringify(real)}\n      esperado: ${JSON.stringify(debe)}`) }
}

console.log('\n1. LOS DATOS CUADRAN CON EL FOLLETO')
// El folleto dice: papel los miércoles, vidrio/metal/plástico los viernes,
// restos verdes los martes. Diciembre trae dos excepciones marcadas.
const DIA = { papier_muri: 3, papier_guemligen: 3, glas: 5, metall: 5, kunststoff: 5, deponie: 5, gruengut: 2 }
const EXCEPCIONES = ['2026-12-22', '2026-12-23'] // el folleto las marca con *
for (const [tipo, fechas] of Object.entries(RECOGIDAS)) {
  const malas = fechas.filter((f) => {
    if (EXCEPCIONES.includes(f)) return false
    return new Date(`${f}T12:00:00Z`).getUTCDay() !== DIA[tipo]
  })
  checkIgual(`${tipo}: todas en su día de la semana`, malas.length, 0)
}
checkIgual('vidrio: una vez al mes', RECOGIDAS.glas.length, 12)
checkIgual('metal: una vez al mes', RECOGIDAS.metall.length, 12)
checkIgual('escombros: una vez por trimestre', RECOGIDAS.deponie.length, 4)
checkIgual('plástico: cada dos semanas', RECOGIDAS.kunststoff.length, 24)

console.log('\n2. LAS CONSULTAS')
checkIgual('qué se recoge el 9 de enero', recogidasDe('2026-01-09').join(','), 'glas')
checkIgual('próximo papel tras el 5 de septiembre', proximaDe('papier_muri', '2026-09-05'), '2026-09-09')
checkIgual('ya no hay escombros tras diciembre', proximaDe('deponie', '2026-12-24'), null)
checkIgual('las próximas salen ordenadas', proximas('2026-09-05', 3).map((x) => x.fecha).join(' '), '2026-09-09 2026-09-11 2026-09-16')
checkIgual('sumar un día cruzando el mes', masDias('2026-09-30', 1), '2026-10-01')

console.log('\n3. PREGUNTARLO POR WHATSAPP')
await initDb()
for (const t of ['attachments','comments','subtasks','aliases','wa_conversations','tasks']) await query(`delete from ${t}`)
await query('delete from users')
const CRIS = '+41765683445'
await query(`insert into users (email, password_hash, full_name, phone, language)
  values ('cris@x.com','x','Cristian Amaya',$1,'es')`, [CRIS])
check('¿cuándo sacan el papel?', await processMessage(CRIS, '¿cuándo sacan el papel?'), ['papel'])
check('¿cuándo es el vidrio?', await processMessage(CRIS, '¿cuándo es el vidrio?'), ['vidrio'])
check('pregunta general por la basura', await processMessage(CRIS, '¿cuándo sacan la basura?'), ['Próximas recogidas'])
// Con un usuario que ya tiene el alemán puesto (la autodetección con frases
// tan cortas es otra historia, y no es lo que se prueba aquí).
const RETO = '+41793226933'
await query(`insert into users (email, password_hash, full_name, phone, language, language_auto)
  values ('reto@x.com','x','Reto Amonn',$1,'de',false)`, [RETO])
check('en alemán', await processMessage(RETO, 'wann kommt das Papier?'), ['Papier und Karton'])

await pool.end()
console.log(fallos === 0 ? '\n✅ todas las pruebas de residuos pasan\n' : `\n❌ ${fallos} fallo(s)\n`)
process.exit(fallos === 0 ? 0 : 1)
