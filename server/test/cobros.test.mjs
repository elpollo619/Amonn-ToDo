// Pruebas de la QR-Rechnung: referencia QRR, parseo de la frase y el PDF.
// Sin base y sin red: el IBAN es el QR-IBAN de PRUEBA oficial de la spec.
import { isQRReferenceValid } from 'swissqrbill/utils'
import { config } from '../src/config.js'
import { nuevaReferenciaQRR, parseFactura, pdfDeFactura, cobrosConfigurados } from '../src/cobros.js'

let fallos = 0
const eq = (nombre, real, esperado) => {
  const ok = JSON.stringify(real) === JSON.stringify(esperado)
  if (!ok) { fallos++; console.log(`  ✘ ${nombre}\n      obtenido: ${JSON.stringify(real)}\n      esperado: ${JSON.stringify(esperado)}`) }
  else console.log(`  ✔ ${nombre}`)
}

console.log('\n1. SIN IBAN, APAGADO')
eq('no configurado por defecto', cobrosConfigurados(), false)

console.log('\n2. LA REFERENCIA QRR')
const ref = nuevaReferenciaQRR()
eq('27 dígitos', ref.length, 27)
eq('empieza por la marca de la casa', ref.startsWith('909090'), true)
eq('el dígito de control cuadra (mod10)', isQRReferenceValid(ref), true)
eq('dos referencias no se repiten', nuevaReferenciaQRR() === nuevaReferenciaQRR(), false)

console.log('\n3. LA FRASE DE LA FACTURA')
const f = parseFactura('850 para Max Muster, alquiler octubre')
eq('importe', f.importe, 850)
eq('deudor', f.deudor, 'Max Muster, alquiler octubre')
eq('no falta nada', f.faltan, [])
eq('con céntimos', parseFactura('850.50 para Max').importe, 850.5)
eq('en alemán con für', parseFactura('rechnung 900 für Anna Beispiel').importe ? parseFactura('900 für Anna').deudor : null, 'Anna')
eq('sin destinatario se dice', parseFactura('850').faltan, ['para quién'])
eq('sin importe se dice', parseFactura('para Max').faltan.includes('importe'), true)

console.log('\n4. EL PDF SALE DE VERDAD (con el QR-IBAN de prueba de la spec)')
config.qr.iban = 'CH44 3199 9123 0008 8901 2'
const pdf = await pdfDeFactura({ importe: 850, mensaje: 'Miete Zimmer 204', referencia: nuevaReferenciaQRR() })
eq('es un PDF', pdf.slice(0, 5).toString(), '%PDF-')
eq('con contenido de verdad (más de 5 KB)', pdf.length > 5000, true)
config.qr.iban = ''

console.log(fallos === 0 ? '\n✅ todas las pruebas de cobros pasan' : `\n❌ ${fallos} fallos`)
process.exit(fallos === 0 ? 0 : 1)
