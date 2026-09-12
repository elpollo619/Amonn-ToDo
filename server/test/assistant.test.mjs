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

console.log('\nRESUMEN SEMANAL — sin pisar a "resumen" (que es listar)')
check('resumen semanal', 'resumen semanal', 'es', { action: 'resumen_semanal' })
check('"resumen" a secas sigue listando', 'resumen', 'es', { action: 'list_tasks' })
check('en alemán', 'wochenbericht', 'de', { action: 'resumen_semanal' })
check('en portugués', 'resumo da semana', 'pt', { action: 'resumen_semanal' })

console.log('\nAUSENCIAS')
check('alta con rango', 'Rayna de vacaciones del 10.10 al 15.10', 'es',
  { action: 'ausencia_add', quien: 'rayna', motivo: 'vacaciones' })
check('quién está fuera', '¿quién está de vacaciones?', 'es', { action: 'ausencia_list' })
check('"wer ist im urlaub" es lista, no una persona "wer"', 'wer ist im urlaub', 'de',
  { action: 'ausencia_list' })
check('alta en alemán', 'rayna ferien vom 10.10 bis 15.10', 'de',
  { action: 'ausencia_add', quien: 'rayna' })
check('alta en portugués', 'rayna de ferias de 10.10 a 15.10', 'pt',
  { action: 'ausencia_add', quien: 'rayna' })

console.log('\nCONTADORES')
check('apuntar lectura', 'luz 204: 4521', 'es',
  { action: 'contador_add', tipo: 'luz', unidad: '204', valor: 4521 })
check('con decimales y sin dos puntos', 'agua a14 1234,5', 'es',
  { action: 'contador_add', tipo: 'agua', unidad: 'A14', valor: 1234.5 })
check('lecturas de una unidad', 'lecturas de la 204', 'es',
  { action: 'contador_list', unidad: '204' })
check('en alemán', 'strom 204 4521', 'de', { action: 'contador_add', tipo: 'strom' })
check('"gasto 37.90 Landi" NO es un contador', 'gasto 37.90 Landi Kabelbinder', 'es',
  { action: 'gasto_add' })

console.log('\nCONTRATOS')
check('contrato con datos', 'contrato para Max Muster, habitación 204, 850, desde el 1 de octubre', 'es',
  { action: 'contrato_add' })
check('con verbo delante', 'haz un contrato para Max Muster, habitación 204, 850', 'es',
  { action: 'contrato_add' })
check('en alemán', 'mietvertrag für Max Muster, Zimmer 204, 850', 'de', { action: 'contrato_add' })
check('el nombre conserva mayúsculas', 'contrato para Max Muster, habitación 204', 'es',
  { texto: 'Max Muster, habitación 204' })
check('"crea una tarea" sigue creando tareas', 'crea una tarea a Isma: revisar la caldera, para el viernes', 'es',
  { action: 'create_task' })

console.log('\nPRECIOS — sin pisar a la regla del hotel')
check('precios a secas', 'precios', 'es', { action: 'precios', objetivo: null })
check('¿subo o bajo?', '¿subo o bajo los precios?', 'es', { action: 'precios' })
check('"precios del hotel" NO es la acción hotel', 'precios del hotel', 'es',
  { action: 'precios', objetivo: 'hotel' })
check('de casa reto', 'precios de casa reto', 'es', { action: 'precios', objetivo: 'casa' })
check('en alemán', 'wie stehen die preise', 'de', { action: 'precios' })
check('en portugués', 'preços', 'pt', { action: 'precios' })
check('"¿cuántos llegan hoy?" sigue siendo hotel', '¿cuántos llegan hoy al hotel?', 'es',
  { action: 'hotel' })

console.log('\nMETEO Y ZINSSATZ')
check('el tiempo', '¿qué tiempo hace?', 'es', { action: 'meteo' })
check('tiempo a secas', 'tiempo', 'es', { action: 'meteo' })
check('wetter', 'wetter', 'de', { action: 'meteo' })
check('tempo pt', 'tempo', 'pt', { action: 'meteo' })
check('referenzzinssatz', 'referenzzinssatz', 'es', { action: 'zins' })
check('zinssatz de', 'zinssatz', 'de', { action: 'zins' })

