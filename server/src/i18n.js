// ============================================================
// Textos del asistente en los tres idiomas del equipo: español, alemán y
// portugués. Antes estaban incrustados a mano dentro de inbound.js, lo que
// hacía imposible traducirlos sin tocar la lógica.
//
// Uso:  t(lang, 'clave', { nombre: 'Ana' })
// Si falta una traducción se cae a español en lugar de romperse o de
// enseñarle al usuario el nombre de la clave.
// ============================================================

export const LANGS = ['es', 'de', 'pt']
export const DEFAULT_LANG = 'es'

// ─── Detección del idioma ─────────────────────────────────────
// Palabras muy frecuentes y suficientemente distintivas de cada idioma. No
// pretende ser un detector serio: solo acertar el idioma de alguien del
// equipo escribiendo sobre tareas. Por eso solo se aplica a mensajes con
// cuerpo suficiente (ver detectLanguage).
const PISTAS = {
  de: /\b(ich|nicht|bitte|danke|aufgabe|erledigt|morgen|heute|kannst|kannst du|mach|machen|bis|freitag|montag|dienstag|mittwoch|donnerstag|samstag|sonntag|und|oder|der|die|das|für|fuer|wir|brauche|erstelle|neue)\b/g,
  pt: /\b(não|nao|você|voce|obrigado|obrigada|tarefa|feito|feita|amanhã|amanha|hoje|pode|fazer|até|ate|sexta|segunda|terça|terca|quarta|quinta|sábado|sabado|domingo|e|ou|para|nós|nos|preciso|criar|nova)\b/g,
  es: /\b(no|sí|si|gracias|tarea|hecha|hecho|mañana|manana|hoy|puedes|hacer|hasta|viernes|lunes|martes|miércoles|miercoles|jueves|sábado|sabado|domingo|y|o|para|nosotros|necesito|crea|crear|nueva)\b/g,
}

/**
 * Adivina el idioma de un texto. Devuelve 'es' | 'de' | 'pt' o null cuando no
 * hay señal suficiente (mensajes cortos como "ok" o "sí": ahí NO se debe
 * cambiar el idioma de nadie, se conserva el que ya tuviera).
 */
export function detectLanguage(text) {
  const t = String(text ?? '').toLowerCase()
  if (t.replace(/\s+/g, '').length < 15) return null
  let mejor = null
  let mejorPuntos = 0
  for (const lang of LANGS) {
    const puntos = (t.match(PISTAS[lang]) ?? []).length
    if (puntos > mejorPuntos) {
      mejorPuntos = puntos
      mejor = lang
    }
  }
  return mejorPuntos >= 2 ? mejor : null
}

/**
 * ¿La persona está pidiendo explícitamente cambiar de idioma?
 * ("habla en alemán", "sprich spanisch", "fala português").
 * Devuelve el código de idioma o null.
 */
