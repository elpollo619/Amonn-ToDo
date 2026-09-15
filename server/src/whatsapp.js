// ============================================================
// Integración con el OpenWA - WhatsApp API Gateway (open-wa.org).
// - Enviamos: POST /api/sessions/{sessionId}/messages/send-text (X-API-Key).
// - Recibimos las respuestas por webhook, evento "message.received"
//   (ver routes/webhook.js).
// ============================================================
import { config } from './config.js'

// Estado en memoria de la sesión de WhatsApp que usamos (se resuelve al
// arrancar; puede venir fija por config o detectarse automáticamente).
export const waState = { sessionId: config.whatsapp.sessionId, sessionStatus: null }

function waHeaders(extra = {}) {
  return {
    'Content-Type': 'application/json',
    ...(config.whatsapp.apiKey ? { 'X-API-Key': config.whatsapp.apiKey } : {}),
    ...extra,
  }
}

/** Convierte un teléfono E.164 (+34600111222) al "chatId" de WhatsApp. */
export function phoneToChatId(phone) {
  const digits = String(phone).replace(/[^\d]/g, '')
  return `${digits}@c.us`
}

/** Extrae el teléfono E.164 a partir de un chatId (34600111222@c.us). */
export function chatIdToPhone(chatId) {
  const digits = String(chatId).split('@')[0].replace(/[^\d]/g, '')
  return `+${digits}`
}

// Tamaño máximo de un mensaje. El 15.09.2026 el Gateway respondió «400 Bad
// Request» al intentar enviar un contrato de muestra entero: los avisos
// cortos de cada mañana salían bien y el primer texto largo, no. El límite
// exacto del Gateway no está documentado, así que se parte con margen y,
// si un trozo sigue siendo rechazado, se vuelve a partir en dos.
const MAX_CHARS = Number(process.env.WA_MAX_CHARS) || 3000
const MIN_CHARS = 300 // por debajo de esto un 400 ya no es por tamaño

/**
 * Parte un texto en trozos de como mucho `max` caracteres, cortando por
 * párrafos; si un párrafo no cabe, por líneas; y si una línea no cabe, a
 * lo bruto. Pura, para poder probarla.
 */
export function splitText(text, max = MAX_CHARS) {
  const t = String(text ?? '')
  if (t.length <= max) return [t]
  const trozos = []
  let actual = ''
  const empujar = (pieza) => {
    if ((actual + pieza).length <= max) { actual += pieza; return }
    if (actual) { trozos.push(actual); actual = '' }
    if (pieza.length <= max) { actual = pieza; return }
    for (let i = 0; i < pieza.length; i += max) trozos.push(pieza.slice(i, i + max))
  }
  for (const parrafo of t.split(/(?<=\n\n)/)) {
    if (parrafo.length <= max) empujar(parrafo)
    else for (const linea of parrafo.split(/(?<=\n)/)) empujar(linea)
  }
  if (actual) trozos.push(actual)
  return trozos.map((x) => x.trimEnd()).filter(Boolean)
}

async function postText(phone, text) {
  const { apiUrl } = config.whatsapp
  return fetch(
    `${apiUrl}/api/sessions/${encodeURIComponent(waState.sessionId)}/messages/send-text`,
    {
      method: 'POST',
      headers: waHeaders(),
      body: JSON.stringify({ chatId: phoneToChatId(phone), text }),
    },
  )
}

/** Envía un trozo; si el Gateway lo rechaza con 400 y aún es largo, lo parte en dos. */
async function sendChunk(phone, text) {
  const res = await postText(phone, text)
  if (res.ok) return
  const detalle = await res.text().catch(() => '')
  if (res.status === 400 && text.length > MIN_CHARS) {
    const mitad = Math.floor(text.length / 2)
    // Se corta por la línea más cercana a la mitad para no partir palabras.
    const corte = text.lastIndexOf('\n', mitad)
    const en = corte > MIN_CHARS ? corte + 1 : mitad
    console.warn(`[wa] el Gateway rechazó un texto de ${text.length} caracteres (400); lo parto en dos`)
    await sendChunk(phone, text.slice(0, en))
    await sendChunk(phone, text.slice(en))
    return
  }
  throw new Error(`OpenWA Gateway respondió ${res.status} (texto de ${text.length} caracteres): ${detalle.slice(0, 200)}`)
}