console.log('\nCONTRATOS: CONSULTAR SIN PISAR A CREAR, Y FACTURAS')
check('consultar por unidad', 'contrato de la 204', 'es', { action: 'vertrag_info', que: '204' })
check('consultar por código', 'contrato de A4-11.1', 'es', { action: 'vertrag_info', que: 'a4-11.1' })
check('consultar por apellido', 'contrato de Koubaa', 'es', { action: 'vertrag_info' })
check('crear sigue siendo crear', 'contrato para Max Muster, habitación 204, 850, desde el 1 de octubre', 'es',
  { action: 'contrato_add' })
check('"vertrag von 204" consulta', 'vertrag von 204', 'de', { action: 'vertrag_info', que: '204' })
check('"vertrag für Max, Zimmer 204" crea', 'mietvertrag für Max Muster, Zimmer 204, 850', 'de',
  { action: 'contrato_add' })
check('alquileres total', 'alquileres', 'es', { action: 'mieten_sum', grupo: null })
check('alquileres de un edificio', 'alquileres de B22', 'es', { action: 'mieten_sum', grupo: 'B22' })
check('factura', 'factura 850 para Max Muster, alquiler octubre', 'es',
  { action: 'factura_add', texto: '850 para Max Muster, alquiler octubre' })
check('impagos', '¿quién no ha pagado?', 'es', { action: 'impagos' })
check('impagos de', 'wer hat nicht bezahlt', 'de', { action: 'impagos' })

console.log('\nHUÉSPEDES — espejo y respuesta ordenada')
check('ver mensajes', 'mensajes de los huéspedes', 'es', { action: 'huesped_list' })
check('responder con texto tal cual', 'responde al huésped 12345: Llegamos a las 15, Grüsse', 'es',
  { action: 'huesped_reply', bookingId: '12345', texto: 'Llegamos a las 15, Grüsse' })
check('en alemán', 'antworte dem gast 12345: Danke, bis morgen', 'de',
  { action: 'huesped_reply', bookingId: '12345' })
check('en portugués', 'responde ao hóspede 12345: obrigado', 'pt',
  { action: 'huesped_reply', bookingId: '12345' })

console.log('\nRESÚMENES — diario y semanal no se pisan')
check('diario es', 'resumen de hoy', 'es', { action: 'resumen_diario' })
check('diario es 2', 'qué requiere mi atención hoy', 'es', { action: 'resumen_diario' })
check('diario de', 'Tagesbericht', 'de', { action: 'resumen_diario' })
check('diario pt', 'resumo de hoje', 'pt', { action: 'resumen_diario' })
check('semanal sigue siendo semanal', 'resumen semanal', 'es', { action: 'resumen_semanal' })

console.log('\nTRADUCIR — captura idioma destino y texto (nunca envía nada)')
check('al alemán con dos puntos', 'traduce esto al alemán: hola', 'es',
  { action: 'traducir', idioma: 'alemán', texto: 'hola' })
check('al francés sin dos puntos', 'traduce al francés hola', 'es',
  { action: 'traducir', idioma: 'francés', texto: 'hola' })
check('conserva acentos y mayúsculas del texto', 'traduce al inglés: Llegamos a las 15, Grüsse', 'es',
  { action: 'traducir', idioma: 'inglés', texto: 'Llegamos a las 15, Grüsse' })
check('en alemán (übersetze ins Französische)', 'übersetze ins Französische: hallo', 'de',
  { action: 'traducir', idioma: 'francés', texto: 'hallo' })
check('en portugués (traduz para inglês)', 'traduz para inglês: olá', 'pt',
  { action: 'traducir', idioma: 'inglés', texto: 'olá' })

