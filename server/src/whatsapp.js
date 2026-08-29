// ============================================================
// Integración con OpenWA (open-wa/wa-automate) corriendo en el NAS.
// - Enviamos mensajes llamando a su API HTTP (EASY API): POST /sendText
// - Recibimos las respuestas del equipo por webhook (ver routes/webhook.js)
// ============================================================
import { config } from './config.js'

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

/** Envía un mensaje de texto por WhatsApp a través de OpenWA. */
export async function sendWhatsApp(phone, content) {
  if (!config.whatsapp.enabled) {
    console.log(`[wa] (desactivado) mensaje a ${phone}: ${content}`)
    return
  }
  const res = await fetch(`${config.whatsapp.apiUrl}/sendText`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(config.whatsapp.apiKey ? { api_key: config.whatsapp.apiKey } : {}),
    },
    body: JSON.stringify({
      args: { to: phoneToChatId(phone), content },
    }),
  })
  if (!res.ok) {
    throw new Error(`OpenWA respondió ${res.status}: ${await res.text()}`)
  }
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
