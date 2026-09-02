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
