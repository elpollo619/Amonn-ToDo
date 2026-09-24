// Pruebas del catálogo de documentos.
//
// Lo que más se vigila aquí: que añadir el contrato de parking NO cambie lo
// que ya funcionaba. El tipo por defecto sigue siendo el Longstay, porque es
// lo que el equipo escribe a diario y cambiar un comportamiento por defecto
// es la forma más rápida de romper algo sin enterarse.
import test from 'node:test'
import assert from 'node:assert/strict'
import { PLANTILLAS, tipoDeDocumento, unAnoMenosUnDia, partirNombre, suizo } from '../src/plantillas.js'
import { parseContrato } from '../src/contratos.js'
import { parseWithRules } from '../src/assistant.js'

const HOY = '2026-09-24'
const ctx = (lang = 'es') => ({ users: [], sender: '+41765683445', today: HOY, lang, openTasks: [] })

test('el tipo por defecto sigue siendo el de siempre', () => {
  assert.equal(tipoDeDocumento('Peter Muster, B22, habitación 3, 800'), 'longstay')
  assert.equal(tipoDeDocumento('Max Muster, habitación 204, 850'), 'longstay')
  assert.equal(tipoDeDocumento(''), 'longstay')
})

test('reconoce un contrato de aparcamiento, como lo escribe la gente', () => {
  for (const frase of [
    'Max Muster, A4, plaza 12, 90',
    'Anna Test, A4, Platz 12, 90',
    'Hans, AEP 15, 130',
    'Lena, Einstellhallenplatz 7, 120',
    'Otto, Abstellplatz 3, 80',
    'Eva, parking 9, 100',
  ]) {
    assert.equal(tipoDeDocumento(frase), 'garaje', `no detectó parking en: ${frase}`)
  }
})

test('«contrato de parking para X» no mete «parking» en el nombre', () => {
  const r = parseWithRules('contrato de parking para Max Muster, A4, plaza 12, 90, desde el 1 de noviembre', ctx())
  assert.equal(r.action, 'contrato_add')
  const datos = parseContrato(r.texto, HOY, 'es')
  assert.equal(datos.nombre, 'Max Muster', `el nombre salió como: ${datos.nombre}`)
  assert.equal(datos.habitacion, '12')
  assert.equal(datos.alquiler, '90')
})

test('la plaza conserva su nombre completo («AEP 15», no «AEP»)', () => {
  const d = parseContrato('Anna Beispiel, plaza AEP 15, 130, pauschal 20, desde el 1 de marzo', HOY, 'es')
  assert.equal(d.habitacion, 'AEP 15')
  assert.equal(d.pauschal, '20')
  assert.equal(d.alquiler, '130')
})

test('los gastos fijos se suman al total, no se piden dos veces', () => {
  const huecos = PLANTILLAS.garaje.huecos(
    { nombre: 'Anna Beispiel', habitacion: 'AEP 15', alquiler: '130', pauschal: '20', desde: '2026-03-01' },
    HOY,
  )
  assert.equal(huecos['{{Netto}}'], '130.00')
  assert.equal(huecos['{{Pauschal}}'], '20.00')
  assert.equal(huecos['{{Total}}'], '150.00', 'el total debe salir sumado solo')
})

test('sin gastos fijos, el total es el alquiler', () => {
  const h = PLANTILLAS.garaje.huecos({ nombre: 'Max Muster', habitacion: '12', alquiler: '90', desde: '2026-11-01' }, HOY)
  assert.equal(h['{{Pauschal}}'], '0.00')
  assert.equal(h['{{Total}}'], '90.00')
})

test('la primera fecha de rescisión se calcula: un año menos un día', () => {
  assert.equal(unAnoMenosUnDia('2026-03-01'), '2027-02-28')
  assert.equal(unAnoMenosUnDia('2026-01-01'), '2026-12-31')
  // Año bisiesto: del 01.03.2027 al 29.02.2028.
  assert.equal(unAnoMenosUnDia('2027-03-01'), '2028-02-29')
  assert.equal(unAnoMenosUnDia('cualquier cosa'), null)
})

test('lo que no se sabe se MARCA, no se deja en blanco', () => {
  const h = PLANTILLAS.garaje.huecos({ nombre: 'Max Muster', habitacion: '12', alquiler: '90', desde: '2026-11-01' }, HOY)
  // La dirección del inquilino no la sabe nadie todavía: tiene que verse.
  assert.match(h['{{MieterAdresse}}'], /A RELLENAR/)
  assert.match(h['{{MieterOrt}}'], /A RELLENAR/)
  assert.match(h['{{Liegenschaft}}'], /A RELLENAR/)
  // Y con dirección, se escribe.
  const h2 = PLANTILLAS.garaje.huecos(
    { nombre: 'Max Muster', habitacion: '12', alquiler: '90', desde: '2026-11-01', direccion: 'Allmendstrasse 4, 3210 Kerzers' },
    HOY,
  )
  assert.equal(h2['{{Liegenschaft}}'], 'Allmendstrasse 4, 3210 Kerzers')
})

