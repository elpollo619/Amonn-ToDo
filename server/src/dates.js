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

// ─── Configuración por idioma ─────────────────────────────────
// Cada idioma aporta sus días, sus meses y las expresiones relativas
// ("mañana", "morgen", "amanhã"). El resto del algoritmo es común.
const IDIOMAS = {
  es: {
    weekdays: ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'],
    months: ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto',
      'septiembre', 'octubre', 'noviembre', 'diciembre'],
    hoy: /\b(?:para )?(hoy)\b/,
    manana: /\b(?:para |antes de |hasta )?(manana)\b/,
    pasado: /\b(?:para |el |antes del |hasta el |hasta )?(pasado manana)\b/,
    enDias: /\b(?:para )?(?:dentro de|en) (\d{1,2}) dias?\b/,
    enSemanas: /\b(?:para )?(?:dentro de|en) (una|1|dos|2) semanas?\b/,
    // "5 de septiembre"
    diaMes: (meses) => new RegExp(`\\b(\\d{1,2}) de (${meses})\\b`),
    prefijoDia: '(?:para |hasta |antes del )?(?:el |este |proximo |el proximo )?',
    sufijoDia: '(?: que viene| proximo)?',
    sinFecha: /\b(sin fecha|sin plazo|cuando sea)\b/,
  },
  de: {
    weekdays: ['sonntag', 'montag', 'dienstag', 'mittwoch', 'donnerstag', 'freitag', 'samstag'],
    months: ['januar', 'februar', 'marz', 'april', 'mai', 'juni', 'juli', 'august',
      'september', 'oktober', 'november', 'dezember'],
    hoy: /\b(heute)\b/,
    manana: /\b(?:bis |am )?(morgen)\b/,
    pasado: /\b(?:bis |am )?(ubermorgen)\b/,
    enDias: /\bin (\d{1,2}) tagen?\b/,
    enSemanas: /\bin (einer|1|zwei|2) wochen?\b/,
    // "5. September"
    diaMes: (meses) => new RegExp(`\\b(\\d{1,2})\\.? (${meses})\\b`),
    prefijoDia: '(?:bis |am |bis zum |diesen |nachsten |am nachsten )?',
    sufijoDia: '',
    sinFecha: /\b(ohne datum|ohne frist|irgendwann)\b/,
  },
  pt: {
    weekdays: ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'],
    months: ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho', 'agosto',
      'setembro', 'outubro', 'novembro', 'dezembro'],
    hoy: /\b(?:para )?(hoje)\b/,
    manana: /\b(?:para |ate )?(amanha)\b/,
    pasado: /\b(?:para |ate )?(depois de amanha)\b/,
    enDias: /\b(?:daqui a|em) (\d{1,2}) dias?\b/,
    enSemanas: /\b(?:daqui a|em) (uma|1|duas|2) semanas?\b/,
    // "5 de setembro"
    diaMes: (meses) => new RegExp(`\\b(\\d{1,2}) de (${meses})\\b`),
    prefijoDia: '(?:para |ate |na |nesta |proxima |na proxima )?(?:feira )?',
    sufijoDia: '(?:-feira)?(?: que vem)?',
    sinFecha: /\b(sem data|sem prazo|quando der)\b/,
  },
}

/** ¿La persona ha dicho explícitamente "sin fecha"? */
export function saysNoDate(text, lang = 'es') {
  const t = normalize(text)
  return Object.values(IDIOMAS).some((cfg) => cfg.sinFecha.test(t)) ||
    (IDIOMAS[lang]?.sinFecha.test(t) ?? false)
}

/**
 * Busca una fecha dentro del texto, en el idioma indicado. Devuelve
 * { key: 'YYYY-MM-DD', match: 'texto que la expresaba' } o null.
 * Entiende expresiones relativas (hoy/mañana/pasado mañana/en N días),
 * días de la semana, dd/mm[/aaaa] (y dd.mm en alemán) y "5 de septiembre".
 */
