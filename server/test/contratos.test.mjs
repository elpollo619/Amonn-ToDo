// Pruebas del generador de contratos: el parseo y la plantilla, que son
// puras. La llamada real a Google no se prueba aquí (no hay credenciales);
// por eso generarContrato avisa de mirar la respuesta cruda la primera vez.
import { parseContrato, camposDePlantilla, contratosConfigurados } from '../src/contratos.js'

const HOY = '2026-09-03'
let fallos = 0
const eq = (nombre, real, esperado) => {
  const ok = JSON.stringify(real) === JSON.stringify(esperado)
  if (!ok) { fallos++; console.log(`  ✘ ${nombre}\n      obtenido: ${JSON.stringify(real)}\n      esperado: ${JSON.stringify(esperado)}`) }
  else console.log(`  ✔ ${nombre}`)
}

console.log('\n1. SACAR LOS DATOS DE LA FRASE')
const c = parseContrato('Max Muster, habitación 204, 850, desde el 1 de octubre', HOY, 'es')
eq('nombre', c.nombre, 'Max Muster')
eq('habitación', c.habitacion, '204')
eq('alquiler', c.alquiler, '850')
eq('desde', c.desde, '2026-10-01')
eq('no falta nada', c.faltan, [])

const d = parseContrato('Max Muster, Zimmer 204, CHF 850.50, 1.10', HOY, 'de')
eq('Zimmer también vale', d.habitacion, '204')
eq('CHF y céntimos', d.alquiler, '850.50')
eq('fecha alemana 1.10', d.desde, '2026-10-01')

console.log('\n2. LA HABITACIÓN EXIGE SU PALABRA (204 y 850 son ambos números)')
const e = parseContrato('Max Muster, 204, 850', HOY, 'es')
eq('sin la palabra habitación, falta', e.faltan.includes('habitacion'), true)
eq('y solo UN número se toma como alquiler', e.alquiler, '204')

console.log('\n3. LO QUE FALTA SE DICE')
const f = parseContrato('Max Muster', HOY, 'es')
eq('faltan tres cosas', f.faltan, ['habitacion', 'alquiler', 'desde'])

console.log('\n4. LOS HUECOS SON LOS MERGEFIELD DE LA EMPRESA')
const campos = camposDePlantilla(
  { nombre: 'Max Muster', habitacion: '204', alquiler: '850', desde: '2026-10-01' }, HOY)
eq('nombre de pila → M1VName', campos['{{M1VName}}'], 'Max')
eq('apellido → M1Name', campos['{{M1Name}}'], 'Muster')
eq('el objeto se escribe como en sus contratos', campos['{{Objekt}}'], 'Zimmer Nr. 204')
eq('inicio en formato suizo → Mbeginn', campos['{{Mbeginn}}'], '01.10.2026')
eq('fecha del día → Datum', campos['{{Datum}}'], '03.09.2026')
eq('fianza por defecto 500 (práctica Longstay)', campos['{{Depot}}'], '500')
const conKaution = camposDePlantilla(
  { nombre: 'Max Muster', habitacion: '204', alquiler: '850', desde: '2026-10-01', deposito: '300' }, HOY)
eq('la fianza dicha manda', conKaution['{{Depot}}'], '300')

console.log('\n4b. LA FIANZA SE ENTIENDE EN LA FRASE')
const g = parseContrato('Max Muster, habitación 204, 850, desde el 1 de octubre, kaution 300', HOY, 'es')
eq('kaution 300', g.deposito, '300')

console.log('\n5. SIN CREDENCIALES, DESACTIVADO')
eq('no configurado por defecto', contratosConfigurados(), false)

console.log(fallos === 0 ? '\n✅ todas las pruebas de contratos pasan' : `\n❌ ${fallos} fallos`)
process.exit(fallos === 0 ? 0 : 1)
