// Prueba de extremo a extremo de la base de conocimiento (Fase D2) contra un
// Postgres de usar y tirar. Enseñar (cualquiera), listar, rechazo de secretos
// y olvidar (solo admin).
import { initDb, query, pool } from '../src/db.js'
import { processMessage } from '../src/inbound.js'
import { darPermiso } from '../src/permisos.js'

const PHONE = '+41761112233'
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
await query('delete from company_facts')
await query('delete from wa_context')
await query('delete from wa_conversations')
await query('delete from users where phone = $1', [PHONE])
const { rows } = await query(
  `insert into users (email, password_hash, full_name, phone, language)
   values ('karl@x.com','x','Karl Knecht',$1,'es') returning id`, [PHONE])
const uid = rows[0].id

console.log('\nCONOCIMIENTO (Fase D2) — extremo a extremo')
check('enseñar un hecho', await processMessage(PHONE, 'recuerda que la caldera de A14 es Viessmann'),
  ['Aprendido', 'Viessmann'])
check('listar lo aprendido', await processMessage(PHONE, 'qué has aprendido'), ['Viessmann'])
check('rechaza un secreto (contraseña)',
  await processMessage(PHONE, 'recuerda que la contraseña del wifi es Amonn2024xy'), ['secreto'])
check('rechaza un secreto (IBAN)',
  await processMessage(PHONE, 'recuerda que el IBAN de la empresa es CH93 0076 2011 6238 5295 7'), ['secreto'])
check('olvidar sin ser admin lo bloquea',
  await processMessage(PHONE, 'olvida lo de la caldera'), ['admin'])

await darPermiso(uid, 'admin')
check('olvidar siendo admin funciona',
  await processMessage(PHONE, 'olvida lo de la caldera'), ['Olvidado'])
check('el secreto nunca se guardó', await processMessage(PHONE, 'qué has aprendido'), ['enseñado'])

console.log(fallos === 0 ? '\n✅ conocimiento (D2) ok' : `\n❌ ${fallos} fallos`)
await pool.end()
process.exit(fallos === 0 ? 0 : 1)
