// ============================================================
// Asistente de WhatsApp: entiende lo que escribe una persona del equipo al
// número de Amonn y lo convierte en una acción:
//   - crear una tarea ("crea una tarea a Cristian: detail de la ventana, para el viernes")
//   - listar tareas ("¿qué tengo abierto?", "tareas de Luis")
//   - completar una tarea ("hecha la de la ventana")
//   - responder a un recordatorio ("sí" / "no")
//   - ayuda
// Si hay GEMINI_API_KEY, interpreta con Google Gemini (más flexible). Si no,
// o si Gemini falla, usa reglas en español que cubren los casos habituales.
// ============================================================
import { config } from './config.js'
import { normalize, parseDateAnyLang, parseRange, parseWorkDays, todayKey, weekdayOf } from './dates.js'
import { interpretReply } from './whatsapp.js'
import { resolvePerson, resolveTask } from './aliases.js'
import { matchStateByName } from './states.service.js'
import { DOSSIER } from './empresa.js'
import { NOMBRES_PERMISO as NOMBRES_PERMISO_RULES } from './permisos.js'

const WEEKDAY_NAMES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']

// ─── Personas: buscar por nombre ──────────────────────────────
/**
 * Encuentra a una persona del equipo por cómo la nombran ("cristian",
 * "Cristian Amaya", "cris"). Devuelve { user } o { candidates } si hay dudas.
 */