console.log('\nBORRADOR — captura destinatario y tema (nunca envía nada)')
check('respuesta para X con dos puntos', 'prepara una respuesta para Timon: confirmar la cita del jueves', 'es',
  { action: 'borrador', para: 'Timon', tema: 'confirmar la cita del jueves' })
check('correo a X sobre tema', 'escribe un correo a Reto sobre la factura de octubre', 'es',
  { action: 'borrador', para: 'Reto', tema: 'la factura de octubre' })
check('en alemán (schreib eine Nachricht an X)', 'schreib eine Nachricht an Isma: die Heizung ist repariert', 'de',
  { action: 'borrador', para: 'Isma', tema: 'die Heizung ist repariert' })
check('en portugués (prepara uma resposta para X)', 'prepara uma resposta para Ana: confirmar a reunião', 'pt',
  { action: 'borrador', para: 'Ana', tema: 'confirmar a reunião' })
check('"crea una tarea" NO es un borrador', 'crea una tarea a Isma: revisar la caldera, para el viernes', 'es',
  { action: 'create_task' })

console.log('\nBÚSQUEDA GLOBAL — captura el término y no pisa intenciones existentes')
check('busca es', 'busca la caldera', 'es', { action: 'buscar', texto: 'la caldera' })
check('qué sabemos de X', 'qué sabemos de Seewer', 'es', { action: 'buscar', texto: 'Seewer' })
check('info de X', 'info de la caldera', 'es', { action: 'buscar', texto: 'la caldera' })
check('conserva mayúsculas/acentos', 'busca Müller AG', 'es', { action: 'buscar', texto: 'Müller AG' })
check('suche de', 'suche Heizung', 'de', { action: 'buscar', texto: 'Heizung' })
check('was wissen wir über X', 'was wissen wir über Seewer', 'de', { action: 'buscar', texto: 'Seewer' })
check('procura pt', 'procura a caldeira', 'pt', { action: 'buscar', texto: 'a caldeira' })
check('o que sabemos sobre X', 'o que sabemos sobre Seewer', 'pt', { action: 'buscar', texto: 'Seewer' })
// La búsqueda NO debe pisar las intenciones específicas ya existentes:
check('contrato de Koubaa sigue siendo contrato', 'contrato de Koubaa', 'es',
  { action: 'vertrag_info', que: 'koubaa' })
check('tareas de Isma siguen siendo lista', 'tareas de Isma', 'es', { action: 'list_tasks', who: 'isma' })
check('resumen de hoy sigue siendo diario', 'resumen de hoy', 'es', { action: 'resumen_diario' })

console.log('\nAVERÍAS — registrar, listar, resolver en 3 idiomas')
// Español
check('registrar fuga con ubicación', 'hay una fuga en la ducha de la 203', 'es',
  { action: 'averia_add', ubicacion: '203', urgencia: 'normal' })
check('no funciona → avería urgente', 'la calefacción no funciona urgente', 'es',
  { action: 'averia_add', urgencia: 'urgente' })
check('emergencia', 'se rompió una tubería, emergencia', 'es',
  { action: 'averia_add', urgencia: 'emergencia' })
check('listar abiertas', 'averías abiertas', 'es', { action: 'averia_list', texto: null })
check('listar con búsqueda', 'averías del hotel', 'es', { action: 'averia_list', texto: 'hotel' })
check('resolver por ubicación', 'avería de la 203 resuelta', 'es',
  { action: 'averia_done', pista: '203' })
check('resolver por descripción', 'resuelta la fuga de la ducha', 'es',
  { action: 'averia_done', pista: 'fuga de la ducha' })
// Alemán
check('registrar defekt', 'die heizung funktioniert nicht', 'de', { action: 'averia_add' })
check('störung dringend', 'störung: aufzug kaputt, dringend', 'de',
  { action: 'averia_add', urgencia: 'urgente' })
check('listar offene störungen', 'offene störungen', 'de', { action: 'averia_list' })
check('resolver störung behoben', 'störung heizung behoben', 'de',
  { action: 'averia_done', pista: 'heizung' })
