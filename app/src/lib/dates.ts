/** Convierte 'YYYY-MM-DD' en Date local (sin desfase de zona horaria). */
export function parseDay(due: string): Date {
  const [y, m, d] = due.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function todayKey(): string {
  const t = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}`
}

/** Etiqueta corta y si está vencida, relativa a hoy. */
export function describeDue(due: string): { label: string; overdue: boolean; today: boolean } {
  const date = parseDay(due)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diff = Math.round((date.getTime() - today.getTime()) / 86400000)
  let label: string
  if (diff === 0) label = 'Hoy'
  else if (diff === 1) label = 'Mañana'
  else if (diff === -1) label = 'Ayer'
  else if (diff < -1 && diff > -7) label = `Hace ${-diff} días`
  else label = date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
  return { label, overdue: diff < 0, today: diff === 0 }
}

/** Etiqueta corta de un día suelto: "mié 10", "3 sept". */
function etiquetaCorta(key: string): string {
  return parseDay(key).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric' })
}

/**
 * Texto del plazo de una tarea. Con inicio y fin distintos se enseña el
 * tramo entero ("lun 7 → jue 10"); si no, la etiqueta relativa de siempre.
 */
export function describeRange(
  start: string | null | undefined,
  end: string | null,
): { label: string; overdue: boolean; today: boolean; span: boolean } {
  if (!end) return { label: 'Sin fecha', overdue: false, today: false, span: false }
  const fin = describeDue(end)
  if (!start || start === end) return { ...fin, span: false }
  return { label: `${etiquetaCorta(start)} → ${etiquetaCorta(end)}`, overdue: fin.overdue, today: fin.today, span: true }
}

export type Cubo = 'vencida' | 'hoy' | 'semana' | 'despues' | 'sin_fecha'

/**
 * En qué grupo de urgencia cae una tarea. Esto es lo que ordena la pantalla
 * de inicio: la urgencia deja de ser un detalle de la tarjeta y pasa a ser la
 * estructura de la pantalla.
 */
export function cuboDe(task: { due_date: string | null }): Cubo {
  if (!task.due_date) return 'sin_fecha'
  const date = parseDay(task.due_date)
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  const dias = Math.round((date.getTime() - hoy.getTime()) / 86400000)
  if (dias < 0) return 'vencida'
  if (dias === 0) return 'hoy'
  if (dias <= 7) return 'semana'
  return 'despues'
}

/** Días de trabajo de una tarea (el campo llega como texto desde Postgres). */
export function diasDeTrabajo(task: { work_days?: number | string | null }): number {
  const n = Number(task.work_days)
  return Number.isFinite(n) && n > 0 ? n : 0
}
