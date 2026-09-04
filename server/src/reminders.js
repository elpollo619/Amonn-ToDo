import cron from 'node-cron'
import { query } from './db.js'
import { config } from './config.js'
import { notifyUser, firstName, taskSummary } from './notify.js'
import { mailEnabled } from './mailer.js'
import { t as tr, safeLang } from './i18n.js'
import { NOMBRES as BASURA_NOMBRES, recogidasDe, masDias } from './entsorgung.js'
import { sendWhatsApp } from './whatsapp.js'
import { todayKey } from './dates.js'

// Un ÚNICO aviso diario por persona, en lugar de un mensaje por tarea.
//
// Antes, cinco tareas vencidas eran cinco mensajes de WhatsApp seguidos: se
// leen como spam y se acaban ignorando, que es justo lo contrario de lo que
// debe hacer un recordatorio. Ahora se agrupan y se separan en tres bloques,
// porque no es lo mismo "llevas tres días de retraso" que "esto es para
// mañana".
export async function runReminders() {
  const cooldownIso = new Date(
    Date.now() - config.reminderCooldownHours * 3600 * 1000,
  ).toISOString()

  const { rows: tasks } = await query(
    `select t.*, u.id as user_id, u.full_name, u.phone, u.email,
            u.notify_whatsapp, u.notify_email, u.language,
            (current_date - t.due_date) as dias_retraso
       from tasks t
       join users u on u.id = t.assignee_id
      where t.status in ('open','in_progress')
        and t.due_date is not null
        and t.due_date <= current_date + 1     -- hoy, atrasadas y las de mañana
        and (t.last_reminder_at is null or t.last_reminder_at < $1)
        and (
          (u.notify_whatsapp and u.phone is not null and u.phone <> '')
          or (u.notify_email and $2::boolean)
        )
      order by t.due_date asc`,
    [cooldownIso, mailEnabled()],
  )

  // Agrupar por persona: un mensaje cada uno, no uno por tarea.
  const porPersona = new Map()
  for (const t of tasks) {
    if (!porPersona.has(t.user_id)) porPersona.set(t.user_id, [])
    porPersona.get(t.user_id).push(t)
  }

  let sent = 0
  for (const [, suyas] of porPersona) {
    const p = suyas[0]
    const user = {
      id: p.user_id, full_name: p.full_name, phone: p.phone, email: p.email,
      notify_whatsapp: p.notify_whatsapp, notify_email: p.notify_email,
      language: p.language,
    }
    const lang = safeLang(p.language)
    const cuerpo = componerAviso(suyas, lang)
    const link = config.appUrl ? tr(lang, 'see_in_app', { url: config.appUrl }) : ''
    const r = await notifyUser(user, {
      whatsapp: tr(lang, 'digest_wa', { nombre: firstName(user), cuerpo }),
      email: tr(lang, 'digest_mail', { nombre: firstName(user), cuerpo, link }),
      subject: tr(lang, 'subject_digest', { total: suyas.length }),
    })
    if (r.whatsapp || r.email) {
      await query(
        'update tasks set last_reminder_at = now() where id = any($1::uuid[])',
        [suyas.map((x) => x.id)],
      )
      sent++
    }
  }
  console.log(`[reminders] tareas: ${tasks.length}, personas avisadas: ${sent}`)
  return { candidates: tasks.length, sent }
}

/**
 * Separa las tareas en atrasadas, de hoy y de mañana. El retraso se dice en
 * días: "hace 3 días" pesa distinto que "hace uno", y quien lo lee decide.
 */
export function componerAviso(tareas, lang) {
  const atrasadas = tareas.filter((x) => x.dias_retraso > 0)
  const hoy = tareas.filter((x) => x.dias_retraso === 0)
  const mañana = tareas.filter((x) => x.dias_retraso < 0)

  const linea = (x) => `• ${x.title}`
  const lineaConDias = (x) => tr(lang, 'digest_line_late', {
    titulo: x.title,
    dias: x.dias_retraso,
  })

  let out = ''
  if (atrasadas.length) out += tr(lang, 'digest_overdue', { lista: atrasadas.map(lineaConDias).join('\n') })
  if (hoy.length) out += tr(lang, 'digest_today', { lista: hoy.map(linea).join('\n') })
  if (mañana.length) out += tr(lang, 'digest_tomorrow', { lista: mañana.map(linea).join('\n') })
  return out
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


// ============================================================
// Aviso de la recogida de residuos, la tarde anterior.
//
// El folleto dice que hay que sacarlo antes de las 7:00 y como pronto la
// tarde de antes: avisar por la mañana no serviría de nada. Va solo a los
// teléfonos de ENTSORGUNG_TO (separados por comas) — no a todo el equipo,
// porque a quien no está en la oficina esto le sobra.
// ============================================================
export async function runAvisoBasura(hoy = todayKey()) {
  const destinos = (process.env.ENTSORGUNG_TO ?? '')
    .split(',').map((x) => x.trim()).filter(Boolean)
  if (destinos.length === 0) return { tipos: [], enviados: 0 }

  const mañana = masDias(hoy, 1)
  const tipos = recogidasDe(mañana)
  if (tipos.length === 0) return { tipos: [], enviados: 0 }

  let enviados = 0
  for (const phone of destinos) {
    const { rows } = await query('select language from users where phone = $1', [phone])
    const lang = safeLang(rows[0]?.language ?? 'de')
    const nombres = BASURA_NOMBRES[lang] ?? BASURA_NOMBRES.de
    const texto = tipos.map((x) => nombres[x]).join(' + ')
    try {
      await sendWhatsApp(phone, tr(lang, 'waste_tomorrow', { tipo: texto }))
      enviados++
    } catch (err) {
      console.error(`[basura] no se pudo avisar a ${phone}: ${err.message}`)
    }
  }
  console.log(`[basura] mañana ${mañana}: ${tipos.join(', ')} · avisados: ${enviados}`)
  return { tipos, enviados }
}

export function scheduleAvisoBasura() {
  const expr = process.env.ENTSORGUNG_CRON ?? '0 18 * * *'
  if (!cron.validate(expr)) {
    console.error(`[basura] cron inválido: ${expr}`)
    return
  }
  cron.schedule(expr, () => { runAvisoBasura().catch((e) => console.error('[basura]', e.message)) },
    { timezone: config.reminderTimezone })
  console.log(`[basura] aviso programado con "${expr}"`)
}