export function parseDate(text, today = todayKey(), lang = 'es') {
  const cfg = IDIOMAS[lang] ?? IDIOMAS.es
  const t = normalize(text)

  // El orden importa: "pasado mañana" antes que "mañana".
  let m = t.match(cfg.pasado)
  if (m) return { key: addDays(today, 2), match: m[0] }
  m = t.match(cfg.manana)
  if (m) return { key: addDays(today, 1), match: m[0] }
  m = t.match(cfg.hoy)
  if (m) return { key: today, match: m[0] }
  m = t.match(cfg.enDias)
  if (m) return { key: addDays(today, Number(m[1])), match: m[0] }
  m = t.match(cfg.enSemanas)
  if (m) return { key: addDays(today, /dos|2|zwei|duas/.test(m[1]) ? 14 : 7), match: m[0] }

  // dd/mm[/aaaa], dd-mm[-aaaa] y, en alemán, dd.mm[.aaaa]
  m = t.match(/\b(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?\b/)
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

  // "5 de septiembre" / "5. September" / "5 de setembro"
  m = t.match(cfg.diaMes(cfg.months.join('|')))
  if (m) {
    const d = Number(m[1]); const mo = cfg.months.indexOf(m[2]) + 1
    const y = Number(today.slice(0, 4))
    let key = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    if (key < today) key = `${y + 1}${key.slice(4)}`
    return { key, match: m[0] }
  }

  // Día de la semana: "el viernes", "am Freitag", "na sexta-feira"
  m = t.match(new RegExp(`\\b${cfg.prefijoDia}(${cfg.weekdays.join('|')})${cfg.sufijoDia}\\b`))
  if (m) {
    const target = cfg.weekdays.indexOf(m[1])
    const cur = weekdayOf(today)
    let diff = (target - cur + 7) % 7
    if (diff === 0) diff = 7 // "el viernes" dicho un viernes = el que viene
    return { key: addDays(today, diff), match: m[0] }
  }
  return null
}

/** Compatibilidad: el nombre viejo, solo español. */
export function parseSpanishDate(text, today = todayKey()) {
  return parseDate(text, today, 'es')
}

/**
 * Prueba primero el idioma de la persona y luego los otros dos, para que
 * alguien que escribe "am Freitag" en un chat en español siga siendo
 * entendido. Devuelve { key, match, lang } o null.
 */
export function parseDateAnyLang(text, today = todayKey(), preferred = 'es') {
  const orden = [preferred, ...Object.keys(IDIOMAS).filter((l) => l !== preferred)]
  for (const lang of orden) {
    const r = parseDate(text, today, lang)
    if (r) return { ...r, lang }
  }
  return null
}

// ─── Texto amable para una fecha ──────────────────────────────
const CORTOS = {
  es: {
    dias: ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'],
    meses: ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'],
  },
  de: {
    dias: ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'],
    meses: ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'],
  },
  pt: {
    dias: ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'],
    meses: ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'],
  },
}

/**
 * Texto amable para una fecha, en el idioma pedido: "hoy", "morgen",
 * "sex 5 set", "mié 3 sep (vencida hace 2 días)".
 * Los textos vienen de i18n.js para no duplicar traducciones.
 */
export function describeDue(key, today = todayKey(), lang = 'es', t = null) {
  const txt = t ?? ((l, k, v) => defaultTexts(l, k, v))
  if (!key) return txt(lang, 'no_date')
  if (key === today) return txt(lang, 'due_today')
  if (key === addDays(today, 1)) return txt(lang, 'due_tomorrow')
  const cortos = CORTOS[lang] ?? CORTOS.es
  const d = toDate(key)
  const label = `${cortos.dias[d.getUTCDay()]} ${d.getUTCDate()} ${cortos.meses[d.getUTCMonth()]}`
  if (key < today) {
    const dias = Math.round((toDate(today) - d) / 86400000)
    return txt(lang, 'due_overdue', { fecha: label, dias, s: dias === 1 ? '' : 's' })
  }
  return label
}

// Textos mínimos por si se llama a describeDue sin pasar el traductor
// (evita una dependencia circular entre dates.js e i18n.js).
function defaultTexts(lang, key, vars = {}) {
  const M = {
    es: { no_date: 'sin fecha', due_today: 'hoy', due_tomorrow: 'mañana', due_overdue: `${vars.fecha} (vencida hace ${vars.dias} día${vars.s ?? ''})` },
    de: { no_date: 'ohne Datum', due_today: 'heute', due_tomorrow: 'morgen', due_overdue: `${vars.fecha} (seit ${vars.dias} Tag${vars.s ?? ''} überfällig)` },
    pt: { no_date: 'sem data', due_today: 'hoje', due_tomorrow: 'amanhã', due_overdue: `${vars.fecha} (atrasada há ${vars.dias} dia${vars.s ?? ''})` },
  }
  return (M[lang] ?? M.es)[key]
}

// ─── Plazos: de cuándo a cuándo ───────────────────────────────────────

// Palabras que unen dos fechas en los tres idiomas ("del lunes AL jueves").
const UNE = /\b(al|a|hasta el|hasta|bis zum|bis|ate|até|a\s)\b/

/**
 * Busca un PLAZO (dos fechas) en el texto: "del lunes al jueves",
 * "de mañana hasta el viernes", "vom Montag bis Donnerstag".
 * Devuelve { start, end, matches: [texto1, texto2] } o null.
 *
 * Estrategia deliberadamente sencilla y a prueba de idiomas: se busca la
 * primera fecha, y en lo que queda a su derecha se busca una segunda. Si hay
 * dos y la segunda no es anterior, es un plazo. Así no hace falta una
 * gramática por idioma para cada forma de decir "de… a…".
 */
export function parseRange(text, today = todayKey(), lang = 'es') {
  const t = normalize(text)
  const primera = parseDate(t, today, lang) ?? parseDateAnyLang(t, today, lang)
  if (!primera) return null
  const corte = t.indexOf(primera.match) + primera.match.length
  const resto = t.slice(corte)
  if (!UNE.test(resto)) return null
  const segunda = parseDate(resto, today, lang) ?? parseDateAnyLang(resto, today, lang)
  if (!segunda || segunda.key < primera.key) return null
  return { start: primera.key, end: segunda.key, matches: [primera.match, segunda.match] }
}

// "3 días", "3 Tage", "3 dias" — cuánto TRABAJO lleva, no cuándo vence.
const DURACION = /\b(\d{1,2}(?:[.,]5)?)\s*(dias?|tagen?|tage|jornadas?)\b/

/** Días de trabajo mencionados en el texto, o null. */
export function parseWorkDays(text) {
  const m = normalize(text).match(DURACION)
  if (!m) return null
  const n = Number(m[1].replace(',', '.'))
  if (!Number.isFinite(n) || n <= 0 || n > 60) return null
  return { days: n, match: m[0] }
}

/**
 * Texto del plazo de una tarea: "lun 1 → mié 3" si dura varios días, y el
 * texto de siempre si es de un solo día. Es lo que se enseña en la app y en
 * los mensajes de WhatsApp.
 */
export function describeRange(start, end, today = todayKey(), lang = 'es', t = null) {
  if (!start || start === end) return describeDue(end, today, lang, t)
  const cortos = CORTOS[lang] ?? CORTOS.es
  const etiqueta = (key) => {
    const d = toDate(key)
    return `${cortos.dias[d.getUTCDay()]} ${d.getUTCDate()} ${cortos.meses[d.getUTCMonth()]}`
  }
  return `${etiqueta(start)} → ${etiqueta(end)}`
}
