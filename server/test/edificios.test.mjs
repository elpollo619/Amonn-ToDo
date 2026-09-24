// Pruebas de la deducción de edificio y dirección para los contratos.
//
// La mitad de estas pruebas vigilan que el asistente NO INVENTE una dirección.
// Un contrato con la finca equivocada se firma sin que nadie lo note; uno con
// el hueco visible, no. Por eso «no sé» es una respuesta correcta aquí, y hay
// pruebas que lo exigen.
//
// Necesita base de datos: usa la tabla mietvertraege (los 222 contratos
// importados del Excel maestro).
import { initDb, query, pool } from '../src/db.js'
import {
  direccionDeEdificio, listarEdificios, edificioEnTexto, edificioDeHabitacion,
  formatDireccion, habitacionOcupada, resolverEdificio,
  registrarContrato, contratosGenerados, contratoRepetido, formatContratoGenerado,
} from '../src/edificios.js'
import { camposDePlantilla } from '../src/contratos.js'

let fallos = 0
const check = (nombre, ok, detalle = '') => {
  if (ok) console.log(`  ✔ ${nombre}`)
  else { fallos++; console.log(`  ✘ ${nombre}${detalle ? `\n      ${detalle}` : ''}`) }
}

await initDb()

// Un puñado de contratos de mentira, con la misma forma que los de verdad:
// dos edificios que comparten el número de habitación (el caso que obliga a
// preguntar) y uno con dos direcciones (el caso «A12» real).
await query(`delete from mietvertraege where objgrp in ('TEST1','TEST2','TESTAMB')`)
const mete = (grp, code, adr, ort, objekt, vname, name) => query(
  `insert into mietvertraege (objgrp, objcode, objadr, objort, objekt, m1vname, m1name, total, imported_at)
   values ($1,$2,$3,$4,$5,$6,$7, 900, now())`,
  [grp, code, adr, ort, objekt, vname, name],
)
for (let i = 0; i < 4; i++) await mete('TEST1', `T1-0${i}`, 'Teststrasse 1', '3000 Bern', `Zimmer Nr. ${i}`, 'Ana', `Uno${i}`)
for (let i = 0; i < 4; i++) await mete('TEST2', `T2-0${i}`, 'Probeweg 22', '3053 Testort', `Zimmer Nr. ${i}`, 'Beto', `Dos${i}`)
// TESTAMB: cuatro contratos en una dirección y tres en otra → no está claro.
for (let i = 0; i < 4; i++) await mete('TESTAMB', `TA-0${i}`, 'Zweifelgasse 5', '3000 Bern', `Zimmer ${i}`, 'C', `Tres${i}`)
for (let i = 0; i < 3; i++) await mete('TESTAMB', `TA-1${i}`, 'Zweifelgasse 5a', '3000 Bern', `Zimmer 1${i}`, 'D', `Cuatro${i}`)

console.log('\n1. LA DIRECCIÓN SALE DE LOS CONTRATOS REALES, NO DE UNA LISTA A MANO')
const d1 = await direccionDeEdificio('TEST1')
check('encuentra la dirección del edificio', formatDireccion(d1) === 'Teststrasse 1, 3000 Bern', `obtuvo: ${formatDireccion(d1)}`)
check('y la da por segura', d1.seguro === true)
check('no inventa edificios que no existen', (await direccionDeEdificio('NOEXISTE')) === null)
check('un código vacío no devuelve nada', (await direccionDeEdificio('')) === null)

console.log('\n2. CUANDO UN EDIFICIO TIENE DOS DIRECCIONES, NO ELIGE A CIEGAS')
const amb = await direccionDeEdificio('TESTAMB')
check('avisa de que no está seguro', amb.seguro === false, `seguro=${amb.seguro}`)
check('y ofrece la otra dirección', amb.alternativas.some((a) => a.adr === 'Zweifelgasse 5a'))

console.log('\n3. RECONOCE EL EDIFICIO EN LA FRASE')
check('por código', formatDireccion(await edificioEnTexto('contrato para Max, TEST1 habitación 3, 850')) === 'Teststrasse 1, 3000 Bern')
check('por calle', formatDireccion(await edificioEnTexto('para Anna en Probeweg 22')) === 'Probeweg 22, 3053 Testort')
check('por calle sin número', formatDireccion(await edificioEnTexto('en Teststrasse')) === 'Teststrasse 1, 3000 Bern')
check('si no se nombra ninguno, no se inventa', (await edificioEnTexto('contrato para Juan, habitación 3')) === null)

