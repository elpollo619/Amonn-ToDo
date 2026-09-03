// ============================================================
// "Escribe una tarea y pulsa Enter": convierte una línea suelta en una tarea.
//
//   Revisar la caldera @Isma /lun-jue !
//
//   @nombre  → responsable (por nombre o apodo; busca por parecido)
//   /fecha   → plazo: /hoy /mañana /viernes /15-10 /lun-jue (de lunes a jueves)
//   !        → prioridad alta
//
// Es el mismo espíritu que el asistente de WhatsApp, pero en la app y sin
// pasar por el servidor: apuntar algo tiene que costar segundos.
// ============================================================
import { todayKey, parseDay } from './dates'
import type { Profile, TaskInput } from './types'

const DIAS = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado']
const CORTOS = ['dom', 'lun', 'mar', 'mie', 'jue', 'vie', 'sab']

function normaliza(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

function clave(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

function sumaDias(key: string, n: number): string {
  const d = parseDay(key)
  d.setDate(d.getDate() + n)
  return clave(d)
}

/** Un día suelto escrito tras la barra: hoy, mañana, un día de la semana, 15-10. */
function unDia(txt: string): string | null {
  const t = normaliza(txt).trim()
  const hoy = todayKey()
  if (t === 'hoy') return hoy
  if (t === 'manana') return sumaDias(hoy, 1)
  if (t === 'pasado') return sumaDias(hoy, 2)

  const idx = DIAS.findIndex((d) => d === t) >= 0 ? DIAS.findIndex((d) => d === t) : CORTOS.indexOf(t)
  if (idx >= 0) {
    const actual = parseDay(hoy).getDay()
    let diff = (idx - actual + 7) % 7
    if (diff === 0) diff = 7 // "el jueves" dicho un jueves es el que viene
    return sumaDias(hoy, diff)
  }

  const m = t.match(/^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?$/)
  if (m) {
    const dia = Number(m[1])
    const mes = Number(m[2])
    let anio = m[3] ? Number(m[3]) : parseDay(hoy).getFullYear()
    if (anio < 100) anio += 2000
    if (dia < 1 || dia > 31 || mes < 1 || mes > 12) return null
    const p = (n: number) => String(n).padStart(2, '0')
    let key = `${anio}-${p(mes)}-${p(dia)}`
    if (!m[3] && key < hoy) key = `${anio + 1}${key.slice(4)}`
    return key
  }
  return null
}

export interface Analizado {
  input: TaskInput
  /** Trozos reconocidos, para poder resaltarlos mientras se escribe. */
  reconocido: { persona: string | null; plazo: string | null; urgente: boolean }
}

/**
 * Analiza la línea. `personas` sirve para resolver el @nombre; si no se
 * encuentra a nadie, el texto se deja tal cual en el título en lugar de
 * tragárselo en silencio.
 */
export function analizar(linea: string, personas: Profile[]): Analizado {
  let texto = linea
  let assignee: string | null = null
  let nombreVisto: string | null = null
  let start: string | null = null
  let end: string | null = null
  let plazoVisto: string | null = null

  // @nombre
  const mPersona = texto.match(/@([\p{L}]+)/u)
  if (mPersona) {
    const q = normaliza(mPersona[1])
    const encontrada = personas.find((p) => {
      const nombre = normaliza(p.full_name ?? '')
      return nombre === q || nombre.split(' ')[0] === q || nombre.startsWith(q)
    })
    if (encontrada) {
      assignee = encontrada.id
      nombreVisto = encontrada.full_name
      texto = texto.replace(mPersona[0], ' ')
    }
  }

  // /fecha o /desde-hasta
  const mPlazo = texto.match(/\/([\p{L}\d]+(?:[/.-][\p{L}\d]+)*)/u)
  if (mPlazo) {
    const crudo = mPlazo[1]
    const guion = crudo.match(/^([\p{L}]+)-([\p{L}]+)$/u) // "lun-jue"
    if (guion) {
      const a = unDia(guion[1])
      const b = unDia(guion[2])
      if (a && b && b >= a) {
        start = a
        end = b
      }
    }
    if (!end) end = unDia(crudo)
    if (end) {
      plazoVisto = crudo
      texto = texto.replace(mPlazo[0], ' ')
    }
  }

  // ! al final = urgente
  const urgente = /(^|\s)!(\s|$)/.test(texto)
  if (urgente) texto = texto.replace(/(^|\s)!(\s|$)/, ' ')

  const title = texto.replace(/\s+/g, ' ').trim()
  return {
    input: {
      title,
      assignee_id: assignee,
      due_date: end,
      start_date: start,
      priority: urgente ? 'high' : 'medium',
    },
    reconocido: { persona: nombreVisto, plazo: plazoVisto, urgente },
  }
}
