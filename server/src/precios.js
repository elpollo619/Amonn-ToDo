// ============================================================
// Consejero de precios: «¿subo o bajo los precios?»
//
// Los datos vienen de PreisPilot, el motor de precios de Casa Reto que vive
// en Supabase (proyecto hansamonn-vermietung) y escribe a Beds24 dos veces
// al día. Su Edge Function `dashboard` es pública y devuelve el estado, el
// calendario de 365 noches (con desglose por noche) y el último envío.
//
// El análisis es una función PURA sobre ese JSON: así se prueba con datos
// fijos sin llamar a nadie. Los consejos son heurísticos y lo dicen: la
// ocupación real (reservas) aún no está conectada, y sin ella un consejo
// solo puede basarse en el propio calendario y los eventos.
//
// El hotel (A14) va aparte: sus precios viven en Apaleo, y hasta tener las
// credenciales el asistente lo dice en vez de inventar.
// ============================================================
import { config } from './config.js'
import { todayKey, addDays } from './dates.js'

export async function fetchDashboard() {
  const res = await fetch(config.preispilot.dashboardUrl, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(20_000),
  })
  if (!res.ok) throw new Error(`PreisPilot respondió ${res.status}`)
  return res.json()
}

const media = (xs) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0)

/**
 * Analiza el calendario y devuelve datos + consejos. Puro: sin red ni reloj
 * (el día se pasa por parámetro).
 */
export function analizarPrecios({ status, calendar, lastApply }, hoy = todayKey()) {
  const st = status ?? {}
  const noches = (calendar ?? []).filter((n) => n.d >= hoy).sort((a, b) => (a.d < b.d ? -1 : 1))
  const en = (dias) => noches.filter((n) => n.d < addDays(hoy, dias))

  const prox7 = en(7)
  const prox30 = en(30)
  const consejos = []

  // 1. ¿El cálculo está viejo? El cron reenvía cada día lo que haya, pero si
  //    nadie recalcula, los eventos y el horizonte se van quedando atrás.
  const dias = st.generated
    ? Math.round((Date.parse(hoy) - Date.parse(st.generated)) / 86400000)
    : null
  if (dias !== null && dias > 14) consejos.push({ tipo: 'stale', dias })

  // 2. Noches cercanas sin evento y por encima de la media de entre semana:
  //    a 7 días vista, sin reserva, lo que no se vende a precio alto se
  //    queda sin vender. Candidatas a bajar.
  const caras = prox7.filter((n) => !n.ev && !n.we && st.weekdayAvg && n.p > st.weekdayAvg * 1.05)
  if (caras.length >= 2) {
    consejos.push({ tipo: 'bajar', noches: caras.length, hasta: st.min ?? null })
  }

  // 3. Eventos en los próximos 60 días que siguen baratos: candidatos a
  //    subir mientras queda tiempo de venderlos caros.
  const eventosBaratos = en(60).filter((n) => n.ev && st.base && n.p < st.base * 1.25)
  if (eventosBaratos.length) {
    consejos.push({
      tipo: 'subir',
      noches: eventosBaratos.length,
      ejemplo: eventosBaratos[0],
      techo: st.hi ?? st.max ?? null,
    })
  }

  // 4. ¿Beds24 recibió el último envío?
  const aplicado = lastApply?.ok === true
  if (!aplicado) consejos.push({ tipo: 'apply_failed' })

  return {
    propiedad: st.property ?? 'Casa Reto',
    generado: st.generated ?? null,
    diasDesdeCalculo: dias,
    base: st.base ?? null, min: st.min ?? null, max: st.max ?? null,
    media7: media(prox7.map((n) => n.p)),
    media30: media(prox30.map((n) => n.p)),
    weekdayAvg: st.weekdayAvg ?? null,
    weekendAvg: st.weekendAvg ?? null,
    eventosProx30: prox30.filter((n) => n.ev).length,
    prox7,
    ultimoEnvio: lastApply?.at ? String(lastApply.at).slice(0, 10) : null,
    aplicado,
    consejos,
  }
}

// ─── Precios fijados a mano ──────────────────────────────────
// PreisPilot guarda los overrides en `pp_state.casa_overrides`, con la forma
// {"AAAA-MM-DD": {price, minStay?, note?}}. Se leen con `dashboard` y se
// escriben con `seed`, que pide el PIN. El PIN NO sale del servidor: la hoja
// web habla con nosotros y nosotros con PreisPilot.
//
// Importante: desde el 08.09.2026 el cron de PreisPilot RESPETA estos
// precios, así que fijar uno aquí ya no dura solo hasta el siguiente pase.

