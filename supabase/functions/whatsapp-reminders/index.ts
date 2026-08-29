// ============================================================
// whatsapp-reminders (Supabase Edge Function)
//
// Recorre las tareas ABIERTAS que vencen hoy o están vencidas, cuyo
// responsable tiene teléfono, y le envía un WhatsApp preguntando si la
// completó. Se ejecuta de forma programada (cron) — ver README.
// ============================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { sendWhatsAppText, sendWhatsAppTemplate } from '../_shared/whatsapp.ts'

// Horas mínimas entre dos recordatorios de la misma tarea.
const REMINDER_COOLDOWN_HOURS = 20

interface AssigneeInfo {
  full_name: string | null
  phone: string | null
}

Deno.serve(async (req) => {
  // Protección simple: exige una cabecera secreta salvo que sea invocación
  // programada interna (que ya viaja autenticada con el service role).
  const secret = Deno.env.get('REMINDER_SECRET')
  if (secret) {
    const provided = req.headers.get('x-reminder-secret')
    if (provided !== secret) {
      return new Response('No autorizado', { status: 401 })
    }
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const today = new Date().toISOString().slice(0, 10)
  const cutoff = new Date(
    Date.now() - REMINDER_COOLDOWN_HOURS * 3600 * 1000,
  ).toISOString()

  // Tareas abiertas/en curso, con fecha vencida o de hoy, sin recordar hace poco.
  const { data: tasks, error } = await supabase
    .from('tasks')
    .select(
      'id, title, due_date, last_reminder_at, status, assignee:profiles!tasks_assignee_id_fkey(full_name, phone)',
    )
    .in('status', ['open', 'in_progress'])
    .not('assignee_id', 'is', null)
    .lte('due_date', today)
    .or(`last_reminder_at.is.null,last_reminder_at.lt.${cutoff}`)

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const useTemplate = Deno.env.get('WHATSAPP_USE_TEMPLATE') === 'true'
  let sent = 0
  const failures: string[] = []

  for (const task of tasks ?? []) {
    const assignee = task.assignee as AssigneeInfo | null
    const phone = assignee?.phone
    if (!phone) continue

    const name = assignee?.full_name?.split(' ')[0] ?? 'hola'
    try {
      if (useTemplate) {
        // Plantilla aprobada con variables: {{1}} nombre, {{2}} tarea.
        await sendWhatsAppTemplate(phone, [name, task.title])
      } else {
        await sendWhatsAppText(
          phone,
          `Hola ${name} 👋\n\n¿Has completado la tarea *"${task.title}"*?\n\n` +
            `Responde *SÍ* si ya está hecha, o *NO* si sigue abierta.`,
        )
      }
      await supabase
        .from('tasks')
        .update({ last_reminder_at: new Date().toISOString() })
        .eq('id', task.id)
      sent++
    } catch (e) {
      failures.push(`${task.id}: ${e instanceof Error ? e.message : e}`)
    }
  }

  return new Response(
    JSON.stringify({ ok: true, candidates: tasks?.length ?? 0, sent, failures }),
    { headers: { 'Content-Type': 'application/json' } },
  )
})
