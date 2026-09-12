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

/**
 * ¿La última lectura delata una fuga? Puro: recibe las lecturas de UN
 * contador ordenadas de vieja a nueva y compara el ritmo diario del último
 * tramo con la media de los tramos anteriores. Hace falta historia (≥3
 * lecturas) y un ritmo claramente disparado (>2.5×) para acusar: mejor
 * callar que gritar fuga cada vez que alguien ducha a un huésped más.
 * La fuga de las habitaciones 206/207 (semanas abierta) es el caso que
 * esta alerta habría cantado el primer día.
 */
export function detectarAnomalia(lecturas) {
  if (!Array.isArray(lecturas) || lecturas.length < 3) return null
  const dias = (a, b) => Math.max((new Date(b.created_at) - new Date(a.created_at)) / 86400000, 0.04)
  const tramos = []
  for (let i = 1; i < lecturas.length; i++) {
    const delta = Number(lecturas[i].value) - Number(lecturas[i - 1].value)
    if (delta < 0) return null // contador reiniciado o mal apuntado: no se juzga
    tramos.push(delta / dias(lecturas[i - 1], lecturas[i]))
  }
  const ultimo = tramos[tramos.length - 1]
  const previos = tramos.slice(0, -1)
  const media = previos.reduce((a, b) => a + b, 0) / previos.length
  if (media <= 0 || ultimo <= 0) return null
  if (ultimo > media * 2.5) {
    return { tasa: Math.round(ultimo * 10) / 10, media: Math.round(media * 10) / 10 }
  }
  return null
}

/** Las últimas lecturas de un contador concreto, de vieja a nueva. */
export async function serieDe(kind, unit, limite = 6) {
  const { rows } = await query(
    `select value, created_at from meter_readings
      where kind = $1 and unit = $2
      order by created_at desc limit $3`,
    [kind, unit, limite],
  )
  return rows.reverse()
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