export function matchUser(nameText, users, sender, aliases = []) {
  const q = normalize(nameText).replace(/[.,;:]/g, '').trim()
  if (!q) return { user: null, candidates: [] }
  // "para mí" en los tres idiomas.
  if (/^(mi|me|yo|a mi|para mi|mio|ich|mir|mich|fur mich|eu|mim|para mim)$/.test(q)) {
    return { user: sender, candidates: [] }
  }
  // El vocabulario del equipo manda sobre el parecido de nombres: si alguien
  // enseñó que "jasmi" es Jasmina, no hay nada que adivinar.
  const porAlias = resolvePerson(aliases, nameText)
  if (porAlias) {
    const u = users.find((x) => x.id === porAlias)
    if (u) return { user: u, candidates: [], viaAlias: true }
  }
  const scored = users
    .map((u) => {
      const full = normalize(u.full_name ?? '')
      const tokens = full.split(' ').filter(Boolean)
      let score = 0
      if (full === q) score = 100
      else if (tokens[0] === q) score = 90
      else if (tokens.includes(q)) score = 70
      else if (full.startsWith(q)) score = 60
      else if (tokens[0]?.startsWith(q) && q.length >= 3) score = 50
      return { u, score }
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
  if (scored.length === 0) return { user: null, candidates: [] }
  if (scored.length > 1 && scored[0].score === scored[1].score) {
    return { user: null, candidates: scored.filter((x) => x.score === scored[0].score).map((x) => x.u) }
  }
  return { user: scored[0].u, candidates: [] }
}

// ─── Reglas (sin IA), por idioma ──────────────────────────────
// Cada idioma aporta sus propias expresiones con la MISMA forma, para que el
// algoritmo sea uno solo. Al interpretar se prueba primero el idioma de quien
// escribe y luego los otros dos: así alguien que escribe "am Freitag" en un
// chat en español sigue siendo entendido.
//
// ⚠️ Los patrones se comparan contra texto ya normalizado (sin acentos y en
// minúsculas), así que aquí se escribe "fur" y no "für", "amanha" y no "amanhã".
const REGLAS = {
  es: {
    create:
      /^(?:oye |hola |por favor |porfa )?(?:(?:crea(?:r|me)?|anade|anadir|agrega|agregar|anota|anotar|apunta|apuntar|pon(?:me)?|poner|manda|mandar|asigna(?:le)?|asignar|dile|di)\b[\s:,-]*(?:una |un |la |el )?(?:tarea|trabajo|pendiente|recordatorio)?|(?:nueva|nuevo) (?:tarea|trabajo|pendiente|recordatorio))[\s:,-]*/,
    list:
      /\b(que (?:tengo|hay|tenemos|tiene \w+)|mis tareas|tareas (?:abiertas|pendientes|de \w+|del equipo|de todos)|lista(?:me)?|pendientes|abiertas|resumen)\b/,
    done:
      /^(?:ya )?(?:hecha|hecho|terminada|terminado|termine|acabe|completada|completado|lista|listo|cierra|cerrar|marca(?:r)? como hecha|marca(?:r)? como completada|completa(?:r)?)\b\s*(?:la |el |lo )?(?:de |la de |tarea |tarea de )?(.+)?$/,
    help: /^(ayuda|help|hola|buenas|buenos dias|buenas tardes|que puedes hacer|comandos)\b/,
    prioAlta: /\b(urgente|urgentemente|prioridad alta|importante|cuanto antes|asap)\b/,
    prioBaja: /\b(prioridad baja|sin prisa|cuando puedas|tranqui)\b/,
    stripPrio: [
      [/\b(es )?(urgente|urgentemente|importante|cuanto antes|asap)\b/g, ' '],
      [/\b(con )?prioridad (alta|baja|media)\b/g, ' '],
    ],
    prep: '(?:a|para)',
    sep: '(?::|,|-|que|de|para que)',
    ask: /^(?:necesito|quiero|hay) que ([a-z]+) (.+)$/,
    listWho: /\b(?:tareas de|que tiene|pendientes de|abiertas de) ([a-z]+)/,
    team: /\b(todos|equipo|todas|de todos)\b/,
    me: /^(yo|mi|mias|mias)$/i,
    teamWord: /^(equipo|todos|todas|all)$/i,
    // "pon la caldera en esperando material"
    createNoun: /^(?:pon|ponme|poner|pasa|pasar|cambia|cambiar|mueve|mover|marca|marcar|crea|crear|anade|anadir|agrega|agregar|anota|anotar|apunta|apuntar)\s+(?:una |un |la |el )?(?:tarea|trabajo|pendiente|recordatorio)\b/,
    addComment: /^(?:comenta|comentar|anota\s+en|nota\s+en|apunta\s+en|di\s+en)\s+(?:en\s+)?(?:la |el |lo )?(.+?)\s*[:,-]\s*(.+)$/,
    addStep: /^(?:anade|anadir|agrega|agregar|apunta|apuntar|suma|sumar)\s+(?:a|en)\s+(?:la |el |lo )?(.+?)\s*[:,-]\s*(.+)$/,
    setState: /^(?:pon|ponme|poner|pasa|pasar|cambia|cambiar|mueve|mover|marca|marcar)\s+(?:la |el |lo )?(.+?)\s+(?:al estado|al|a|en|como)\s+(.+)$/,
    // "cambia el plazo de la caldera al viernes"
    setDue: /^(?:cambia(?:le)?|cambiar|pon(?:le)?|poner|mueve|mover|aplaza|aplazar|adelanta|adelantar)?\s*(?:el |la )?(?:plazo|fecha|entrega|vencimiento)\s+(?:de\s+)?(?:la |el )?(.+?)\s+(?:a|al|para)\s+(.+)$/,
    // "pásale la caldera a Rayna"
    reassign: /^(?:pasa(?:le|sela)?|pasar|reasigna(?:le)?|reasignar|asigna(?:le)?|asignar|dale|encarga(?:le)?)\s+(?:la |el |lo )?(.+?)\s+(?:a|para)\s+([a-z]+)$/,
    // "¿cómo va la caldera?"
    detail: /^(?:como (?:va|esta|anda)|que tal (?:va |esta )?|detalle(?:s)? de|informacion de|info de|estado de|ver|muestra(?:me)?|dame)\s+(?:la |el |lo )?(.+?)\??$/,
    // "¿qué hay en esperando material?"
    listState: /^(?:que|cuales|cuantas)\s+(?:tareas\s+)?(?:hay|tenemos|estan|hay ahora)?\s*(?:en|con estado)\s+(.+?)\??$/,
    // "¿qué vence esta semana?"
    listDue: /^(?:que|cuales|cuantas)\s+(?:tareas\s+)?(?:vence(?:n)?|caduca(?:n)?|hay para|tenemos para)\s+(.+?)\??$/,
    // "¿cuándo sacan el papel?" · "cuándo es la basura"
    basura: /\b(cuando|que dia|proxima)\b.{0,20}\b(basura|kehricht|papel|carton|vidrio|metal|plastico|verdes?|gruengut|escombros|reciclaje|entsorgung|contenedor)\b/,
    // "falta café" · "hay que comprar folios" · "apunta en la compra: leche"
    compraAdd: /^(?:falta(?:n)?|se acabo|se ha acabado|hay que comprar|necesitamos|compra(?:r)?|apunta en la (?:compra|lista)|anade a la (?:compra|lista))\s*[:,-]?\s*(.+)$/,
    compraList: /^(?:que (?:falta|hay que comprar|necesitamos)|lista de (?:la )?compra|la compra|compras)\b\??$/,
    // "cita con Baumgartner el martes a las 14:00 en la obra G60"
    citaAdd: /^(?:cita|reunion|visita|termin|agenda(?:r)?)\s*(?:con\s+)?(.*)$/,
    citaList: /^(?:que citas|mis citas|proximas citas|agenda|citas)\b\??$/,
    // "teléfono de Baumgartner" · "contacto del gipser"
    contactoBuscar: /^(?:(?:el\s+)?(?:telefono|numero|mail|email|correo|contacto|datos)\s+(?:de|del|de la)\s+|quien es\s+|buscar?\s+(?:contacto\s+)?)(.+?)\??$/,
    // "guarda contacto: Reto Baumgartner, R. Baumgartner AG, +41 79 938 50 71"
    contactoAdd: /^(?:guarda(?:r)?|anade|anadir|agrega(?:r)?|nuevo)\s+(?:el\s+)?contacto\s*[:,-]?\s*(.+)$/,
    // "gasto 37.90 Landi Kabelbinder" · "spesen a14 45.20 Migros"
    gastoAdd: /^(?:gasto|gastos|spesen|spese|ticket|recibo)\s*[:,-]?\s*(.+)$/,
    gastoList: /^(?:que se me debe|cuanto se me debe|mis gastos|mis spesen|resumen de gastos|saldo)\b\??$/,
    // "resumen semanal": la foto del negocio. Va con apellido ("semanal")
    // porque "resumen" a secas ya significa listar tareas.
    resumenSemanal: /^(?:resumen (?:semanal|de la semana)|como va la semana)\??$/,
    // "Rayna de vacaciones del 10 al 15" · "quién está de vacaciones"
    ausenciaList: /^(?:quien esta (?:de vacaciones|de baja|fuera|ausente)|ausencias|vacaciones)\b\??$/,
    ausenciaAdd: /^(\w+)\s+(?:esta\s+)?de\s+(vacaciones|baja|permiso|libre)\s*(.*)$/,
    // "luz 204: 4521" · "lecturas de la 204"
    contadorAdd: /^(luz|electricidad|agua|gas|calefaccion|contador)\s+([^\s:,-]+)\s*[:,-]?\s*(\d+(?:[.,]\d+)?)$/,
    contadorList: /^(?:lecturas|contadores)(?:\s+(?:de\s+)?(?:la\s+|el\s+)?(\S+))?\??$/,
    // "contrato para Max Muster, habitación 204, 850, desde el 1 de octubre"
    contratoAdd: /^(?:(?:haz(?:me)?|crea(?:r)?|prepara(?:r)?|nuevo)\s+)?(?:un\s+|el\s+)?contrato\s+(?:para|de|a)\s+(.+)$/,
    // "contrato de la 204" · "contrato de Koubaa" (consultar, no crear)
    vertragInfo: /^(?:contrato|mietvertrag|vertrag)\s+(?:de|del|de la|da|do)\s*(?:la\s+|el\s+)?(?:habitacion\s+|zimmer\s+|quarto\s+)?([\w.\-]+)\??$/,
    // "alquileres" · "alquileres de B22"
    mietenSum: /^(?:alquileres|suma de alquileres|rendas)(?:\s+(?:de|del|de la|da|do)\s+(\S+))?\??$/,
    // "¿quién no ha pagado?" · "impagos"
    impagos: /^(?:impagos|impagados|quien no ha pagado|quien no pago|morosos)\??$/,
    // "mahnung a la A4-11.1" · "2. mahnung a Koubaa" · "recordatorio de pago a la 204"
    mahnungCmd: /^(?:(?:1\.?|2\.?|primera?|segunda?|erste|zweite)\s+)?(?:mahnung|recordatorio de pago|zahlungserinnerung)\s+(?:a|an|para|fur)\s+.+$/,
    // "mietertrag septiembre" · "mietertrag"
    mietertragCmd: /^mietertrag(?:\s+(\w+))?\??$/,
    // "mwst q3" · "iva 2026 q2" · "vorsteuer"
    mwstCmd: /^(?:mwst|iva|vorsteuer)(?:\s+(\d{4}))?(?:\s+q?([1-4]))?\??$/,
    // "dale acceso al dinero a Jasmina" · "quita el acceso a los huéspedes a X"
    permisoDar: /^(?:dale|da|dar)\s+(?:el\s+)?(?:acceso|permiso)\s+(?:al?\s+|a\s+l[oa]s?\s+|de\s+)?(\w+)\s+a\s+(\w+)$/,
    permisoQuitar: /^(?:quita(?:le)?|quitar|retira(?:le)?)\s+(?:el\s+)?(?:acceso|permiso)\s+(?:al?\s+|a\s+l[oa]s?\s+|de\s+)?(\w+)\s+a\s+(\w+)$/,
    permisoList: /^(?:accesos|permisos|quien tiene acceso)\??$/,
    // "factura 850 para Max Muster, alquiler octubre"
    facturaAdd: /^(?:(?:haz(?:me)?|crea(?:r)?|nueva)\s+)?(?:una\s+)?(?:factura|qr[- ]?rechnung)\s*[:,-]?\s*(.+)$/,
    // "precios" · "¿subo o bajo los precios?" · "precios del hotel"
    precios: /^(?:precios|analisis de precios|como van los precios|subo o bajo (?:los )?precios)(?:\s+(?:de\s+|del\s+|de la\s+)?(casa reto|casa|hotel|a14))?\??$/,
    // "¿qué tiempo hace?" · "tiempo" · "meteo"
    meteoCmd: /^(?:que tiempo (?:hace|hara|va a hacer)|el tiempo|tiempo|meteo|prevision(?: del tiempo)?)\??$/,
    zinsCmd: /^(?:referenzzinssatz|zinssatz|tipo de referencia|tipo hipotecario)\??$/,
    // "mensajes de los huéspedes" · "responde al huésped 12345: llegamos a las 15"
    huespedList: /^(?:mensajes(?: de(?: los)? huespedes)?|que dicen los huespedes)\??$/,
    huespedReply: /^responde (?:al |a la |a )?(?:huesped|reserva)\s+(\S+)\s*[:,-]\s*(.+)$/,
    // "cierra los gastos de agosto" · "exporta las spesen". Exige la palabra
    // gastos/spesen: "cierra" a secas es completar una tarea (verbo de done).
    gastoCierre: /^(?:cierra|cerrar|exporta(?:r)?)\s+(?:el mes de (?:los\s+)?)?(?:los\s+|las\s+)?(?:gastos|spesen)(?:\s+de(?:l mes de)?\s+(\w+))?$/,
    // "¿cuántos llegan hoy?" · "¿qué cuartos están sucios?" · "el hotel"
    hotel: /\b(hotel|llegan|llegadas|salidas|check[\s-]?in|huespedes|cuartos?|habitacion(?:es)?|sucia?s?|limpia?s?|ocupacion)\b/,
    compraDone: /^(?:ya (?:esta|lo) compr\w+|compr(?:e|ado|ada)|todo comprado|ya compre)\s*(.*)$/,
  },

  de: {
    create:
      /^(?:hey |hallo |bitte )?(?:(?:erstelle?|erstellen|mach(?:e)?|machen|leg(?:e)? an|anlegen|notier(?:e)?|notieren|trag(?:e)? ein|eintragen|schick(?:e)?|schicken|weis(?:e)? zu|zuweisen|sag)\b[\s:,-]*(?:eine |einen |ein |die |der |das )?(?:aufgabe|todo|to-do|pendenz|erinnerung)?|(?:neue|neuer|neues) (?:aufgabe|todo|to-do|pendenz|erinnerung))[\s:,-]*/,
    list:
      /\b(was (?:ist|habe ich|haben wir|hat \w+)|meine aufgaben|aufgaben (?:von \w+|vom team|des teams|offen)|offene aufgaben|offen|pendenzen|liste|ubersicht|uberblick)\b/,
    done:
      /^(?:schon )?(?:erledigt|fertig|gemacht|abgeschlossen|beendet|erledige|erledigt ist|als erledigt markieren|schliesse|schliessen)\b\s*(?:die |der |das )?(?:von |die von |aufgabe |aufgabe von )?(.+)?$/,
    help: /^(hilfe|help|hallo|hi|guten morgen|guten tag|was kannst du|befehle)\b/,
    prioAlta: /\b(dringend|eilt|wichtig|hohe prioritat|so schnell wie moglich|asap|sofort)\b/,
    prioBaja: /\b(niedrige prioritat|keine eile|wenn du zeit hast|nicht dringend)\b/,
    stripPrio: [
      [/\b(ist )?(dringend|eilt|wichtig|sofort|asap|so schnell wie moglich)\b/g, ' '],
      [/\b(mit )?(hohe|niedrige|mittlere) prioritat\b/g, ' '],
    ],
    prep: '(?:fur|an)',
    sep: '(?::|,|-|dass|soll|zu)',
    ask: /^(?:ich brauche|kannst du|konnte|soll) ([a-z]+) (.+)$/,
    listWho: /\b(?:aufgaben von|was hat|pendenzen von|offene von) ([a-z]+)/,
    team: /\b(alle|team|vom team|des teams)\b/,
    me: /^(ich|mir|mich|meine)$/i,
    teamWord: /^(team|alle|all)$/i,
    createNoun: /^(?:setze|stelle|andere|verschiebe|markiere|erstelle|mach|lege)\s+(?:eine |einen |ein |die |der |das )?(?:aufgabe|todo|to-do|pendenz|erinnerung)\b/,
    addComment: /^(?:kommentiere|kommentar\s+zu|notiere\s+zu|vermerke)\s+(?:zu\s+)?(?:die |der |das )?(.+?)\s*[:,-]\s*(.+)$/,
    addStep: /^(?:fuge|fuege|hinzufugen|erganze|erganzen)\s+(?:zu|bei)\s+(?:die |der |das )?(.+?)\s*[:,-]\s*(.+)$/,
    setState: /^(?:setze|stelle|andere|verschiebe|markiere)\s+(?:die |der |das )?(.+?)\s+(?:auf|zu|als)\s+(.+)$/,
    setDue: /^(?:andere|andern|verschiebe|setze|verlangere)?\s*(?:die |den |das )?(?:frist|termin|datum|abgabe)\s+(?:von\s+)?(?:die |der |das )?(.+?)\s+(?:auf|zu)\s+(.+)$/,
    reassign: /^(?:gib|ubergib|ubergebe|ubertrage|weise|zuweisen)\s+(?:die |der |das )?(.+?)\s+(?:an|zu)\s+([a-z]+)$/,
    detail: /^(?:wie (?:steht|lauft|ist)(?: es um)?|status von|details? (?:zu|von)|infos? (?:zu|von)|zeig(?:e|mir)?|zeige mir)\s+(?:die |der |das )?(.+?)\??$/,
    listState: /^(?:was|welche|wie viele)\s+(?:aufgaben\s+)?(?:gibt es|haben wir|ist|sind)?\s*(?:in|im|auf|mit status)\s+(.+?)\??$/,
    listDue: /^(?:was|welche|wie viele)\s+(?:aufgaben\s+)?(?:lauft ab|lauf(?:en)? ab|ist fallig|sind fallig|haben wir fur|gibt es fur)\s+(.+?)\??$/,
    basura: /\b(wann|welcher tag|nachste)\b.{0,20}\b(abfall|kehricht|papier|karton|glas|metall|kunststoff|gruengut|deponie|entsorgung|container)\b/,
    compraAdd: /^(?:es fehlt|es fehlen|fehlt|ist aus|wir brauchen|einkaufen|kaufen|auf die (?:einkaufsliste|liste))\s*[:,-]?\s*(.+)$/,
    compraList: /^(?:was (?:fehlt|brauchen wir|müssen wir kaufen)|einkaufsliste|einkauf)\b\??$/,
    citaAdd: /^(?:termin|besprechung|sitzung|besuch)\s*(?:mit\s+)?(.*)$/,
    citaList: /^(?:welche termine|meine termine|nachste termine|agenda|termine)\b\??$/,
    contactoBuscar: /^(?:(?:die\s+)?(?:telefon|nummer|mail|email|kontakt|daten)\s+(?:von|vom)\s+|wer ist\s+|such(?:e)?\s+(?:kontakt\s+)?)(.+?)\??$/,
    contactoAdd: /^(?:speicher(?:e)?|neuer|fuge)\s+(?:den\s+)?kontakt\s*[:,-]?\s*(.+)$/,
    gastoAdd: /^(?:spesen|spese|auslage|beleg|quittung)\s*[:,-]?\s*(.+)$/,
    gastoList: /^(?:was schuldet ihr mir|meine spesen|meine auslagen|saldo)\b\??$/,
    resumenSemanal: /^(?:wochenbericht|wochenubersicht|wochen ubersicht|wie lauft die woche)\??$/,
    ausenciaList: /^(?:wer (?:ist|hat) (?:im urlaub|in den ferien|ferien|frei)|abwesenheiten|ferien)\b\??$/,
    ausenciaAdd: /^(\w+)\s+(?:ist\s+|hat\s+)?(im urlaub|in den ferien|ferien|urlaub|krank|abwesend)\s*(.*)$/,
    contadorAdd: /^(strom|wasser|gas|heizung|zahler|zaehler)\s+([^\s:,-]+)\s*[:,-]?\s*(\d+(?:[.,]\d+)?)$/,
    contadorList: /^(?:zahlerstande|zaehlerstande|ablesungen|zahlerstand)(?:\s+(\S+))?\??$/,
    contratoAdd: /^(?:(?:mach(?:e)?|erstelle?|neuer)\s+)?(?:einen\s+|den\s+)?(?:miet)?vertrag\s+(?:fur|an)\s+(.+)$/,
    // Consultar es "vertrag von 204"; crear es "vertrag für ..." (contratoAdd).
    vertragInfo: /^(?:mietvertrag|vertrag)\s+(?:von|vom)\s*(?:zimmer\s+)?([\w.\-]+)\??$/,
    mietenSum: /^(?:mieten|mietzinsen)(?:\s+(?:von|vom)\s+(\S+))?\??$/,
    impagos: /^(?:wer hat nicht bezahlt|offene mieten|zahlungsruckstande)\??$/,
    permisoDar: /^(?:gib|gebe)\s+(\w+)\s+zugriff\s+auf\s+(\w+)$/,
    permisoQuitar: /^(?:entzieh(?:e)?|nimm)\s+(\w+)\s+(?:den\s+)?zugriff\s+auf\s+(\w+)$/,
    permisoList: /^(?:zugriffe|berechtigungen|wer hat zugriff)\??$/,
    facturaAdd: /^(?:(?:mach(?:e)?|erstelle?|neue)\s+)?(?:eine\s+)?(?:rechnung|qr[- ]?rechnung)\s*[:,-]?\s*(.+)$/,
    precios: /^(?:preise|preisanalyse|wie stehen die preise|preise rauf oder runter)(?:\s+(?:von\s+|vom\s+)?(casa reto|casa|hotel|a14))?\??$/,
    meteoCmd: /^(?:wetter|wie wird das wetter|wetterbericht|wettervorhersage)\??$/,
    zinsCmd: /^(?:referenzzinssatz|zinssatz|hypothekarischer referenzzinssatz)\??$/,
    huespedList: /^(?:gastnachrichten|nachrichten der gaste|was sagen die gaste)\??$/,
    huespedReply: /^antworte (?:dem |an |der )?(?:gast|buchung)\s+(\S+)\s*[:,-]\s*(.+)$/,
    // "spesen august abschliessen" · "schliesse die spesen von august ab"
    gastoCierre: /^(?:(?:spesen|auslagen)(?:\s+(?:von\s+|vom\s+)?(\w+))?\s+(?:abschliessen|exportieren)|schliess(?:e)?\s+die\s+(?:spesen|auslagen)(?:\s+(?:von|vom)\s+(\w+))?\s*(?:ab)?|monat(?:\s+(\w+))?\s+abschliessen)$/,
    hotel: /\b(hotel|anreise|anreisen|abreise|check[\s-]?in|gaste|zimmer|schmutzig|sauber|belegung)\b/,
    compraDone: /^(?:gekauft|schon gekauft|alles gekauft|erledigt einkauf)\s*(.*)$/,
  },

  pt: {
    create:
      /^(?:ei |ola |por favor |se faz favor )?(?:(?:cria(?:r)?|adiciona(?:r)?|acrescenta(?:r)?|anota(?:r)?|apontar?|poe|por|manda(?:r)?|atribui(?:r)?|diz)\b[\s:,-]*(?:uma |um |a |o )?(?:tarefa|trabalho|pendente|lembrete)?|(?:nova|novo) (?:tarefa|trabalho|pendente|lembrete))[\s:,-]*/,
    list:
      /\b(o que (?:tenho|ha|temos|tem \w+)|minhas tarefas|as minhas tarefas|tarefas (?:abertas|pendentes|de \w+|do \w+|da equipa|da equipe|de todos)|lista(?:me)?|pendentes|em aberto|resumo)\b/,
    done:
      /^(?:ja )?(?:feito|feita|concluida|concluido|terminada|terminado|acabei|pronto|pronta|fecha(?:r)?|marca(?:r)? como feita|completa(?:r)?)\b\s*(?:a |o )?(?:de |a de |tarefa |tarefa de )?(.+)?$/,
    help: /^(ajuda|help|ola|oi|bom dia|boa tarde|o que podes fazer|comandos)\b/,
    prioAlta: /\b(urgente|urgentemente|prioridade alta|importante|quanto antes|asap|ja)\b/,
    prioBaja: /\b(prioridade baixa|sem pressa|quando puderes|com calma)\b/,
    stripPrio: [
      [/\b(e )?(urgente|urgentemente|importante|quanto antes|asap)\b/g, ' '],
      [/\b(com )?prioridade (alta|baixa|media)\b/g, ' '],
    ],
    prep: '(?:para|ao|a)',
    sep: '(?::|,|-|que|de|para que)',
    ask: /^(?:preciso|quero|e preciso) que (?:o |a )?([a-z]+) (.+)$/,
    listWho: /\b(?:tarefas de|tarefas do|tarefas da|o que tem|pendentes de) ([a-z]+)/,
    team: /\b(todos|equipa|equipe|todas)\b/,
    me: /^(eu|mim|minhas|meu)$/i,
    teamWord: /^(equipa|equipe|todos|todas|all)$/i,
    createNoun: /^(?:poe|poem|passa|passar|muda|mudar|move|mover|marca|marcar|cria|criar|adiciona|anota)\s+(?:uma |um |a |o )?(?:tarefa|trabalho|pendente|lembrete)\b/,
    addComment: /^(?:comenta|comentar|nota\s+em|apontar\s+em)\s+(?:em\s+|n[ao]\s+)?(?:a |o )?(.+?)\s*[:,-]\s*(.+)$/,
    addStep: /^(?:adiciona|adicionar|acrescenta|acrescentar|junta)\s+(?:a|ao|em)\s+(?:a |o )?(.+?)\s*[:,-]\s*(.+)$/,
    setState: /^(?:poe|poem|passa|passar|muda|mudar|move|mover|marca|marcar)\s+(?:a |o )?(.+?)\s+(?:para|ao|em|no|na|como)\s+(.+)$/,
    setDue: /^(?:muda|mudar|poe|por|adia|adiar|antecipa)?\s*(?:o |a )?(?:prazo|data|entrega|vencimento)\s+(?:de\s+|da\s+|do\s+)?(?:a |o )?(.+?)\s+(?:para|a)\s+(.+)$/,
    reassign: /^(?:passa|passar|reatribui|reatribuir|atribui|atribuir|da|entrega)\s+(?:a |o )?(.+?)\s+(?:para|ao|a)\s+([a-z]+)$/,
    detail: /^(?:como (?:vai|esta)|detalhe(?:s)? de|informacao de|info de|estado de|mostra(?:me)?|ve)\s+(?:a |o )?(.+?)\??$/,
    listState: /^(?:que|quais|quantas)\s+(?:tarefas\s+)?(?:ha|temos|estao|esta)?\s*(?:em|no|na|com estado)\s+(.+?)\??$/,
    listDue: /^(?:que|quais|quantas)\s+(?:tarefas\s+)?(?:vence(?:m)?|expira(?:m)?|ha para|temos para)\s+(.+?)\??$/,
    basura: /\b(quando|que dia|proxima)\b.{0,20}\b(lixo|papel|cartao|vidro|metal|plastico|verdes?|entulho|reciclagem|contentor)\b/,
    compraAdd: /^(?:falta(?:m)?|acabou|precisamos de|precisamos|comprar|apontar na (?:compra|lista))\s*[:,-]?\s*(.+)$/,
    compraList: /^(?:o que (?:falta|precisamos)|lista de compras|compras)\b\??$/,
    citaAdd: /^(?:reuniao|encontro|visita|marcacao|agendar)\s*(?:com\s+)?(.*)$/,
    citaList: /^(?:que reunioes|minhas reunioes|proximas reunioes|agenda)\b\??$/,
    contactoBuscar: /^(?:(?:o\s+)?(?:telefone|numero|mail|email|contacto|dados)\s+(?:de|do|da)\s+|quem e\s+|procura(?:r)?\s+(?:contacto\s+)?)(.+?)\??$/,
    contactoAdd: /^(?:guarda(?:r)?|adiciona(?:r)?|novo)\s+(?:o\s+)?contacto\s*[:,-]?\s*(.+)$/,
    gastoAdd: /^(?:despesa|despesas|gasto|recibo|talao)\s*[:,-]?\s*(.+)$/,
    gastoList: /^(?:quanto me devem|as minhas despesas|saldo)\b\??$/,
    resumenSemanal: /^(?:resumo (?:semanal|da semana)|como vai a semana)\??$/,
    ausenciaList: /^(?:quem esta de ferias|ausencias|ferias)\b\??$/,
    ausenciaAdd: /^(\w+)\s+(?:esta\s+)?de\s+(ferias|baixa|licenca|folga)\s*(.*)$/,
    contadorAdd: /^(luz|eletricidade|agua|gas|aquecimento|contador)\s+([^\s:,-]+)\s*[:,-]?\s*(\d+(?:[.,]\d+)?)$/,
    contadorList: /^(?:leituras|contadores)(?:\s+(?:de\s+)?(?:a\s+|o\s+)?(\S+))?\??$/,
    contratoAdd: /^(?:(?:faz|cria(?:r)?|novo)\s+)?(?:um\s+|o\s+)?contrato\s+(?:para|de|a)\s+(.+)$/,
    vertragInfo: /^(?:contrato)\s+(?:de|do|da)\s*(?:o\s+|a\s+)?(?:quarto\s+)?([\w.\-]+)\??$/,
    mietenSum: /^(?:rendas)(?:\s+(?:de|do|da)\s+(\S+))?\??$/,
    impagos: /^(?:quem nao pagou|rendas em atraso|incumprimentos)\??$/,
    permisoDar: /^(?:da|dar)\s+(?:o\s+)?acesso\s+(?:ao?\s+|aos\s+|as\s+)?(\w+)\s+a\s+(\w+)$/,
    permisoQuitar: /^(?:tira|retira|tirar)\s+(?:o\s+)?acesso\s+(?:ao?\s+|aos\s+|as\s+)?(\w+)\s+a\s+(\w+)$/,
    permisoList: /^(?:acessos|permissoes|quem tem acesso)\??$/,
    facturaAdd: /^(?:(?:faz|cria(?:r)?|nova)\s+)?(?:uma\s+)?(?:fatura|factura)\s*[:,-]?\s*(.+)$/,
    precios: /^(?:precos|analise de precos|como estao os precos|subo ou baixo os precos)(?:\s+(?:de\s+|da\s+|do\s+)?(casa reto|casa|hotel|a14))?\??$/,
    meteoCmd: /^(?:tempo|que tempo (?:faz|fara|vai fazer)|meteo|previsao(?: do tempo)?)\??$/,
    zinsCmd: /^(?:referenzzinssatz|zinssatz|taxa de referencia)\??$/,
    huespedList: /^(?:mensagens dos hospedes|que dizem os hospedes)\??$/,
    huespedReply: /^responde (?:ao |a )?(?:hospede|reserva)\s+(\S+)\s*[:,-]\s*(.+)$/,
    // "fecha as despesas de agosto" · "exporta as despesas". Exige a palavra
    // despesas: "fecha" sozinho é concluir uma tarefa (verbo de done).
    gastoCierre: /^(?:fecha(?:r)?|exporta(?:r)?)\s+(?:o mes d(?:e|as)\s+)?(?:as\s+)?despesas(?:\s+de\s+(\w+))?$/,
    hotel: /\b(hotel|chegam|chegadas|saidas|check[\s-]?in|hospedes|quartos?|sujos?|limpos?|ocupacao)\b/,
    compraDone: /^(?:ja compr\w+|comprado|tudo comprado)\s*(.*)$/,
  },
}

function extractPriority(t, cfg) {
  if (cfg.prioAlta.test(t)) return 'high'
  if (cfg.prioBaja.test(t)) return 'low'
  return null
}

function stripPriority(t, cfg) {
  let out = t
  for (const [re, rep] of cfg.stripPrio) out = out.replace(re, rep)
  return out
}

/**
 * Interpretación por reglas en UN idioma concreto. Devuelve un "intent" con la
 * misma forma que devuelve Gemini, o { action: 'unknown' }.
 */
function parseInLang(text, ctx, lang) {
  const cfg = REGLAS[lang]
  const raw = String(text ?? '').trim()
  const t = normalize(raw)
  if (!t) return { action: 'unknown' }

  if (cfg.help.test(t) && t.split(' ').length <= 3) return { action: 'help' }

  // "¿cuándo sacan el papel?" — no tiene nada que ver con las tareas, así que
  // se resuelve pronto y no compite con ninguna otra regla.
  if (cfg.basura && cfg.basura.test(t)) {
    return { action: 'entsorgung', texto: t }
  }

  // Los precios ANTES que el hotel: "precios del hotel" lleva la palabra
  // "hotel" y la regla del hotel se lo quedaría.
  const precios = cfg.precios ? t.match(cfg.precios) : null
  if (precios) {
    const objetivo = precios[1] ?? null
    return { action: 'precios', objetivo: objetivo === 'a14' || objetivo === 'hotel' ? 'hotel' : objetivo ? 'casa' : null }
  }

  if (cfg.meteoCmd && cfg.meteoCmd.test(t)) return { action: 'meteo' }
  if (cfg.zinsCmd && cfg.zinsCmd.test(t)) return { action: 'zins' }

  // Mensajes de huéspedes. La respuesta necesita el texto TAL CUAL (va a un
  // huésped): se re-extrae del crudo, como en los contactos.
  if (cfg.huespedList && cfg.huespedList.test(t)) return { action: 'huesped_list' }
  const huesped = cfg.huespedReply ? t.match(cfg.huespedReply) : null
  if (huesped) {
    const enCrudo = raw.match(/\s(\S+)\s*[:,-]\s*([\s\S]+)$/)
    return {
      action: 'huesped_reply',
      bookingId: huesped[1],
      texto: (enCrudo?.[2] ?? huesped[2]).trim(),
    }
  }

  // Consultar un contrato existente va ANTES que crear uno: «contrato de la
  // 204» es una pregunta; «contrato para Max, habitación 204, 850» (con
  // comas y "para") es crear.
  const vertrag = cfg.vertragInfo ? t.match(cfg.vertragInfo) : null
  if (vertrag) return { action: 'vertrag_info', que: vertrag[1] }
  const mieten = cfg.mietenSum ? t.match(cfg.mietenSum) : null
  if (mieten) return { action: 'mieten_sum', grupo: mieten[1] ? mieten[1].toUpperCase() : null }
  if (cfg.impagos && cfg.impagos.test(t)) return { action: 'impagos' }
  if (cfg.mahnungCmd && cfg.mahnungCmd.test(t)) return { action: 'mahnung', texto: t }
  const mietertrag = cfg.mietertragCmd ? t.match(cfg.mietertragCmd) : null
  if (mietertrag) return { action: 'mietertrag', mes: mietertrag[1] ?? null }
  const mwst = cfg.mwstCmd ? t.match(cfg.mwstCmd) : null
  if (mwst) return { action: 'mwst', anno: mwst[1] ? Number(mwst[1]) : null, q: mwst[2] ? Number(mwst[2]) : null }

  // Gestión de accesos. El orden persona/permiso cambia según el idioma
  // («dale acceso al dinero a Jasmina» vs «gib Jasmina zugriff auf geld»):
  // el permiso se reconoce por su nombre y el otro grupo es la persona.
  if (cfg.permisoList && cfg.permisoList.test(t)) return { action: 'permiso_list' }
  for (const [regla, accion] of [[cfg.permisoDar, 'permiso_dar'], [cfg.permisoQuitar, 'permiso_quitar']]) {
    const m = regla ? t.match(regla) : null
    if (m) {
      const [a, b] = [m[1], m[2]]
      const permA = NOMBRES_PERMISO_RULES[a]
      const permB = NOMBRES_PERMISO_RULES[b]
      const perm = permA ?? permB ?? null
      const quien = permA ? b : a
      return { action: accion, perm, quien }
    }
  }

  // Facturas QR. Como el contrato, el nombre del deudor va en crudo.
  const factura = cfg.facturaAdd ? t.match(cfg.facturaAdd) : null
  if (factura) {
    const enCrudo = raw.match(/(?:factura|rechnung|fatura)\s*[:,-]?\s*(.+)$/i)
    return { action: 'factura_add', texto: (enCrudo?.[1] ?? factura[1]).trim() }
  }

  // Contratos ANTES que el hotel: "contrato para Max, habitación 204" lleva
  // la palabra "habitación" y el hotel se lo quedaría. Como en los contactos,
  // hace falta el texto TAL CUAL se escribió: normalizado destrozaría el
  // nombre del inquilino.
  const contrato = cfg.contratoAdd ? t.match(cfg.contratoAdd) : null
  if (contrato) {
    const enCrudo = raw.match(/contrato\s+(?:para|de|a)\s+(.+)$|vertrag\s+(?:fur|für|an)\s+(.+)$/i)
    return { action: 'contrato_add', texto: (enCrudo?.[1] ?? enCrudo?.[2] ?? contrato[1]).trim() }
  }

  // La compra de la oficina. Va aquí arriba, con la basura: tampoco tiene
  // nada que ver con las tareas y así no compite con "crea una tarea".
  // El hotel: llegadas, salidas, habitaciones sucias. Va antes que las
  // tareas porque "cuartos" y "habitación" no son palabras de tarea.
  if (cfg.hotel && cfg.hotel.test(t)) return { action: 'hotel', texto: t }

  // El resumen semanal va antes que las listas: "resumen" a secas es listar.
  if (cfg.resumenSemanal && cfg.resumenSemanal.test(t)) return { action: 'resumen_semanal' }

  // Ausencias. La lista va primero: "wer ist im urlaub" encaja también en el
  // alta (leería "wer" como si fuera el nombre de una persona).
  if (cfg.ausenciaList && cfg.ausenciaList.test(t)) return { action: 'ausencia_list' }
  const ausencia = cfg.ausenciaAdd ? t.match(cfg.ausenciaAdd) : null
  if (ausencia) {
    return {
      action: 'ausencia_add',
      quien: ausencia[1], motivo: ausencia[2], texto: (ausencia[3] ?? '').trim(),
    }
  }

  // Lecturas de contadores: "luz 204: 4521".
  const lectura = cfg.contadorAdd ? t.match(cfg.contadorAdd) : null
  if (lectura) {
    return {
      action: 'contador_add',
      tipo: lectura[1], unidad: lectura[2].toUpperCase(),
      valor: Number(lectura[3].replace(',', '.')),
    }
  }
  const lecturas = cfg.contadorList ? t.match(cfg.contadorList) : null
  if (lecturas) return { action: 'contador_list', unidad: lecturas[1] ? lecturas[1].toUpperCase() : null }

  // El cierre de mes va ANTES que apuntar un gasto: en alemán "spesen august
  // abschliessen" empieza igual que "spesen 45.20 Migros" y se lo comería.
  if (cfg.gastoCierre && cfg.gastoCierre.test(t)) return { action: 'gasto_cierre', texto: t }
  if (cfg.gastoList && cfg.gastoList.test(t)) return { action: 'gasto_list' }
  const gastoNuevo = cfg.gastoAdd ? t.match(cfg.gastoAdd) : null
  if (gastoNuevo) {
    const resto = gastoNuevo[1].trim()
    // Un gasto necesita IMPORTE. Sin él no hay nada que apuntar.
    const imp = resto.match(/(\d{1,5})[.,](\d{2})\b/) ?? resto.match(/\b(\d{1,5})\b(?!\s*[:.h]\d)/)
    return {
      action: 'gasto_add',
      texto: restoreCase(resto, raw),
      importe: imp ? Number(`${imp[1]}.${imp[2] ?? '00'}`) : null,
    }
  }

  const contactoNuevo = cfg.contactoAdd ? t.match(cfg.contactoAdd) : null
  if (contactoNuevo) {
    // Aquí hace falta el texto TAL CUAL se escribió: restoreCase sirve para
    // títulos de tarea, pero a un contacto le rompe el nombre ("Serge gerber"),
    // se come las diéresis y capitaliza el correo, que deja de ser válido.
    const enCrudo = raw.match(/(?:contacto|kontakt|kontakte)\s*[:,-]?\s*(.+)$/i)
    const texto = (enCrudo ? enCrudo[1] : contactoNuevo[1]).trim()
    return { action: 'contacto_add', texto }
  }
  const contactoBusca = cfg.contactoBuscar ? t.match(cfg.contactoBuscar) : null
  if (contactoBusca) return { action: 'contacto_buscar', que: contactoBusca[1].trim() }

  if (cfg.citaList && cfg.citaList.test(t)) return { action: 'cita_list' }
  const citaNueva = cfg.citaAdd ? t.match(cfg.citaAdd) : null
  if (citaNueva) {
    const resto = citaNueva[1].trim()
    // Una cita necesita HORA; si no la lleva, no es una cita sino otra cosa
    // (y así "cita" suelto no se traga la frase).
    const hora = resto.match(/\b(?:a las|um|as|@)?\s*(\d{1,2})[:.h](\d{2})?\b/)
    // Sin hora sigue siendo una cita: se pregunta la hora en vez de
    // responder "no te he entendido", que no ayuda a nadie.
    if (resto) {
      return {
        action: 'cita_add',
        texto: restoreCase(resto, raw),
        hora: hora ? `${String(hora[1]).padStart(2, '0')}:${hora[2] ?? '00'}` : null,
      }
    }
  }
  if (cfg.compraList && cfg.compraList.test(t)) return { action: 'compra_list' }
  const compraHecha = cfg.compraDone ? t.match(cfg.compraDone) : null
  if (compraHecha) {
    return { action: 'compra_done', que: limpiaArticulos(restoreCase((compraHecha[1] ?? '').trim(), raw)) }
  }
  const compraNueva = cfg.compraAdd ? t.match(cfg.compraAdd) : null
  if (compraNueva) {
    // El texto viene normalizado (sin tildes y en minúsculas). Para la lista
    // hay que devolverle su forma original: nadie quiere leer "cafe".
    const que = limpiaArticulos(restoreCase(compraNueva[1].trim(), raw))
    // "falta pintar la ventana" es una tarea, no la compra. Si la frase
    // parece una acción, se deja pasar a las reglas de tareas.
    const pareceTarea = /^(?:que |de )?(?:hacer|pintar|revisar|llamar|mandar|enviar|arreglar|limpiar|montar|terminar)\b/i.test(que)
    if (que && !pareceTarea) return { action: 'compra_add', que }
  }

  // Respuesta corta a un recordatorio ("sí", "no", "ja", "sim", "erledigt")
  if (t.split(' ').length <= 2) {
    const r = interpretReply(raw)
    if (r === 'done') return { action: 'reply_done' }
    if (r === 'not_done') return { action: 'reply_not_done' }
  }

  // "comenta en la caldera: falta el diferencial" → un COMENTARIO.
  // Va antes de los pasos porque comparten verbos ("anota en"), y exige que
  // la pista señale una tarea que ya existe.
  const com = cfg.addComment ? t.match(cfg.addComment) : null
  if (com && !cfg.createNoun.test(t)) {
    const pista = com[1].trim()
    const texto = com[2].trim()
    const donde = ctx.allOpenTasks ?? ctx.openTasks ?? []
    if (pista && texto && pickTaskByHint(pista, donde, ctx.aliases)) {
      return { action: 'add_comment', task_hint: pista, comment: texto }
    }
  }

  // "añade a la caldera: cambiar el diferencial" → un PASO dentro de la tarea.
  //
  // ⚠️ Mismo cuidado que con los estados: "añade" también sirve para crear una
  // tarea. Solo cuenta como paso si la pista señala una tarea que ya existe y
  // la frase no lleva el sustantivo "tarea".
  const paso = cfg.addStep ? t.match(cfg.addStep) : null
  if (paso && !cfg.createNoun.test(t)) {
    const pista = paso[1].trim()
    const texto = paso[2].trim()
    const dondeBuscar = ctx.allOpenTasks ?? ctx.openTasks ?? []
    if (pista && texto && pickTaskByHint(pista, dondeBuscar, ctx.aliases)) {
      return { action: 'add_step', task_hint: pista, step: texto }
    }
  }

  // "pon la caldera en esperando material".
  //
  // ⚠️ Va ANTES de crear porque comparten verbo ("pon"), pero solo cuenta si
  // la cola de la frase es un estado QUE EXISTE. Sin esa condición, "pon una
  // tarea a Isma: revisar la caldera" se interpretaría como un cambio de
  // estado, y con ella la decisión es determinista y no hay solapamiento.
  const est = cfg.setState ? t.match(cfg.setState) : null
  // Si la frase menciona el plazo, es un cambio de plazo y se resuelve más
  // abajo: esa regla es más específica y tiene preferencia.
  if (est && !cfg.createNoun.test(t) && !(cfg.setDue && cfg.setDue.test(t))) {
    const pista = est[1].trim()
    const pedido = est[2].trim()
    const estados = Array.isArray(ctx.states) ? ctx.states : []
    const m = matchStateByName(estados, pedido)
    // Cuenta como cambio de estado si el estado existe, O si la pista señala
    // una tarea que ya existe. En el segundo caso el estado no existirá y se
    // responderá "no tengo ese estado", que es lo útil: quien escribe "pon la
    // caldera en pendiente de pintura" no está creando una tarea llamada
    // "caldera en pendiente de pintura".
    const candidatasTareas = ctx.allOpenTasks ?? ctx.openTasks ?? []
    const señalaTarea = pista ? Boolean(pickTaskByHint(pista, candidatasTareas, ctx.aliases)) : false
    if (pista && (m.state || m.candidates.length > 0 || señalaTarea)) {
      return { action: 'set_state', task_hint: pista, state: pedido }
    }
  }

  // ---- Retoques sobre una tarea que YA existe -------------------------
  //
  // Todas estas reglas comparten verbos con "crear" ("pon", "pasa", "cambia",
  // "asigna"), así que ninguna decide por sí sola: TODAS exigen que la pista
  // señale una tarea existente. Sin esa condición, "asigna una tarea a Rayna:
  // pintar" se leería como una reasignación. Con ella la decisión es
  // determinista y no hay solapamiento — la misma lección que con los estados.
  const tareasVivas = ctx.allOpenTasks ?? ctx.openTasks ?? []
  const señala = (pista) => Boolean(pista && pickTaskByHint(pista, tareasVivas, ctx.aliases))

  // "cambia el plazo de la caldera al viernes"
  const plazo = cfg.setDue ? t.match(cfg.setDue) : null
  if (plazo && !cfg.createNoun.test(t)) {
    const pista = plazo[1].trim()
    const cuando = plazo[2].trim()
    if (señala(pista) && cuando) {
      return { action: 'set_due', task_hint: pista, due: cuando }
    }
  }

  // "pásale la caldera a Rayna"
  const reasig = cfg.reassign ? t.match(cfg.reassign) : null
  if (reasig && !cfg.createNoun.test(t)) {
    const pista = reasig[1].trim()
    const quien = reasig[2].trim()
    // Doble condición: la tarea existe Y el destinatario es alguien conocido.
    if (señala(pista) && quien) {
      return { action: 'reassign', task_hint: pista, assignee: quien }
    }
  }

  // "¿cómo va la caldera?"
  const det = cfg.detail ? t.match(cfg.detail) : null
  if (det && !cfg.createNoun.test(t)) {
    const pista = det[1].trim()
    if (señala(pista)) return { action: 'task_detail', task_hint: pista }
  }

  // "¿qué hay en esperando material?"
  const porEstado = cfg.listState ? t.match(cfg.listState) : null
  if (porEstado) {
    const pedido = porEstado[1].trim()
    const estados = Array.isArray(ctx.states) ? ctx.states : []
    const m = matchStateByName(estados, pedido)
    if (m.state) return { action: 'list_by_state', state: pedido }
  }

  // "¿qué vence esta semana?"
  const porFecha = cfg.listDue ? t.match(cfg.listDue) : null
  if (porFecha) {
    const cuando = porFecha[1].trim()
    if (cuando) return { action: 'list_due', due: cuando }
  }

  if (cfg.create.test(t)) {
    let rest = t.replace(cfg.create, '')
    const priority = extractPriority(rest, cfg)
    rest = stripPriority(rest, cfg)
    // Primero el PLAZO ("del lunes al jueves"); si no hay, una sola fecha.
    const rango = parseRange(rest, ctx.today, lang)
    let inicio = null
    let due = null
    if (rango) {
      inicio = rango.start
      due = { key: rango.end }
      for (const m of rango.matches) rest = rest.replace(m, ' ')
    } else {
      due = parseDateAnyLang(rest, ctx.today, lang)
      if (due) rest = rest.replace(due.match, ' ')
    }
    // Y después la duración ("3 días de trabajo"), que es otra cosa distinta.
    const trabajo = parseWorkDays(rest)
    if (trabajo) rest = rest.replace(trabajo.match, ' ')
    let assignee = null
    const sepRe = new RegExp(`^${cfg.prep} ([a-z]+(?: [a-z]+)?)\\s*${cfg.sep}?\\s*`)
    const m = rest.match(sepRe)
    if (m) {
      // prueba con dos palabras y con una (por si el nombre es "ana maria")
      const two = m[1]; const one = two.split(' ')[0]
      const tryTwo = matchUser(two, ctx.users, ctx.sender, ctx.aliases)
      const tryOne = matchUser(one, ctx.users, ctx.sender, ctx.aliases)
      if (tryTwo.user) { assignee = two; rest = rest.slice(m[0].length) }
      else {
        assignee = one
        rest = rest.slice(rest.indexOf(one) + one.length)
          .replace(new RegExp(`^\\s*${cfg.sep}?\\s*`), '')
      }
    } else {
      const endRe = new RegExp(`\\b${cfg.prep} ([a-z]+)\\s*$`)
      const end = rest.match(endRe)
      if (end) {
        const r = matchUser(end[1], ctx.users, ctx.sender, ctx.aliases)
        if (r.user) { assignee = end[1]; rest = rest.slice(0, end.index) }
      }
    }
    const title = restoreCase(cleanTitle(rest, lang), raw)
    return {
      action: 'create_task',
      title,
      assignee,
      due: due?.key ?? null,
      start: inicio,
      work_days: trabajo?.days ?? null,
      priority,
      description: null,
    }
  }

  const done = t.match(cfg.done)
  if (done && !/^(no|nein|nao)\b/.test(t)) {
    // Recorta artículos y preposiciones de los tres idiomas al principio de
    // la pista ("la de la caldera", "die von der Heizung", "a da caldeira").
    const hint = (done[1] ?? '')
      .replace(/^(la |el |lo |de |del |tarea |die |der |das |den |von |vom |aufgabe |a |o |da |do |das |dos |tarefa )+/, '')
      .trim()
    if (!hint) return { action: 'reply_done' }
    return { action: 'complete_task', task_hint: hint }
  }

  if (cfg.list.test(t)) {
    if (cfg.team.test(t)) return { action: 'list_tasks', who: 'equipo' }
    const who = t.match(cfg.listWho)
    return { action: 'list_tasks', who: who ? who[1] : null }
  }

  // Frase que pide algo a alguien sin decir "tarea":
  // "necesito que Luis mire la caldera mañana" / "kannst du Luis die Heizung prüfen"
  const ask = t.match(cfg.ask)
  if (ask) {
    const r = matchUser(ask[1], ctx.users, ctx.sender, ctx.aliases)
    if (r.user) {
      let rest = ask[2]
      const priority = extractPriority(rest, cfg); rest = stripPriority(rest, cfg)
      const rango2 = parseRange(rest, ctx.today, lang)
      let inicio2 = null
      let due2 = null
      if (rango2) {
        inicio2 = rango2.start
        due2 = { key: rango2.end }
        for (const m of rango2.matches) rest = rest.replace(m, ' ')
      } else {
        due2 = parseDateAnyLang(rest, ctx.today, lang)
        if (due2) rest = rest.replace(due2.match, ' ')
      }
      const trabajo2 = parseWorkDays(rest)
      if (trabajo2) rest = rest.replace(trabajo2.match, ' ')
      return {
        action: 'create_task',
        title: restoreCase(cleanTitle(rest, lang), raw),
        assignee: ask[1],
        due: due2?.key ?? null,
        start: inicio2,
        work_days: trabajo2?.days ?? null,
        priority,
        description: null,
      }
    }
  }
  return { action: 'unknown' }
}

/**
 * Interpretación por reglas. Prueba el idioma de quien escribe y, si no
 * entiende nada, los otros dos.
 */
export function parseWithRules(text, ctx) {
  const preferido = REGLAS[ctx.lang] ? ctx.lang : 'es'
  const orden = [preferido, ...Object.keys(REGLAS).filter((l) => l !== preferido)]
  for (const lang of orden) {
    const intent = parseInLang(text, ctx, lang)
    if (intent.action !== 'unknown') return { ...intent, lang }
  }
  return { action: 'unknown' }
}

// "que me haga un detail" → "hacer un detail": pasa el verbo a infinitivo.
const INFINITIVE = {
  haga: 'hacer', hagas: 'hacer', mire: 'mirar', mires: 'mirar', busque: 'buscar', busques: 'buscar',
  prepare: 'preparar', prepares: 'preparar', envie: 'enviar', envies: 'enviar', llame: 'llamar',
  llames: 'llamar', revise: 'revisar', revises: 'revisar', compre: 'comprar', compres: 'comprar',
  pida: 'pedir', pidas: 'pedir', traiga: 'traer', traigas: 'traer', lleve: 'llevar', lleves: 'llevar',
  arregle: 'arreglar', arregles: 'arreglar', limpie: 'limpiar', limpies: 'limpiar', monte: 'montar',
  montes: 'montar', instale: 'instalar', instales: 'instalar', mida: 'medir', midas: 'medir',
  pinte: 'pintar', pintes: 'pintar', corte: 'cortar', cortes: 'cortar', pase: 'pasar', pases: 'pasar',
  mande: 'mandar', mandes: 'mandar', escriba: 'escribir', escribas: 'escribir', cambie: 'cambiar',
  cambies: 'cambiar', termine: 'terminar', termines: 'terminar', acabe: 'acabar', acabes: 'acabar',
  vaya: 'ir', vayas: 'ir', venga: 'venir', vengas: 'venir', hable: 'hablar', hables: 'hablar',
  recoja: 'recoger', recojas: 'recoger', entregue: 'entregar', entregues: 'entregar',
  organice: 'organizar', organices: 'organizar', calcule: 'calcular', calcules: 'calcular',
  dibuje: 'dibujar', dibujes: 'dibujar', imprima: 'imprimir', imprimas: 'imprimir',
}

// Limpieza del título por idioma: quita muletillas del principio y
// preposiciones sueltas al final. Solo el español pasa el verbo a infinitivo
// (INFINITIVE); en alemán y portugués basta con la limpieza.
const LIMPIEZA = {
  es: {
    inicio: [/^(?:que |de que |para que )+/, /^(?:necesito|quiero|hace falta|tiene|tienes|hay) que (?:me |le |nos |te )?/, /^(?:me |le |nos |te )+/],
    final: /\s+(?:para|antes de|hasta|el|la|en|de|a|por|con)\s*$/,
  },
  de: {
    inicio: [/^(?:dass |soll |zu )+/, /^(?:ich brauche|kannst du|bitte) /, /^(?:mir |ihm |uns |dir )+/],
    final: /\s+(?:bis|am|der|die|das|in|von|zu|fur|mit)\s*$/,
  },
  pt: {
    inicio: [/^(?:que |de que |para que )+/, /^(?:preciso|quero|e preciso) que (?:me |lhe |nos |te )?/, /^(?:me |lhe |nos |te )+/],
    final: /\s+(?:para|antes de|ate|o|a|em|de|por|com)\s*$/,
  },
}

function cleanTitle(s, lang = 'es') {
  const cfg = LIMPIEZA[lang] ?? LIMPIEZA.es
  let t = String(s ?? '').replace(/^[\s,;:.-]+/, '')
  for (const re of cfg.inicio) t = t.replace(re, '')
  t = t
    .replace(cfg.final, '')
    .replace(/[\s,;:.-]+$/, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (lang === 'es') {
    const words = t.split(' ')
    if (words[0] && INFINITIVE[words[0]]) words[0] = INFINITIVE[words[0]]
    t = words.join(' ')
  }
  return t
}

/**
 * Devuelve el título con las mayúsculas y acentos del mensaje original
 * (el análisis se hace sobre texto normalizado). Palabras nuevas (p. ej. el
 * infinitivo) se dejan tal cual.
 */
/** Quita el artículo del principio: "el café" y "café" son lo mismo. */
function limpiaArticulos(s) {
  return String(s ?? '').replace(/^(?:el|la|los|las|un|una|unos|unas|o|a|os|as|der|die|das|den|dem)\s+/i, '').trim()
}

function restoreCase(title, raw) {
  if (!title) return ''
  const rawWords = String(raw).split(/\s+/)
  const rawNorm = rawWords.map((w) => normalize(w).replace(/[^a-z0-9ñ/.-]/g, ''))
  let cursor = 0
  const out = title.split(' ').map((w) => {
    for (let i = cursor; i < rawWords.length; i++) {
      if (rawNorm[i] === w) {
        cursor = i + 1
        return rawWords[i].replace(/^[¡¿"“«(]+|[!?.,;:"”»)]+$/g, '')
      }
    }
    return w
  })
  let t = out.join(' ').trim()
  return t.charAt(0).toUpperCase() + t.slice(1)
}

// ─── Gemini (IA): la secretaria ───────────────────────────────
// Las reglas van ANTES (instantáneas, gratis, sin mandar datos fuera).
// Gemini entra solo cuando no entienden — y entonces actúa de secretaria:
// conoce el dossier de la empresa (src/empresa.js) y puede CONTESTAR
// preguntas libres con la acción "answer", además de mapear a las acciones
// clásicas. ⚠️ Las acciones especializadas (gastos, compra, citas...) las
// siguen llevando las reglas; aquí solo las clásicas + answer.
function buildPrompt(text, ctx) {
  const names = ctx.users.map((u) => u.full_name).filter(Boolean).join(', ')
  const wd = WEEKDAY_NAMES[weekdayOf(ctx.today)]
  const mine = (ctx.openTasks ?? []).map((t) => `- ${t.title}`).join('\n') || '- (ninguna)'
  const lang = ctx.lang ?? 'es'
  return `Eres la secretaria de Hans Amonn AG. Un miembro del equipo te escribe por WhatsApp. Convierte su mensaje en UNA acción en JSON. Responde SOLO con el JSON, sin texto alrededor.

LO QUE SABES DE LA EMPRESA:
${DOSSIER}

Hoy es ${wd} ${ctx.today} (zona Europe/Madrid).
Quien escribe: ${ctx.sender.full_name} (idioma: ${lang}).
Personas del equipo: ${names}.
Tareas abiertas de quien escribe:
${mine}

Acciones posibles (campo "action"):
- "create_task": crear una tarea. Campos: "title" (breve, imperativo, sin el nombre de la persona ni la fecha), "assignee" (nombre de la persona tal como aparece en el equipo, o "yo" si es para quien escribe, o null si no dice), "due" (fecha YYYY-MM-DD o null; interpreta "el viernes" como el próximo viernes, "mañana", "en 3 días", "5/9"...), "priority" ("high" si dice urgente/importante, "low" si dice sin prisa, si no null), "description" (detalles extra o null).
- "list_tasks": quiere ver tareas abiertas. Campo "who": null (las suyas), "equipo" (todas) o el nombre de una persona.
- "complete_task": dice que una tarea concreta está hecha. Campo "task_hint": palabras clave de la tarea.
- "reply_done" / "reply_not_done": responde solo sí/no/hecho a una pregunta de si terminó una tarea.
- "help": saluda o pregunta qué puedes hacer.
- "answer": es una PREGUNTA o conversación que puedes responder con lo que sabes de la empresa. Campo "text": la respuesta, en el idioma de quien escribe (${lang}), corta y práctica como un WhatsApp (máximo ~6 líneas). Si algo no está conectado o no lo sabes, dilo claramente en vez de inventar.
- "unknown": no encaja en nada y tampoco sabes responder.

Mensaje: """${text}"""`
}

async function parseWithGemini(text, ctx) {
  const { apiKey, model } = config.gemini
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15_000)
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: buildPrompt(text, ctx) }] }],
        generationConfig: { temperature: 0, responseMimeType: 'application/json' },
      }),
    })
    if (!res.ok) throw new Error(`Gemini respondió ${res.status}: ${(await res.text()).slice(0, 200)}`)
    const data = await res.json()
    const out = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') ?? ''
    const json = out.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
    const intent = JSON.parse(json)
    if (!intent || typeof intent.action !== 'string') throw new Error('respuesta sin action')
    return intent
  } finally {
    clearTimeout(timer)
  }
}

