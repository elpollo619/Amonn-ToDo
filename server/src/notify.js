// ============================================================
// Avisos a las personas: WhatsApp y/o email según sus preferencias.
// - Al asignar una tarea a alguien → aviso inmediato.
// - Recordatorios de tareas que vencen (reminders.js) → usan lo mismo.
// Nunca lanzan error hacia fuera: un aviso fallido se registra y ya.
// ============================================================
import { config } from './config.js'
import { sendWhatsApp } from './whatsapp.js'
import { sendEmail, mailEnabled } from './mailer.js'
import { describeRange } from './dates.js'
import { t, safeLang } from './i18n.js'

const PRIORITY_LABEL = { low: 'baja', medium: 'media', high: 'ALTA 🔴' }

export function firstName(user) {
  return (user?.full_name ?? '').trim().split(/\s+/)[0] || 'hola'
}

/** Resumen de una tarea para un mensaje. */
export function taskSummary(task, lang = 'es') {
  const lines = [`📌 ${task.title}`]
  if (task.description) lines.push(`📝 ${task.description}`)
  lines.push(t(lang, 'summary_due', {
    fecha: describeRange(task.start_date, task.due_date, undefined, lang, t),
  }))
  if (task.work_days) lines.push(t(lang, 'summary_work', { dias: task.work_days }))
  if (task.priority && task.priority !== 'medium') {
    lines.push(t(lang, 'summary_priority', { prioridad: t(lang, `prio_${task.priority}`) }))
  }
  return lines.join('\n')
}

function appLink(lang = 'es') {
  return config.appUrl ? t(lang, 'see_in_app', { url: config.appUrl }) : ''
}

/**
 * Envía un aviso a una persona por los canales que tenga activados.
 * Devuelve { whatsapp: bool, email: bool } con lo que se pudo enviar.
 */
export async function notifyUser(user, { whatsapp, email, subject }) {
  const result = { whatsapp: false, email: false }
  if (!user) return result
  const wantsWa = user.notify_whatsapp !== false && user.phone
  const wantsMail = user.notify_email !== false && user.email && mailEnabled()

  if (wantsWa && whatsapp) {
    try {
      await sendWhatsApp(user.phone, whatsapp)
      result.whatsapp = true
    } catch (err) {
      console.error(`[notify] WhatsApp a ${user.phone} falló:`, err.message)
    }
  }
  if (wantsMail && email) {
    try {
      await sendEmail(user.email, subject ?? 'Amonn', email)
      result.email = true
    } catch (err) {
      console.error(`[notify] email a ${user.email} falló:`, err.message)
    }
  }
  return result
}

/** Aviso "te han asignado una tarea". `creator` puede ser null. */
export async function notifyTaskAssigned(task, assignee, creator) {
  if (!assignee) return { whatsapp: false, email: false }
  // El aviso va en el idioma de QUIEN LO RECIBE, no en el de quien crea la
  // tarea: si Cris escribe en español y asigna a alguien que habla alemán,
  // esa persona debe recibirlo en alemán.
  const lang = safeLang(assignee.language)
  const who = creator && creator.id !== assignee.id ? firstName(creator) : null
  const intro = who
    ? t(lang, 'assigned_by', { nombre: firstName(assignee), quien: who })
    : t(lang, 'assigned', { nombre: firstName(assignee) })
  const body = `${intro}\n\n${taskSummary(task, lang)}${appLink(lang)}`
  return notifyUser(assignee, {
    whatsapp: body,
    email: body,
    subject: t(lang, 'subject_new_task', { titulo: task.title }),
  })
}