/**
 * Envía un mensaje de texto por WhatsApp a través del OpenWA Gateway. Los
 * textos largos (un contrato, una lista de 222 alquileres) salen en varios
 * mensajes seguidos, numerados, en orden.
 */
export async function sendWhatsApp(phone, content) {
  if (!config.whatsapp.enabled) {
    console.log(`[wa] (desactivado) mensaje a ${phone}: ${content}`)
    return
  }
  const trozos = splitText(content, MAX_CHARS)
  for (let i = 0; i < trozos.length; i++) {
    const texto = trozos.length > 1 ? `${trozos[i]}\n(${i + 1}/${trozos.length})` : trozos[i]
    await sendChunk(phone, texto)
  }
}

// Normaliza la respuesta de un endpoint que puede devolver un array directo o
// envuelto en { data: [...] } / { sessions: [...] } / { items: [...] }.
function asList(payload) {
  if (Array.isArray(payload)) return payload
  return payload?.data ?? payload?.sessions ?? payload?.items ?? []
}

/**
 * Detecta la sesión de WhatsApp a usar. Si WA_SESSION_ID es "auto" o está
 * vacío, pregunta al Gateway y elige una sesión conectada. Guarda el resultado
 * en waState.sessionId.
 */
export async function resolveSession() {
  const configured = config.whatsapp.sessionId
  if (configured && configured !== 'auto') {
    waState.sessionId = configured
    return waState.sessionId
  }
  const res = await fetch(`${config.whatsapp.apiUrl}/api/sessions`, {
    headers: waHeaders(),
  })
  if (!res.ok) {
    throw new Error(`No pude listar sesiones (${res.status}): ${await res.text()}`)
  }
  const list = asList(await res.json())
  if (list.length === 0) throw new Error('El Gateway no tiene ninguna sesión')
  // Se registra SIEMPRE la lista completa: cuando el asistente se queda sordo
  // la pregunta es «¿a qué sesión te suscribiste y cuáles había?», y hasta el
  // 15.09.2026 el Protokoll solo enseñaba la elegida.
  console.log(`[wa] sesiones en el Gateway: ${describirSesiones(list)}`)
  const { chosen, connected, ambigua } = pickSession(list, waState.sessionId)
  waState.sessionId = sessionIdOf(chosen)
  const status = String(chosen.status ?? chosen.state ?? 'desconocido')
  waState.sessionStatus = status
  console.log(`[wa] sesión seleccionada: ${waState.sessionId} (estado: ${status})`)
  if (ambigua) {
    console.warn(
      `[wa] ⚠️ hay VARIAS sesiones conectadas y ninguna fijada: elegí ${waState.sessionId}. ` +
        'Si el asistente no recibe mensajes, fija WA_SESSION_ID en el compose con la sesión correcta.',
    )
  }
  lastKnownConnected = Boolean(connected)
  if (!connected) warnSessionNotConnected(status)
  return waState.sessionId
}

const sessionIdOf = (s) => s?.id ?? s?.sessionId ?? s?.name ?? s?.session
const describirSesiones = (list) =>
  list.map((s) => `${sessionIdOf(s)}=${s.status ?? s.state ?? '?'}`).join(', ') || '(ninguna)'

/**
 * Elige la sesión a usar entre las que devuelve el Gateway. Pura, sin red,
 * para poder probarla. Criterio, en orden:
 *  1. Si la sesión que ya usábamos (`preferida`) sigue conectada, se mantiene
 *     (evita cambiar de sesión —y de número— por un empate).
 *  2. Si hay UNA conectada, esa.
 *  3. Si hay varias conectadas, la primera, marcando `ambigua` para avisar.
 *  4. Si no hay ninguna conectada, la preferida si existe, o la primera, con
 *     `connected: false` para que se avise bien alto (una sesión 'failed' o
 *     'qr_ready' no recibe ni envía nada).
 */
export function pickSession(list, preferida = null) {
  const conectadas = list.filter((s) => isConnectedStatus(s.status ?? s.state))
  const pref = preferida ? list.find((s) => sessionIdOf(s) === preferida) : null
  if (pref && conectadas.includes(pref)) return { chosen: pref, connected: true, ambigua: false }
  if (conectadas.length === 1) return { chosen: conectadas[0], connected: true, ambigua: false }
  if (conectadas.length > 1) return { chosen: conectadas[0], connected: true, ambigua: true }
  return { chosen: pref ?? list[0], connected: false, ambigua: false }
}

