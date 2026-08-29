// ============================================================
// whatsapp-webhook (Supabase Edge Function)
//
// Recibe las respuestas entrantes de WhatsApp (Twilio o Meta), interpreta
// si el usuario dice que completó la tarea, actualiza la base de datos y
// contesta con una confirmación. Configura la URL de esta función como
// webhook en tu proveedor — ver README.
// ============================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { sendWhatsAppText, normalizePhone } from '../_shared/whatsapp.ts'
import { interpretReply } from '../_shared/reply.ts'

function svc() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )
}

// Localiza a la persona por teléfono y su tarea abierta más recientemente
// recordada, decide la respuesta y devuelve el texto de confirmación.
async function processInbound(
  fromPhone: string,
  text: string,
): Promise<string> {
  const supabase = svc()
  const phone = normalizePhone(fromPhone)

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, full_name')
    .eq('phone', phone)
    .maybeSingle()

  if (!profile) {
    return 'No te reconozco en Amonn 🤔. Pide a tu equipo que registre este número en tu perfil.'
  }

  // Tarea candidata: abierta/en curso, asignada a esta persona, la más
  // recientemente recordada (o la más próxima a vencer).
  const { data: tasks } = await supabase
    .from('tasks')
    .select('id, title, last_reminder_at, due_date')
    .eq('assignee_id', profile.id)
    .in('status', ['open', 'in_progress'])
    .order('last_reminder_at', { ascending: false, nullsFirst: false })
    .order('due_date', { ascending: true })
    .limit(1)

  const task = tasks?.[0]
  if (!task) {
    return `¡Hola ${profile.full_name?.split(' ')[0] ?? ''}! No tienes tareas abiertas ahora mismo 🎉`
  }

  const intent = interpretReply(text)
  if (intent === 'done') {
    await supabase
      .from('tasks')
      .update({ status: 'done', completed_at: new Date().toISOString() })
      .eq('id', task.id)
    return `¡Genial! ✅ He marcado *"${task.title}"* como completada. ¡Buen trabajo!`
  }
  if (intent === 'not_done') {
    return `De acuerdo, dejo *"${task.title}"* como abierta. ¡Ánimo! 💪`
  }
  return (
    `No te he entendido 🤔. Sobre la tarea *"${task.title}"*:\n` +
    `Responde *SÍ* si ya la completaste, o *NO* si sigue pendiente.`
  )
}

function twiml(message: string): Response {
  const xml =
    `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${message
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')}</Message></Response>`
  return new Response(xml, { headers: { 'Content-Type': 'text/xml' } })
}

Deno.serve(async (req) => {
  const url = new URL(req.url)

  // ── Verificación del webhook de Meta (GET) ──
  if (req.method === 'GET') {
    const mode = url.searchParams.get('hub.mode')
    const token = url.searchParams.get('hub.verify_token')
    const challenge = url.searchParams.get('hub.challenge')
    if (mode === 'subscribe' && token === Deno.env.get('META_VERIFY_TOKEN')) {
      return new Response(challenge ?? '', { status: 200 })
    }
    return new Response('Forbidden', { status: 403 })
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const contentType = req.headers.get('content-type') ?? ''

  try {
    // ── Twilio: formulario urlencoded, respuesta por TwiML ──
    if (contentType.includes('application/x-www-form-urlencoded')) {
      const form = await req.formData()
      const from = (form.get('From') as string | null) ?? ''
      const body = (form.get('Body') as string | null) ?? ''
      const reply = await processInbound(from.replace('whatsapp:', ''), body)
      return twiml(reply)
    }

    // ── Meta Cloud API: JSON ──
    const payload = await req.json()
    const entries = payload?.entry ?? []
    for (const entry of entries) {
      for (const change of entry?.changes ?? []) {
        const messages = change?.value?.messages ?? []
        for (const msg of messages) {
          if (msg.type !== 'text') continue
          const from = msg.from as string // sin "+"
          const text = msg.text?.body ?? ''
          const reply = await processInbound(`+${from}`, text)
          await sendWhatsAppText(`+${from}`, reply)
        }
      }
    }
    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }
})
