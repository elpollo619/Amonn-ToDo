import cron from 'node-cron'
import { query } from './db.js'
import { config } from './config.js'
import { notifyUser, firstName, taskSummary } from './notify.js'
import { mailEnabled } from './mailer.js'
import { t as tr, safeLang } from './i18n.js'
import { NOMBRES as BASURA_NOMBRES, recogidasDe, masDias } from './entsorgung.js'
import { sendWhatsApp } from './whatsapp.js'
import { todayKey } from './dates.js'
import { saldos, chf } from './gastos.js'
import { listAppointments } from './agenda.js'
import { estadoDeCobros } from './impagos.js'
import { apaleoConfigurado, llegadas, salidas } from './apaleo.js'

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
        -- A quien está de vacaciones o de baja no se le recuerda nada:
        -- ya le esperará todo a la vuelta.
        and not exists (
          select 1 from absences ab
           where ab.user_id = u.id
             and ab.starts_on <= current_date and ab.ends_on >= current_date
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
// Resumen semanal: la foto del negocio en un mensaje.
//
// Lo pide cualquiera con «resumen semanal» y, si RESUMEN_TO tiene teléfonos
// (separados por comas), también se manda solo los lunes por la mañana.
// ============================================================
export async function componerResumenSemanal(lang = 'es') {
  const { rows: atrasadas } = await query(
    `select t.title, u.full_name, (current_date - t.due_date) as dias
       from tasks t left join users u on u.id = t.assignee_id
      where t.status in ('open','in_progress') and t.due_date < current_date
      order by t.due_date asc limit 10`,
  )
  const { rows: semana } = await query(
    `select t.title, t.due_date, u.full_name
       from tasks t left join users u on u.id = t.assignee_id
      where t.status in ('open','in_progress')
        and t.due_date >= current_date and t.due_date < current_date + 7
      order by t.due_date asc limit 12`,
  )
  const deudas = await saldos()
  const citas = await listAppointments(new Date().toISOString(), 8)
  const enSemana = citas.filter((c) => new Date(c.starts_at) < new Date(Date.now() + 7 * 86400000))

  const dia = (d) => String(d).slice(0, 10).split('-').reverse().slice(0, 2).join('/')
  const hora = (iso) => new Intl.DateTimeFormat('de-CH', {
    timeZone: config.timezone, weekday: 'short', hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso))

  let out = ''
  if (atrasadas.length) {
    out += tr(lang, 'week_overdue', {
      lista: atrasadas.map((x) => tr(lang, 'week_overdue_line', {
        titulo: x.title, quien: x.full_name ?? '—', dias: x.dias,
      })).join('\n'),
    })
  }
  if (semana.length) {
    out += tr(lang, 'week_due', {
      lista: semana.map((x) => `• ${dia(x.due_date)} ${x.title} (${x.full_name ?? '—'})`).join('\n'),
    })
  }
  if (deudas.length) {
    const total = deudas.reduce((n, p) => n + Number(p.total_cents), 0)
    out += tr(lang, 'week_expenses', {
      total: chf(total),
      lista: deudas.map((p) => `• ${p.full_name}: CHF ${chf(Number(p.total_cents))}`).join('\n'),
    })
  }
  if (enSemana.length) {
    out += tr(lang, 'week_appts', {
      lista: enSemana.map((c) => `• ${hora(c.starts_at)} ${c.title}${c.with_whom ? ` — ${c.with_whom}` : ''}`).join('\n'),
    })
  }
  return out ? tr(lang, 'week_head') + out : tr(lang, 'week_quiet')
}

export async function runResumenSemanal() {
  const destinos = (process.env.RESUMEN_TO ?? '')
    .split(',').map((x) => x.trim()).filter(Boolean)
  if (destinos.length === 0) return { enviados: 0 }
  let enviados = 0
  for (const phone of destinos) {
    const { rows } = await query('select language from users where phone = $1', [phone])
    const lang = safeLang(rows[0]?.language ?? 'es')
    try {
      await sendWhatsApp(phone, await componerResumenSemanal(lang))
      enviados++
    } catch (err) {
      console.error(`[resumen] no se pudo mandar a ${phone}: ${err.message}`)
    }
  }
  console.log(`[resumen] semanal enviado a ${enviados} teléfono(s)`)
  return { enviados }
}

// ============================================================
// Resumen diario: "¿qué requiere mi atención hoy?".
//
// La foto del día para dirección/oficina en un solo mensaje: lo urgente de
// tareas, las citas de hoy, entradas/salidas del hotel e impagos del mes.
// Cada bloque es defensivo: si un módulo no está configurado (p.ej. Apaleo)
// o falla, el resumen sigue saliendo con lo demás.
// ============================================================
export async function componerResumenDiario(lang = 'es') {
  const bloques = []

  // 1) Tareas: atrasadas y las de hoy (lo que vence ya).
  try {
    const { rows } = await query(
      `select t.title, u.full_name, (current_date - t.due_date) as dias
         from tasks t left join users u on u.id = t.assignee_id
        where t.status in ('open','in_progress')
          and t.due_date is not null and t.due_date <= current_date
        order by t.due_date asc limit 12`,
    )
    if (rows.length) {
      const linea = (x) => x.dias > 0
        ? tr(lang, 'week_overdue_line', { titulo: x.title, quien: x.full_name ?? '—', dias: x.dias })
        : `• ${x.title} (${x.full_name ?? '—'})`
      bloques.push(tr(lang, 'day_tasks', { lista: rows.map(linea).join('\n') }))
    }
  } catch (e) { console.error('[resumen-diario] tareas:', e.message) }

  // 2) Citas de hoy.
  try {
    const hoy = todayKey()
    const citas = (await listAppointments(new Date().toISOString(), 12))
      .filter((c) => String(c.starts_at).slice(0, 10) === hoy)
    if (citas.length) {
      const hora = (iso) => new Intl.DateTimeFormat('de-CH', {
        timeZone: config.timezone, hour: '2-digit', minute: '2-digit',
      }).format(new Date(iso))
      bloques.push(tr(lang, 'day_appts', {
        lista: citas.map((c) => `• ${hora(c.starts_at)} ${c.title}${c.with_whom ? ` — ${c.with_whom}` : ''}`).join('\n'),
      }))
    }
  } catch (e) { console.error('[resumen-diario] citas:', e.message) }

  // 3) Hotel: entradas y salidas de hoy (solo si Apaleo está conectado).
  if (apaleoConfigurado()) {
    try {
      const hoy = todayKey()
      const [inn, out] = await Promise.all([llegadas(hoy), salidas(hoy)])
      const nIn = Array.isArray(inn) ? inn.length : (inn?.reservations?.length ?? 0)
      const nOut = Array.isArray(out) ? out.length : (out?.reservations?.length ?? 0)
      if (nIn || nOut) bloques.push(tr(lang, 'day_hotel', { entradas: nIn, salidas: nOut }))
    } catch (e) { console.error('[resumen-diario] hotel:', e.message) }
  }

  // 4) Impagos del mes (si ya hay abonos vistos en el banco).
  try {
    const cobros = await estadoDeCobros()
    if (cobros.abonos > 0 && cobros.impagados.length > 0) {
      bloques.push(tr(lang, 'day_unpaid', { n: cobros.impagados.length }))
    }
  } catch (e) { console.error('[resumen-diario] impagos:', e.message) }

  return bloques.length ? tr(lang, 'day_head') + bloques.join('') : tr(lang, 'day_quiet')
}

export function scheduleResumenSemanal() {
  const expr = process.env.RESUMEN_CRON ?? '0 7 * * 1' // lunes 07:00
  if (!cron.validate(expr)) {
    console.error(`[resumen] cron inválido: ${expr}`)
    return
  }
  cron.schedule(expr, () => { runResumenSemanal().catch((e) => console.error('[resumen]', e.message)) },
    { timezone: config.timezone })
  console.log(`[resumen] semanal programado con "${expr}"`)
}

// ============================================================
// Aviso de cada cita, una hora antes.
//
// El calendario .ics ya lleva su alarma, pero Google tarda horas en
// refrescar y no todo el mundo está suscrito. El WhatsApp llega seguro.
// Se avisa a quien va a la cita (attendee) o, si no tiene, a quien la creó.
// ============================================================
export async function runAvisoCitas(ahora = new Date()) {
  // Ventana de 60 a 0 minutos antes. El cron pasa cada 5, así que ninguna
  // cita se escapa; reminded_at evita avisar dos veces.
  const hasta = new Date(ahora.getTime() + 60 * 60000)
  const { rows: citas } = await query(
    `select a.*, coalesce(att.phone, cre.phone) as phone,
            coalesce(att.language, cre.language) as language
       from appointments a
       left join users att on att.id = a.attendee_id
       left join users cre on cre.id = a.created_by
      where a.starts_at > $1 and a.starts_at <= $2
        and a.reminded_at is null
      order by a.starts_at asc`,
    [ahora.toISOString(), hasta.toISOString()],
  )

  let enviados = 0
  for (const c of citas) {
    if (!c.phone) continue
    const lang = safeLang(c.language ?? 'es')
    const hora = new Intl.DateTimeFormat('de-CH', {
      timeZone: config.timezone, hour: '2-digit', minute: '2-digit',
    }).format(new Date(c.starts_at))
    const con = c.with_whom ? ` — ${c.with_whom}` : ''
    const lugar = c.place ? tr(lang, 'appt_soon_place', { lugar: c.place }) : ''
    try {
      await sendWhatsApp(c.phone, tr(lang, 'appt_soon', { hora, titulo: `${c.title}${con}`, lugar }))
      await query('update appointments set reminded_at = now() where id = $1', [c.id])
      enviados++
    } catch (err) {
      console.error(`[citas] no se pudo avisar de "${c.title}": ${err.message}`)
    }
  }
  if (citas.length) console.log(`[citas] próximas: ${citas.length}, avisadas: ${enviados}`)
  return { candidatas: citas.length, enviados }
}

export function scheduleAvisoCitas() {
  cron.schedule('*/5 * * * *', () => {
    runAvisoCitas().catch((e) => console.error('[citas]', e.message))
  }, { timezone: config.timezone })
  console.log('[citas] aviso de cita 1 h antes, comprobando cada 5 min')
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
