// Pruebas de comprensión del asistente en español, alemán y portugués.
// No tocan la base de datos: solo parseWithRules con un equipo de mentira.
import { parseWithRules, matchUser } from '../src/assistant.js'

const USERS = [
  { id: '1', full_name: 'Cristian Amaya' },
  { id: '2', full_name: 'Isma Torres' },
  { id: '3', full_name: 'Jasmina Keller' },
  { id: '4', full_name: 'Ana María López' },
]
const SENDER = USERS[0]
const HOY = '2026-09-03' // jueves

let fallos = 0
function check(nombre, texto, lang, esperado) {
  const got = parseWithRules(texto, { users: USERS, sender: SENDER, today: HOY, lang, openTasks: [] })
  const malas = Object.entries(esperado).filter(([k, v]) => JSON.stringify(got[k]) !== JSON.stringify(v))
  if (malas.length) {
    fallos++
    console.log(`  ✘ ${nombre}\n      "${texto}"\n      obtenido: ${JSON.stringify(got)}\n      esperado: ${JSON.stringify(esperado)}`)
  } else {
    console.log(`  ✔ ${nombre}`)
  }
}

console.log('\nESPAÑOL — crear')
check('completa', 'crea una tarea a Isma: revisar la caldera, para el viernes', 'es',
  { action: 'create_task', assignee: 'isma', due: '2026-09-04' })
check('urgente', 'necesito que Jasmina prepare el presupuesto mañana urgente', 'es',
  { action: 'create_task', assignee: 'jasmina', due: '2026-09-04', priority: 'high' })
check('para mí', 'apunta una tarea para mi: llamar al fontanero', 'es', { action: 'create_task' })
console.log('ESPAÑOL — otras acciones')
check('listar mías', '¿qué tengo abierto?', 'es', { action: 'list_tasks', who: null })
check('listar equipo', 'tareas del equipo', 'es', { action: 'list_tasks', who: 'equipo' })
check('listar persona', 'tareas de Isma', 'es', { action: 'list_tasks', who: 'isma' })
check('completar', 'hecha la de la caldera', 'es', { action: 'complete_task', task_hint: 'caldera' })
check('ayuda', 'hola', 'es', { action: 'help' })
check('sí corto', 'sí', 'es', { action: 'reply_done' })
check('no corto', 'no', 'es', { action: 'reply_not_done' })

console.log('\nALEMÁN — crear')
check('completa', 'Erstelle eine Aufgabe für Isma: Heizung prüfen, bis Freitag', 'de',
  { action: 'create_task', assignee: 'isma', due: '2026-09-04' })
check('dringend', 'Neue Aufgabe für Jasmina: Offerte vorbereiten, morgen, dringend', 'de',
  { action: 'create_task', assignee: 'jasmina', due: '2026-09-04', priority: 'high' })
console.log('ALEMÁN — otras acciones')
check('listar mías', 'Was ist offen?', 'de', { action: 'list_tasks', who: null })
check('listar equipo', 'Aufgaben vom Team', 'de', { action: 'list_tasks', who: 'equipo' })
check('listar persona', 'Aufgaben von Isma', 'de', { action: 'list_tasks', who: 'isma' })
check('completar', 'Erledigt die Heizung', 'de', { action: 'complete_task' })
check('ayuda', 'Hilfe', 'de', { action: 'help' })
check('ja corto', 'ja', 'de', { action: 'reply_done' })
check('nein corto', 'nein', 'de', { action: 'reply_not_done' })

console.log('\nPORTUGUÉS — crear')
check('completa', 'Cria uma tarefa para Isma: verificar a caldeira, na sexta', 'pt',
  { action: 'create_task', assignee: 'isma', due: '2026-09-04' })
check('urgente', 'Nova tarefa para Jasmina: preparar o orçamento, amanhã, urgente', 'pt',
  { action: 'create_task', assignee: 'jasmina', due: '2026-09-04', priority: 'high' })
console.log('PORTUGUÉS — otras acciones')
check('listar mías', 'O que tenho em aberto?', 'pt', { action: 'list_tasks', who: null })
check('listar equipa', 'tarefas da equipa', 'pt', { action: 'list_tasks', who: 'equipo' })
check('completar', 'Feita a da caldeira', 'pt', { action: 'complete_task', task_hint: 'caldeira' })
check('ayuda', 'ajuda', 'pt', { action: 'help' })
check('sim corto', 'sim', 'pt', { action: 'reply_done' })
check('não corto', 'não', 'pt', { action: 'reply_not_done' })

console.log('\nMEZCLA — el idioma guardado no impide entender otro')
check('alemán en chat español', 'Erstelle eine Aufgabe für Isma: Heizung prüfen, bis Freitag', 'es',
  { action: 'create_task', assignee: 'isma', due: '2026-09-04' })
check('español en chat alemán', 'crea una tarea a Isma: revisar la caldera, para el viernes', 'de',
  { action: 'create_task', assignee: 'isma', due: '2026-09-04' })

console.log('\nSPESEN — cerrar el mes sin pisar a las tareas ni a los gastos')
// "cierra" y "fecha" también son verbos de completar tarea; "spesen …" también
// abre un gasto. El cierre solo puede saltar con la palabra gastos/despesas.
check('cierre con mes', 'cierra los gastos de agosto', 'es', { action: 'gasto_cierre' })
check('cierre sin mes', 'cierra los gastos', 'es', { action: 'gasto_cierre' })
check('exportar también cierra', 'exporta las spesen', 'es', { action: 'gasto_cierre' })
check('"cierra la de la caldera" sigue completando', 'cierra la de la caldera', 'es',
  { action: 'complete_task', task_hint: 'caldera' })
check('apuntar gasto sigue apuntando', 'gasto 37.90 Landi Kabelbinder', 'es',
  { action: 'gasto_add', importe: 37.9 })
check('cierre en alemán', 'spesen august abschliessen', 'de', { action: 'gasto_cierre' })
check('apuntar spesen en alemán sigue apuntando', 'spesen 45.20 Migros', 'de',
  { action: 'gasto_add', importe: 45.2 })
check('cierre en portugués', 'fecha as despesas de agosto', 'pt', { action: 'gasto_cierre' })
check('"fecha a da caldeira" sigue completando', 'fecha a da caldeira', 'pt',
  { action: 'complete_task', task_hint: 'caldeira' })

console.log('\nPERSONAS')
const amb = matchUser('ana', USERS, SENDER)
check('sin sentido → unknown', 'asdfghjkl qwerty', 'es', { action: 'unknown' })
console.log(`  ${amb.user ? '✔' : '✘'} "ana" encuentra a Ana María`)
if (!amb.user) fallos++

console.log(fallos === 0 ? '\n✅ todas las pruebas del asistente pasan' : `\n❌ ${fallos} fallos`)
process.exit(fallos === 0 ? 0 : 1)
