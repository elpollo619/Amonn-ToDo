// Utilidades de fechas en la zona horaria configurada (Europe/Madrid por
// defecto). Todo trabaja con claves "YYYY-MM-DD" para no liarse con horas.
import { config } from './config.js'

const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado']
const MONTHS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto',
  'septiembre', 'octubre', 'noviembre', 'diciembre',
]

/** "YYYY-MM-DD" de hoy en la zona horaria configurada. */
export function todayKey(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: config.timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now)
  const get = (t) => parts.find((p) => p.type === t).value
  return `${get('year')}-${get('month')}-${get('day')}`
}

function toDate(key) {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}
function toKey(date) {
  return date.toISOString().slice(0, 10)
}
export function addDays(key, n) {
  const d = toDate(key)
  d.setUTCDate(d.getUTCDate() + n)
  return toKey(d)
}
export function weekdayOf(key) {
  return toDate(key).getUTCDay()
}

/** Quita acentos, minúsculas, sin puntuación sobrante. */
export function normalize(text) {
  return String(text ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[¡!¿?"“”«»]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Busca una fecha escrita en español dentro del texto. Devuelve
 * { key: 'YYYY-MM-DD', match: 'texto que la expresaba' } o null.
 * Entiende: hoy, mañana, pasado mañana, en N días, lunes…domingo (opcional
 * "que viene"/"próximo"), dd/mm, dd-mm, dd/mm/yyyy, "5 de septiembre".
 */
export function parseSpanishDate(text, today = todayKey()) {
  const t = normalize(text)

  let m = t.match(/\b(?:para |el |antes del |hasta el |hasta )?(pasado manana)\b/)
  if (m) return { key: addDays(today, 2), match: m[0] }
  m = t.match(/\b(?:para |antes de |hasta )?(manana)\b/)
  if (m) return { key: addDays(today, 1), match: m[0] }
  m = t.match(/\b(?:para )?(hoy)\b/)
  if (m) return { key: today, match: m[0] }
  m = t.match(/\b(?:para )?(?:dentro de|en) (\d{1,2}) dias?\b/)
  if (m) return { key: addDays(today, Number(m[1])), match: m[0] }
  m = t.match(/\b(?:para )?(?:dentro de|en) (una|1|dos|2) semanas?\b/)
  if (m) return { key: addDays(today, /dos|2/.test(m[1]) ? 14 : 7), match: m[0] }

  // dd/mm[/yyyy] o dd-mm[-yyyy]
  m = t.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/)
  if (m) {
    const d = Number(m[1]); const mo = Number(m[2])
    let y = m[3] ? Number(m[3]) : Number(today.slice(0, 4))
    if (y < 100) y += 2000
    if (d >= 1 && d <= 31 && mo >= 1 && mo <= 12) {
      let key = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      if (!m[3] && key < today) key = `${y + 1}${key.slice(4)}` // ya pasó: año que viene
      return { key, match: m[0] }
    }
  }

  // "5 de septiembre"
  m = t.match(new RegExp(`\\b(\\d{1,2}) de (${MONTHS.join('|')})\\b`))
  if (m) {
    const d = Number(m[1]); const mo = MONTHS.indexOf(m[2]) + 1
    let y = Number(today.slice(0, 4))
    let key = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    if (key < today) key = `${y + 1}${key.slice(4)}`
    return { key, match: m[0] }
  }

  // día de la semana: "el viernes", "para el lunes que viene", "proximo martes"
  m = t.match(
    new RegExp(`\\b(?:para |hasta |antes del )?(?:el |este |proximo |el proximo )?(${WEEKDAYS.join('|')})(?: que viene| proximo)?\\b`),
  )
  if (m) {
    const target = WEEKDAYS.indexOf(m[1])
    const cur = weekdayOf(today)
    let diff = (target - cur + 7) % 7
    if (diff === 0) diff = 7 // "el viernes" dicho un viernes = el que viene
    return { key: addDays(today, diff), match: m[0] }
  }
  return null
}

/** Texto amable para una fecha: "hoy", "mañana", "viernes 5 sept", "vencida (hace 2 días)". */
export function describeDue(key, today = todayKey()) {
  if (!key) return 'sin fecha'
  if (key === today) return 'hoy'
  if (key === addDays(today, 1)) return 'mañana'
  const d = toDate(key)
  const wd = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'][d.getUTCDay()]
  const mo = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'][d.getUTCMonth()]
  const label = `${wd} ${d.getUTCDate()} ${mo}`
  if (key < today) {
    const days = Math.round((toDate(today) - d) / 86400000)
    return `${label} (vencida hace ${days} día${days === 1 ? '' : 's'})`
  }
  return label
}
