// Pruebas del Spesen: catálogo, propuesta de columna y registro por WhatsApp.
import { initDb, query, pool } from '../src/db.js'
import { processMessage } from '../src/inbound.js'
import { CATEGORIAS, categoriasDe, porKey, proponerCategoria, nombreDeArchivo } from '../src/spesen.js'
import { gastosAbiertos, exportarCsv, chf } from '../src/gastos.js'
import { esTextoDeVerdad, leerRecibo } from '../src/recibo.js'

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

console.log('\n1. EL CATÁLOGO CUADRA CON EL EXCEL')
// Cuentas comprobadas contra Spesen 2026.xlsx.
checkIgual('URE Allg. es la 6100', porKey('ure_allg').cuenta, '6100')
checkIgual('Benzin es la 6210', porKey('benzin').cuenta, '6210')
checkIgual('A14 Hotel Material es la 6502', porKey('a14_material').cuenta, '6502')
checkIgual('Reinigung de B22 es la 422110', porKey('b22_reinigung').cuenta, '422110')
checkIgual('Reinigung de A4 es la 432110', porKey('a4_reinigung').cuenta, '432110')
checkIgual('B22 tiene ocho columnas', categoriasDe('B22').length, 8)
checkIgual('ninguna cuenta se repite dentro del mismo código',
  CATEGORIAS.filter((c) => c.codigos.includes('HAAG')).map((c) => c.cuenta).length,
  new Set(CATEGORIAS.filter((c) => c.codigos.includes('HAAG')).map((c) => c.cuenta)).size)

console.log('\n2. LA PROPUESTA DE COLUMNA')
// Casos reales sacados del histórico de 2026.
checkIgual('Migrolino Benzin → Benzin', porKey(proponerCategoria('Migrolino Benzin')).col, 'Benzin')
checkIgual('IKEA Einrichtung A14 → A14 Hotel Material', porKey(proponerCategoria('IKEA Einrichtung A14')).col, 'A14 Hotel Material')
checkIgual('Office World Stift → Büro', porKey(proponerCategoria('Office World Stift')).col, 'Büro')
checkIgual('Que Rico Essen → Essen', porKey(proponerCategoria('Que Rico Essen')).col, 'Essen')
checkIgual('la limpieza cambia de cuenta según el edificio',
  porKey(proponerCategoria('Migros Putzmittel', 'B22')).cuenta, '422110')
checkIgual('lo desconocido no se inventa', proponerCategoria('Chuzo Cosa Rara'), null)

console.log('\n3. EL NOMBRE DEL RECIBO SIGUE LA CONVENCIÓN DE LA CASA')
checkIgual('como «HAAG 250429 Coop Blau Kraft.pdf»',
  nombreDeArchivo({ codigo: 'HAAG', fecha: '2025-04-29', concepto: 'Coop Blau Kraft' }),
  'HAAG 250429 Coop Blau Kraft.pdf')

console.log('\n4. UN RECIBO ESCANEADO NO SE INVENTA')
checkIgual('la basura binaria no cuela', esTextoDeVerdad('3=MqóüM:i"?kzÄ]ÚÓ]éó$/ASP5{Gßoq6'), false)
checkIgual('un recibo de verdad sí', esTextoDeVerdad('Coop Muri\nTotal CHF 37.90\nMwSt 8.1 %\n02.09.2026 vielen Dank'), true)
const r = leerRecibo('Coop Muri\nTotal CHF 37.90\nMwSt 8.1 %\n02.09.2026')
checkIgual('saca el comercio', r.comercio, 'Coop')
checkIgual('saca el importe', r.importe, 37.90)
checkIgual('saca el IVA', r.iva, '8.1')

console.log('\n5. APUNTARLO POR WHATSAPP')
await initDb()
for (const t of ['expenses','contacts','appointments','shopping_items','attachments','comments','subtasks','aliases','wa_conversations','tasks']) await query(`delete from ${t}`)
await query('delete from users')
await query(`insert into users (email, password_hash, full_name, phone, language)
  values ('cris@x.com','x','Cristian Amaya',$1,'es')`, [CRIS])

check('"gasto 37.90 Landi Kabelbinder"', await processMessage(CRIS, 'gasto 37.90 Landi Kabelbinder'),
  ['Gasto apuntado', 'HAAG', '37.90', 'URE Allg.', '6100'])
check('propone otras columnas por si falla', await processMessage(CRIS, 'gasto 12.60 Bigler'), ['¿Va bien la columna?'])
check('con código de edificio', await processMessage(CRIS, 'gasto B22 9.45 Migros Putzmittel'),
  ['B22', 'Reinigung', '422110'])
check('sin importe pregunta', await processMessage(CRIS, 'gasto Landi cosas'), '¿Cuánto fue?')
const abiertos = await gastosAbiertos()
checkIgual('quedan tres gastos apuntados', abiertos.length, 3)
check('el resumen suma bien', await processMessage(CRIS, 'qué se me debe'), ['Gastos pendientes', 'Total: CHF 59.95'])

console.log('\n6. EXPORTAR PARA EL EXCEL')
const csv = exportarCsv(await gastosAbiertos())
check('lleva las columnas del Spesen', csv, ['Code;Datum;Bemerkung;Betrag CHF;Spalte;Konto;MwSt'])
check('y las filas con su cuenta', csv, ['HAAG', 'Landi Kabelbinder', '37.90', '6100'])
checkIgual('una cabecera y tres filas', csv.trim().split('\r\n').length, 4)

await pool.end()
console.log(fallos === 0 ? '\n✅ todas las pruebas de Spesen pasan\n' : `\n❌ ${fallos} fallo(s)\n`)
process.exit(fallos === 0 ? 0 : 1)