console.log('\n4. EL NÚMERO DE HABITACIÓN SOLO NO BASTA (ni debe bastar)')
const porNumero = await edificioDeHabitacion('3')
check('detecta que el número está en varios edificios', porNumero.ambiguo === true, JSON.stringify(porNumero).slice(0, 120))
check('un número que no existe se dice, no se adivina', (await edificioDeHabitacion('99999')).encontrado === false)

console.log('\n5. RESOLVER: preguntar antes que acertar por casualidad')
const sinEdificio = await resolverEdificio('contrato para Juan, habitación 3, 850')
check('sin edificio en la frase, manda preguntar', sinEdificio.preguntar === true && sinEdificio.motivo === 'sin_edificio')
check('y ofrece la lista de edificios', Array.isArray(sinEdificio.opciones) && sinEdificio.opciones.length > 0)
const conEdificio = await resolverEdificio('contrato para Juan, TEST2, habitación 3, 850')
check('con edificio claro, NO pregunta', conEdificio.preguntar === false)
check('y devuelve la dirección lista para el contrato', conEdificio.direccion === 'Probeweg 22, 3053 Testort')
const dudoso = await resolverEdificio('contrato para Juan, TESTAMB, habitación 3, 850')
check('con edificio dudoso, pregunta cuál', dudoso.preguntar === true && dudoso.motivo === 'ambiguo')

console.log('\n6. AVISO DE HABITACIÓN YA OCUPADA')
const ocup = await habitacionOcupada('TEST1', '2')
check('encuentra el contrato que ya existe', Boolean(ocup) && ocup.inquilino.includes('Uno2'), JSON.stringify(ocup))
check('no avisa de una habitación libre', (await habitacionOcupada('TEST1', '77')) === null)
check('sin edificio no se inventa un aviso', (await habitacionOcupada('', '2')) === null)

console.log('\n7. EL CONTRATO LLEVA LA FINCA')
const campos = camposDePlantilla(
  { nombre: 'Max Muster', habitacion: '3', alquiler: '850', desde: '2026-10-01', direccion: 'Probeweg 22, 3053 Testort' },
  '2026-09-24',
)
check('la dirección va al hueco de la plantilla', campos['{{Liegenschaft}}'] === 'Probeweg 22, 3053 Testort')
const sinDir = camposDePlantilla({ nombre: 'Max Muster', habitacion: '3', alquiler: '850', desde: '2026-10-01' }, '2026-09-24')
check('sin dirección, deja un aviso VISIBLE (no un hueco en blanco)', /A RELLENAR/.test(sinDir['{{Liegenschaft}}']), sinDir['{{Liegenschaft}}'])

console.log('\n8. QUEDA CONSTANCIA DE LOS CONTRATOS GENERADOS')
await query(`delete from contratos_generados where nombre like 'ZZTest%'`)
check('al principio no hay ninguno mío', (await contratosGenerados(50)).every((c) => !c.nombre.startsWith('ZZTest')))
const guardado = await registrarContrato({
  nombre: 'ZZTest Persona', habitacion: '3', edificio: 'TEST2',
  direccion: 'Probeweg 22, 3053 Testort', alquiler: '800', deposito: '500',
  desde: '2026-12-01', docId: 'doc-abc', docUrl: 'https://docs.google.com/document/d/doc-abc/edit',
})
check('se guarda con su edificio y su finca', guardado.edificio === 'TEST2' && guardado.direccion.includes('Probeweg'))
const lista = await contratosGenerados(5)
check('aparece en la lista', lista.some((c) => c.nombre === 'ZZTest Persona'))
check('el texto lleva nombre, habitación y enlace', (() => {
  const txt = formatContratoGenerado(lista.find((c) => c.nombre === 'ZZTest Persona'))
  return txt.includes('ZZTest Persona') && txt.includes('hab. 3') && txt.includes('docs.google.com')
})())

console.log('\n9. AVISA SI SE REPITE UN CONTRATO')
const rep = await contratoRepetido('ZZTest Persona', '3')
check('detecta el mismo nombre y habitación', Boolean(rep) && rep.doc_id === 'doc-abc')
check('no confunde otra habitación', (await contratoRepetido('ZZTest Persona', '9')) === null)
check('no confunde a otra persona', (await contratoRepetido('ZZOtra Persona', '3')) === null)
check('da igual mayúsculas o minúsculas', Boolean(await contratoRepetido('zztest persona', '3')))
await query(`delete from contratos_generados where nombre like 'ZZTest%'`)

await query(`delete from mietvertraege where objgrp in ('TEST1','TEST2','TESTAMB')`)
await pool.end()

console.log(fallos === 0 ? '\n✅ todas las pruebas de edificios pasan' : `\n❌ ${fallos} fallos`)
process.exit(fallos === 0 ? 0 : 1)
