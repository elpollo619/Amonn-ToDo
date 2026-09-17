// ============================================================
// Ausencias del equipo: «Rayna de vacaciones del 10 al 15».
//
// Mientras dura la ausencia, la persona no recibe el aviso diario de tareas
// (volver de vacaciones a un WhatsApp con tres días de "atrasadas" ya lo
// hace la vida sola). Al asignarle una tarea se avisa a quien la crea, pero
// la tarea SE CREA igual: la máquina no decide por la persona.
// ============================================================
import { query } from './db.js'
import { broadcast } from './events.js'

export async function addAbsence({ userId, startsOn, endsOn, reason = null, createdBy = null }) {
  const { rows } = await query(
    `insert into absences (user_id, starts_on, ends_on, reason, created_by)
     values ($1,$2,$3,$4,$5) returning *`,
    [userId, startsOn, endsOn, reason, createdBy],
  )
  broadcast()
  return rows[0]
}

/** Ausencias de hoy en adelante, con el nombre de la persona. */
export async function listAbsences(desde) {
  const { rows } = await query(
    `select a.*, u.full_name
       from absences a join users u on u.id = a.user_id
      where a.ends_on >= $1
      order by a.starts_on asc`,
    [desde],
  )
  return rows
}

/** La ausencia que cubre ese día para esa persona, o null. */
export async function ausenciaDe(userId, dia) {
  const { rows } = await query(
    `select * from absences
      where user_id = $1 and starts_on <= $2 and ends_on >= $2
      order by ends_on desc limit 1`,
    [userId, dia],
  )
  return rows[0] ?? null
}
