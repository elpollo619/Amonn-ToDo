// ============================================================
// Procesa un mensaje entrante de WhatsApp (llega por tiempo real o webhook):
// identifica a la persona por su teléfono, decide en qué idioma hablarle,
// interpreta lo que pide (assistant.js) y actúa: crea tareas, las lista, las
// completa o responde a un recordatorio.
//
// Novedades respecto a la primera versión:
//  - Habla español, alemán y portugués (i18n.js). El idioma se guarda por
//    persona y se detecta solo del primer mensaje con cuerpo suficiente.
//  - Si falta información para crear una tarea, PREGUNTA en lugar de rendirse
//    o de crear algo a medias. La conversación a medias vive en
//    conversations.js y caduca a los 10 minutos.
// ============================================================
import { query } from './db.js'
import { config } from './config.js'
import { sendWhatsApp, chatIdToPhone, interpretReply } from './whatsapp.js'
import { interpret, matchUser, pickTaskByHint, parseWithRules } from './assistant.js'
import {
  createTask, completeTask, setTaskState, openTasksFor, openTasksAll, listUsers,
} from './tasks.service.js'
import { firstName, taskSummary } from './notify.js'
import { describeRange, parseDateAnyLang, parseRange, saysNoDate, todayKey, normalize } from './dates.js'
import { t, safeLang, detectLanguage, parseLanguageCommand } from './i18n.js'
import { getPending, setPending, clearPending } from './conversations.js'
import { loadAliases, learn, touch, normalizePhrase } from './aliases.js'
import { listStates, matchStateByName } from './states.service.js'

/**
 * Procesa un mensaje entrante. `msg` trae al menos { from, body } y
 * opcionalmente { fromMe, isGroup }. Ignora mensajes propios y de grupos.
 */
export async function handleInbound(msg) {
  if (!msg || typeof msg !== 'object') return
  if (msg.fromMe) return
  const from = msg.from ?? ''
  if (!from || msg.isGroup || String(from).endsWith('@g.us')) return // ignora grupos
  const text = msg.body ?? msg.content ?? msg.text ?? ''
  if (!text || typeof text !== 'string') return

  const phone = chatIdToPhone(from)
  let reply
  try {
    reply = await processMessage(phone, text)
  } catch (err) {
    console.error('[asistente] error procesando el mensaje:', err.message)
    // Aún sin saber quién es, respondemos en el idioma que parezca.
    reply = t(detectLanguage(text) ?? 'es', 'error')
  }
  if (reply) {
    try {
      await sendWhatsApp(phone, reply)
    } catch (err) {
      console.error('[wa] no se pudo responder:', err.message)
    }
  }
}

async function findUserByPhone(phone) {
  const digits = phone.replace(/[^\d]/g, '')
  const { rows } = await query(
    `select * from users
     where regexp_replace(coalesce(phone,''), '[^0-9]', '', 'g') = $1
     limit 1`,
    [digits],
  )
  return rows[0] ?? null
}

async function saveLanguage(userId, lang, auto) {
  await query('update users set language = $2, language_auto = $3 where id = $1', [userId, lang, auto])
}

// ─── Listas ───────────────────────────────────────────────────
function listText(lang, titulo, tasks, today) {
  if (tasks.length === 0) return t(lang, 'list_empty', { titulo })
  const lines = tasks.slice(0, 15).map((task, i) => {
    const who = task.assignee_name ? ` · ${task.assignee_name.split(' ')[0]}` : ''
    const prio = task.priority === 'high' ? ' 🔴' : ''
    // Se enseña el estado salvo que sea uno de los de serie (Abierta / En
    // curso / Hecha): si no, todas las líneas dirían "Abierta" y no aportaría
    // nada. Ojo: no vale filtrar por clase, porque un estado propio como
    // "Por facturar" es de clase 'open' y sí hay que verlo.
    const estado = task.state_name && !task.state_is_default ? ` · ${task.state_name}` : ''
    return `${i + 1}. ${task.title}${prio} · ${describeRange(task.start_date, task.due_date, today, lang, t)}${estado}${who}`
  })
  const more = tasks.length > 15 ? t(lang, 'list_more', { resto: tasks.length - 15 }) : ''
  return `${t(lang, 'list_header', { titulo, total: tasks.length })}\n${lines.join('\n')}${more}`
}

const nombres = (users) => users.map((u) => u.full_name).filter(Boolean).join(', ')