/** Interpreta el mensaje: Gemini si está configurado, reglas si no (o si falla). */
export async function interpret(text, ctx) {
  ctx.today = ctx.today ?? todayKey()

  // PRIMERO las reglas. Son instantáneas, no cuestan nada, no mandan a nadie
  // los nombres de los clientes, y son las únicas que conocen todo lo que se
  // ha ido añadiendo: gastos, compra, residuos, contactos, citas, hotel...
  const intent = parseWithRules(text, ctx)
  if (intent.action !== 'unknown') {
    console.log(`[asistente] reglas → ${JSON.stringify(intent)}`)
    return { ...intent, via: 'reglas' }
  }

  // Solo cuando las reglas NO entienden se pregunta a Gemini. Así se paga
  // por lo raro, no por lo de todos los días, y una caída de Google no deja
  // el asistente mudo.
  if (config.gemini.apiKey) {
    try {
      const deIa = await parseWithGemini(text, ctx)
      console.log(`[asistente] no lo entendí por reglas; gemini → ${JSON.stringify(deIa)}`)
      return { ...deIa, via: 'gemini' }
    } catch (err) {
      console.error('[asistente] Gemini falló:', err.message)
    }
  }

  console.log('[asistente] reglas → {"action":"unknown"}')
  return { ...intent, via: 'reglas' }
}

/** Elige la tarea que mejor encaja con unas palabras clave. */
export function pickTaskByHint(hint, tasks, aliases = []) {
  // Si el equipo enseñó qué significa esa frase ("la caldera"), se buscan
  // TAMBIÉN sus palabras clave, no solo las que se escribieron.
  const extra = resolveTask(aliases, hint)
  const texto = extra ? `${hint} ${extra}` : hint
  const IGNORAR = ['tarea', 'del', 'los', 'las', 'con', 'para', 'que', 'die', 'der', 'das', 'von', 'aufgabe', 'tarefa', 'dos', 'das']
  const words = normalize(texto).split(' ').filter((w) => w.length >= 3 && !IGNORAR.includes(w))
  if (words.length === 0 || tasks.length === 0) return null
  let best = null
  for (const t of tasks) {
    const title = normalize(`${t.title} ${t.description ?? ''}`)
    const hits = words.filter((w) => title.includes(w)).length
    if (hits > 0 && (!best || hits > best.hits)) best = { task: t, hits }
  }
  return best?.task ?? null
}