// Portugués
check('registrar avaria', 'não funciona o aquecimento', 'pt', { action: 'averia_add' })
check('listar avarias', 'avarias abertas', 'pt', { action: 'averia_list' })
check('resolver avaria', 'avaria da 203 resolvida', 'pt',
  { action: 'averia_done', pista: '203' })

console.log('\nAVERÍAS — no pisan a otras intenciones')
check('crear tarea sigue creando', 'crea una tarea a Isma: revisar la caldera', 'es',
  { action: 'create_task', assignee: 'isma' })
check('gasto sigue apuntando', 'gasto 37.90 Landi', 'es', { action: 'gasto_add', importe: 37.9 })
check('contador sigue apuntando', 'luz 204: 4521', 'es',
  { action: 'contador_add', tipo: 'luz', unidad: '204', valor: 4521 })
check('completar sigue completando', 'hecha la de la caldera', 'es',
  { action: 'complete_task', task_hint: 'caldera' })
check('contrato sigue consultando', 'contrato de Koubaa', 'es',
  { action: 'vertrag_info', que: 'koubaa' })
check('buscar sigue buscando', 'busca la caldera', 'es', { action: 'buscar', texto: 'la caldera' })
check('completar en alemán no es avería', 'Erledigt die Heizung', 'de',
  { action: 'complete_task' })

console.log('\nDIARIO DE OBRA — registrar y listar en 3 idiomas')
// Español
check('informe de obra con proyecto y trabajos', 'informe de obra de Seewer: hormigonado del sótano, estuvo Böhlen', 'es',
  { action: 'obra_add', proyecto: 'Seewer', trabajos: 'hormigonado del sótano, estuvo Böhlen' })
check('parte de obra', 'parte de obra Seewer: encofrado terminado', 'es',
  { action: 'obra_add', proyecto: 'Seewer', trabajos: 'encofrado terminado' })
check('qué pasó en X', 'qué pasó en Seewer', 'es', { action: 'obra_list', proyecto: 'Seewer' })
check('partes de obra de X', 'partes de obra de Seewer', 'es', { action: 'obra_list', proyecto: 'Seewer' })
// Alemán
check('baubericht', 'Baubericht Seewer: Aushub fertig', 'de',
  { action: 'obra_add', proyecto: 'Seewer', trabajos: 'Aushub fertig' })
check('was ist auf der baustelle X passiert', 'was ist auf der Baustelle Seewer passiert', 'de',
  { action: 'obra_list', proyecto: 'Seewer' })
// Portugués
check('relatório de obra', 'relatório de obra de Seewer: betonagem da cave', 'pt',
  { action: 'obra_add', proyecto: 'Seewer', trabajos: 'betonagem da cave' })
check('relatórios de obra X', 'relatórios de obra Seewer', 'pt',
  { action: 'obra_list', proyecto: 'Seewer' })

console.log('\nDIARIO DE OBRA — no pisa a otras intenciones')
check('Tagesbericht sigue siendo resumen diario', 'Tagesbericht', 'de', { action: 'resumen_diario' })
check('resumen de hoy sigue siendo diario', 'resumen de hoy', 'es', { action: 'resumen_diario' })
check('fuga sigue siendo avería', 'hay una fuga en la 203', 'es', { action: 'averia_add' })
check('crear tarea sigue creando', 'crea una tarea a Isma: pintar', 'es',
  { action: 'create_task', assignee: 'isma' })

console.log('\nPERSONAS')
const amb = matchUser('ana', USERS, SENDER)
check('sin sentido → unknown', 'asdfghjkl qwerty', 'es', { action: 'unknown' })
console.log(`  ${amb.user ? '✔' : '✘'} "ana" encuentra a Ana María`)
if (!amb.user) fallos++

console.log(fallos === 0 ? '\n✅ todas las pruebas del asistente pasan' : `\n❌ ${fallos} fallos`)
process.exit(fallos === 0 ? 0 : 1)
