// ============================================================
// Mahnwesen: «mahnung a la A4-11.1» / «2. mahnung a Koubaa».
//
// Genera la carta de recordatorio de pago con el boletín QR del alquiler
// del contrato incluido — la combinación que de verdad recupera dinero:
// el inquilino recibe UNA hoja con el texto y el QR para pagar en el acto.
// El texto sigue la práctica de la empresa: recordatorio amable en la 1.ª,
// y en la 2.ª el recargo de CHF 50 que fijan sus contratos de vivienda
// (Art. «Schriftliche Mahnungen», según OR 257d).
//
// El PDF se guarda como una factura más (tabla qr_bills) y se descarga por
// su enlace; mandárselo al inquilino sigue siendo decisión de la persona.
// ============================================================
import PDFDocument from 'pdfkit'
import { SwissQRBill } from 'swissqrbill/pdf'
import crypto from 'node:crypto'
import { config } from './config.js'
import { query } from './db.js'
import { buscarVertraege } from './vertraege.js'

export const RECARGO_2A = 50 // CHF, según sus contratos

const TEXTOS = {
  1: (v, mes) => `Zahlungserinnerung

Sehr geehrte(r) ${[v.m1vname, v.m1name].filter(Boolean).join(' ')}

Gemäss unseren Unterlagen ist der Mietzins für ${v.objcode} (${v.objekt ?? ''}) für ${mes} in der Höhe von CHF ${v.total} noch offen. Wir bitten Sie, den Betrag innert 10 Tagen mit dem untenstehenden Einzahlungsschein zu begleichen.

Sollte sich Ihre Zahlung mit diesem Schreiben gekreuzt haben, betrachten Sie es bitte als gegenstandslos.

Freundliche Grüsse
${config.qr.nombre}`,
  2: (v, mes) => `2. Mahnung

Sehr geehrte(r) ${[v.m1vname, v.m1name].filter(Boolean).join(' ')}

Trotz unserer Zahlungserinnerung ist der Mietzins für ${v.objcode} (${v.objekt ?? ''}) für ${mes} in der Höhe von CHF ${v.total} weiterhin offen. Gemäss Mietvertrag verrechnen wir CHF ${RECARGO_2A}.– Mahngebühr; der Gesamtbetrag beläuft sich auf CHF ${Number(v.total) + RECARGO_2A}.

Wir setzen Ihnen eine letzte Frist von 10 Tagen. Bleibt die Zahlung aus, behalten wir uns die Schritte nach Art. 257d OR vor (Kündigungsandrohung).

Freundliche Grüsse
${config.qr.nombre}`,
}

/** Saca nivel (1|2) y a quién de «2. mahnung a koubaa». Puro. */
export function parseMahnung(texto) {
  const t = String(texto ?? '').trim()
  const nivel = /^2/.test(t) || /\b(?:2\.?\s*mahnung|segunda|zweite)\b/i.test(t) ? 2 : 1
  const m = t.match(/\b(?:a|an|para|fur|für)\s+(?:la\s+|el\s+|die\s+|der\s+)?(.+)$/i)
  return { nivel, que: m ? m[1].trim() : null }
}

/**
 * Genera la carta con QR y la guarda. Devuelve { token, contrato, importe }
 * o { error: 'no_encontrado' | 'ambiguo', candidatos } si no hay UN contrato.
 */
export async function crearMahnung({ que, nivel = 1, mes }) {
  const encontrados = await buscarVertraege(que, 3)
  if (encontrados.length === 0) return { error: 'no_encontrado' }
  if (encontrados.length > 1) return { error: 'ambiguo', candidatos: encontrados }
  const v = encontrados[0]
  if (!v.total) return { error: 'sin_importe' }
  const importe = Number(v.total) + (nivel === 2 ? RECARGO_2A : 0)

  const cuenta = config.qr.iban.replace(/\s+/g, '')
  const pdf = await new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margins: { top: 70, left: 60, right: 60, bottom: 20 } })
    const trozos = []
    doc.on('data', (c) => trozos.push(c))
    doc.on('end', () => resolve(Buffer.concat(trozos)))
    doc.on('error', reject)
    doc.fontSize(10).text(`${config.qr.nombre} · ${config.qr.direccion} · ${config.qr.zip} ${config.qr.ciudad}`)
    doc.moveDown(2).fontSize(11).text(TEXTOS[nivel](v, mes), { lineGap: 3 })
    new SwissQRBill({
      amount: importe, currency: 'CHF',
      creditor: {
        account: cuenta, name: config.qr.nombre, address: config.qr.direccion,
        zip: config.qr.zip, city: config.qr.ciudad, country: 'CH',
      },
      // El campo "Zahlbar durch" se deja abierto, como en sus boletines de
      // siempre: la dirección de la Liste no siempre es la postal del
      // inquilino y un dato malo invalida el QR.
      message: `${nivel}. Mahnung Miete ${v.objcode} ${mes}`.slice(0, 140),
    }).attachTo(doc)
    doc.end()
  })

  const token = crypto.randomBytes(16).toString('hex')
  await query(
    `insert into qr_bills (token, amount_cents, debtor, message, pdf)
     values ($1,$2,$3,$4,$5)`,
    [token, Math.round(importe * 100), [v.m1vname, v.m1name].filter(Boolean).join(' '),
      `${nivel}. Mahnung ${v.objcode} ${mes}`, pdf],
  )
  return { token, contrato: v, importe, nivel }
}
