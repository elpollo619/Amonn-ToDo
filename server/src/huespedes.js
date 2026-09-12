// ============================================================
// Espejo de mensajes de huéspedes (Casa Reto, vía Beds24).
//
// REGLA DE ORO, pedida por Cris el 05.09.2026: el asistente NUNCA responde
// a un huésped ni a un inquilino por su cuenta. Solo ESPEJA lo que llega
// (a las personas autorizadas) y envía una respuesta únicamente cuando una
// de ellas la ordena con «responde al huésped …». Sin autorizado, no sale
// nada hacia fuera. Y sin matar a nadie a mensajes: UN WhatsApp agrupado
// por tanda de sondeo (cada 15 min), no uno por mensaje.
//
// El refreshToken de Beds24 no vive aquí: lo guarda Supabase y lo usa la
// Edge Function `guest-messages` (proyecto hansamonn-vermietung), que se
// llama con un PIN. Este servidor solo conoce el PIN.
// ============================================================
import cron from 'node-cron'
import { config } from './config.js'
import { query } from './db.js'
import { sendWhatsApp } from './whatsapp.js'
import { t as tr, safeLang } from './i18n.js'
import { telefonosConPermiso } from './permisos.js'

export function huespedesConfigurado() {
  return Boolean(config.huespedes?.pin)
}

async function llamar(body) {
  const res = await fetch(config.huespedes.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin: config.huespedes.pin, ...body }),
    signal: AbortSignal.timeout(25_000),
  })
  if (!res.ok) throw new Error(`guest-messages respondió ${res.status}`)
  const j = await res.json()
  if (j.error) throw new Error(j.error)
  return j
}

/** Mensajes recientes tal cual los da Beds24 (dentro de data.data). */
export async function listarMensajes() {
  const j = await llamar({ action: 'list', propertyId: config.huespedes.propertyId, maxAge: 3 })
  return j?.data?.data ?? []
}

/** Envía UNA respuesta a UNA reserva. Solo se llama tras orden autorizada. */
export async function responderHuesped(bookingId, message) {
  return llamar({ action: 'reply', bookingId, message })
}

/**
 * Una tanda del espejo: mira qué mensajes hay, se queda con los no vistos
 * y manda UN WhatsApp agrupado a cada autorizado. Nada más: responder es
 * decisión humana.
 */
export async function runEspejoHuespedes() {
  if (!huespedesConfigurado()) return { nuevos: 0, avisados: 0 }
  const mensajes = await listarMensajes()
  const nuevos = []
  for (const m of mensajes) {
    const id = String(m.id ?? `${m.bookingId}-${m.time ?? ''}`)
    const { rowCount } = await query(
      'insert into seen_guest_messages (id) values ($1) on conflict (id) do nothing',
      [id],
    )
    if (rowCount > 0) nuevos.push(m)
  }
  if (nuevos.length === 0) return { nuevos: 0, avisados: 0 }

  // El espejo va a quien tenga el permiso 'huespedes' EN ESE MOMENTO: los
  // accesos los gestiona el admin por WhatsApp y se leen de la base.
  const destinos = await telefonosConPermiso('huespedes')
  if (destinos.length === 0) {
    console.warn('[huespedes] hay mensajes nuevos pero nadie tiene el permiso huespedes')
    return { nuevos: nuevos.length, avisados: 0 }
  }

  // ⚠️ La forma exacta de cada mensaje no está verificada contra la cuenta
  // real (los canales aún no están conectados): se leen los campos con
  // paracaídas y se espeja TODO lo no visto, etiquetado como se pueda.
  const linea = (m) => {
    const quien = m.source ?? m.channel ?? '¿?'
    const texto = String(m.message ?? '').slice(0, 200)
    return `• [${m.bookingId ?? '¿?'} · ${quien}] ${texto}`
  }
  const detalle = nuevos.slice(0, 6).map(linea).join('\n')
    + (nuevos.length > 6 ? `\n… y ${nuevos.length - 6} más` : '')

  let avisados = 0
  for (const phone of destinos) {
    const { rows } = await query('select language from users where phone = $1', [phone])
    const lang = safeLang(rows[0]?.language ?? 'es')
    try {
      await sendWhatsApp(phone, tr(lang, 'guest_mirror', { total: nuevos.length, detalle }))
      avisados++
    } catch (err) {
      console.error(`[huespedes] no se pudo avisar a ${phone}: ${err.message}`)
    }
  }
  console.log(`[huespedes] mensajes nuevos: ${nuevos.length}, avisados: ${avisados}`)
  return { nuevos: nuevos.length, avisados }
}

export function scheduleEspejoHuespedes() {
  if (!huespedesConfigurado()) {
    console.log('[huespedes] sin PIN o sin autorizados: espejo apagado')
    return
  }
  cron.schedule('*/15 * * * *', () => {
    runEspejoHuespedes().catch((e) => console.error('[huespedes]', e.message))
  }, { timezone: config.timezone })
  console.log('[huespedes] espejo cada 15 min · destinatarios: quien tenga el permiso huespedes')
}
