// ============================================================
// Citas (Termine) y el calendario que se puede suscribir.
//
// Una cita no es una tarea: tiene HORA y suele ser con alguien de fuera.
// Por eso vive aparte.
//
// El calendario se publica en formato iCalendar y Google (o el móvil) se
// suscribe a él UNA vez. Se eligió así en lugar de conectar la app con la
// cuenta de Google: sin permisos que caducan, sin credenciales que guardar,
// y funciona igual en Google, Apple u Outlook. A cambio, Google refresca
// cuando quiere (suele tardar unas horas), así que no sirve para cambios de
// último minuto — para eso está el propio WhatsApp.
// ============================================================
import { query } from './db.js'
import { broadcast } from './events.js'

export async function createAppointment({ title, withWhom = null, place = null, startsAt, minutes = 60, notes = null, createdBy = null, attendeeId = null, source = 'app' }) {
  const { rows } = await query(
    `insert into appointments (title, with_whom, place, starts_at, minutes, notes, created_by, attendee_id, source)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning *`,
    [title, withWhom, place, startsAt, minutes, notes, createdBy, attendeeId, source],
  )
  broadcast()
  return rows[0]
}

/** Citas desde una fecha, para listar por WhatsApp. */
export async function listAppointments(desdeIso, limite = 10) {
  const { rows } = await query(
    `select a.*, u.full_name as attendee_name
       from appointments a
       left join users u on u.id = a.attendee_id
      where a.starts_at >= $1
      order by a.starts_at asc limit $2`,
    [desdeIso, limite],
  )
  return rows
}

/** Todo lo que va al calendario: citas + tareas con plazo. */
export async function eventosDelCalendario() {
  const { rows: citas } = await query(
    `select a.id, a.title, a.with_whom, a.place, a.starts_at, a.minutes, a.notes,
            u.full_name as quien
       from appointments a
       left join users u on u.id = a.attendee_id
      where a.starts_at > now() - interval '90 days'`,
  )
  const { rows: tareas } = await query(
    `select t.id, t.title, t.due_date, t.start_date, u.full_name as quien, s.name as estado
       from tasks t
       left join users u on u.id = t.assignee_id
       left join task_states s on s.id = t.state_id
      where t.due_date is not null
        and t.due_date > current_date - 90
        and t.status in ('open','in_progress')`,
  )
  return { citas, tareas }
}

// ---------- iCalendar ----------
// El formato es quisquilloso: líneas terminadas en CRLF, textos con los
// caracteres especiales escapados, y fechas en UTC con Z.

function esc(s) {
  return String(s ?? '')
    .replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')
}
const utc = (d) => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
const soloDia = (d) => String(d).slice(0, 10).replace(/-/g, '')

/** Genera el .ics completo. `base` es solo para los identificadores. */
export function construirIcs({ citas, tareas }, base = 'amonn') {
  const L = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Hans Amonn AG//Amonn ToDo//DE',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Amonn — Termine und Fristen',
    'X-WR-TIMEZONE:Europe/Zurich',
    // Cada cuánto puede refrescar quien se suscribe.
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
  ]

  for (const c of citas) {
    const fin = new Date(new Date(c.starts_at).getTime() + (c.minutes ?? 60) * 60000)
    const titulo = c.with_whom ? `${c.title} — ${c.with_whom}` : c.title
    L.push(
      'BEGIN:VEVENT',
      `UID:cita-${c.id}@${base}`,
      `DTSTAMP:${utc(new Date())}`,
      `DTSTART:${utc(c.starts_at)}`,
      `DTEND:${utc(fin)}`,
      `SUMMARY:${esc(titulo)}`,
      ...(c.place ? [`LOCATION:${esc(c.place)}`] : []),
      ...(c.notes || c.quien
        ? [`DESCRIPTION:${esc([c.notes, c.quien ? `Zuständig: ${c.quien}` : null].filter(Boolean).join('\n'))}`]
        : []),
      // Aviso una hora antes; una cita con un cliente sin aviso no sirve.
      'BEGIN:VALARM', 'TRIGGER:-PT1H', 'ACTION:DISPLAY', `DESCRIPTION:${esc(titulo)}`, 'END:VALARM',
      'END:VEVENT',
    )
  }

  // Las tareas van como evento de día completo el día del plazo: en el
  // calendario interesa VER el vencimiento, no ocupar una hora concreta.
  for (const t of tareas) {
    const dia = soloDia(t.due_date)
    const finExclusivo = new Date(`${String(t.due_date).slice(0, 10)}T12:00:00Z`)
    finExclusivo.setUTCDate(finExclusivo.getUTCDate() + 1)
    L.push(
      'BEGIN:VEVENT',
      `UID:tarea-${t.id}@${base}`,
      `DTSTAMP:${utc(new Date())}`,
      `DTSTART;VALUE=DATE:${dia}`,
      `DTEND;VALUE=DATE:${soloDia(finExclusivo.toISOString())}`,
      `SUMMARY:${esc(`⏳ ${t.title}`)}`,
      ...(t.quien || t.estado
        ? [`DESCRIPTION:${esc([t.quien ? `Zuständig: ${t.quien}` : null, t.estado].filter(Boolean).join(' · '))}`]
        : []),
      'TRANSP:TRANSPARENT',
      'END:VEVENT',
    )
  }

  L.push('END:VCALENDAR')
  return L.join('\r\n') + '\r\n'
}
