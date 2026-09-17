// ============================================================
// «¿Quién no ha pagado?» — el aviso del día 25.
//
// Los contratos exigen el pago antes del 28 para renovarse, y el aviso de
// salida se da antes del 25: por eso el día 25 es EL día de mirar cobros.
//
// La verdad de este módulo son los extractos camt que se hayan reenviado
// al asistente este mes (bank_entries). Sin extractos, no se inventa nada:
// se pide el fichero del banco. Un contrato cuenta como pagado si este mes
// (a) el nombre del inquilino aparece como pagador de un abono, o (b) una
// factura QR a su nombre quedó cobrada. Es una PISTA de trabajo, no un
// juicio: la lista siempre dice en qué se basa.
// ============================================================
import cron from 'node-cron'
import { config } from './config.js'
import { query } from './db.js'
import { sendWhatsApp } from './whatsapp.js'
import { t as tr, safeLang } from './i18n.js'
import { todayKey } from './dates.js'

/**
 * El estado de cobro del mes: cuántos extractos se han visto y qué
 * contratos no tienen ningún abono que les case.
 */
export async function estadoDeCobros(hoy = todayKey()) {
  const mes = hoy.slice(0, 7)
  const { rows: vistos } = await query(
    `select count(*)::int as abonos from bank_entries
      where to_char(booked_on, 'YYYY-MM') = $1`,
    [mes],
  )
  const abonos = vistos[0]?.abonos ?? 0
  if (abonos === 0) return { mes, abonos: 0, impagados: [], contratos: 0 }

  const { rows } = await query(
    `select v.objcode, v.m1vname, v.m1name, v.total
       from mietvertraege v
      where length(coalesce(v.m1name, '')) >= 4
        and not exists (
          select 1 from bank_entries b
           where to_char(b.booked_on, 'YYYY-MM') = $1
             and b.payer ilike '%' || v.m1name || '%'
        )
        and not exists (
          select 1 from qr_bills q
           where q.paid_at is not null
             and to_char(q.paid_at, 'YYYY-MM') = $1
             and q.debtor ilike '%' || v.m1name || '%'
        )
      order by v.objcode asc`,
    [mes],
  )
  const { rows: total } = await query('select count(*)::int as n from mietvertraege')
  return { mes, abonos, impagados: rows, contratos: total[0]?.n ?? 0 }
}

export function formatImpagos(e, lang) {
  if (e.abonos === 0) return tr(lang, 'unpaid_no_data', { mes: e.mes.split('-').reverse().join('/') })
  if (e.impagados.length === 0) {
    return tr(lang, 'unpaid_none', { abonos: e.abonos, mes: e.mes.split('-').reverse().join('/') })
  }
  const lista = e.impagados.slice(0, 15).map((v) =>
    `• ${v.objcode} ${[v.m1vname, v.m1name].filter(Boolean).join(' ')} — CHF ${v.total ?? '—'}`,
  ).join('\n')
    + (e.impagados.length > 15 ? `\n… y ${e.impagados.length - 15} más` : '')
  return tr(lang, 'unpaid_list', {
    n: e.impagados.length, contratos: e.contratos, abonos: e.abonos,
    mes: e.mes.split('-').reverse().join('/'), lista,
  })
}

/** El día 25: si hay extractos del mes, se manda la lista a RESUMEN_TO. */
export async function runAvisoImpagos() {
  const destinos = (process.env.RESUMEN_TO ?? '').split(',').map((x) => x.trim()).filter(Boolean)
  if (destinos.length === 0) return { enviados: 0 }
  const e = await estadoDeCobros()
  // Sin extractos no se avisa de nada: una lista de 222 "impagados" que en
  // realidad significa "no me habéis mandado el banco" solo hace ruido.
  if (e.abonos === 0) {
    console.log('[impagos] día 25 sin extractos del mes: no se avisa')
    return { enviados: 0, sinDatos: true }
  }
  let enviados = 0
  for (const phone of destinos) {
    const { rows } = await query('select language from users where phone = $1', [phone])
    const lang = safeLang(rows[0]?.language ?? 'es')
    try {
      await sendWhatsApp(phone, formatImpagos(e, lang))
      enviados++
    } catch (err) {
      console.error(`[impagos] no se pudo avisar a ${phone}: ${err.message}`)
    }
  }
  console.log(`[impagos] día 25: ${e.impagados.length} sin abono visto · avisados: ${enviados}`)
  return { enviados, impagados: e.impagados.length }
}

export function scheduleAvisoImpagos() {
  cron.schedule('0 9 25 * *', () => {
    runAvisoImpagos().catch((e) => console.error('[impagos]', e.message))
  }, { timezone: config.timezone })
  console.log('[impagos] aviso del día 25 a las 09:00 (solo si hay extractos del mes)')
}