export function parseLanguageCommand(text) {
  const t = String(text ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  if (!/\b(habla|hablame|escribe|escribeme|en|sprich|schreib|sprache|fala|escreve|idioma|language|speak)\b/.test(t)) {
    return null
  }
  if (/\b(aleman|alemao|deutsch|german|alemanha)\b/.test(t)) return 'de'
  if (/\b(portugues|portuguese|portugiesisch)\b/.test(t)) return 'pt'
  if (/\b(espanol|castellano|spanisch|spanish|espanhol)\b/.test(t)) return 'es'
  return null
}

// ─── Textos ───────────────────────────────────────────────────
const TEXTOS = {
  es: {
    help:
      '¡Hola {nombre}! Soy el asistente de Amonn 🤖. Puedes escribirme, por ejemplo:\n\n' +
      '• "Crea una tarea a Luis: revisar la caldera, para el viernes"\n' +
      '• "Necesito que Ana prepare el presupuesto Gómez mañana, urgente"\n' +
      '• "¿Qué tengo abierto?" o "Tareas de Luis" o "Tareas del equipo"\n' +
      '• "Hecha la de la caldera"\n\n' +
      'Puedo hablar español, alemán y portugués: dime "habla en alemán" cuando quieras.',
    unknown_user:
      'No te reconozco en Amonn 🤔. Pon este número (con prefijo, p. ej. +41) en "Mi perfil" dentro de la app y vuelve a escribirme.',
    error: 'Uy, algo ha fallado al procesar tu mensaje 😅. Inténtalo de nuevo en un momento.',
    lang_changed: 'Hecho, a partir de ahora te hablo en español 🇪🇸',
    list_empty: '{titulo}: nada pendiente 🎉',
    list_header: '{titulo} ({total}):',
    list_more: '\n… y {resto} más',
    title_my_tasks: 'Tus tareas abiertas',
    title_team_tasks: 'Tareas abiertas del equipo',
    title_person_tasks: 'Tareas abiertas de {nombre}',
    person_not_found: 'No encuentro a "{nombre}" en el equipo. Personas: {lista}.',
    person_ambiguous:
      '¿A quién te refieres con "{nombre}"? Hay varias personas: {lista}. Escríbelo con el nombre completo.',
    person_not_found_create:
      'No encuentro a "{nombre}" en el equipo, así que no he creado la tarea. Personas registradas: {lista}. Cada persona tiene que crear su cuenta en Amonn.',
    ask_what: 'Vale, creo la tarea. ¿Qué hay que hacer exactamente?',
    ask_who: '¿Para quién es "{titulo}"? Dime un nombre, o "para mí".',
    ask_when: '¿Para cuándo? Puedes decir "mañana", "el viernes", "del lunes al jueves", "15/10" o "sin fecha".',
    confirm: '¿Creo esta tarea?\n\n{resumen}\n\nResponde SÍ o NO.',
    cancelled: 'De acuerdo, no la creo. 👍',
    cancelled_timeout: 'Habíamos dejado una tarea a medias, pero ha pasado mucho rato: empiezo de nuevo.',
    created: '✅ Tarea creada {para}:\n\n{resumen}',
    for_you: 'para ti',
    for_person: 'para {nombre}',
    for_nobody: 'sin responsable (asígnala desde la app)',
    notified: '\n\nLe he avisado por {canales}.',
    not_notified: '\n\n⚠️ {nombre} no tiene avisos activos (sin teléfono en su perfil), lo verá al abrir la app.',
    channel_whatsapp: 'WhatsApp',
    channel_email: 'email',
    see_link: '\n\nVerla: {url}',
    complete_not_found: 'No encuentro ninguna tarea abierta que encaje con "{pista}" 🤔.',
    completed: '✅ Hecho: "{titulo}" marcada como completada. ¡Buen trabajo!',
    no_open_tasks: '¡Hola {nombre}! No tienes tareas abiertas ahora mismo 🎉',
    reply_done: '¡Genial! ✅ He marcado "{titulo}" como completada. ¡Buen trabajo!',
    reply_not_done: 'De acuerdo, dejo "{titulo}" como abierta. ¡Ánimo! 💪',
    fallback:
      'No te he entendido 🤔. Prueba con algo como:\n' +
      '• "Crea una tarea a Luis: revisar la caldera, para el viernes"\n' +
      '• "¿Qué tengo abierto?"\n' +
      '• "Hecha la de la caldera"\n\n' +
      'Escribe "ayuda" para ver más ejemplos.',
    teach_ok: 'Anotado: a partir de ahora «{frase}» es {nombre} 👍',
    teach_unknown: 'No encuentro a "{nombre}" en el equipo, así que no lo anoto. Personas: {lista}.',
    learned_person: '\n\n(Anotado: «{frase}» es {nombre}.)',
    ask_which_task: 'No sé cuál es «{pista}». ¿Cuál de estas? Responde con el número:\n{lista}',
    learned_task: '\n\n(Anotado: «{pista}» es esa.)',
    not_a_number: 'Dime el número de la tarea, o «cancela».',
    reminder_wa: 'Hola {nombre} 👋\n\n¿Has completado esta tarea?\n\n{resumen}\n\nResponde SÍ si ya está hecha, o NO si sigue abierta.',
    reminder_mail: 'Hola {nombre},\n\nEsta tarea vence o está vencida:\n\n{resumen}\n\nCuando la termines, márcala como hecha en la app.{link}',
    subject_reminder: 'Recordatorio: {titulo}',
    assigned_by: 'Hola {nombre} 👋 {quien} te ha asignado una tarea nueva:',
    assigned: 'Hola {nombre} 👋 tienes una tarea nueva:',
    subject_new_task: 'Nueva tarea: {titulo}',
    see_in_app: '\n\nVerla en Amonn: {url}',
    summary_due: '📅 Plazo: {fecha}',
    summary_work: '⏱ Trabajo: {dias} días',
    summary_priority: '⚡ Prioridad: {prioridad}',
    prio_high: 'alta', prio_low: 'baja', prio_medium: 'media',
    ask_person_again: 'No encuentro a "{nombre}" en el equipo. Personas: {lista}. ¿Para quién es?',
    cancel_words: 'cancela',
    no_date: 'sin fecha',
    due_today: 'hoy',
    due_tomorrow: 'mañana',
    due_overdue: '{fecha} (vencida hace {dias} día{s})',
  },

  de: {
    help:
      'Hallo {nombre}! Ich bin der Amonn-Assistent 🤖. Du kannst mir zum Beispiel schreiben:\n\n' +
      '• "Erstelle eine Aufgabe für Luis: Heizung prüfen, bis Freitag"\n' +
      '• "Ana soll morgen die Offerte Gómez vorbereiten, dringend"\n' +
      '• "Was ist offen?" oder "Aufgaben von Luis" oder "Aufgaben vom Team"\n' +
      '• "Die Heizung ist erledigt"\n\n' +
      'Ich spreche Spanisch, Deutsch und Portugiesisch: sag einfach "sprich Spanisch".',
    unknown_user:
      'Ich kenne dich in Amonn noch nicht 🤔. Trag diese Nummer (mit Vorwahl, z. B. +41) unter "Mein Profil" in der App ein und schreib mir nochmal.',
    error: 'Da ist leider etwas schiefgelaufen 😅. Versuch es gleich nochmal.',
    lang_changed: 'Alles klar, ab jetzt schreibe ich dir auf Deutsch 🇩🇪',
    list_empty: '{titulo}: nichts offen 🎉',
    list_header: '{titulo} ({total}):',
    list_more: '\n… und {resto} weitere',
    title_my_tasks: 'Deine offenen Aufgaben',
    title_team_tasks: 'Offene Aufgaben vom Team',
    title_person_tasks: 'Offene Aufgaben von {nombre}',
    person_not_found: 'Ich finde "{nombre}" nicht im Team. Personen: {lista}.',
    person_ambiguous:
      'Wen meinst du mit "{nombre}"? Es gibt mehrere: {lista}. Schreib bitte den vollen Namen.',
    person_not_found_create:
      'Ich finde "{nombre}" nicht im Team, deshalb habe ich die Aufgabe nicht erstellt. Registrierte Personen: {lista}. Jede Person braucht ein eigenes Amonn-Konto.',
    ask_what: 'Gut, ich erstelle die Aufgabe. Was genau ist zu tun?',
    ask_who: 'Für wen ist "{titulo}"? Sag mir einen Namen, oder "für mich".',
    ask_when: 'Bis wann? Du kannst "morgen", "am Freitag", "vom Montag bis Donnerstag", "15.10" oder "ohne Datum" sagen.',
    confirm: 'Soll ich diese Aufgabe erstellen?\n\n{resumen}\n\nAntworte JA oder NEIN.',
    cancelled: 'In Ordnung, ich erstelle sie nicht. 👍',
    cancelled_timeout: 'Wir hatten eine Aufgabe angefangen, aber das ist lange her: ich fange neu an.',
    created: '✅ Aufgabe erstellt {para}:\n\n{resumen}',
    for_you: 'für dich',
    for_person: 'für {nombre}',
    for_nobody: 'ohne Zuständige:n (in der App zuweisen)',
    notified: '\n\nIch habe per {canales} Bescheid gegeben.',
    not_notified: '\n\n⚠️ {nombre} hat keine Benachrichtigungen aktiv (keine Nummer im Profil) und sieht es beim Öffnen der App.',
    channel_whatsapp: 'WhatsApp',
    channel_email: 'E-Mail',
    see_link: '\n\nAnsehen: {url}',
    complete_not_found: 'Ich finde keine offene Aufgabe, die zu "{pista}" passt 🤔.',
    completed: '✅ Erledigt: "{titulo}" ist als abgeschlossen markiert. Gute Arbeit!',
    no_open_tasks: 'Hallo {nombre}! Du hast gerade keine offenen Aufgaben 🎉',
    reply_done: 'Super! ✅ Ich habe "{titulo}" als erledigt markiert. Gute Arbeit!',
    reply_not_done: 'Alles klar, "{titulo}" bleibt offen. Viel Erfolg! 💪',
    fallback:
      'Das habe ich nicht verstanden 🤔. Versuch es zum Beispiel so:\n' +
      '• "Erstelle eine Aufgabe für Luis: Heizung prüfen, bis Freitag"\n' +
      '• "Was ist offen?"\n' +
      '• "Die Heizung ist erledigt"\n\n' +
      'Schreib "Hilfe" für mehr Beispiele.',
    teach_ok: 'Notiert: «{frase}» ist ab jetzt {nombre} 👍',
    teach_unknown: 'Ich finde "{nombre}" nicht im Team, also notiere ich es nicht. Personen: {lista}.',
    learned_person: '\n\n(Notiert: «{frase}» ist {nombre}.)',
    ask_which_task: 'Ich weiss nicht, welche «{pista}» ist. Welche davon? Antworte mit der Nummer:\n{lista}',
    learned_task: '\n\n(Notiert: «{pista}» ist diese.)',
    not_a_number: 'Sag mir die Nummer der Aufgabe, oder «abbrechen».',
    reminder_wa: 'Hallo {nombre} 👋\n\nHast du diese Aufgabe erledigt?\n\n{resumen}\n\nAntworte JA, wenn sie fertig ist, oder NEIN, wenn sie noch offen ist.',
    reminder_mail: 'Hallo {nombre},\n\nDiese Aufgabe ist fällig oder überfällig:\n\n{resumen}\n\nMarkiere sie in der App als erledigt, sobald du fertig bist.{link}',
    subject_reminder: 'Erinnerung: {titulo}',
    assigned_by: 'Hallo {nombre} 👋 {quien} hat dir eine neue Aufgabe zugewiesen:',
    assigned: 'Hallo {nombre} 👋 du hast eine neue Aufgabe:',
    subject_new_task: 'Neue Aufgabe: {titulo}',
    see_in_app: '\n\nIn Amonn ansehen: {url}',
    summary_due: '📅 Frist: {fecha}',
    summary_work: '⏱ Aufwand: {dias} Tage',
    summary_priority: '⚡ Priorität: {prioridad}',
    prio_high: 'hoch', prio_low: 'niedrig', prio_medium: 'mittel',
    ask_person_again: 'Ich finde "{nombre}" nicht im Team. Personen: {lista}. Für wen ist es?',
    cancel_words: 'abbrechen',
    no_date: 'ohne Datum',
    due_today: 'heute',
    due_tomorrow: 'morgen',
    due_overdue: '{fecha} (seit {dias} Tag{s} überfällig)',
  },

  pt: {
    help:
      'Olá {nombre}! Sou o assistente da Amonn 🤖. Podes escrever-me, por exemplo:\n\n' +
      '• "Cria uma tarefa para o Luis: verificar a caldeira, para sexta"\n' +
      '• "Preciso que a Ana prepare o orçamento Gómez amanhã, urgente"\n' +
      '• "O que tenho em aberto?" ou "Tarefas do Luis" ou "Tarefas da equipa"\n' +
      '• "Feita a da caldeira"\n\n' +
      'Falo espanhol, alemão e português: diz "fala espanhol" quando quiseres.',
    unknown_user:
      'Não te reconheço na Amonn 🤔. Põe este número (com indicativo, p. ex. +41) em "O meu perfil" na aplicação e escreve-me outra vez.',
    error: 'Ups, alguma coisa correu mal ao processar a tua mensagem 😅. Tenta outra vez daqui a pouco.',
    lang_changed: 'Feito, a partir de agora falo contigo em português 🇵🇹',
    list_empty: '{titulo}: nada pendente 🎉',
    list_header: '{titulo} ({total}):',
    list_more: '\n… e mais {resto}',
    title_my_tasks: 'As tuas tarefas em aberto',
    title_team_tasks: 'Tarefas em aberto da equipa',
    title_person_tasks: 'Tarefas em aberto de {nombre}',
    person_not_found: 'Não encontro "{nombre}" na equipa. Pessoas: {lista}.',
    person_ambiguous:
      'A quem te referes com "{nombre}"? Há várias pessoas: {lista}. Escreve o nome completo.',
    person_not_found_create:
      'Não encontro "{nombre}" na equipa, por isso não criei a tarefa. Pessoas registadas: {lista}. Cada pessoa tem de criar a sua conta na Amonn.',
    ask_what: 'Certo, vou criar a tarefa. O que é preciso fazer exatamente?',
    ask_who: 'Para quem é "{titulo}"? Diz-me um nome, ou "para mim".',
    ask_when: 'Para quando? Podes dizer "amanhã", "sexta", "de segunda a quinta", "15/10" ou "sem data".',
    confirm: 'Crio esta tarefa?\n\n{resumen}\n\nResponde SIM ou NÃO.',
    cancelled: 'Está bem, não a crio. 👍',
    cancelled_timeout: 'Tínhamos uma tarefa a meio, mas já passou muito tempo: vou começar de novo.',
    created: '✅ Tarefa criada {para}:\n\n{resumen}',
    for_you: 'para ti',
    for_person: 'para {nombre}',
    for_nobody: 'sem responsável (atribui na aplicação)',
    notified: '\n\nAvisei por {canales}.',
    not_notified: '\n\n⚠️ {nombre} não tem avisos ativos (sem telefone no perfil) e vai ver ao abrir a aplicação.',
    channel_whatsapp: 'WhatsApp',
    channel_email: 'email',
    see_link: '\n\nVer: {url}',
    complete_not_found: 'Não encontro nenhuma tarefa em aberto que corresponda a "{pista}" 🤔.',
    completed: '✅ Feito: "{titulo}" marcada como concluída. Bom trabalho!',
    no_open_tasks: 'Olá {nombre}! Não tens tarefas em aberto neste momento 🎉',
    reply_done: 'Boa! ✅ Marquei "{titulo}" como concluída. Bom trabalho!',
    reply_not_done: 'Está bem, deixo "{titulo}" em aberto. Força! 💪',
    fallback:
      'Não percebi 🤔. Experimenta algo como:\n' +
      '• "Cria uma tarefa para o Luis: verificar a caldeira, para sexta"\n' +
      '• "O que tenho em aberto?"\n' +
      '• "Feita a da caldeira"\n\n' +
      'Escreve "ajuda" para veres mais exemplos.',
    teach_ok: 'Anotado: a partir de agora «{frase}» é {nombre} 👍',
    teach_unknown: 'Não encontro "{nombre}" na equipa, por isso não anoto. Pessoas: {lista}.',
    learned_person: '\n\n(Anotado: «{frase}» é {nombre}.)',
    ask_which_task: 'Não sei qual é «{pista}». Qual destas? Responde com o número:\n{lista}',
    learned_task: '\n\n(Anotado: «{pista}» é essa.)',
    not_a_number: 'Diz-me o número da tarefa, ou «cancela».',
    reminder_wa: 'Olá {nombre} 👋\n\nJá concluíste esta tarefa?\n\n{resumen}\n\nResponde SIM se já está feita, ou NÃO se continua em aberto.',
    reminder_mail: 'Olá {nombre},\n\nEsta tarefa vence ou está atrasada:\n\n{resumen}\n\nQuando a terminares, marca-a como feita na aplicação.{link}',
    subject_reminder: 'Lembrete: {titulo}',
    assigned_by: 'Olá {nombre} 👋 {quien} atribuiu-te uma tarefa nova:',
    assigned: 'Olá {nombre} 👋 tens uma tarefa nova:',
    subject_new_task: 'Nova tarefa: {titulo}',
    see_in_app: '\n\nVer na Amonn: {url}',
    summary_due: '📅 Prazo: {fecha}',
    summary_work: '⏱ Trabalho: {dias} dias',
    summary_priority: '⚡ Prioridade: {prioridad}',
    prio_high: 'alta', prio_low: 'baixa', prio_medium: 'média',
    ask_person_again: 'Não encontro "{nombre}" na equipa. Pessoas: {lista}. Para quem é?',
    cancel_words: 'cancela',
    no_date: 'sem data',
    due_today: 'hoje',
    due_tomorrow: 'amanhã',
    due_overdue: '{fecha} (atrasada há {dias} dia{s})',
  },
}

/** Idioma válido, o el de por defecto. */
export function safeLang(lang) {
  return LANGS.includes(lang) ? lang : DEFAULT_LANG
}

/**
 * Texto traducido con sustitución de {variables}. Si la clave no existe en el
 * idioma pedido cae a español; si tampoco existe allí, devuelve la clave (eso
 * es un fallo de programación, no algo que deba ver el usuario, y así se ve
 * enseguida en las pruebas).
 */
export function t(lang, key, vars = {}) {
  const dict = TEXTOS[safeLang(lang)] ?? TEXTOS[DEFAULT_LANG]
  const plantilla = dict[key] ?? TEXTOS[DEFAULT_LANG][key] ?? key
  return plantilla.replace(/\{(\w+)\}/g, (_, nombre) =>
    vars[nombre] === undefined || vars[nombre] === null ? '' : String(vars[nombre]),
  )
}
