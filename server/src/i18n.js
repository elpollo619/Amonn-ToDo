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
      '• "Hecha la de la caldera"\n' +
      '• "¿Cómo va la caldera?" o "Pásale la caldera a Rayna"\n' +
      '• "Cambia el plazo de la caldera al viernes"\n\n' +
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
      '• "Hecha la de la caldera"\n' +
      '• "¿Cómo va la caldera?" o "Pásale la caldera a Rayna"\n' +
      '• "Cambia el plazo de la caldera al viernes"\n\n' +
      'Escribe "ayuda" para ver más ejemplos.',
    teach_ok: 'Anotado: a partir de ahora «{frase}» es {nombre} 👍',
    teach_unknown: 'No encuentro a "{nombre}" en el equipo, así que no lo anoto. Personas: {lista}.',
    learned_person: '\n\n(Anotado: «{frase}» es {nombre}.)',
    ask_which_task: 'No sé cuál es «{pista}». ¿Cuál de estas? Responde con el número:\n{lista}',
    learned_task: '\n\n(Anotado: «{pista}» es esa.)',
    not_a_number: 'Dime el número de la tarea, o «cancela».',
    state_changed: '✅ «{titulo}» pasa a {estado}.',
    state_not_found: 'No tengo un estado que se llame «{estado}». Los que hay: {lista}.',
    state_ambiguous: '«{estado}» encaja con varios: {lista}. Dime cuál exactamente.',
    states_list: 'Estados de las tareas: {lista}.',
    step_added: '✅ Paso añadido a «{titulo}»: {paso}\n\nPasos: {hechos} de {total}.',
    steps_progress: 'Pasos: {hechos}/{total}',
    comment_added: '💬 Anotado en «{titulo}»: {texto}',
    photo_added: '📷 Foto añadida a «{titulo}».',
    audio_added: '🎤 Nota de voz añadida a «{titulo}».',
    digest_wa: '⏰ Buenos días {nombre}. Esto es lo que tienes:{cuerpo}',
    digest_mail: 'Buenos días {nombre}:{cuerpo}{link}',
    subject_digest: 'Amonn: {total} tarea(s) que necesitan tu atención',
    digest_overdue: '\n\n🔴 Atrasadas:\n{lista}',
    digest_today: '\n\n📅 Vence hoy:\n{lista}',
    digest_tomorrow: '\n\n🔜 Para mañana:\n{lista}',
    digest_line_late: '• {titulo} — hace {dias} día(s)',
    waste_next: '🗑️ Próximas recogidas en Muri:\n{lista}',
    waste_one: '🗑️ {tipo}: {cuando}.',
    waste_none: '🗑️ Ya no quedan recogidas de {tipo} este año.',
    waste_tomorrow: '🗑️ ¡Mañana sacan {tipo}! Hay que dejarlo fuera esta tarde o antes de las 7:00.',
    waste_today: 'hoy',
    shop_added: '🛒 Apuntado: {que}. Ahora hay {total} cosa(s) en la lista.',
    appt_added: '📆 Cita apuntada:\n\n📌 {titulo}\n🕐 {cuando}{donde}\n\nYa está en el calendario.',
    appt_no_date: '📆 ¿Qué día es la cita? Dime por ejemplo «el martes a las 14:00».',
    appt_no_time: '📆 ¿A qué hora? Dime por ejemplo «el martes a las 14:00».',
    contact_found: '{ficha}',
    contact_many: 'He encontrado {total}:\n\n{lista}',
    contact_none: '🔍 No encuentro a «{que}» en los contactos.',
    contact_added: '✅ Contacto guardado:\n\n{ficha}',
    contact_need_name: '¿Cómo se llama? Dime por ejemplo «guarda contacto: Reto Baumgartner, R. Baumgartner AG, +41 79 938 50 71».',
    exp_need_amount: '💰 ¿Cuánto fue? Dime por ejemplo «gasto 37.90 Landi Kabelbinder».',
    exp_receipt_saved: '🧾 Recibo guardado. Ahora dime, en un solo mensaje:\n\n• cuánto fue\n• de qué día (o «hoy»)\n• para qué propiedad: {codigos}\n• y qué se compró\n\nPor ejemplo: «37.90 hoy A14 Landi Kabelbinder»',
    exp_receipt_need_more: '🧾 Me falta {que}. Contesta por ejemplo «37.90 hoy A14 Landi Kabelbinder».',
    hotel_off: '🏨 Todavía no está conectado el sistema del hotel. Hacen falta las credenciales de Apaleo.',
    hotel_error: '🏨 No he podido preguntarle a Apaleo: {motivo}',
    hotel_today: '🏨 Hoy en el hotel\n\n🛬 Llegan {personas} persona(s) en {llegadas} reserva(s){detalle}\n🛫 Salen {salidas}\n\n🧹 Sucias ({sucias}): {listaSucias}\n✅ Limpias: {limpias}',
    hotel_dirty: '🧹 Habitaciones sucias ({total}): {lista}',
    hotel_dirty_none: '🧹 No hay ninguna habitación sucia.',
    hotel_arrivals: '🛬 {personas} persona(s) en {reservas} reserva(s){detalle}',
    hotel_arrivals_none: '🛬 Hoy no llega nadie.',
    exp_receipt_done: '✅ Apuntado y archivado:\n\n{code} · {fecha} · {concepto}\nCHF {importe} → {columna} (cuenta {cuenta})\n📄 {archivo}\n\nSe te deben CHF {saldo}.',
    exp_added: '💰 Gasto apuntado:\n\n{code} · {fecha} · {concepto}\nCHF {importe} → {columna} (cuenta {cuenta}){iva}\n\nSe te deben CHF {saldo}.',
    exp_vat: ' · IVA {iva}%',
    exp_guessed: '\n\n¿Va bien la columna? Si no, dime cuál de estas:\n{lista}',
    exp_list: '💰 Gastos pendientes de devolver:\n{lista}\n\nTotal: CHF {total}',
    exp_empty: '💰 No hay gastos pendientes.',
    exp_saldos: '\n\nPor persona:\n{lista}',
    appt_list: '📆 Próximas citas:\n{lista}',
    appt_none: '📆 No tienes ninguna cita apuntada.',
    appt_where: '\n📍 {donde}',
    shop_repeated: '🛒 {que} ya estaba en la lista (lo pidió {quien}).',
    shop_list: '🛒 Hace falta comprar:\n{lista}',
    shop_empty: '🛒 No falta nada en la oficina.',
    shop_bought_all: '🛒 Marcadas como compradas {total} cosa(s). Lista vacía.',
    shop_bought_some: '🛒 Marcado como comprado: {lista}.',
    shop_not_found: '🛒 No encuentro «{que}» en la lista.',
    waste_tomorrow_word: 'mañana',
    audio_which_task: '🎤 He guardado la nota de voz. ¿A qué tarea la pongo?\n{lista}\n\nContesta con el número.',
    due_changed: '📅 Plazo de «{titulo}» cambiado a {fecha}.',
    due_removed: '📅 Plazo de «{titulo}» quitado.',
    due_not_understood: '📅 No he entendido la fecha «{fecha}». Prueba con «el viernes», «mañana» o «15/10».',
    reassigned: '👤 «{titulo}» ahora es de {nombre}.',
    detail_state: '\n📊 Estado: {estado}',
    detail_assignee: '\n👤 Responsable: {nombre}',
    detail_due: '\n📅 Plazo: {fecha}',
    detail_no_due: '\n📅 Plazo: sin fecha',
    detail_priority: '\n🔴 Urgente',
    detail_steps: '\n\n✅ Pasos ({hechos}/{total}):\n{lista}',
    detail_comments: '\n\n💬 Últimos comentarios:\n{lista}',
    list_by_state: '📊 En «{estado}» ({total}):\n{lista}',
    list_by_state_empty: '📊 No hay nada en «{estado}».',
    list_due: '📅 Vence hasta {fecha} ({total}):\n{lista}',
    list_due_empty: '📅 No vence nada hasta {fecha}.',
    photo_which_task: '📷 He guardado la foto. ¿A qué tarea la pongo?\n{lista}\n\nContesta con el número.',
    photo_no_tasks: '📷 He guardado la foto, pero no tienes ninguna tarea abierta donde ponerla. Crea la tarea y vuelve a mandármela, y la coloco.',
    photo_no_storage: '📷 He recibido la foto, pero ahora mismo no puedo guardarla: {motivo}',
    photo_bad_type: '📷 Ese tipo de fichero no lo puedo guardar. Mándame una foto (JPG, PNG) o un PDF.',
    photo_too_big: '📷 La foto es demasiado grande. Mándala con menos calidad, por favor.',
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
    state_changed: '✅ «{titulo}» ist jetzt {estado}.',
    state_not_found: 'Ich habe keinen Status namens «{estado}». Vorhanden: {lista}.',
    state_ambiguous: '«{estado}» passt auf mehrere: {lista}. Sag mir genau welchen.',
    states_list: 'Status der Aufgaben: {lista}.',
    step_added: '✅ Schritt zu «{titulo}» hinzugefügt: {paso}\n\nSchritte: {hechos} von {total}.',
    steps_progress: 'Schritte: {hechos}/{total}',
    comment_added: '💬 Zu «{titulo}» notiert: {texto}',
    photo_added: '📷 Foto zu «{titulo}» hinzugefügt.',
    audio_added: '🎤 Sprachnachricht zu «{titulo}» hinzugefügt.',
    digest_wa: '⏰ Guten Morgen {nombre}. Das steht an:{cuerpo}',
    digest_mail: 'Guten Morgen {nombre}:{cuerpo}{link}',
    subject_digest: 'Amonn: {total} Aufgabe(n) brauchen deine Aufmerksamkeit',
    digest_overdue: '\n\n🔴 Überfällig:\n{lista}',
    digest_today: '\n\n📅 Heute fällig:\n{lista}',
    digest_tomorrow: '\n\n🔜 Für morgen:\n{lista}',
    digest_line_late: '• {titulo} — seit {dias} Tag(en)',
    waste_next: '🗑️ Nächste Abfuhren in Muri:\n{lista}',
    waste_one: '🗑️ {tipo}: {cuando}.',
    waste_none: '🗑️ Dieses Jahr gibt es keine {tipo}-Abfuhr mehr.',
    waste_tomorrow: '🗑️ Morgen kommt {tipo}! Heute Abend oder vor 7:00 Uhr bereitstellen.',
    waste_today: 'heute',
    shop_added: '🛒 Notiert: {que}. Jetzt {total} Sache(n) auf der Liste.',
    appt_added: '📆 Termin notiert:\n\n📌 {titulo}\n🕐 {cuando}{donde}\n\nSteht im Kalender.',
    appt_no_date: '📆 An welchem Tag? Sag zum Beispiel «Dienstag um 14:00».',
    appt_no_time: '📆 Um welche Uhrzeit? Sag zum Beispiel «Dienstag um 14:00».',
    contact_found: '{ficha}',
    contact_many: 'Ich habe {total} gefunden:\n\n{lista}',
    contact_none: '🔍 «{que}» ist nicht in den Kontakten.',
    contact_added: '✅ Kontakt gespeichert:\n\n{ficha}',
    contact_need_name: 'Wie heisst er? Sag zum Beispiel «Kontakt speichern: Reto Baumgartner, R. Baumgartner AG, +41 79 938 50 71».',
    exp_need_amount: '💰 Wie viel war es? Sag zum Beispiel «Spesen 37.90 Landi Kabelbinder».',
    exp_receipt_saved: '🧾 Beleg gespeichert. Jetzt sag mir in einer Nachricht:\n\n• wie viel\n• von welchem Tag (oder «heute»)\n• für welche Liegenschaft: {codigos}\n• und was gekauft wurde\n\nZum Beispiel: «37.90 heute A14 Landi Kabelbinder»',
    exp_receipt_need_more: '🧾 Mir fehlt {que}. Antworte zum Beispiel «37.90 heute A14 Landi Kabelbinder».',
    hotel_off: '🏨 Das Hotelsystem ist noch nicht verbunden. Es fehlen die Apaleo-Zugangsdaten.',
    hotel_error: '🏨 Apaleo antwortet nicht: {motivo}',
    hotel_today: '🏨 Heute im Hotel\n\n🛬 {personas} Person(en) in {llegadas} Reservation(en){detalle}\n🛫 Abreisen: {salidas}\n\n🧹 Schmutzig ({sucias}): {listaSucias}\n✅ Sauber: {limpias}',
    hotel_dirty: '🧹 Schmutzige Zimmer ({total}): {lista}',
    hotel_dirty_none: '🧹 Kein Zimmer ist schmutzig.',
    hotel_arrivals: '🛬 {personas} Person(en) in {reservas} Reservation(en){detalle}',
    hotel_arrivals_none: '🛬 Heute keine Anreisen.',
    exp_receipt_done: '✅ Notiert und abgelegt:\n\n{code} · {fecha} · {concepto}\nCHF {importe} → {columna} (Konto {cuenta})\n📄 {archivo}\n\nDu bekommst CHF {saldo}.',
    exp_added: '💰 Spese notiert:\n\n{code} · {fecha} · {concepto}\nCHF {importe} → {columna} (Konto {cuenta}){iva}\n\nDu bekommst CHF {saldo}.',
    exp_vat: ' · MwSt {iva}%',
    exp_guessed: '\n\nStimmt die Spalte? Wenn nicht, sag welche:\n{lista}',
    exp_list: '💰 Offene Spesen:\n{lista}\n\nTotal: CHF {total}',
    exp_empty: '💰 Keine offenen Spesen.',
    exp_saldos: '\n\nPro Person:\n{lista}',
    appt_list: '📆 Nächste Termine:\n{lista}',
    appt_none: '📆 Du hast keine Termine.',
    appt_where: '\n📍 {donde}',
    shop_repeated: '🛒 {que} stand schon auf der Liste ({quien} hat es gemeldet).',
    shop_list: '🛒 Wir brauchen:\n{lista}',
    shop_empty: '🛒 Im Büro fehlt nichts.',
    shop_bought_all: '🛒 {total} Sache(n) als gekauft markiert. Liste leer.',
    shop_bought_some: '🛒 Als gekauft markiert: {lista}.',
    shop_not_found: '🛒 «{que}» steht nicht auf der Liste.',
    waste_tomorrow_word: 'morgen',
    audio_which_task: '🎤 Ich habe die Sprachnachricht gespeichert. Zu welcher Aufgabe gehört sie?\n{lista}\n\nAntworte mit der Nummer.',
    due_changed: '📅 Frist von «{titulo}» auf {fecha} geändert.',
    due_removed: '📅 Frist von «{titulo}» entfernt.',
    due_not_understood: '📅 Ich habe das Datum «{fecha}» nicht verstanden. Versuch «Freitag», «morgen» oder «15.10.».',
    reassigned: '👤 «{titulo}» gehört jetzt {nombre}.',
    detail_state: '\n📊 Status: {estado}',
    detail_assignee: '\n👤 Zuständig: {nombre}',
    detail_due: '\n📅 Frist: {fecha}',
    detail_no_due: '\n📅 Frist: keine',
    detail_priority: '\n🔴 Dringend',
    detail_steps: '\n\n✅ Schritte ({hechos}/{total}):\n{lista}',
    detail_comments: '\n\n💬 Letzte Kommentare:\n{lista}',
    list_by_state: '📊 In «{estado}» ({total}):\n{lista}',
    list_by_state_empty: '📊 Nichts in «{estado}».',
    list_due: '📅 Fällig bis {fecha} ({total}):\n{lista}',
    list_due_empty: '📅 Nichts fällig bis {fecha}.',
    photo_which_task: '📷 Ich habe das Foto gespeichert. Zu welcher Aufgabe gehört es?\n{lista}\n\nAntworte mit der Nummer.',
    photo_no_tasks: '📷 Ich habe das Foto gespeichert, aber du hast keine offene Aufgabe dafür. Leg die Aufgabe an und schick es mir nochmal, dann ordne ich es zu.',
    photo_no_storage: '📷 Ich habe das Foto bekommen, kann es aber gerade nicht speichern: {motivo}',
    photo_bad_type: '📷 Diesen Dateityp kann ich nicht speichern. Schick mir ein Foto (JPG, PNG) oder ein PDF.',
    photo_too_big: '📷 Das Foto ist zu groß. Schick es bitte mit geringerer Qualität.',
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
    state_changed: '✅ «{titulo}» passa a {estado}.',
    state_not_found: 'Não tenho um estado chamado «{estado}». Os que há: {lista}.',
    state_ambiguous: '«{estado}» corresponde a vários: {lista}. Diz-me qual exatamente.',
    states_list: 'Estados das tarefas: {lista}.',
    step_added: '✅ Passo adicionado a «{titulo}»: {paso}\n\nPassos: {hechos} de {total}.',
    steps_progress: 'Passos: {hechos}/{total}',
    comment_added: '💬 Anotado em «{titulo}»: {texto}',
    photo_added: '📷 Foto adicionada a «{titulo}».',
    audio_added: '🎤 Nota de voz adicionada a «{titulo}».',
    digest_wa: '⏰ Bom dia {nombre}. Isto é o que tens:{cuerpo}',
    digest_mail: 'Bom dia {nombre}:{cuerpo}{link}',
    subject_digest: 'Amonn: {total} tarefa(s) precisam da tua atenção',
    digest_overdue: '\n\n🔴 Atrasadas:\n{lista}',
    digest_today: '\n\n📅 Vence hoje:\n{lista}',
    digest_tomorrow: '\n\n🔜 Para amanhã:\n{lista}',
    digest_line_late: '• {titulo} — há {dias} dia(s)',
    waste_next: '🗑️ Próximas recolhas em Muri:\n{lista}',
    waste_one: '🗑️ {tipo}: {cuando}.',
    waste_none: '🗑️ Já não há recolhas de {tipo} este ano.',
    waste_tomorrow: '🗑️ Amanhã levam {tipo}! Põe cá fora esta tarde ou antes das 7:00.',
    waste_today: 'hoje',
    shop_added: '🛒 Apontado: {que}. Agora há {total} coisa(s) na lista.',
    appt_added: '📆 Reunião apontada:\n\n📌 {titulo}\n🕐 {cuando}{donde}\n\nJá está no calendário.',
    appt_no_date: '📆 Em que dia? Diz por exemplo «terça às 14:00».',
    appt_no_time: '📆 A que horas? Diz por exemplo «terça às 14:00».',
    contact_found: '{ficha}',
    contact_many: 'Encontrei {total}:\n\n{lista}',
    contact_none: '🔍 Não encontro «{que}» nos contactos.',
    contact_added: '✅ Contacto guardado:\n\n{ficha}',
    contact_need_name: 'Como se chama? Diz por exemplo «guarda contacto: Reto Baumgartner, R. Baumgartner AG, +41 79 938 50 71».',
    exp_need_amount: '💰 Quanto foi? Diz por exemplo «despesa 37.90 Landi Kabelbinder».',
    exp_receipt_saved: '🧾 Recibo guardado. Agora diz-me numa só mensagem:\n\n• quanto foi\n• de que dia (ou «hoje»)\n• para que propriedade: {codigos}\n• e o que se comprou\n\nPor exemplo: «37.90 hoje A14 Landi Kabelbinder»',
    exp_receipt_need_more: '🧾 Falta-me {que}. Responde por exemplo «37.90 hoje A14 Landi Kabelbinder».',
    hotel_off: '🏨 O sistema do hotel ainda não está ligado. Faltam as credenciais do Apaleo.',
    hotel_error: '🏨 O Apaleo não respondeu: {motivo}',
    hotel_today: '🏨 Hoje no hotel\n\n🛬 Chegam {personas} pessoa(s) em {llegadas} reserva(s){detalle}\n🛫 Saem {salidas}\n\n🧹 Sujos ({sucias}): {listaSucias}\n✅ Limpos: {limpias}',
    hotel_dirty: '🧹 Quartos sujos ({total}): {lista}',
    hotel_dirty_none: '🧹 Não há nenhum quarto sujo.',
    hotel_arrivals: '🛬 {personas} pessoa(s) em {reservas} reserva(s){detalle}',
    hotel_arrivals_none: '🛬 Hoje não chega ninguém.',
    exp_receipt_done: '✅ Apontado e arquivado:\n\n{code} · {fecha} · {concepto}\nCHF {importe} → {columna} (conta {cuenta})\n📄 {archivo}\n\nDevem-te CHF {saldo}.',
    exp_added: '💰 Despesa apontada:\n\n{code} · {fecha} · {concepto}\nCHF {importe} → {columna} (conta {cuenta}){iva}\n\nDevem-te CHF {saldo}.',
    exp_vat: ' · IVA {iva}%',
    exp_guessed: '\n\nA coluna está certa? Se não, diz qual:\n{lista}',
    exp_list: '💰 Despesas por devolver:\n{lista}\n\nTotal: CHF {total}',
    exp_empty: '💰 Não há despesas pendentes.',
    exp_saldos: '\n\nPor pessoa:\n{lista}',
    appt_list: '📆 Próximas reuniões:\n{lista}',
    appt_none: '📆 Não tens nenhuma reunião.',
    appt_where: '\n📍 {donde}',
    shop_repeated: '🛒 {que} já estava na lista (pediu {quien}).',
    shop_list: '🛒 Falta comprar:\n{lista}',
    shop_empty: '🛒 Não falta nada no escritório.',
    shop_bought_all: '🛒 {total} coisa(s) marcadas como compradas. Lista vazia.',
    shop_bought_some: '🛒 Marcado como comprado: {lista}.',
    shop_not_found: '🛒 Não encontro «{que}» na lista.',
    waste_tomorrow_word: 'amanhã',
    audio_which_task: '🎤 Guardei a nota de voz. A que tarefa a ponho?\n{lista}\n\nResponde com o número.',
    due_changed: '📅 Prazo de «{titulo}» mudado para {fecha}.',
    due_removed: '📅 Prazo de «{titulo}» retirado.',
    due_not_understood: '📅 Não percebi a data «{fecha}». Tenta «sexta-feira», «amanhã» ou «15/10».',
    reassigned: '👤 «{titulo}» agora é de {nombre}.',
    detail_state: '\n📊 Estado: {estado}',
    detail_assignee: '\n👤 Responsável: {nombre}',
    detail_due: '\n📅 Prazo: {fecha}',
    detail_no_due: '\n📅 Prazo: sem data',
    detail_priority: '\n🔴 Urgente',
    detail_steps: '\n\n✅ Passos ({hechos}/{total}):\n{lista}',
    detail_comments: '\n\n💬 Últimos comentários:\n{lista}',
    list_by_state: '📊 Em «{estado}» ({total}):\n{lista}',
    list_by_state_empty: '📊 Não há nada em «{estado}».',
    list_due: '📅 Vence até {fecha} ({total}):\n{lista}',
    list_due_empty: '📅 Não vence nada até {fecha}.',
    photo_which_task: '📷 Guardei a foto. A que tarefa a ponho?\n{lista}\n\nResponde com o número.',
    photo_no_tasks: '📷 Guardei a foto, mas não tens nenhuma tarefa aberta onde a pôr. Cria a tarefa e manda-ma outra vez, que eu coloco-a.',
    photo_no_storage: '📷 Recebi a foto, mas agora não a consigo guardar: {motivo}',
    photo_bad_type: '📷 Esse tipo de ficheiro não consigo guardar. Manda uma foto (JPG, PNG) ou um PDF.',
    photo_too_big: '📷 A foto é demasiado grande. Manda-a com menos qualidade, por favor.',
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
