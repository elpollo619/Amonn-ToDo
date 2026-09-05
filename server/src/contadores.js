// ============================================================
// Lecturas de contadores: «luz 204: 4521» y queda apuntada con fecha.
//
// El tipo se normaliza al alemán (strom, wasser, gas, heizung): así la
// serie del contador de la 204 es UNA serie, la apunte quien la apunte y
// en el idioma que sea. La respuesta enseña la diferencia con la lectura
// anterior — que es lo que de verdad se quiere saber.
// ============================================================
import { query } from './db.js'
import { broadcast } from './events.js'

// De lo que dice la gente al tipo canónico.
export const TIPOS = {
  luz: 'strom', electricidad: 'strom', strom: 'strom', eletricidade: 'strom',
  agua: 'wasser', wasser: 'wasser',
  gas: 'gas',
  calefaccion: 'heizung', heizung: 'heizung', aquecimento: 'heizung',
  contador: 'zahler', zahler: 'zahler', zaehler: 'zahler',
}

// Cómo se le dice a la persona, en su idioma.
export const NOMBRES = {
  es: { strom: 'luz', wasser: 'agua', gas: 'gas', heizung: 'calefacción', zahler: 'contador' },
  de: { strom: 'Strom', wasser: 'Wasser', gas: 'Gas', heizung: 'Heizung', zahler: 'Zähler' },
  pt: { strom: 'luz', wasser: 'água', gas: 'gás', heizung: 'aquecimento', zahler: 'contador' },
}

export async function addReading({ kind, unit, value, createdBy = null }) {
  const anterior = await lastReading(kind, unit)
  const { rows } = await query(
    `insert into meter_readings (kind, unit, value, created_by)
     values ($1,$2,$3,$4) returning *`,
    [kind, unit, value, createdBy],
  )
  broadcast()
  return { lectura: rows[0], anterior }
}

/** La última lectura de ese contador, o null. */
export async function lastReading(kind, unit) {
  const { rows } = await query(
    `select * from meter_readings
      where kind = $1 and unit = $2
      order by created_at desc limit 1`,
    [kind, unit],
  )
  return rows[0] ?? null
}

/** Últimas lecturas: de una unidad concreta, o la última de cada contador. */
export async function listReadings(unit = null, limite = 12) {
  if (unit) {
    const { rows } = await query(
      `select * from meter_readings where unit = $1
        order by created_at desc limit $2`,
      [unit, limite],
    )
    return rows
  }
  const { rows } = await query(
    `select distinct on (kind, unit) *
       from meter_readings
      order by kind, unit, created_at desc`,
  )
  return rows.slice(0, limite)
}
