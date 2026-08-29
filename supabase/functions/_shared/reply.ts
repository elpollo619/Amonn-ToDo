// Interpreta la respuesta del usuario a "¿Has completado la tarea?".

export type ReplyIntent = 'done' | 'not_done' | 'unknown'

const YES = [
  'si', 'sí', 'yes', 'hecho', 'hecha', 'listo', 'lista', 'ok', 'okay',
  'vale', 'completada', 'completado', 'terminada', 'terminado', 'done',
  'finalizada', 'finalizado', '1', '✅', '👍',
]

const NO = [
  'no', 'aun no', 'aún no', 'todavia', 'todavía', 'pendiente', 'nope',
  'sigue abierta', 'no todavia', 'no todavía', '2', '❌',
]

function normalize(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // quita acentos para comparar
}

export function interpretReply(text: string): ReplyIntent {
  const t = normalize(text)
  const norm = (arr: string[]) => arr.map(normalize)

  // Coincidencia exacta primero (evita que "no" dentro de "nota" cuente).
  if (norm(YES).includes(t)) return 'done'
  if (norm(NO).includes(t)) return 'not_done'

  // Luego por palabra al inicio del mensaje.
  const firstWord = t.split(/\s+/)[0]
  if (norm(YES).includes(firstWord)) return 'done'
  if (norm(NO).includes(firstWord)) return 'not_done'

  return 'unknown'
}
