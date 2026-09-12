// ============================================================
// Consulta de contratos de alquiler: «¿qué contrato tiene la 204?»,
// «alquileres de B22».
//
// Los datos son una FOTO de la hoja «Liste aktuell» del Excel maestro
// (~220 contratos activos), importada a la tabla mietvertraege. El Excel
// sigue siendo la fuente de verdad; aquí solo se consulta. La fecha de la
// foto (imported_at) se enseña siempre: nadie debe tomar por fresco un
// dato de hace meses.
// ============================================================
import crypto from 'node:crypto'
import { query } from './db.js'

/** Contratos que casan con una unidad o un nombre («204», «A4-11», «Koubaa»). */
export async function buscarVertraege(q, limite = 5) {
  const patron = `%${String(q ?? '').trim()}%`
  const { rows } = await query(
    `select *, (select max(imported_at) from mietvertraege) as foto
       from mietvertraege
      where objcode ilike $1
         or objekt ilike $1
         or (m1vname || ' ' || m1name) ilike $1
         or m1name ilike $1
      order by objcode asc
      limit $2`,
    [patron, limite],
  )
  return rows
}

/** Suma de alquileres por edificio, o de toda la casa. */
export async function sumaAlquileres(grupo = null) {
  const { rows } = await query(
    `select coalesce($1, 'TOTAL') as grupo,
            count(*) as contratos,
            sum(total) as suma,
            (select max(imported_at) from mietvertraege) as foto
       from mietvertraege
      where $1::text is null or lower(objgrp) = lower($1)`,
    [grupo],
  )
  return rows[0]
}

/**
 * El Mietertrag del mes: una fila por contrato con su alquiler, en CSV,
 * listo para pegar en el «01 – Mietertrag» y asentar en Honag — el paso 7
 * del manual de la empresa, que hoy se teclea a mano. Se guarda por el
 * mismo canal que los cierres de Spesen (tabla expense_exports + token).
 */
export async function mietertragCsv(mes) {
  const { rows } = await query(
    'select objgrp, objcode, m1vname, m1name, total from mietvertraege order by objcode asc',
  )
  if (rows.length === 0) return null
  const esc = (v) => {
    const s = String(v ?? '')
    return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const filas = rows.map((v) => [
    v.objgrp, v.objcode, [v.m1vname, v.m1name].filter(Boolean).join(' '), mes, v.total ?? '',
  ])
  const suma = rows.reduce((n, v) => n + Number(v.total ?? 0), 0)
  const csv = [['ObjGrp', 'ObjCode', 'Mieter', 'Monat', 'Mietzins CHF'], ...filas,
    ['', '', 'TOTAL', mes, suma]]
    .map((f) => f.map(esc).join(';')).join('\r\n') + '\r\n'
  const token = crypto.randomBytes(16).toString('hex')
  await query(
    `insert into expense_exports (month, token, csv, gastos, total_cents)
     values ($1,$2,$3,$4,$5)`,
    [`Mietertrag ${mes}`, token, csv, rows.length, Math.round(suma * 100)],
  )
  return { token, contratos: rows.length, suma }
}

/** La ficha corta de un contrato, para WhatsApp. */
export function formatVertrag(v) {
  const desde = v.mbeginn ? String(v.mbeginn).slice(0, 10).split('-').reverse().join('.') : '—'
  const lineas = [
    `📄 ${v.objcode} · ${v.objekt ?? ''}`.trim(),
    `👤 ${[v.m1vname, v.m1name].filter(Boolean).join(' ') || '—'}${v.m1tel ? ` · ${v.m1tel}` : ''}`,
    `💰 CHF ${v.total ?? '—'}/Monat · Kaution ${v.depot ?? '—'} · seit ${desde}`,
  ]
  if (v.bemerkungen) lineas.push(`📝 ${String(v.bemerkungen).slice(0, 120)}`)
  return lineas.join('\n')
}
