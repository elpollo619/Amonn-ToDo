// ============================================================
// Colocación de las barras de la línea de tiempo.
//
// Se separa de la pantalla a propósito: aquí está toda la aritmética
// delicada (recortar barras que se salen de la ventana, repartir las que se
// solapan en carriles, contar solo días laborables) y así se puede probar
// sin navegador.
//
// Solo se muestran DÍAS LABORABLES: el taller no trabaja el fin de semana, y
// dedicarle dos columnas de siete a algo que siempre está vacío desperdicia
// la mitad del ancho.
// ============================================================
import { parseDay, todayKey } from './dates'
import type { Task } from './types'

export interface Dia {
  key: string
  /** "lun", "mar"… */
  dow: string
  /** Día del mes. */
  num: string
  esHoy: boolean
  /** Primer día de una semana nueva: sirve para dibujar la separación. */
  inicioSemana: boolean
}

export interface Barra {
  task: Task
  /** Columna donde empieza (1 = primera). */
  col: number
  /** Cuántas columnas ocupa. */
  span: number
  /** Carril dentro de la fila de la persona (0 = el de arriba). */
  carril: number
  /** La tarea empieza antes de la ventana visible. */
  cortadaIzquierda: boolean
  /** La tarea acaba después. */
  cortadaDerecha: boolean
}

const DOW = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']

function suma(key: string, n: number): string {
  const d = parseDay(key)
  d.setDate(d.getDate() + n)
  const p = (x: number) => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** El lunes de la semana de `key`. */
export function lunesDe(key: string): string {
  const d = parseDay(key)
  const dow = d.getDay() // 0 = domingo
  return suma(key, dow === 0 ? -6 : 1 - dow)
}

/**
 * Los días laborables de `semanas` semanas empezando en el lunes indicado.
 */
export function diasLaborables(lunes: string, semanas = 2, hoy = todayKey()): Dia[] {
  const dias: Dia[] = []
  for (let s = 0; s < semanas; s++) {
    for (let i = 0; i < 5; i++) {
      const key = suma(lunes, s * 7 + i)
      const d = parseDay(key)
      dias.push({
        key,
        dow: DOW[d.getDay()],
        num: String(d.getDate()),
        esHoy: key === hoy,
        inicioSemana: i === 0,
      })
    }
  }
  return dias
}

/**
 * Coloca las tareas de UNA persona en carriles. Devuelve las barras ya
 * recortadas a la ventana; las que caen fuera del todo se descartan.
 *
 * El reparto en carriles es voraz: cada barra va al primer carril donde no
 * pisa a otra. Es suficiente y predecible; algoritmos más finos solo
 * cambiarían el orden vertical sin ganar nada.
 */
export function colocarBarras(tasks: Task[], dias: Dia[]): Barra[] {
  if (dias.length === 0) return []
  const primero = dias[0].key
  const ultimo = dias[dias.length - 1].key
  // Índice por fecha: una tarea puede empezar un sábado, que no es columna.
  // En ese caso se engancha al primer día laborable siguiente.
  const indice = (key: string, haciaDelante: boolean): number => {
    const i = dias.findIndex((d) => d.key === key)
    if (i >= 0) return i
    if (haciaDelante) {
      const j = dias.findIndex((d) => d.key > key)
      return j >= 0 ? j : -1
    }
    for (let j = dias.length - 1; j >= 0; j--) if (dias[j].key < key) return j
    return -1
  }

  const candidatas = tasks
    .filter((t) => t.due_date)
    .map((t) => {
      const fin = t.due_date as string
      const ini = t.start_date && t.start_date <= fin ? t.start_date : fin
      return { t, ini, fin }
    })
    // Fuera de la ventana por completo.
    .filter(({ ini, fin }) => !(fin < primero || ini > ultimo))
    .sort((a, b) => (a.ini < b.ini ? -1 : a.ini > b.ini ? 1 : 0))

  const finDeCarril: number[] = []
  const barras: Barra[] = []

  for (const { t, ini, fin } of candidatas) {
    const desde = indice(ini < primero ? primero : ini, true)
    const hasta = indice(fin > ultimo ? ultimo : fin, false)
    if (desde < 0 || hasta < 0 || hasta < desde) continue
    let carril = finDeCarril.findIndex((ultimaCol) => ultimaCol < desde)
    if (carril === -1) {
      carril = finDeCarril.length
      finDeCarril.push(hasta)
    } else {
      finDeCarril[carril] = hasta
    }
    barras.push({
      task: t,
      col: desde + 1,
      span: hasta - desde + 1,
      carril,
      cortadaIzquierda: ini < primero,
      cortadaDerecha: fin > ultimo,
    })
  }
  return barras
}

/** Cuántos carriles hacen falta para esas barras (mínimo 1). */
export function carriles(barras: Barra[]): number {
  return Math.max(1, ...barras.map((b) => b.carril + 1))
}

/** Clase visual de una barra según su situación respecto a hoy. */
export function claseBarra(task: Task, hoy = todayKey()): 'vencida' | 'marcha' | 'plan' {
  const fin = task.due_date ?? ''
  const ini = task.start_date ?? fin
  if (fin < hoy) return 'vencida'
  if (ini <= hoy && hoy <= fin) return 'marcha'
  return 'plan'
}