export function overridesConfigurados() {
  return Boolean(config.preispilot.pin)
}

/** Todo lo fijado a mano, tal cual está hoy. */
export async function leerOverrides() {
  const d = await fetchDashboard()
  return d?.overrides ?? {}
}

/**
 * Fija (o quita, con price null) el precio de una noche. Devuelve el mapa
 * completo ya guardado.
 *
 * Se lee el mapa entero y se reescribe entero porque `seed` es un upsert de
 * la clave: no hay forma de tocar una sola fecha. Es un dato pequeño (unas
 * pocas fechas), así que compensa la sencillez.
 */
export async function fijarPrecio({ fecha, precio, minStay = null, nota = null, quien = null }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(fecha ?? ''))) {
    throw new Error('La fecha debe ser AAAA-MM-DD')
  }
  if (!config.preispilot.pin) throw new Error('Falta PREISPILOT_PIN en el servidor')

  const overrides = await leerOverrides()
  if (precio === null || precio === undefined) {
    delete overrides[fecha]
  } else {
    const p = Number(precio)
    if (!Number.isFinite(p) || p <= 0) throw new Error('Precio inválido')
    // Los límites del propio motor: fijar 20 CHF por un dedazo sería caro.
    const { status } = await fetchDashboard()
    const min = Number(status?.min ?? 0)
    const max = Number(status?.max ?? 0)
    if (min && p < min) throw new Error(`El mínimo configurado es CHF ${min}`)
    if (max && p > max) throw new Error(`El máximo configurado es CHF ${max}`)
    overrides[fecha] = {
      price: p,
      ...(minStay ? { minStay: Number(minStay) } : {}),
      // Se deja constancia de quién lo tocó: dentro de un mes nadie recuerda
      // por qué esa noche vale 420.
      ...(nota || quien ? { note: [nota, quien && `(${quien})`].filter(Boolean).join(' ') } : {}),
    }
  }

  const res = await fetch(`${config.preispilot.baseUrl}/seed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin: config.preispilot.pin, key: 'casa_overrides', value: overrides }),
    signal: AbortSignal.timeout(20_000),
  })
  const out = await res.json().catch(() => ({}))
  if (!out.ok) throw new Error(out.error ?? `PreisPilot respondió ${res.status}`)
  return overrides
}

// ─── Vista por semanas y eventos ─────────────────────────────
// Los eventos NO se leen del config.json del motor (vive en otra máquina):
// se derivan del propio calendario, que ya trae el evento de cada noche. Así
// lo que se enseña es exactamente lo que se va a cobrar.

const lunesDe = (key) => {
  const d = new Date(`${key}T00:00:00Z`)
  // getUTCDay(): 0 = domingo. La semana se cuenta de lunes a domingo.
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7))
  return d.toISOString().slice(0, 10)
}

/** Resumen semana a semana: media, mínimo, máximo y qué pasa esa semana. */
export function porSemanas(calendar, hoy = todayKey(), semanas = 12) {
  const noches = (calendar ?? []).filter((n) => n.d >= hoy).sort((a, b) => (a.d < b.d ? -1 : 1))
  const mapa = new Map()
  for (const n of noches) {
    const k = lunesDe(n.d)
    if (!mapa.has(k)) mapa.set(k, { desde: k, noches: [], eventos: new Set() })
    const s = mapa.get(k)
    s.noches.push(n)
    if (n.ev) s.eventos.add(n.ev)
  }
  return [...mapa.values()].slice(0, semanas).map((s) => {
    const precios = s.noches.map((n) => n.p).filter((p) => Number.isFinite(p))
    const fin = s.noches[s.noches.length - 1].d
    return {
      desde: s.desde,
      hasta: fin,
      noches: s.noches.length,
      media: media(precios),
      min: precios.length ? Math.min(...precios) : 0,
      max: precios.length ? Math.max(...precios) : 0,
      finde: media(s.noches.filter((n) => n.we).map((n) => n.p)),
      entreSemana: media(s.noches.filter((n) => !n.we).map((n) => n.p)),
      eventos: [...s.eventos],
    }
  })
}

/**
 * Los próximos eventos, agrupando las noches seguidas que comparten nombre.
 * Devuelve también qué precio medio tienen y cuánto sube respecto a la media
 * general: es lo que de verdad interesa mirar antes de tocar nada.
 */
export function proximosEventos(calendar, hoy = todayKey(), limite = 12) {
  const noches = (calendar ?? []).filter((n) => n.d >= hoy).sort((a, b) => (a.d < b.d ? -1 : 1))
  const normal = media(noches.filter((n) => !n.ev).map((n) => n.p))
  const bloques = []
  for (const n of noches) {
    if (!n.ev) continue
    const ult = bloques[bloques.length - 1]
    // Se unen solo si es el MISMO evento y la noche siguiente: dos ediciones
    // distintas del mismo festival no deben salir como un bloque único.
    const seguido = ult && ult.nombre === n.ev && addDays(ult.hasta, 1) === n.d
    if (seguido) { ult.hasta = n.d; ult.precios.push(n.p) }
    else bloques.push({ nombre: n.ev, desde: n.d, hasta: n.d, precios: [n.p] })
  }
  return bloques.slice(0, limite).map((b) => ({
    nombre: b.nombre,
    desde: b.desde,
    hasta: b.hasta,
    noches: b.precios.length,
    media: media(b.precios),
    // Cuánto más caro que una noche normal, en %.
    sobreNormal: normal ? Math.round((media(b.precios) / normal - 1) * 100) : 0,
  }))
}

// ─── Aprobar y enviar a Beds24 ───────────────────────────────
// Desde el 09.09.2026 el cron automático está apagado: esto es lo ÚNICO que
// manda precios a Beds24, y lo dispara un admin a mano. La Edge Function
// `apply` escribe solo price1 y minStay — nunca la disponibilidad.

export async function enviarABeds24({ meses = 12, ensayo = false } = {}) {
  if (!config.preispilot.pin) throw new Error('Falta PREISPILOT_PIN en el servidor')
  const res = await fetch(`${config.preispilot.baseUrl}/apply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin: config.preispilot.pin, months: meses, dryRun: ensayo }),
    // Escribe cientos de tramos: necesita más margen que una simple lectura.
    signal: AbortSignal.timeout(120_000),
  })
  const out = await res.json().catch(() => ({}))
  if (!res.ok || out.ok === false) {
    throw new Error(out.error ?? `PreisPilot respondió ${res.status}`)
  }
  return out
}