// "jasmi es Jasmina" / "jasmi ist Jasmina" / "jasmi é a Jasmina".
// Se exige que la parte izquierda sea corta y la derecha una persona real,
// para no confundirlo con una frase normal ("la caldera es urgente").
const ENSENAR_RE = /^(.{2,28}?)\s+(?:es|significa|ist|bedeutet|e|é)\s+(?:el |la |o |a |der |die |das )?(.{2,28})$/i

/** ¿Es un intento de enseñar vocabulario? Devuelve {frase, nombre} o null. */
function parseTeach(text) {
  const m = String(text ?? '').trim().match(ENSENAR_RE)
  if (!m) return null
  const frase = m[1].trim()
  const nombre = m[2].trim()
  if (frase.split(/\s+/).length > 3 || nombre.split(/\s+/).length > 3) return null
  return { frase, nombre }
}

/** Palabras que identifican una tarea, para recordar cómo la llama el equipo. */
function keywordsDe(task) {
  return normalize(`${task.title} ${task.description ?? ''}`)
    .split(' ')
    .filter((w) => w.length >= 4)
    .slice(0, 4)
    .join(' ')
}

// ─── Crear una tarea (con preguntas si falta algo) ─────────────
/**
 * Decide el siguiente paso de un borrador de tarea: preguntar lo que falta,
 * pedir confirmación, o crearla. `preguntado` indica si ya hubo que preguntar
 * algo (entonces se confirma al final; si el mensaje venía completo, no).
 */
async function avanzarBorrador(phone, user, lang, draft, users, today) {
  if (!draft.title) {
    await setPending(phone, user.id, { ...draft, esperando: 'what', preguntado: true })
    return t(lang, 'ask_what')
  }
  if (!draft.assignee_id && !draft.sin_responsable) {
    await setPending(phone, user.id, { ...draft, esperando: 'who', preguntado: true })
    // Si veníamos de un nombre que no reconocimos, se dice: es más claro que
    // preguntar en seco, y avisa de que hay un apodo por aprender.
    return draft.nombre_no_reconocido
      ? t(lang, 'ask_person_again', { nombre: draft.nombre_no_reconocido, lista: nombres(users) })
      : t(lang, 'ask_who', { titulo: draft.title })
  }
  if (draft.due === undefined) {
    await setPending(phone, user.id, { ...draft, esperando: 'when', preguntado: true })
    return t(lang, 'ask_when')
  }
  // Solo se confirma cuando hubo que preguntar algo. Si el mensaje ya venía
  // completo, se crea directamente: preguntar "¿seguro?" siempre cansa.
  if (draft.preguntado && !draft.confirmado) {
    await setPending(phone, user.id, { ...draft, esperando: 'confirm' })
    const resumen = taskSummary(
      {
        title: draft.title,
        description: draft.description,
        due_date: draft.due,
        start_date: draft.start,
        work_days: draft.work_days,
        priority: draft.priority ?? 'medium',
      },
      lang,
    )
    return t(lang, 'confirm', { resumen })
  }
  await clearPending(phone)
  return crearTarea(user, lang, draft, users, today)
}

async function crearTarea(user, lang, draft, users, today) {
  const assignee = draft.assignee_id ? users.find((u) => u.id === draft.assignee_id) ?? null : null
  const task = await createTask(
    {
      title: draft.title,
      description: draft.description || null,
      assignee_id: assignee?.id ?? null,
      due_date: draft.due || null,
      start_date: draft.start || null,
      work_days: draft.work_days ?? null,
      priority: draft.priority || 'medium',
    },
    user.id,
    { source: 'whatsapp' },
  )
  const para = assignee
    ? assignee.id === user.id ? t(lang, 'for_you') : t(lang, 'for_person', { nombre: firstName(assignee) })
    : t(lang, 'for_nobody')
  let nota = ''
  if (assignee && assignee.id !== user.id) {
    const canWa = assignee.notify_whatsapp !== false && assignee.phone
    const canMail = assignee.notify_email !== false && assignee.email && config.mail.enabled
    const canales = [canWa && t(lang, 'channel_whatsapp'), canMail && t(lang, 'channel_email')].filter(Boolean)
    nota = canales.length
      ? t(lang, 'notified', { canales: canales.join(' + ') })
      : t(lang, 'not_notified', { nombre: firstName(assignee) })
  }
  const link = config.appUrl ? t(lang, 'see_link', { url: config.appUrl }) : ''
  const aprendido = draft.aprendido
    ? t(lang, 'learned_person', { frase: draft.aprendido.frase, nombre: draft.aprendido.nombre })
    : ''
  return t(lang, 'created', { para, resumen: taskSummary(task, lang) }) + nota + link + aprendido
}