// Último estado conocido (conectada / no conectada). Lo comparte el aviso de
// arranque con el vigilante, para no repetir el mismo mensaje dos veces.
let lastKnownConnected = null

/** Aviso claro y accionable cuando la sesión de WhatsApp no está vinculada. */
function warnSessionNotConnected(status) {
  lastKnownConnected = false
  console.error(
    `[wa] ⚠️ LA SESIÓN DE WHATSAPP NO ESTÁ CONECTADA (estado: ${status}). ` +
      'No se recibirán ni enviarán mensajes hasta volver a vincular el teléfono: ' +
      'abre el panel del Gateway y escanea el código QR ' +
      `(o GET ${config.whatsapp.apiUrl}/api/sessions/${waState.sessionId}/qr).`,
  )
}

let sessionWatchTimer = null

/**
 * Vigila el estado de la sesión y avisa SOLO cuando cambia (conectada ↔ caída).
 * Sin esto, que WhatsApp se desvincule es un fallo totalmente silencioso.
 */
// Quien quiera enterarse de que la sesión ha cambiado (el tiempo real, para
// resuscribirse) se registra aquí. Evita importar realtime.js desde aquí.
const onSessionChange = []
export function whenSessionChanges(fn) { onSessionChange.push(fn) }

export function startSessionWatch(intervalMs = 60_000) {
  if (sessionWatchTimer || !config.whatsapp.enabled) return
  const fijada = config.whatsapp.sessionId && config.whatsapp.sessionId !== 'auto'
  const check = async () => {
    try {
      // Antes el vigilante solo miraba el ESTADO de la sesión elegida. Si en
      // el arranque se había elegido la sesión equivocada (por ejemplo porque
      // la buena aún no aparecía conectada), nadie volvía a elegir y el
      // asistente quedaba suscrito a una sesión que no recibe nada. Ahora se
      // vuelve a elegir con el mismo criterio y, si cambia, se avisa a quien
      // esté registrado (el tiempo real resuscribe).
      if (!fijada) {
        const res = await fetch(`${config.whatsapp.apiUrl}/api/sessions`, { headers: waHeaders() })
        if (res.ok) {
          const list = asList(await res.json())
          if (list.length) {
            const { chosen, connected } = pickSession(list, waState.sessionId)
            const nuevo = sessionIdOf(chosen)
            waState.sessionStatus = String(chosen.status ?? chosen.state ?? 'desconocido')
            if (nuevo && nuevo !== waState.sessionId) {
              console.warn(`[wa] la sesión a usar ha cambiado: ${waState.sessionId} → ${nuevo} (${describirSesiones(list)})`)
              waState.sessionId = nuevo
              for (const fn of onSessionChange) { try { fn(nuevo) } catch (e) { console.error('[wa] al cambiar de sesión:', e.message) } }
            }
            if (connected !== lastKnownConnected) {
              lastKnownConnected = connected
              if (connected) console.log(`[wa] la sesión de WhatsApp está conectada (estado: ${waState.sessionStatus})`)
              else warnSessionNotConnected(waState.sessionStatus)
            }
            return
          }
        }
      }
      const { status, connected } = await getSessionStatus()
      waState.sessionStatus = status
      if (connected === lastKnownConnected) return
      lastKnownConnected = connected
      if (connected) console.log(`[wa] la sesión de WhatsApp está conectada (estado: ${status})`)
      else warnSessionNotConnected(status)
    } catch (err) {
      console.error(`[wa] no pude comprobar el estado de la sesión: ${err.message}`)
    }
  }
  // La primera comprobación, pronto: si el arranque eligió mal, no esperamos.
  setTimeout(() => void check(), 20_000).unref?.()
  sessionWatchTimer = setInterval(check, intervalMs)
  sessionWatchTimer.unref?.()
}

// ⚠️ Ojo con las subcadenas: 'qr_ready' CONTIENE 'ready', y 'disconnected'
// contiene 'connect'. Por eso se descartan primero los estados de avería o de
// espera; antes, una sesión esperando el QR se daba por conectada.
const NOT_CONNECTED_RE = /qr|pair|fail|error|initiali|starting|stopp|closed|logout|logged_out|disconnect/i
const CONNECTED_RE = /connect|working|authenticated|ready|online|open/i

