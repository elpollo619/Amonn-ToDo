// ============================================================
// Registro de Spesen. Cada fila de aquí es una fila del Excel.
//
// Se guarda en la base y NO se escribe en el Spesen 2026.xlsx: ese fichero
// tiene fórmulas de totales por mes y trimestre, y lo abre gente. Escribir
// en él mientras alguien lo tiene abierto es la forma más rápida de perder
// trabajo sin que nadie se entere. Se exporta cuando toca cerrar el mes.
// ============================================================
import { query } from './db.js'
import { broadcast } from './events.js'
import { porKey, CATEGORIAS } from './spesen.js'

export async function addGasto({ code, spentOn, merchant = null, concept, amountCents, vat = null, category, personId = null, receiptPath = null, receiptName = null }) {
  const cat = porKey(category)
  const { rows } = await query(
    `insert into expenses (code, spent_on, merchant, concept, amount_cents, vat, category, account,
                           person_id, receipt_path, receipt_name)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning *`,
    [code, spentOn, merchant, concept, amountCents, vat, category, cat?.cuenta ?? null,
     personId, receiptPath, receiptName],
  )
  broadcast()
  return rows[0]
}

/** Gastos aún no exportados, con el nombre de quien los pagó. */
export async function gastosAbiertos(personId = null) {
  const { rows } = await query(
    `select e.*, u.full_name as person_name
       from expenses e
       left join users u on u.id = e.person_id
      where e.status = 'open' and ($1::uuid is null or e.person_id = $1::uuid)
      order by e.spent_on asc, e.created_at asc`,
    [personId],
  )
  return rows
}

/** Cuánto se le debe a cada persona ahora mismo. */
export async function saldos() {
  const { rows } = await query(
    `select u.full_name, count(*) as gastos, sum(e.amount_cents) as total_cents
       from expenses e join users u on u.id = e.person_id
      where e.status = 'open'
      group by u.full_name order by sum(e.amount_cents) desc`,
  )
  return rows
}

export const chf = (cents) => (cents / 100).toFixed(2)

/**
 * Las filas listas para pegar en el Excel, en el mismo orden de columnas que
 * el Spesen: Code · Datum · Bemerkung · Importe · Columna · Cuenta · IVA.
 * Se exporta en CSV para poder revisarlo antes de tocar el fichero bueno.
 */
export function exportarCsv(gastos) {
  const cab = ['Code', 'Datum', 'Bemerkung', 'Betrag CHF', 'Spalte', 'Konto', 'MwSt', 'Person', 'Beleg']
  const filas = gastos.map((g) => {
    const cat = porKey(g.category)
    const fecha = String(g.spent_on).slice(0, 10).split('-').reverse().join('/')
    return [
      g.code, fecha, g.concept, chf(g.amount_cents),
      cat?.col ?? '', g.account ?? '', g.vat ?? '', g.person_name ?? '', g.receipt_name ?? '',
    ]
  })
  const esc = (v) => {
    const s = String(v ?? '')
    return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [cab, ...filas].map((f) => f.map(esc).join(';')).join('\r\n') + '\r\n'
}

/** Marca como exportados los gastos que se acaban de pasar al Excel. */
export async function marcarExportados(ids) {
  if (!ids?.length) return 0
  const { rowCount } = await query(
    "update expenses set status = 'exported' where id = any($1::uuid[]) and status = 'open'",
    [ids],
  )
  broadcast()
  return rowCount
}

export { CATEGORIAS }