/** Convierte lo que dijo la persona sobre "para quién" en un id de usuario. */
function resolverPersona(texto, users, sender, lang, aliases = []) {
  const m = matchUser(texto, users, sender, aliases)
  if (m.candidates.length > 1) {
    return { error: t(lang, 'person_ambiguous', { nombre: texto, lista: nombres(m.candidates) }) }
  }
  if (!m.user) return { error: null, noEncontrada: true }
  return { user: m.user }
}

// ─── Continuar una conversación a medias ──────────────────────
async function continuarPendiente(phone, user, lang, pending, texto, users, today, aliases = []) {
  const t0 = normalize(texto)
  // Cancelar en cualquier momento.
  if (/^(cancela|cancelar|olvidalo|dejalo|abbrechen|vergiss es|cancel|esquece)\b/.test(t0)) {
    await clearPending(phone)
    return t(lang, 'cancelled')
  }

  // "¿Cuál de estas?" tras no saber a qué tarea se refería. No es un
  // borrador de tarea, así que se resuelve aparte.
  if (pending.esperando === 'which_task') {
    const todas = await openTasksAll()
    const candidatas = todas.filter((x) => (pending.ids ?? []).includes(x.id))
    // Solo se acepta un número, o un texto que identifique UNA sola candidata
    // sin ambigüedad. Una coincidencia floja no vale: completar la tarea
    // equivocada porque alguien ignoró la pregunta y escribió otra cosa es
    // mucho peor que volver a preguntar.
    const soloDigitos = /^\s*\d{1,2}\s*$/.test(t0)
    const n = soloDigitos ? Number.parseInt(t0.trim(), 10) : NaN
    let elegida = n >= 1 && n <= (pending.ids ?? []).length ? pending.ids[n - 1] : null
    if (!elegida) {
      const palabras = t0.split(' ').filter((w) => w.length >= 4)
      const exactas = palabras.length
        ? candidatas.filter((c) => {
            const titulo = normalize(`${c.title} ${c.description ?? ''}`)
            return palabras.every((w) => titulo.includes(w))
          })
        : []
      if (exactas.length === 1) elegida = exactas[0].id
    }
    if (!elegida) {
      // Ni número ni coincidencia clara: se abandona la pregunta y el mensaje
      // se trata como uno nuevo, en lugar de secuestrarlo.
      await clearPending(phone)
      return null
    }
    await clearPending(phone)
    const task = candidatas.find((x) => x.id === elegida)
    let extra = ''
    if (pending.hint && task) {
      await learn({ kind: 'task', phrase: pending.hint, keywords: keywordsDe(task), createdBy: user.id })
      extra = t(lang, 'learned_task', { pista: normalizePhrase(pending.hint) })
    }
    // La pregunta pudo venir de "márcala hecha" o de "ponla en X".
    if (pending.estado_id) {
      const estado = (await listStates()).find((e) => e.id === pending.estado_id)
      if (estado) {
        await setTaskState(elegida, estado)
        return t(lang, 'state_changed', { titulo: task?.title ?? '', estado: estado.name }) + extra
      }
    }
    await completeTask(elegida)
    return t(lang, 'completed', { titulo: task?.title ?? '' }) + extra
  }

  // Si el mensaje es claramente OTRA cosa (una pregunta, un saludo, otra
  // tarea), se abandona la pregunta en vez de tragárselo como respuesta. Es la
  // misma lección que en "¿cuál de estas?": secuestrar un mensaje es peor que
  // perder el hilo.
  if (pending.esperando === 'who' || pending.esperando === 'what') {
    const otra = parseWithRules(texto, {
      sender: user, users, aliases, today, lang, openTasks: [], states: [],
    })
    if (['list_tasks', 'help', 'complete_task', 'set_state'].includes(otra.action)) {
      await clearPending(phone)
      return null
    }
  }

  const draft = { ...pending }
  delete draft.esperando

  switch (pending.esperando) {
    case 'what':
      draft.title = texto.trim()
      break

    case 'who': {
      const r = resolverPersona(texto, users, user, lang, aliases)
      if (r.error) return r.error
      if (r.noEncontrada) {
        // Se puede dejar sin responsable diciéndolo explícitamente.
        if (/^(nadie|sin responsable|niemand|ninguem|ninguém)\b/.test(t0)) {
          draft.sin_responsable = true
          break
        }
        await setPending(phone, user.id, { ...draft, esperando: 'who' })
        return t(lang, 'ask_person_again', { nombre: texto.trim(), lista: nombres(users) })
      }
      draft.assignee_id = r.user.id
      // Aprender de la corrección: si preguntamos porque no reconocimos un
      // nombre ("jasmi") y ahora sí sabemos a quién se refiere, se anota.
      if (draft.nombre_no_reconocido) {
        await learn({
          kind: 'person',
          phrase: draft.nombre_no_reconocido,
          userId: r.user.id,
          createdBy: user.id,
        })
        draft.aprendido = { frase: normalizePhrase(draft.nombre_no_reconocido), nombre: firstName(r.user) }
        delete draft.nombre_no_reconocido
      }
      break
    }

    case 'when': {
      if (saysNoDate(texto, lang)) {
        draft.due = null
      } else {
        // También aquí se admite un plazo entero: "del lunes al jueves".
        const rango = parseRange(texto, today, lang)
        if (rango) {
          draft.start = rango.start
          draft.due = rango.end
        } else {
          const d = parseDateAnyLang(texto, today, lang)
          draft.due = d ? d.key : null
        }
      }
      break
    }

    case 'confirm': {
      const r = interpretReply(texto)
      if (r === 'done') {
        draft.confirmado = true
        break
      }
      await clearPending(phone)
      return t(lang, 'cancelled')
    }

    default:
      await clearPending(phone)
      return null // no sabemos qué esperábamos: se procesa como mensaje nuevo
  }

  return avanzarBorrador(phone, user, lang, draft, users, today)
}

