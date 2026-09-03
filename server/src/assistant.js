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
import { normalize, parseSpanishDate, todayKey, weekdayOf } from './dates.js'
import { interpretReply } from './whatsapp.js'

const WEEKDAY_NAMES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']

// ─── Personas: buscar por nombre ──────────────────────────────
/**
 * Encuentra a una persona del equipo por cómo la nombran ("cristian",
 * "Cristian Amaya", "cris"). Devuelve { user } o { candidates } si hay dudas.
 */
export function matchUser(nameText, users, sender) {
  const q = normalize(nameText).replace(/[.,;:]/g, '').trim()
  if (!q) return { user: null, candidates: [] }
  if (/^(mi|me|yo|a mi|para mi|mio)$/.test(q)) return { user: sender, candidates: [] }
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

// ─── Reglas (sin IA) ──────────────────────────────────────────
const CREATE_RE =
  /^(?:oye |hola |por favor |porfa )?(?:(?:crea(?:r|me)?|anade|anadir|agrega|agregar|anota|anotar|apunta|apuntar|pon(?:me)?|poner|manda|mandar|asigna(?:le)?|asignar|dile|di)\b[\s:,-]*(?:una |un |la |el )?(?:tarea|trabajo|pendiente|recordatorio)?|(?:nueva|nuevo) (?:tarea|trabajo|pendiente|recordatorio))[\s:,-]*/
const LIST_RE =
  /\b(que (?:tengo|hay|tenemos|tiene \w+)|mis tareas|tareas (?:abiertas|pendientes|de \w+|del equipo|de todos)|lista(?:me)?|pendientes|abiertas|resumen)\b/
const DONE_RE =
  /^(?:ya )?(?:hecha|hecho|terminada|terminado|terminé|termine|acabé|acabe|completada|completado|lista|listo|cierra|cerrar|marca(?:r)? como hecha|marca(?:r)? como completada|completa(?:r)?)\b\s*(?:la |el |lo )?(?:de |la de |tarea |tarea de )?(.+)?$/
const HELP_RE = /^(ayuda|help|hola|buenas|buenos dias|buenas tardes|que puedes hacer|comandos)\b/

function extractPriority(t) {
  if (/\b(urgente|urgentemente|prioridad alta|importante|cuanto antes|asap)\b/.test(t)) return 'high'
  if (/\b(prioridad baja|sin prisa|cuando puedas|tranqui)\b/.test(t)) return 'low'
  return null
}

function stripPriority(t) {
  return t
    .replace(/\b(es )?(urgente|urgentemente|importante|cuanto antes|asap)\b/g, ' ')
    .replace(/\b(con )?prioridad (alta|baja|media)\b/g, ' ')
}

/** Interpretación por reglas. Devuelve un "intent" con la misma forma que Gemini. */
export function parseWithRules(text, ctx) {
  const raw = String(text ?? '').trim()
  const t = normalize(raw)
  if (!t) return { action: 'unknown' }

  if (HELP_RE.test(t) && t.split(' ').length <= 3) return { action: 'help' }

  // Respuesta corta a un recordatorio ("sí", "no", "hecho")
  if (t.split(' ').length <= 2) {
    const r = interpretReply(raw)
    if (r === 'done') return { action: 'reply_done' }
    if (r === 'not_done') return { action: 'reply_not_done' }
  }

  if (CREATE_RE.test(t)) {
    let rest = t.replace(CREATE_RE, '')
    const priority = extractPriority(rest)
    rest = stripPriority(rest)
    const due = parseSpanishDate(rest, ctx.today)
    if (due) rest = rest.replace(due.match, ' ')
    // "a Cristian: ..." / "para Cristian que ..." / "a Cristian de ..."
    let assignee = null
    const m = rest.match(/^(?:a|para) ([a-z]+(?: [a-z]+)?)\s*(?::|,|-|que|de|para que)?\s*/)
    if (m) {
      // prueba con dos palabras y con una (por si el nombre es "ana maria")
      const two = m[1]; const one = two.split(' ')[0]
      const tryTwo = matchUser(two, ctx.users, ctx.sender)
      const tryOne = matchUser(one, ctx.users, ctx.sender)
      if (tryTwo.user) { assignee = two; rest = rest.slice(m[0].length) }
      else if (tryOne.user || one === 'mi') {
        assignee = one
        rest = rest.slice(rest.indexOf(one) + one.length).replace(/^\s*(?::|,|-|que|de|para que)?\s*/, '')
      } else { assignee = one; rest = rest.slice(rest.indexOf(one) + one.length).replace(/^\s*(?::|,|-|que|de)?\s*/, '') }
    } else {
      // "... a Cristian" al final
      const end = rest.match(/\b(?:a|para) ([a-z]+)\s*$/)
      if (end) {
        const r = matchUser(end[1], ctx.users, ctx.sender)
        if (r.user || end[1] === 'mi') { assignee = end[1]; rest = rest.slice(0, end.index) }
      }
    }
    const title = restoreCase(cleanTitle(rest), raw)
    return { action: 'create_task', title, assignee, due: due?.key ?? null, priority, description: null }
  }

  const done = t.match(DONE_RE)
  if (done && !/\bno\b/.test(t.split(' ')[0])) {
    const hint = (done[1] ?? '').replace(/^(la |el |de |tarea )+/, '').trim()
    if (!hint) return { action: 'reply_done' }
    return { action: 'complete_task', task_hint: hint }
  }

  if (LIST_RE.test(t)) {
    const who = t.match(/\b(?:tareas de|que tiene|pendientes de|abiertas de) ([a-z]+)/)
    if (/\b(todos|equipo|todas|de todos)\b/.test(t)) return { action: 'list_tasks', who: 'equipo' }
    return { action: 'list_tasks', who: who ? who[1] : null }
  }

  // Frase que pide algo a alguien sin decir "tarea": "necesito que Luis mire la caldera mañana"
  const ask = t.match(/^(?:necesito|quiero|hay) que ([a-z]+) (.+)$/)
  if (ask) {
    const r = matchUser(ask[1], ctx.users, ctx.sender)
    if (r.user) {
      let rest = ask[2]
      const priority = extractPriority(rest); rest = stripPriority(rest)
      const due = parseSpanishDate(rest, ctx.today)
      if (due) rest = rest.replace(due.match, ' ')
      return { action: 'create_task', title: restoreCase(cleanTitle(rest), raw), assignee: ask[1], due: due?.key ?? null, priority, description: null }
    }
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

function cleanTitle(s) {
  let t = String(s ?? '')
    .replace(/^[\s,;:.-]+/, '')
    .replace(/^(?:que |de que |para que )+/, '')
    .replace(/^(?:necesito|quiero|hace falta|tiene|tienes|hay) que (?:me |le |nos |te )?/, '')
    .replace(/^(?:me |le |nos |te )+/, '')
    .replace(/\s+(?:para|antes de|hasta|el|la|en|de|a|por|con)\s*$/, '')
    .replace(/[\s,;:.-]+$/, '')
    .replace(/\s+/g, ' ')
    .trim()
  const words = t.split(' ')
  if (words[0] && INFINITIVE[words[0]]) words[0] = INFINITIVE[words[0]]
  t = words.join(' ')
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
export function pickTaskByHint(hint, tasks) {
  const words = normalize(hint).split(' ').filter((w) => w.length >= 3 && !['tarea', 'del', 'los', 'las', 'con', 'para', 'que'].includes(w))
  if (words.length === 0 || tasks.length === 0) return null
  let best = null
  for (const t of tasks) {
    const title = normalize(`${t.title} ${t.description ?? ''}`)
    const hits = words.filter((w) => title.includes(w)).length
    if (hits > 0 && (!best || hits > best.hits)) best = { task: t, hits }
  }
  return best?.task ?? null
}
