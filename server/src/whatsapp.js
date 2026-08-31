// ============================================================
// Integración con el OpenWA - WhatsApp API Gateway (open-wa.org).
// - Enviamos: POST /api/sessions/{sessionId}/messages/send-text (X-API-Key).
// - Recibimos las respuestas por webhook, evento "message.received"
//   (ver routes/webhook.js).
// ============================================================
import { config } from './config.js'

// Estado en memoria de la sesión de WhatsApp que usamos (se resuelve al
// arrancar; puede venir fija por config o detectarse automáticamente).
export const waState = { sessionId: config.whatsapp.sessionId }

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

/** Envía un mensaje de texto por WhatsApp a través del OpenWA Gateway. */
export async function sendWhatsApp(phone, content) {
  if (!config.whatsapp.enabled) {
    console.log(`[wa] (desactivado) mensaje a ${phone}: ${content}`)
    return
  }
  const { apiUrl } = config.whatsapp
  const res = await fetch(
    `${apiUrl}/api/sessions/${encodeURIComponent(waState.sessionId)}/messages/send-text`,
    {
      method: 'POST',
      headers: waHeaders(),
      body: JSON.stringify({ chatId: phoneToChatId(phone), text: content }),
    },
  )
  if (!res.ok) {
    throw new Error(`OpenWA Gateway respondió ${res.status}: ${await res.text()}`)
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
  const connected = list.find((s) =>
    /connect|working|authenticated|ready|online/i.test(String(s.status ?? s.state ?? '')),
  )
  const chosen = connected ?? list[0]
  waState.sessionId = chosen.id ?? chosen.sessionId ?? chosen.name ?? chosen.session
  console.log(`[wa] sesión seleccionada: ${waState.sessionId}`)
  return waState.sessionId
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
const YES = [
  'si', 'yes', 'hecho', 'hecha', 'listo', 'lista', 'ok', 'okay', 'vale',
  'completada', 'completado', 'terminada', 'terminado', 'done', 'finalizada',
  'finalizado', '1', '✅', '👍',
]
const NO = [
  'no', 'aun no', 'todavia', 'pendiente', 'nope', 'sigue abierta', '2', '❌',
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