// ─── Lógica principal ─────────────────────────────────────────
/** Exportada para las pruebas: devuelve la respuesta sin enviarla. */
export async function processMessage(phone, text) {
  const user = await findUserByPhone(phone)
  if (!user) {
    return t(detectLanguage(text) ?? 'es', 'unknown_user')
  }

  let lang = safeLang(user.language)
  const today = todayKey()

  // 1) ¿Pide cambiar de idioma? ("habla en alemán")
  const pedido = parseLanguageCommand(text)
  if (pedido) {
    await saveLanguage(user.id, pedido, false)
    return t(pedido, 'lang_changed')
  }

  // 2) Autodetección, solo mientras nadie lo haya elegido a mano.
  if (user.language_auto !== false) {
    const detectado = detectLanguage(text)
    if (detectado && detectado !== lang) {
      await saveLanguage(user.id, detectado, true)
      lang = detectado
    }
  }

  const users = await listUsers()
  const aliases = await loadAliases()

  // 3) ¿Está enseñando vocabulario? ("jasmi es Jasmina")
  const ensenanza = parseTeach(text)
  if (ensenanza) {
    const r = resolverPersona(ensenanza.nombre, users, user, lang, aliases)
    if (r.user) {
      await learn({ kind: 'person', phrase: ensenanza.frase, userId: r.user.id, createdBy: user.id })
      return t(lang, 'teach_ok', { frase: normalizePhrase(ensenanza.frase), nombre: firstName(r.user) })
    }
    // Si la parte derecha no es una persona, NO era una enseñanza: seguimos
    // procesando la frase con normalidad (p. ej. "la caldera es urgente").
  }

  // 4) ¿Estábamos a mitad de una conversación?
  const pending = await getPending(phone)
  if (pending?.caducada) {
    // Se le avisa y se procesa el mensaje nuevo con normalidad.
    const aviso = t(lang, 'cancelled_timeout')
    const resto = await procesarNuevo(phone, user, lang, text, users, today, aliases)
    return `${aviso}\n\n${resto}`
  }
  if (pending) {
    const r = await continuarPendiente(phone, user, lang, pending, text, users, today, aliases)
    if (r !== null) return r
  }

  return procesarNuevo(phone, user, lang, text, users, today, aliases)
}

