// Pruebas de los contactos de obra.
import { initDb, query, pool } from '../src/db.js'
import { processMessage } from '../src/inbound.js'
import { addContact, buscarContactos } from '../src/contactos.js'

const CRIS = '+41765683445'
let fallos = 0
function check(n, real, debe) {
  const l = Array.isArray(debe) ? debe : [debe]
  const f = l.filter((x) => !String(real).includes(x))
  if (f.length) { fallos++; console.log(`  ✘ ${n}\n      obtenido: ${JSON.stringify(String(real).slice(0,240))}\n      faltaba:  ${JSON.stringify(f)}`) }
  else console.log(`  ✔ ${n}`)
  return real
}
function checkIgual(n, real, debe) {
  if (real === debe) console.log(`  ✔ ${n}`)
  else { fallos++; console.log(`  ✘ ${n}\n      obtenido: ${JSON.stringify(real)}\n      esperado: ${JSON.stringify(debe)}`) }
}

await initDb()
for (const t of ['contacts','appointments','shopping_items','attachments','comments','subtasks','aliases','wa_conversations','tasks']) await query(`delete from ${t}`)
await query('delete from users')
await query(`insert into users (email, password_hash, full_name, phone, language)
  values ('cris@x.com','x','Cristian Amaya',$1,'es')`, [CRIS])

// Contactos reales de la Adressliste.
await addContact({ name: 'Reto Baumgartner', company: 'R. Baumgartner AG', role: 'Baumeisterarbeiten',
  bkp: '211', project: 'G60 Muri', mobile: '+41 79 938 50 71', email: 'info@rbaumgartner.ch' })
await addContact({ name: 'Bruno Neuenschwander', company: 'Bruno Neuenschwander GmbH', role: 'Gipserarbeiten',
  bkp: '271', project: 'G60 Muri', phone: '+41 31 951 51 70', mobile: '+41 79 652 28 11' })
await addContact({ name: 'Timo Hunziker', company: 'Elektra Ins AG', role: 'Elektr. Installationen',
  bkp: '230', project: 'I16 Gampelen', mobile: '+41 79 376 17 07' })

console.log('\n1. BUSCAR')
checkIgual('por apellido', (await buscarContactos('baumgartner')).length, 1)
checkIgual('por oficio', (await buscarContactos('gipser')).length, 1)
checkIgual('por obra salen los dos de esa obra', (await buscarContactos('G60')).length, 2)

console.log('\n2. PREGUNTARLO POR WHATSAPP')
const uno = check('"teléfono de Baumgartner"', await processMessage(CRIS, 'teléfono de Baumgartner'),
  ['Reto Baumgartner', '+41 79 938 50 71'])
check('enseña empresa y oficio', uno, ['R. Baumgartner AG', 'Baumeisterarbeiten'])
check('"contacto del electricista"', await processMessage(CRIS, 'contacto de Elektra'), ['Timo Hunziker'])
check('si hay varios, los enseña todos', await processMessage(CRIS, 'contacto de G60'), ['He encontrado 2'])
check('si no existe, lo dice', await processMessage(CRIS, 'teléfono de Pérez'), 'No encuentro')

console.log('\n3. GUARDAR UNO NUEVO DESDE WHATSAPP')
check('nombre, empresa y teléfono', await processMessage(CRIS, 'guarda contacto: Serge Gerber, Gerber AG Münsingen, +41 76 802 31 32'),
  ['Contacto guardado', 'Serge Gerber', 'Gerber AG', '+41 76 802 31 32'])
const g = (await buscarContactos('gerber'))[0]
checkIgual('el nombre va en su sitio', g.name, 'Serge Gerber')
checkIgual('la empresa también', g.company, 'Gerber AG Münsingen')
check('con correo, aunque venga en otro orden',
  await processMessage(CRIS, 'guarda contacto: ueli.zihlmann@fensterbaumeler.ch, Ueli Zihlmann, Fensterbaumeler AG'),
  ['Ueli Zihlmann', 'ueli.zihlmann@fensterbaumeler.ch'])

console.log('\n4. ALTA GUIADA PASO A PASO')
check('arranca y pregunta la empresa', await processMessage(CRIS, 'agrega a Cristian Amaya a la lista de contactos'),
  ['Cristian Amaya', 'empresa'])
check('pregunta el correo', await processMessage(CRIS, 'R. Baumgartner AG'), 'Correo')
check('pregunta tel. de oficina', await processMessage(CRIS, 'cris@baumgartner.ch'), 'oficina')
check('pregunta tel. privado', await processMessage(CRIS, '+41 62 000 00 00'), 'privado')
check('pregunta si es responsable', await processMessage(CRIS, '-'), 'responsable')
check('guarda y marca al responsable', await processMessage(CRIS, 'sí'),
  ['Contacto guardado', 'Cristian Amaya', '⭐', 'R. Baumgartner AG', 'cris@baumgartner.ch'])
const nuevo = (await buscarContactos('Cristian Amaya'))[0]
checkIgual('is_responsible = true', nuevo.is_responsible, true)
checkIgual('empresa guardada', nuevo.company, 'R. Baumgartner AG')
checkIgual('tel. oficina en phone', nuevo.phone, '+41 62 000 00 00')
checkIgual('privado vacío (saltado con "-")', nuevo.mobile, null)

console.log('\n5. "NUEVO CONTACTO: X" (solo nombre) TAMBIÉN ARRANCA EL FLUJO')
check('solo nombre → pregunta empresa', await processMessage(CRIS, 'nuevo contacto: Luis Pérez'),
  ['Luis Pérez', 'empresa'])
await processMessage(CRIS, 'Gipser AG')
await processMessage(CRIS, '-')
await processMessage(CRIS, '-')
await processMessage(CRIS, '079 111 22 33')
check('responsable "no" → sin estrella', await processMessage(CRIS, 'no'), ['Contacto guardado', 'Luis Pérez'])
const luis = (await buscarContactos('Luis Pérez'))[0]
checkIgual('no responsable', luis.is_responsible, false)
checkIgual('privado en mobile', luis.mobile, '079 111 22 33')

console.log('\n6. LISTAR CONTACTOS POR EMPRESA')
const lista = check('lista todos los de la empresa', await processMessage(CRIS, 'contactos de R. Baumgartner AG'),
  ['Contactos de', 'Cristian Amaya', 'Reto Baumgartner'])
checkIgual('el responsable va primero', lista.indexOf('Cristian Amaya') < lista.indexOf('Reto Baumgartner'), true)
check('empresa sin contactos lo dice', await processMessage(CRIS, 'contactos de Inexistente SA'), 'No hay contactos')

await pool.end()
console.log(fallos === 0 ? '\n✅ todas las pruebas de contactos pasan\n' : `\n❌ ${fallos} fallo(s)\n`)
process.exit(fallos === 0 ? 0 : 1)
