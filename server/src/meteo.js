// ============================================================
// Meteo de obra: «¿qué tiempo hace?» y la alerta de la tarde.
//
// Datos de Open-Meteo (gratis, sin clave), que en Suiza usa el modelo ICON
// de MeteoSwiss. Lo que le importa a una obra no es el sol, sino cuatro
// cosas: helada (no hormigonar), lluvia fuerte (proteger), viento (no
// grúa/andamio) y nieve. La alerta sale la TARDE ANTERIOR, como la de la
// basura: avisar por la mañana no sirve de nada.
// ============================================================
import cron from 'node-cron'
import { config } from './config.js'
import { query } from './db.js'
import { sendWhatsApp } from './whatsapp.js'
import { t as tr, safeLang } from './i18n.js'

const URL_BASE = 'https://api.open-meteo.com/v1/forecast'

export async function fetchMeteo(dias = 4) {
  const u = new URL(URL_BASE)
  u.searchParams.set('latitude', String(config.meteo.lat))
  u.searchParams.set('longitude', String(config.meteo.lon))
  u.searchParams.set('daily', 'temperature_2m_min,temperature_2m_max,precipitation_sum,wind_gusts_10m_max,snowfall_sum,weather_code')
  u.searchParams.set('timezone', config.timezone)
  u.searchParams.set('forecast_days', String(dias))
  const res = await fetch(u, { signal: AbortSignal.timeout(15_000) })
  if (!res.ok) throw new Error(`Open-Meteo respondió ${res.status}`)
  const j = await res.json()
  return j.daily
}

// Umbrales de obra. Puro, para poder probarlo con datos fijos.
export function alertasDeObra(daily, idx) {
  const alertas = []
  const min = daily.temperature_2m_min?.[idx]
  const lluvia = daily.precipitation_sum?.[idx]
  const viento = daily.wind_gusts_10m_max?.[idx]
  const nieve = daily.snowfall_sum?.[idx]
  if (min !== null && min !== undefined && min <= 0) alertas.push({ tipo: 'helada', valor: min })
  if (lluvia >= 15) alertas.push({ tipo: 'lluvia', valor: lluvia })
  if (viento >= 60) alertas.push({ tipo: 'viento', valor: viento })
  if (nieve >= 1) alertas.push({ tipo: 'nieve', valor: nieve })
  return alertas
}

// Del código WMO a un emoji que se entienda en cualquier idioma.
export function emojiTiempo(code) {
  if (code === 0) return '☀️'
  if (code <= 2) return '🌤️'
  if (code === 3) return '☁️'
  if (code <= 48) return '🌫️'
  if (code <= 57) return '🌦️'
  if (code <= 67) return '🌧️'
  if (code <= 77) return '🌨️'
  if (code <= 82) return '🌧️'
  if (code <= 86) return '🌨️'
  return '⛈️'
}

/** El parte de 3 días que se contesta a «¿qué tiempo hace?». */
export function formatearParte(daily, lang) {
  const lineas = []
  for (let i = 0; i < Math.min(3, daily.time?.length ?? 0); i++) {
    const dia = new Intl.DateTimeFormat(lang === 'de' ? 'de-CH' : lang === 'pt' ? 'pt-PT' : 'es-ES', {
      weekday: 'short', day: 'numeric', month: 'numeric', timeZone: config.timezone,
    }).format(new Date(`${daily.time[i]}T12:00:00`))
    const extras = alertasDeObra(daily, i)
      .map((a) => tr(lang, `wx_${a.tipo}`, { valor: Math.round(a.valor) })).join(' ')
    lineas.push(`${emojiTiempo(daily.weather_code?.[i])} ${dia}: ${Math.round(daily.temperature_2m_min[i])}–${Math.round(daily.temperature_2m_max[i])}°C · ${daily.precipitation_sum[i]} mm · 💨 ${Math.round(daily.wind_gusts_10m_max[i])} km/h${extras ? '\n   ' + extras : ''}`)
  }
  return tr(lang, 'wx_report', { lugar: config.meteo.nombre, lista: lineas.join('\n') })
}

/** La alerta de la tarde: solo habla si MAÑANA hay algo que temer. */
export async function runAvisoMeteo() {
  const destinos = config.meteo.avisarA
  if (destinos.length === 0) return { alertas: 0, enviados: 0 }
  const daily = await fetchMeteo(2)
  const alertas = alertasDeObra(daily, 1)
  if (alertas.length === 0) return { alertas: 0, enviados: 0 }
  let enviados = 0
  for (const phone of destinos) {
    const { rows } = await query('select language from users where phone = $1', [phone])
    const lang = safeLang(rows[0]?.language ?? 'es')
    const detalle = alertas.map((a) => tr(lang, `wx_${a.tipo}`, { valor: Math.round(a.valor) })).join('\n')
    try {
      await sendWhatsApp(phone, tr(lang, 'wx_alert', { lugar: config.meteo.nombre, detalle }))
      enviados++
    } catch (err) {
      console.error(`[meteo] no se pudo avisar a ${phone}: ${err.message}`)
    }
  }
  console.log(`[meteo] alertas para mañana: ${alertas.length} · avisados: ${enviados}`)
  return { alertas: alertas.length, enviados }
}

export function scheduleAvisoMeteo() {
  if (config.meteo.avisarA.length === 0) {
    console.log('[meteo] sin METEO_TO: alerta apagada (la orden «tiempo» funciona igual)')
    return
  }
  cron.schedule('0 17 * * *', () => {
    runAvisoMeteo().catch((e) => console.error('[meteo]', e.message))
  }, { timezone: config.timezone })
  console.log('[meteo] alerta de obra a las 17:00 si mañana pinta mal')
}
