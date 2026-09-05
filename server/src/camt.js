// ============================================================
// Lector de extractos bancarios suizos (ISO 20022: camt.053 diario,
// camt.054 avisos) y conciliación de cobros.
//
// El fichero se descarga del e-banking y se manda al asistente por
// WhatsApp (solo autorizados: es el extracto de la empresa). El asistente
// contesta quién pagó qué:
//   1.º por la referencia QRR de nuestras facturas (certeza),
//   2.º por el nombre del pagador contra la Liste de contratos (pista).
//
// El parser es propio y a regex: los paquetes camt de npm están muertos
// (medido en la investigación del 05.09.2026) y el esquema es estable. Se
// prueba con un extracto de ejemplo en test/camt.test.mjs; con el primer
// fichero REAL del banco, mirar qué no casa y ajustar — regla de la casa.
// ============================================================
import crypto from 'node:crypto'
import { query } from './db.js'

/** ¿Este fichero parece un camt? Barato y sin lanzar. */
export function esCamt(buffer, mime = '') {
  const inicio = buffer.slice(0, 2000).toString('utf8')
  if (!inicio.trimStart().startsWith('<')) return false
  return /camt\.05[34]|BkToCstmrStmt|BkToCstmrDbtCdtNtfctn/.test(inicio)
}

const tag = (s, name) => s.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`))?.[1] ?? null
const tags = (s, name) => [...s.matchAll(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'g'))].map((m) => m[1])
const limpio = (x) => (x === null ? null : String(x).replace(/\s+/g, ' ').trim())

function leerImporte(s) {
  const m = s?.match(/<Amt\s+Ccy="([A-Z]{3})">([\d.]+)<\/Amt>/)
  return m ? { moneda: m[1], importe: Number(m[2]) } : null
}

/**
 * Saca las entradas del XML. Un <Ntry> puede agrupar varios pagos (lote):
 * si trae <TxDtls>, cada uno es una entrada; si no, el propio Ntry.
 */
export function parseCamt(xml) {
  const s = String(xml ?? '')
  const iban = limpio(tag(tag(s, 'Acct') ?? '', 'IBAN'))
  const entradas = []
  for (const ntry of tags(s, 'Ntry')) {
    const tipoNtry = limpio(tag(ntry, 'CdtDbtInd'))
    const fecha = limpio(tag(tag(ntry, 'BookgDt') ?? '', 'Dt'))?.slice(0, 10) ?? null
    const detalles = tags(ntry, 'TxDtls')
    const trozos = detalles.length ? detalles : [ntry]
    for (const tx of trozos) {
      const amt = leerImporte(tx) ?? leerImporte(ntry)
      if (!amt) continue
      const refInf = tag(tx, 'CdtrRefInf')
      entradas.push({
        tipo: limpio(tag(tx, 'CdtDbtInd')) ?? tipoNtry ?? 'CRDT',
        importe: amt.importe,
        moneda: amt.moneda,
        fecha,
        referencia: limpio(refInf ? tag(refInf, 'Ref') : null),
        quien: limpio(tag(tag(tx, 'Dbtr') ?? '', 'Nm')),
        info: limpio(tag(tx, 'Ustrd')),
      })
    }
  }
  return { iban, entradas }
}

const hashEntrada = (e) =>
  crypto.createHash('sha256')
    .update([e.fecha, e.importe, e.tipo, e.referencia ?? '', e.quien ?? ''].join('|'))
    .digest('hex')

/**
 * Concilia los ABONOS del extracto: marca facturas QR pagadas (por
 * referencia), sugiere el contrato por nombre del pagador, y recuerda cada
 * entrada en bank_entries para no contarla dos veces si reenvían el fichero.
 */
export async function conciliarPagos(entradas) {
  const resumen = { creditos: 0, totalChf: 0, facturas: [], contratos: [], desconocidos: [], repetidos: 0 }
  for (const e of entradas) {
    if (e.tipo !== 'CRDT') continue
    const { rowCount } = await query(
      'insert into bank_entries (id, booked_on, amount_cents, reference, payer) values ($1,$2,$3,$4,$5) on conflict (id) do nothing',
      [hashEntrada(e), e.fecha, Math.round(e.importe * 100), e.referencia, e.quien],
    )
    if (rowCount === 0) { resumen.repetidos++; continue }
    resumen.creditos++
    resumen.totalChf += e.importe

    // 1.º la referencia QRR: certeza.
    if (e.referencia) {
      const { rows } = await query(
        `update qr_bills set paid_at = now()
          where replace(reference, ' ', '') = replace($1, ' ', '') and paid_at is null
          returning debtor, amount_cents`,
        [e.referencia],
      )
      if (rows.length) {
        resumen.facturas.push({ ...e, factura: rows[0] })
        continue
      }
    }
    // 2.º el nombre del pagador contra la Liste: pista, no certeza.
    if (e.quien) {
      const { rows } = await query(
        `select objcode, m1vname, m1name, total from mietvertraege
          where length(m1name) >= 4 and $1 ilike '%' || m1name || '%'
          limit 1`,
        [e.quien],
      )
      if (rows.length) {
        resumen.contratos.push({ ...e, contrato: rows[0] })
        continue
      }
    }
    resumen.desconocidos.push(e)
  }
  return resumen
}
