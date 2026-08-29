import cron from 'node-cron'
import { query } from './db.js'
import { config } from './config.js'
import { sendWhatsApp } from './whatsapp.js'

// Envía los recordatorios de WhatsApp de las tareas que vencen hoy o están
// vencidas, cuyo responsable tiene teléfono y no se avisó hace poco.
export async function runReminders() {
  const cooldownIso = new Date(
    Date.now() - config.reminderCooldownHours * 3600 * 1000,
  ).toISOString()

  const { rows: tasks } = await query(
    `select t.id, t.title, u.full_name, u.phone
       from tasks t
       join users u on u.id = t.assignee_id
      where t.status in ('open','in_progress')
        and u.phone is not null and u.phone <> ''
        and t.due_date <= current_date
        and (t.last_reminder_at is null or t.last_reminder_at < $1)`,
    [cooldownIso],
  )

  let sent = 0
  for (const task of tasks) {
    const name = (task.full_name ?? '').split(' ')[0] || 'hola'
    try {
      await sendWhatsApp(
        task.phone,
        `Hola ${name} 👋\n\n¿Has completado la tarea "${task.title}"?\n\n` +
          `Responde SÍ si ya está hecha, o NO si sigue abierta.`,
      )
      await query('update tasks set last_reminder_at = now() where id = $1', [task.id])
      sent++
    } catch (err) {
      console.error(`[reminders] fallo al avisar de ${task.id}:`, err.message)
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
