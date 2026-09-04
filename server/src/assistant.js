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

// ─── Gemini (IA) ──────────────────────────────────────────────
function buildPrompt(text, ctx) {
  const names = ctx.users.map((u) => u.full_name).filter(Boolean).join(', ')
  const wd = WEEKDAY_NAMES[weekdayOf(ctx.today)]
  const mine = (ctx.openTasks ?? []).map((t) => `- ${t.title}`).join('\n') || '- (ninguna)'
  return `Eres el asistente de "Amonn", una app de tareas de una empresa pequeña. Un miembro del equipo te escribe por WhatsApp. Convierte su mensaje en UNA acción en JSON. Responde SOLO con el JSON, sin texto alrededor.

Hoy es ${wd} ${ctx.today} (zona Europe/Madrid).
Quien escribe: ${ctx.sender.full_name}.
Personas del equipo: ${names}.
Tareas abiertas de quien escribe:
${mine}

Acciones posibles (campo "action"):
- "create_task": crear una tarea. Campos: "title" (breve, imperativo, sin el nombre de la persona ni la fecha), "assignee" (nombre de la persona tal como aparece en el equipo, o "yo" si es para quien escribe, o null si no dice), "due" (fecha YYYY-MM-DD o null; interpreta "el viernes" como el próximo viernes, "mañana", "en 3 días", "5/9"...), "priority" ("high" si dice urgente/importante, "low" si dice sin prisa, si no null), "description" (detalles extra o null).
- "list_tasks": quiere ver tareas abiertas. Campo "who": null (las suyas), "equipo" (todas) o el nombre de una persona.
- "complete_task": dice que una tarea concreta está hecha. Campo "task_hint": palabras clave de la tarea.
- "reply_done" / "reply_not_done": responde solo sí/no/hecho a una pregunta de si terminó una tarea.
- "help": saluda o pregunta qué puedes hacer.
- "unknown": no encaja en nada.

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
  if (config.gemini.apiKey) {
    try {
      const intent = await parseWithGemini(text, ctx)
      console.log(`[asistente] gemini → ${JSON.stringify(intent)}`)
      return { ...intent, via: 'gemini' }
    } catch (err) {
      console.error('[asistente] Gemini falló, uso reglas:', err.message)
    }
  }
  const intent = parseWithRules(text, ctx)
  console.log(`[asistente] reglas → ${JSON.stringify(intent)}`)
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