async function procesarNuevo(phone, user, lang, text, users, today, aliases = []) {
  const openTasks = await openTasksFor(user.id)
  const estados = await listStates()
  const todasAbiertas = await openTasksAll()
  const intent = await interpret(text, {
    sender: user, users, openTasks, lang, today, aliases, states: estados,
    // Para reconocer "pon la caldera en X" hace falta poder mirar las tareas
    // de todo el equipo, no solo las de quien escribe.
    allOpenTasks: todasAbiertas,
  })

  switch (intent.action) {
    case 'help':
      return t(lang, 'help', { nombre: firstName(user) })

    case 'list_tasks': {
      const who = (intent.who ?? '').toString().trim()
      if (/^(equipo|team|equipa|equipe|todos|todas|alle|all)$/i.test(who)) {
        return listText(lang, t(lang, 'title_team_tasks'), await openTasksAll(), today)
      }
      if (who && !/^(yo|mi|mias|ich|mir|meine|eu|mim|minhas)$/i.test(who)) {
        const m = matchUser(who, users, user, aliases)
        if (!m.user) return t(lang, 'person_not_found', { nombre: who, lista: nombres(users) })
        return listText(
          lang,
          t(lang, 'title_person_tasks', { nombre: firstName(m.user) }),
          await openTasksFor(m.user.id),
          today,
        )
      }
      return listText(lang, t(lang, 'title_my_tasks'), openTasks, today)
    }

    case 'create_task': {
      const draft = {
        title: String(intent.title ?? '').trim() || null,
        description: intent.description || null,
        due: intent.due ?? undefined, // undefined = no se dijo → se preguntará
        start: intent.start ?? null,
        work_days: intent.work_days ?? null,
        priority: intent.priority || 'medium',
        preguntado: false,
      }
      const nombre = (intent.assignee ?? '').toString().trim()
      if (nombre) {
        const r = resolverPersona(nombre, users, user, lang, aliases)
        if (r.error) return r.error
        if (r.noEncontrada) {
          // Antes se abandonaba la tarea aquí. Ahora se pregunta y la
          // respuesta se guarda en el vocabulario: así el asistente aprende
          // los apodos del equipo en lugar de tropezar siempre con ellos.
          draft.nombre_no_reconocido = nombre
        } else {
          draft.assignee_id = r.user.id
          if (r.user && normalizePhrase(nombre) !== normalizePhrase(firstName(r.user))) {
            void touch('person', nombre)
          }
        }
      }
      return avanzarBorrador(phone, user, lang, draft, users, today)
    }

    case 'set_state': {
      const pista = String(intent.task_hint ?? '').trim()
      const pedido = String(intent.state ?? '').trim()
      const m = matchStateByName(estados, pedido)
      if (m.candidates.length > 1) {
        return t(lang, 'state_ambiguous', { estado: pedido, lista: m.candidates.map((e) => e.name).join(', ') })
      }
      if (!m.state) {
        return t(lang, 'state_not_found', { estado: pedido, lista: estados.map((e) => e.name).join(', ') })
      }
      let task = pickTaskByHint(pista, openTasks, aliases)
      if (!task) task = pickTaskByHint(pista, await openTasksAll(), aliases)
      if (!task) {
        const candidatas = (openTasks.length ? openTasks : await openTasksAll()).slice(0, 8)
        if (candidatas.length === 0) return t(lang, 'no_open_tasks', { nombre: firstName(user) })
        await setPending(phone, user.id, {
          esperando: 'which_task',
          hint: pista,
          ids: candidatas.map((x) => x.id),
          estado_id: m.state.id,
        })
        return t(lang, 'ask_which_task', { pista, lista: candidatas.map((x, i) => `${i + 1}. ${x.title}`).join('\n') })
      }
      await setTaskState(task.id, m.state)
      void touch('task', pista)
      return t(lang, 'state_changed', { titulo: task.title, estado: m.state.name })
    }

    case 'complete_task': {
      const hint = String(intent.task_hint ?? '').trim()
      let task = pickTaskByHint(hint, openTasks, aliases)
      if (!task) task = pickTaskByHint(hint, await openTasksAll(), aliases)
      if (task) {
        await completeTask(task.id)
        void touch('task', hint)
        return t(lang, 'completed', { titulo: task.title })
      }
      // No sabemos cuál es. Antes se volcaba la lista entera y ahí acababa
      // todo; ahora se pregunta con números y la respuesta se aprende, así
      // que "la caldera" funcionará la próxima vez.
      const candidatas = (openTasks.length ? openTasks : await openTasksAll()).slice(0, 8)
      if (candidatas.length === 0) return t(lang, 'no_open_tasks', { nombre: firstName(user) })
      await setPending(phone, user.id, {
        esperando: 'which_task',
        hint,
        ids: candidatas.map((x) => x.id),
      })
      const lista = candidatas.map((x, i) => `${i + 1}. ${x.title}`).join('\n')
      return t(lang, 'ask_which_task', { pista: hint, lista })
    }

    case 'reply_done':
    case 'reply_not_done': {
      const { rows } = await query(
        `select * from tasks
          where assignee_id = $1 and status in ('open','in_progress')
          order by last_reminder_at desc nulls last, due_date asc nulls last
          limit 1`,
        [user.id],
      )
      const task = rows[0]
      if (!task) return t(lang, 'no_open_tasks', { nombre: firstName(user) })
      if (intent.action === 'reply_done') {
        await completeTask(task.id)
        return t(lang, 'reply_done', { titulo: task.title })
      }
      return t(lang, 'reply_not_done', { titulo: task.title })
    }

    default:
      return t(lang, 'fallback')
  }
}
