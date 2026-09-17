// Pruebas de la colocación de barras de la línea de tiempo. Es aritmética
// pura, así que se prueba sin navegador (se compila con esbuild y se ejecuta
// con node; ver el comando en package.json).
import { diasLaborables, lunesDe, colocarBarras, carriles, claseBarra } from '../src/lib/timeline'
import type { Task } from '../src/lib/types'

const HOY = '2026-09-03' // jueves
let fallos = 0
function eq(nombre: string, real: unknown, esperado: unknown) {
  const ok = JSON.stringify(real) === JSON.stringify(esperado)
  if (!ok) {
    fallos++
    console.log(`  ✘ ${nombre}\n      obtenido: ${JSON.stringify(real)}\n      esperado: ${JSON.stringify(esperado)}`)
  } else console.log(`  ✔ ${nombre}`)
}

const tarea = (p: Partial<Task>): Task => ({
  id: p.id ?? 'x', title: p.title ?? 't', description: null,
  status: 'open', priority: 'medium', assignee_id: null, created_by: null,
  due_date: p.due_date ?? null, start_date: p.start_date ?? null,
  completed_at: null, last_reminder_at: null, created_at: '', updated_at: '',
})

console.log('\n1. LA VENTANA DE DÍAS')
const lunes = lunesDe(HOY)
eq('el lunes de esa semana', lunes, '2026-08-31')
const dias = diasLaborables(lunes, 2, HOY)
eq('dos semanas = 10 columnas', dias.length, 10)
eq('sin fines de semana', dias.map((d) => d.dow), ['lun','mar','mié','jue','vie','lun','mar','mié','jue','vie'])
eq('marca hoy', dias.filter((d) => d.esHoy).map((d) => d.key), [HOY])
eq('marca el inicio de cada semana', dias.filter((d) => d.inicioSemana).length, 2)

console.log('\n2. BARRAS BÁSICAS')
eq('un solo día ocupa una columna',
  colocarBarras([tarea({ due_date: '2026-09-03' })], dias).map((b) => [b.col, b.span]), [[4, 1]])
eq('un plazo de lunes a jueves ocupa cuatro',
  colocarBarras([tarea({ start_date: '2026-08-31', due_date: '2026-09-03' })], dias).map((b) => [b.col, b.span]), [[1, 4]])
eq('cruza el fin de semana sin contarlo',
  colocarBarras([tarea({ start_date: '2026-09-04', due_date: '2026-09-07' })], dias).map((b) => [b.col, b.span]), [[5, 2]])

console.log('\n3. RECORTES EN LOS BORDES')
const antes = colocarBarras([tarea({ start_date: '2026-08-20', due_date: '2026-09-01' })], dias)
eq('empieza antes: se recorta y se marca', [antes[0].col, antes[0].span, antes[0].cortadaIzquierda], [1, 2, true])
const despues = colocarBarras([tarea({ start_date: '2026-09-10', due_date: '2026-09-30' })], dias)
// La ventana llega al vie 11: del jue 10 al vie 11 son 2 columnas (la 9 y la 10).
eq('acaba después: se recorta y se marca', [despues[0].col, despues[0].span, despues[0].cortadaDerecha], [9, 2, true])
eq('fuera del todo: no aparece',
  colocarBarras([tarea({ due_date: '2026-12-01' })], dias).length, 0)
eq('sin fecha de fin: no aparece',
  colocarBarras([tarea({ start_date: '2026-09-01' })], dias).length, 0)

console.log('\n4. FECHAS EN FIN DE SEMANA')
// Empieza el sábado 5 → se engancha al lunes 7 (columna 6) y llega al martes 8.
eq('empieza en sábado → salta al lunes',
  colocarBarras([tarea({ start_date: '2026-09-05', due_date: '2026-09-08' })], dias).map((b) => [b.col, b.span]), [[6, 2]])
eq('acaba en domingo → retrocede al viernes',
  colocarBarras([tarea({ start_date: '2026-09-03', due_date: '2026-09-06' })], dias).map((b) => [b.col, b.span]), [[4, 2]])

console.log('\n5. CARRILES CUANDO SE SOLAPAN')
const solapadas = colocarBarras([
  tarea({ id: 'a', start_date: '2026-08-31', due_date: '2026-09-03' }),
  tarea({ id: 'b', start_date: '2026-09-02', due_date: '2026-09-04' }),
  tarea({ id: 'c', start_date: '2026-09-08', due_date: '2026-09-09' }),
], dias)
eq('a y b en carriles distintos, c reutiliza el primero',
  solapadas.map((b) => [b.task.id, b.carril]), [['a', 0], ['b', 1], ['c', 0]])
eq('hacen falta dos carriles', carriles(solapadas), 2)
eq('sin barras, un carril', carriles([]), 1)

console.log('\n6. SITUACIÓN DE CADA BARRA')
eq('vencida', claseBarra(tarea({ due_date: '2026-09-01' }), HOY), 'vencida')
eq('en marcha (hoy dentro del plazo)', claseBarra(tarea({ start_date: '2026-09-01', due_date: '2026-09-10' }), HOY), 'marcha')
eq('en marcha (justo hoy)', claseBarra(tarea({ due_date: HOY }), HOY), 'marcha')
eq('planificada', claseBarra(tarea({ due_date: '2026-09-10' }), HOY), 'plan')

console.log(fallos === 0 ? '\n✅ todas las pruebas de la línea de tiempo pasan' : `\n❌ ${fallos} fallos`)
process.exit(fallos === 0 ? 0 : 1)
