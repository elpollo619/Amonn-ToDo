import cron from 'node-cron'
import { query } from './db.js'
import { config } from './config.js'
import { notifyUser, firstName, taskSummary } from './notify.js'
import { mailEnabled } from './mailer.js'

// Envía los recordatorios (WhatsApp y/o email, según las preferencias de cada
// persona) de las tareas que vencen hoy o están vencidas y de las que no se
// avisó hace poco.
export async function runReminders() {
  const cooldownIso = new Date(
    Date.now() - config.reminderCooldownHours * 3600 * 1000,
  ).toISOString()

  const { rows: tasks } = await query(
    `select t.*, u.id as user_id, u.full_name, u.phone, u.email,
            u.notify_whatsapp, u.notify_email
       from tasks t
       join users u on u.id = t.assignee_id
      where t.status in ('open','in_progress')
        and t.due_date <= current_date
        and (t.last_reminder_at is null or t.last_reminder_at < $1)
        and (
          (u.notify_whatsapp and u.phone is not null and u.phone <> '')
          or (u.notify_email and $2::boolean)
        )`,
    [cooldownIso, mailEnabled()],
  )

  let sent = 0
  for (const t of tasks) {
    const user = {
      id: t.user_id, full_name: t.full_name, phone: t.phone, email: t.email,
      notify_whatsapp: t.notify_whatsapp, notify_email: t.notify_email,
    }
    const name = firstName(user)
    const link = config.appUrl ? `\n\nVerla en Amonn: ${config.appUrl}` : ''
    const r = await notifyUser(user, {
      whatsapp:
        `Hola ${name} 👋\n\n¿Has completado esta tarea?\n\n${taskSummary(t)}\n\n` +
        `Responde SÍ si ya está hecha, o NO si sigue abierta.`,
      email:
        `Hola ${name},\n\nEsta tarea vence o está vencida:\n\n${taskSummary(t)}\n\n` +
        `Cuando la termines, márcala como hecha en la app.${link}`,
      subject: `Recordatorio: ${t.title}`,
    })
    if (r.whatsapp || r.email) {
      await query('update tasks set last_reminder_at = now() where id = $1', [t.id])
      sent++
    }
  }
  console.log(`[reminders] candidatas: ${tasks.length}, enviadas: ${sent}`)
  return { candidates: tasks.length, sent }
}

export function scheduleReminders() {
  if (!cron.validate(config.reminderCron)) {
    console.error(`[reminders] cron inválido: ${config.reminderCron}`)
    return
  }
  cron.schedule(config.reminderCron, () => {
    runReminders().catch((e) => console.error('[reminders]', e.message))
  }, { timezone: config.timezone })
  console.log(`[reminders] programados con "${config.reminderCron}" (${config.timezone})`)
}
