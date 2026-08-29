// ============================================================
// Envío de mensajes de WhatsApp — soporta Twilio y Meta Cloud API.
// Elige el proveedor con la variable de entorno WHATSAPP_PROVIDER
// ("twilio" | "meta"). Ver functions/README.md para la configuración.
// ============================================================

export type WhatsAppProvider = 'twilio' | 'meta'

function env(name: string): string | undefined {
  return Deno.env.get(name)
}

/** Normaliza un teléfono a formato E.164 sin espacios ni guiones. */
export function normalizePhone(raw: string): string {
  return raw.replace(/[^\d+]/g, '')
}

/**
 * Envía un mensaje de texto libre por WhatsApp.
 * Nota: los mensajes de texto libre solo se entregan dentro de la ventana de
 * 24 h tras el último mensaje del usuario. Para iniciar una conversación
 * (recordatorios) Meta exige una PLANTILLA aprobada — ver sendTemplate().
 */
export async function sendWhatsAppText(to: string, body: string): Promise<void> {
  const provider = (env('WHATSAPP_PROVIDER') ?? 'twilio') as WhatsAppProvider
  const dest = normalizePhone(to)
  if (provider === 'meta') {
    await sendMetaText(dest, body)
  } else {
    await sendTwilioText(dest, body)
  }
}

/**
 * Envía una plantilla aprobada (para iniciar conversaciones / recordatorios).
 * `params` rellena las variables {{1}}, {{2}}… de la plantilla en orden.
 * Con Twilio se usa un Content SID; con Meta el nombre de la plantilla.
 */
export async function sendWhatsAppTemplate(
  to: string,
  params: string[],
): Promise<void> {
  const provider = (env('WHATSAPP_PROVIDER') ?? 'twilio') as WhatsAppProvider
  const dest = normalizePhone(to)
  if (provider === 'meta') {
    await sendMetaTemplate(dest, params)
  } else {
    await sendTwilioTemplate(dest, params)
  }
}

// ─── Twilio ──────────────────────────────────────────────────
async function sendTwilioText(to: string, body: string): Promise<void> {
  const sid = env('TWILIO_ACCOUNT_SID')
  const token = env('TWILIO_AUTH_TOKEN')
  const from = env('TWILIO_WHATSAPP_FROM') // ej. "whatsapp:+14155238886"
  if (!sid || !token || !from) throw new Error('Faltan credenciales de Twilio')

  const form = new URLSearchParams({
    To: `whatsapp:${to}`,
    From: from,
    Body: body,
  })
  await twilioRequest(sid, token, form)
}

async function sendTwilioTemplate(to: string, params: string[]): Promise<void> {
  const sid = env('TWILIO_ACCOUNT_SID')
  const token = env('TWILIO_AUTH_TOKEN')
  const from = env('TWILIO_WHATSAPP_FROM')
  const contentSid = env('TWILIO_TEMPLATE_SID')
  if (!sid || !token || !from || !contentSid)
    throw new Error('Faltan credenciales/plantilla de Twilio')

  const variables: Record<string, string> = {}
  params.forEach((p, i) => (variables[String(i + 1)] = p))

  const form = new URLSearchParams({
    To: `whatsapp:${to}`,
    From: from,
    ContentSid: contentSid,
    ContentVariables: JSON.stringify(variables),
  })
  await twilioRequest(sid, token, form)
}

async function twilioRequest(
  sid: string,
  token: string,
  form: URLSearchParams,
): Promise<void> {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + btoa(`${sid}:${token}`),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: form.toString(),
  })
  if (!res.ok) {
    throw new Error(`Twilio error ${res.status}: ${await res.text()}`)
  }
}

// ─── Meta Cloud API ──────────────────────────────────────────
async function sendMetaText(to: string, body: string): Promise<void> {
  await metaRequest({
    messaging_product: 'whatsapp',
    to: to.replace('+', ''),
    type: 'text',
    text: { body },
  })
}

async function sendMetaTemplate(to: string, params: string[]): Promise<void> {
  const templateName = env('META_TEMPLATE_NAME') ?? 'tarea_recordatorio'
  const lang = env('META_TEMPLATE_LANG') ?? 'es'
  await metaRequest({
    messaging_product: 'whatsapp',
    to: to.replace('+', ''),
    type: 'template',
    template: {
      name: templateName,
      language: { code: lang },
      components: [
        {
          type: 'body',
          parameters: params.map((p) => ({ type: 'text', text: p })),
        },
      ],
    },
  })
}

async function metaRequest(payload: unknown): Promise<void> {
  const phoneId = env('META_PHONE_NUMBER_ID')
  const token = env('META_ACCESS_TOKEN')
  if (!phoneId || !token) throw new Error('Faltan credenciales de Meta')

  const res = await fetch(
    `https://graph.facebook.com/v21.0/${phoneId}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    },
  )
  if (!res.ok) {
    throw new Error(`Meta error ${res.status}: ${await res.text()}`)
  }
}