/** ¿Este estado del Gateway significa "teléfono vinculado y operativo"? */
export function isConnectedStatus(status) {
  const s = String(status ?? '')
  if (NOT_CONNECTED_RE.test(s)) return false
  return CONNECTED_RE.test(s)
}

/**
 * Estado actual de la sesión de WhatsApp en el Gateway (¿el número sigue
 * vinculado?). Devuelve { sessionId, status, connected }.
 */
export async function getSessionStatus() {
  const res = await fetch(`${config.whatsapp.apiUrl}/api/sessions`, { headers: waHeaders() })
  if (!res.ok) throw new Error(`El Gateway respondió ${res.status}`)
  const list = asList(await res.json())
  const s = list.find((x) => (x.id ?? x.sessionId ?? x.name ?? x.session) === waState.sessionId) ?? list[0]
  if (!s) return { sessionId: waState.sessionId, status: 'sin sesión', connected: false }
  const status = String(s.status ?? s.state ?? 'desconocido')
  return {
    sessionId: waState.sessionId,
    status,
    connected: isConnectedStatus(status),
    phone: s.phone ?? s.phoneNumber ?? s.me?.id ?? null,
  }
}

/**
 * Registra (si hace falta) el webhook en el Gateway para recibir las respuestas.
 * Idempotente: si ya existe un webhook con nuestra URL, no crea otro.
 */
export async function ensureWebhookRegistered() {
  const { apiUrl, webhookUrl, webhookSecret } = config.whatsapp
  if (!webhookUrl) {
    console.log('[wa] WA_WEBHOOK_URL no configurado: registra el webhook a mano en el Gateway')
    return
  }
  const base = `${apiUrl}/api/sessions/${encodeURIComponent(waState.sessionId)}/webhooks`

  // ¿Ya existe uno con nuestra URL?
  try {
    const existing = await fetch(base, { headers: waHeaders() })
    if (existing.ok) {
      const hooks = asList(await existing.json())
      if (hooks.some((h) => h.url === webhookUrl)) {
        console.log('[wa] webhook ya registrado')
        return
      }
    }
  } catch {
    /* si el listado falla, intentamos crear igualmente */
  }

  const res = await fetch(base, {
    method: 'POST',
    headers: waHeaders(),
    body: JSON.stringify({
      url: webhookUrl,
      events: ['message.received'],
      ...(webhookSecret ? { secret: webhookSecret } : {}),
    }),
  })
  if (!res.ok) {
    throw new Error(`No pude registrar el webhook (${res.status}): ${await res.text()}`)
  }
  console.log(`[wa] webhook registrado → ${webhookUrl}`)
}

// ─── Interpretación de la respuesta "¿Has completado la tarea?" ──────
// Los tres idiomas del equipo (español, alemán, portugués) más inglés.
// ⚠️ 'no' es "no" en español/portugués pero también aparece suelto en alemán
// como parte de otras palabras: por eso se comparan palabras completas.
const YES = [
  // español
  'si', 'hecho', 'hecha', 'listo', 'lista', 'vale', 'completada', 'completado',
  'terminada', 'terminado', 'finalizada', 'finalizado',
  // alemán
  'ja', 'jep', 'erledigt', 'fertig', 'gemacht', 'abgeschlossen', 'klar',
  // portugués
  'sim', 'feito', 'feita', 'concluida', 'concluido', 'pronto', 'pronta',
  // comunes
  'yes', 'ok', 'okay', 'done', '1', '✅', '👍',
]
const NO = [
  // español
  'no', 'aun no', 'todavia', 'pendiente', 'sigue abierta',
  // alemán
  'nein', 'noch nicht', 'nicht', 'offen', 'unerledigt',
  // portugués
  'nao', 'ainda nao', 'pendente', 'em aberto',
  // comunes
  'nope', '2', '❌',
]

function normalize(text) {
  return String(text)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // quita acentos
    .replace(/[.,!?\u00a1\u00bf;:]+/g, ' ') // quita puntuaci\u00f3n
    .replace(/\s+/g, ' ')
    .trim()
}

/** Devuelve 'done' | 'not_done' | 'unknown'. */
export function interpretReply(text) {
  const t = normalize(text)
  const yes = YES.map(normalize)
  const no = NO.map(normalize)
  if (yes.includes(t)) return 'done'
  if (no.includes(t)) return 'not_done'
  const first = t.split(/\s+/)[0]
  if (yes.includes(first)) return 'done'
  if (no.includes(first)) return 'not_done'
  return 'unknown'
}