// ─── Recomendación de mínimo y máximo ────────────────────────
// Casa Reto se alquila ENTERA: aquí no hay «por cuarto». La recomendación es
// una horquilla por semana: por debajo del suelo se regala, por encima del
// techo es difícil que se venda.
//
// ⚠️ Honestidad sobre la exactitud: hoy solo 6 noches del año tienen dato de
// competencia (`data/comp-data.json` de PreisPilot se rellena a mano). Por
// eso CADA semana lleva su nivel de confianza, en vez de dar un número
// redondo que parezca más seguro de lo que es.

const PASO_COMPETENCIA = 'Wettbewerb'

export function recomendarSemanas(calendar, hoy = todayKey(), semanas = 12) {
  return porSemanas(calendar, hoy, semanas).map((s) => {
    const noches = (calendar ?? []).filter((n) => n.d >= s.desde && n.d <= s.hasta)
    const conComp = noches.filter((n) => (n.br ?? []).some((b) => b.t === PASO_COMPETENCIA))
    const conEvento = noches.filter((n) => n.ev)

    // El suelo nunca baja del mínimo configurado en el motor; el techo nunca
    // pasa del máximo. Entre medias, una horquilla alrededor de lo calculado.
    const suelo = Math.round(s.media * 0.88)
    const techo = Math.round(s.media * (conEvento.length ? 1.30 : 1.18))

    const confianza = conComp.length > 0
      ? 'alta'
      : conEvento.length > 0
        ? 'media'
        : 'baja'

    return {
      ...s,
      suelo,
      techo,
      confianza,
      // Se dice en una frase POR QUÉ esa confianza: si no, el usuario no
      // sabe si fiarse del número o no.
      motivo: conComp.length > 0
        ? `${conComp.length} noche(s) con precios de la competencia`
        : conEvento.length > 0
          ? 'hay evento o fiesta, pero sin datos de la competencia'
          : 'solo el cálculo propio: sin datos de la competencia esa semana',
    }
  })
}

/** Cuántas noches del calendario tienen dato de competencia, y cuántas hay. */
export function coberturaCompetencia(calendar, hoy = todayKey()) {
  const noches = (calendar ?? []).filter((n) => n.d >= hoy)
  const con = noches.filter((n) => (n.br ?? []).some((b) => b.t === PASO_COMPETENCIA))
  return { conDato: con.length, total: noches.length }
}
