// ============================================================
// QR-Rechnung: «factura 850 para Max Muster, habitación 204» → PDF con
// el boletín QR suizo listo para mandar o imprimir.
//
// Librería: swissqrbill (MIT, el estándar de facto en Node, spec SIX v2.3).
// El PDF vive en la base (tabla qr_bills, como los CSV del cierre) y se
// descarga en /factura/{token}.pdf: sobrevive a que Watchtower recree el
// contenedor.
//
// Con un QR-IBAN (IID 30000–31999) la factura lleva referencia QRR: ese
// número identifica el cobro en el extracto del banco — es la pieza que
// luego permite conciliar pagos automáticamente. Con un IBAN normal va sin
// referencia (tipo NON), que también es válido.
//
// Sin QR_IBAN configurado, la orden explica qué falta. El IBAN se pone UNA
// vez en el compose del NAS tras confirmarlo con Cris: facturar con la
// cuenta equivocada manda el dinero de 500 contratos al sitio equivocado.
// ============================================================
import crypto from 'node:crypto'
import PDFDocument from 'pdfkit'
import { SwissQRBill } from 'swissqrbill/pdf'
import { isQRIBAN, isIBANValid, calculateQRReferenceChecksum } from 'swissqrbill/utils'
import { config } from './config.js'
import { query } from './db.js'

export function cobrosConfigurados() {
  return Boolean(config.qr.iban)
}

/**
 * Referencia QRR nueva: 26 dígitos + dígito de control (mod10 recursivo).
 * Los primeros 6 son fijos ("909090") para reconocer a simple vista las
 * referencias creadas por el asistente; el resto es aleatorio.
 */
export function nuevaReferenciaQRR() {
  const cuerpo = '909090' + Array.from(crypto.randomBytes(20), (b) => b % 10).join('').slice(0, 20)
  return cuerpo + String(calculateQRReferenceChecksum(cuerpo))
}

/** Saca importe, deudor y concepto de «850 para Max Muster, habitación 204». */
export function parseFactura(texto) {
  const t = String(texto ?? '').trim()
  const imp = t.match(/(\d{1,6})(?:[.,](\d{2}))?/)
  const importe = imp ? Number(`${imp[1]}.${imp[2] ?? '00'}`) : null
  const para = t.match(/\b(?:para|fur|für|an|a)\s+(.+)$/i)
  const deudor = para ? para[1].trim() : null
  return { importe, deudor, faltan: [!importe && 'importe', !deudor && 'para quién'].filter(Boolean) }
}

/** El PDF del boletín, en memoria. Puro salvo por la config del acreedor. */
export async function pdfDeFactura({ importe, mensaje, referencia }) {
  const cuenta = config.qr.iban.replace(/\s+/g, '')
  if (!isIBANValid(cuenta)) throw new Error('el QR_IBAN configurado no pasa la validación')
  const data = {
    amount: importe,
    currency: 'CHF',
    creditor: {
      account: cuenta,
      name: config.qr.nombre,
      address: config.qr.direccion,
      zip: config.qr.zip,
      city: config.qr.ciudad,
      country: 'CH',
    },
    // QR-IBAN exige referencia QRR; IBAN normal va sin referencia.
    ...(isQRIBAN(cuenta) ? { reference: referencia } : {}),
    ...(mensaje ? { message: String(mensaje).slice(0, 140) } : {}),
  }
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4' })
    const trozos = []
    doc.on('data', (c) => trozos.push(c))
    doc.on('end', () => resolve(Buffer.concat(trozos)))
    doc.on('error', reject)
    // La parte alta de la hoja lleva un encabezado mínimo; el boletín QR
    // ocupa el tercio inferior, como manda la norma.
    doc.fontSize(14).text(config.qr.nombre, 50, 60)
    doc.fontSize(10).text(`${config.qr.direccion} · ${config.qr.zip} ${config.qr.ciudad}`)
    if (mensaje) doc.moveDown().fontSize(12).text(String(mensaje))
    new SwissQRBill(data).attachTo(doc)
    doc.end()
  })
}

/** Genera, guarda y devuelve la factura con su token de descarga. */
export async function crearFactura({ importe, deudor = null, mensaje = null }) {
  const cuenta = config.qr.iban.replace(/\s+/g, '')
  const referencia = isQRIBAN(cuenta) ? nuevaReferenciaQRR() : null
  const pdf = await pdfDeFactura({ importe, mensaje, referencia })
  const token = crypto.randomBytes(16).toString('hex')
  const { rows } = await query(
    `insert into qr_bills (token, amount_cents, debtor, message, reference, pdf)
     values ($1,$2,$3,$4,$5,$6) returning id, token, created_at`,
    [token, Math.round(importe * 100), deudor, mensaje, referencia, pdf],
  )
  return { ...rows[0], referencia, importe }
}

/** Una factura por su token, para la ruta de descarga. */
export async function facturaPorToken(token) {
  const { rows } = await query('select * from qr_bills where token = $1', [token])
  return rows[0] ?? null
}
