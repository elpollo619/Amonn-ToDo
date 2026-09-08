// ============================================================
// Registro de Spesen. Cada fila de aquí es una fila del Excel.
//
// Se guarda en la base y NO se escribe en el Spesen 2026.xlsx: ese fichero
// tiene fórmulas de totales por mes y trimestre, y lo abre gente. Escribir
// en él mientras alguien lo tiene abierto es la forma más rápida de perder
// trabajo sin que nadie se entere. Se exporta cuando toca cerrar el mes.
// ============================================================
import crypto from 'node:crypto'
import { query } from './db.js'
import { broadcast } from './events.js'
import { porKey, CATEGORIAS } from './spesen.js'

export async function addGasto({ code, spentOn, merchant = null, concept, amountCents, vat = null, category, personId = null, receiptPath = null, receiptName = null, km = null }) {
  const cat = porKey(category)
  const { rows } = await query(
    `insert into expenses (code, spent_on, merchant, concept, amount_cents, vat, category, account,
                           person_id, receipt_path, receipt_name, km)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) returning *`,
    [code, spentOn, merchant, concept, amountCents, vat, category, cat?.cuenta ?? null,
     personId, receiptPath, receiptName, km],
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

/** Gastos abiertos de un mes concreto ('2026-08'), de todo el equipo. */
export async function gastosDeMes(month) {
  const { rows } = await query(
    `select e.*, u.full_name as person_name
       from expenses e
       left join users u on u.id = e.person_id
      where e.status = 'open' and to_char(e.spent_on, 'YYYY-MM') = $1
      order by e.spent_on asc, e.created_at asc`,
    [month],
  )
  return rows
}

/**
 * Cierra el mes: genera el CSV, lo guarda en la base con un token de
 * descarga y marca los gastos como exportados. Devuelve el cierre, o null
 * si ese mes no tenía nada abierto. El CSV se descarga en
 * /spesen/{token}.csv y desde ahí se pega en el Spesen 2026.xlsx a mano:
 * en el fichero bueno no se escribe (tiene fórmulas y lo abre gente).
 */
export async function cerrarMes(month) {
  const abiertos = await gastosDeMes(month)
  if (abiertos.length === 0) return null
  const csv = exportarCsv(abiertos)
  const token = crypto.randomBytes(16).toString('hex')
  const total = abiertos.reduce((n, g) => n + g.amount_cents, 0)
  const { rows } = await query(
    `insert into expense_exports (month, token, csv, gastos, total_cents)
     values ($1,$2,$3,$4,$5) returning *`,
    [month, token, csv, abiertos.length, total],
  )
  await marcarExportados(abiertos.map((g) => g.id))
  return { ...rows[0], lineas: abiertos }
}

/** Un cierre por su token de descarga, o null. */
export async function exportPorToken(token) {
  const { rows } = await query(
    'select * from expense_exports where token = $1',
    [token],
  )
  return rows[0] ?? null
}

/**
 * Vorsteuer (IVA soportado) de un trimestre, por tipo. La base para el
 * borrador de la declaración de MwSt: los Spesen ya guardan su tipo
 * (8.1 normal, 2.6 reducido) y el importe es bruto, así que el IVA
 * incluido es bruto × t / (100 + t).
 */
export async function vorsteuerTrimestre(anno, q) {
  const desde = `${anno}-${String((q - 1) * 3 + 1).padStart(2, '0')}-01`
  const hasta = q === 4 ? `${anno + 1}-01-01` : `${anno}-${String(q * 3 + 1).padStart(2, '0')}-01`
  const { rows } = await query(
    `select coalesce(vat, 'ohne') as vat, count(*)::int as gastos, sum(amount_cents)::bigint as bruto_cents
       from expenses
      where spent_on >= $1 and spent_on < $2
      group by coalesce(vat, 'ohne') order by vat`,
    [desde, hasta],
  )
  return rows.map((r) => {
    const t = Number(r.vat)
    const bruto = Number(r.bruto_cents)
    return {
      vat: r.vat, gastos: r.gastos, brutoCents: bruto,
      vorsteuerCents: Number.isFinite(t) && t > 0 ? Math.round(bruto * t / (100 + t)) : 0,
    }
  })
}

// ─── Kilometraje ─────────────────────────────────────────────
// «120 km a Gampelen» no es una cosa aparte: es una fila del Spesen en la
// columna URE FZ (cuenta 6200), que es donde la empresa lleva ya el coche.
// Así hereda sin trabajo el cierre de mes, el CSV y los saldos.
//
// La tarifa NO se fija aquí a fuego: va en KM_RAPPEN (rappen por kilómetro)
// porque es una decisión de la empresa, no del programa. 70 rp/km es la
// tarifa habitual en Suiza y sirve de valor por defecto.
export const kmRappen = () => {
  const n = Number(process.env.KM_RAPPEN)
  return Number.isFinite(n) && n > 0 ? n : 70
}

export async function addKilometraje({ km, destino = null, code = 'HAAG', spentOn, personId = null }) {
  const rappen = kmRappen()
  const kms = Math.round(Number(km) * 10) / 10
  const concepto = destino ? `${kms} km ${destino}` : `${kms} km`
  const g = await addGasto({
    code, spentOn, concept: concepto,
    amountCents: Math.round(kms * rappen),
    category: 'ure_fz', personId, km: kms,
  })
  // km viene de la base como numeric(7,1) («120.0»): se devuelve el número.
  return { ...g, km: kms, rappen }
}

/** Kilómetros y francos de un periodo. `personId` null = toda la empresa. */
export async function kmResumen({ desde, hasta, personId = null }) {
  const { rows } = await query(
    `select count(*)::int as viajes,
            coalesce(sum(km), 0)::numeric      as km,
            coalesce(sum(amount_cents), 0)::int as total_cents
       from expenses
      where km is not null and spent_on between $1 and $2
        and ($3::uuid is null or person_id = $3::uuid)`,
    [desde, hasta, personId],
  )
  return { ...rows[0], km: Number(rows[0].km) }
}

/**
 * «¿Cuánto gastamos en IKEA este año?». Busca el texto en el comercio Y en
 * el concepto: hoy casi todos los gastos entran por WhatsApp con el comercio
 * dentro del concepto («37.90 Landi Kabelbinder») y merchant vacío.
 */
export async function gastoPorComercio(texto, { desde, hasta }) {
  const { rows } = await query(
    `select count(*)::int as n, coalesce(sum(amount_cents), 0)::int as total_cents
       from expenses
      where spent_on between $2 and $3
        and (coalesce(merchant, '') ilike '%' || $1 || '%'
             or concept ilike '%' || $1 || '%')`,
    [texto, desde, hasta],
  )
  const { rows: ult } = await query(
    `select spent_on, concept, amount_cents from expenses
      where spent_on between $2 and $3
        and (coalesce(merchant, '') ilike '%' || $1 || '%'
             or concept ilike '%' || $1 || '%')
      order by spent_on desc limit 5`,
    [texto, desde, hasta],
  )
  return { ...rows[0], ultimos: ult }
}

export { CATEGORIAS }
