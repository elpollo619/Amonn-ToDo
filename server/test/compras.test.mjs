// Pruebas de la lista de la compra de la oficina.
// El caso que resuelve: alguien ve que falta café y lo dice en el momento,
// en vez de intentar acordarse cuando toque comprar.
import { initDb, query, pool } from '../src/db.js'
import { processMessage } from '../src/inbound.js'
import { listCompras } from '../src/compras.js'

const CRIS = '+41765683445'
const BEA = '+41767611055'
let fallos = 0
function check(n, real, debe) {
  const l = Array.isArray(debe) ? debe : [debe]
  const f = l.filter((x) => !String(real).includes(x))
  if (f.length) { fallos++; console.log(`  ✘ ${n}\n      obtenido: ${JSON.stringify(String(real).slice(0,200))}\n      faltaba:  ${JSON.stringify(f)}`) }
  else console.log(`  ✔ ${n}`)
  return real
}
function checkIgual(n, real, debe) {
  if (real === debe) console.log(`  ✔ ${n}`)
  else { fallos++; console.log(`  ✘ ${n}\n      obtenido: ${JSON.stringify(real)}\n      esperado: ${JSON.stringify(debe)}`) }
}

await initDb()
for (const t of ['shopping_items','attachments','comments','subtasks','aliases','wa_conversations','tasks']) await query(`delete from ${t}`)
await query('delete from users')
await query(`insert into users (email, password_hash, full_name, phone, language) values
  ('cris@x.com','x','Cristian Amaya',$1,'es'), ('bea@x.com','x','Beatriz Araujo',$2,'es')`, [CRIS, BEA])

console.log('\n1. APUNTAR LO QUE FALTA')
check('"falta café"', await processMessage(CRIS, 'falta café'), ['Apuntado', 'Café'])
check('"se acabó el papel de la impresora"', await processMessage(CRIS, 'se acabó el papel de la impresora'), 'Apuntado')
check('"hay que comprar folios"', await processMessage(BEA, 'hay que comprar folios'), 'Apuntado')
checkIgual('hay tres cosas en la lista', (await listCompras()).length, 3)

console.log('\n2. NO SE DUPLICA')
check('si otro pide lo mismo, avisa', await processMessage(BEA, 'falta café'), ['ya estaba', 'Cristian'])
checkIgual('sigue habiendo tres', (await listCompras()).length, 3)

console.log('\n3. VER LA LISTA')
const lista = check('"¿qué falta?"', await processMessage(CRIS, '¿qué falta?'), ['Hace falta comprar', 'Café', 'Folios'])
check('dice quién lo pidió', lista, 'Beatriz')

console.log('\n4. MARCAR COMO COMPRADO')
check('solo una cosa', await processMessage(CRIS, 'ya compré el café'), ['comprado', 'Café'])
checkIgual('quedan dos', (await listCompras()).length, 2)
check('lo que no está', await processMessage(CRIS, 'ya compré caviar'), 'No encuentro')
check('todo de golpe', await processMessage(CRIS, 'todo comprado'), ['compradas', 'Lista vacía'])
checkIgual('la lista queda vacía', (await listCompras()).length, 0)
check('y lo dice si no falta nada', await processMessage(CRIS, '¿qué falta?'), 'No falta nada')

console.log('\n5. NO SE COME LAS TAREAS')
// "falta pintar la ventana" es trabajo, no compra.
const tarea = await processMessage(CRIS, 'falta pintar la ventana del taller')
checkIgual('"falta pintar..." no va a la compra', (await listCompras()).length, 0)
check('se trata como otra cosa', tarea, ['🤔'])

await pool.end()
console.log(fallos === 0 ? '\n✅ todas las pruebas de la compra pasan\n' : `\n❌ ${fallos} fallo(s)\n`)
process.exit(fallos === 0 ? 0 : 1)