test('el nombre se parte bien, tenga las palabras que tenga', () => {
  assert.deepEqual(partirNombre('Max Muster'), { pila: 'Max', apellido: 'Muster' })
  assert.deepEqual(partirNombre('Anna Maria De la Cruz'), { pila: 'Anna Maria De la', apellido: 'Cruz' })
  assert.deepEqual(partirNombre('Prince'), { pila: 'Prince', apellido: '' })
  assert.deepEqual(partirNombre(''), { pila: '', apellido: '' })
})

test('cada plantilla del catálogo está completa', () => {
  for (const [clave, p] of Object.entries(PLANTILLAS)) {
    assert.equal(p.clave, clave, `${clave}: la clave no coincide`)
    assert.ok(p.etiqueta, `${clave}: sin etiqueta`)
    assert.ok(p.docEnDrive, `${clave}: sin nombre de documento en Drive`)
    assert.equal(typeof p.nombreDoc, 'function', `${clave}: sin nombreDoc`)
    assert.equal(typeof p.huecos, 'function', `${clave}: sin huecos`)
    // Que no reviente con datos mínimos.
    const h = p.huecos({ nombre: 'X Y', habitacion: '1', alquiler: '1', desde: '2026-01-01' }, HOY)
    assert.ok(Object.keys(h).length > 3, `${clave}: devuelve muy pocos huecos`)
    assert.ok(Object.keys(h).every((k) => /^\{\{\w+\}\}$/.test(k)), `${clave}: hay huecos con forma rara`)
  }
})

test('el documento se nombra como manda la empresa', () => {
  assert.equal(PLANTILLAS.longstay.nombreDoc({ nombre: 'Max Muster' }), 'MV Max Muster')
  assert.equal(PLANTILLAS.garaje.nombreDoc({ nombre: 'Max Muster' }), 'MV Parkplatz Max Muster')
})

// ── Contrato de vivienda ───────────────────────────────────────────────────

test('reconoce un contrato de vivienda', () => {
  for (const f of ['Anna Test, I16, 3½-Zimmerwohnung EG, 1500', 'Eva, vivienda EG, 1200', 'Hans, Wohnung 2, 1400', 'Lena, piso 1, 1300']) {
    assert.equal(tipoDeDocumento(f), 'vivienda', `no detecto vivienda en: ${f}`)
  }
})

test('la vivienda gana al parking cuando se nombran los dos', () => {
  // «contrato de vivienda con plaza de garaje» es un contrato de vivienda.
  assert.equal(tipoDeDocumento('Anna, vivienda EG con plaza de garaje, 1500'), 'vivienda')
})

test('los importes salen en formato suizo, con apostrofo', () => {
  assert.equal(suizo(1500), '1\u2019500.00')
  assert.equal(suizo(1730), '1\u2019730.00')
  assert.equal(suizo(90), '90.00')
  assert.equal(suizo(5190), '5\u2019190.00')
  assert.equal(suizo('no es un numero'), '')
})

test('en vivienda se suman los gastos y la fianza son tres meses', () => {
  const h = PLANTILLAS.vivienda.huecos(
    { nombre: 'Anna Test', objeto: '3-Zimmerwohnung EG', alquiler: '1500', pauschal: '230', desde: '2025-10-01' },
    HOY,
  )
  assert.equal(h['{{Netto}}'], '1\u2019500.00')
  assert.equal(h['{{Nebenkosten}}'], '230.00')
  assert.equal(h['{{Total}}'], '1\u2019730.00', 'el total se suma solo')
  assert.equal(h['{{Depot}}'], '5\u2019190.00', 'la fianza por defecto son 3 meses del total')
})

test('la fianza dicha manda sobre la calculada', () => {
  const h = PLANTILLAS.vivienda.huecos(
    { nombre: 'Anna Test', alquiler: '1500', pauschal: '230', deposito: '4500', desde: '2025-10-01' },
    HOY,
  )
  assert.equal(h['{{Depot}}'], '4\u2019500.00')
})

test('el propietario NO se supone: se marca para rellenar', () => {
  // El arrendador no siempre es Hans Amonn AG; en I16 es otro propietario.
  const h = PLANTILLAS.vivienda.huecos({ nombre: 'Anna Test', alquiler: '1500', desde: '2025-10-01' }, HOY)
  assert.match(h['{{VermieterName}}'], /A RELLENAR/)
  assert.match(h['{{Nebenraeume}}'], /A RELLENAR/)
})
