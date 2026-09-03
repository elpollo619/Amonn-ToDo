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
import { interpret, matchUser, pickTaskByHint } from './assistant.js'
import {
  createTask, completeTask, openTasksFor, openTasksAll, listUsers,
} from './tasks.service.js'
import { firstName, taskSummary } from './notify.js'
import { describeDue, parseDateAnyLang, saysNoDate, todayKey, normalize } from './dates.js'
import { t, safeLang, detectLanguage, parseLanguageCommand } from './i18n.js'
import { getPending, setPending, clearPending } from './conversations.js'

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
    return `${i + 1}. ${task.title}${prio} · ${describeDue(task.due_date, today, lang, t)}${who}`
  })
  const more = tasks.length > 15 ? t(lang, 'list_more', { resto: tasks.length - 15 }) : ''
  return `${t(lang, 'list_header', { titulo, total: tasks.length })}\n${lines.join('\n')}${more}`
}

const nombres = (users) => users.map((u) => u.full_name).filter(Boolean).join(', ')

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
    return t(lang, 'ask_who', { titulo: draft.title })
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
      { title: draft.title, description: draft.description, due_date: draft.due, priority: draft.priority ?? 'medium' },
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
  return t(lang, 'created', { para, resumen: taskSummary(task, lang) }) + nota + link
}

/** Convierte lo que dijo la persona sobre "para quién" en un id de usuario. */
function resolverPersona(texto, users, sender, lang) {
  const m = matchUser(texto, users, sender)
  if (m.candidates.length > 1) {
    return { error: t(lang, 'person_ambiguous', { nombre: texto, lista: nombres(m.candidates) }) }
  }
  if (!m.user) return { error: null, noEncontrada: true }
  return { user: m.user }
}

// ─── Continuar una conversación a medias ──────────────────────
async function continuarPendiente(phone, user, lang, pending, texto, users, today) {
  const t0 = normalize(texto)
  // Cancelar en cualquier momento.
  if (/^(cancela|cancelar|olvidalo|dejalo|abbrechen|vergiss es|cancel|esquece)\b/.test(t0)) {
    await clearPending(phone)
    return t(lang, 'cancelled')
  }

  const draft = { ...pending }
  delete draft.esperando

  switch (pending.esperando) {
    case 'what':
      draft.title = texto.trim()
      break

    case 'who': {
      const r = resolverPersona(texto, users, user, lang)
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
      break
    }

    case 'when': {
      if (saysNoDate(texto, lang)) draft.due = null
      else {
        const d = parseDateAnyLang(texto, today, lang)
        draft.due = d ? d.key : null
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

  // 3) ¿Estábamos a mitad de una conversación?
  const pending = await getPending(phone)
  if (pending?.caducada) {
    // Se le avisa y se procesa el mensaje nuevo con normalidad.
    const aviso = t(lang, 'cancelled_timeout')
    const resto = await procesarNuevo(phone, user, lang, text, users, today)
    return `${aviso}\n\n${resto}`
  }
  if (pending) {
    const r = await continuarPendiente(phone, user, lang, pending, text, users, today)
    if (r !== null) return r
  }

  return procesarNuevo(phone, user, lang, text, users, today)
}

async function procesarNuevo(phone, user, lang, text, users, today) {
  const openTasks = await openTasksFor(user.id)
  const intent = await interpret(text, { sender: user, users, openTasks, lang, today })

  switch (intent.action) {
    case 'help':
      return t(lang, 'help', { nombre: firstName(user) })

    case 'list_tasks': {
      const who = (intent.who ?? '').toString().trim()
      if (/^(equipo|team|equipa|equipe|todos|todas|alle|all)$/i.test(who)) {
        return listText(lang, t(lang, 'title_team_tasks'), await openTasksAll(), today)
      }
      if (who && !/^(yo|mi|mias|ich|mir|meine|eu|mim|minhas)$/i.test(who)) {
        const m = matchUser(who, users, user)
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
        priority: intent.priority || 'medium',
        preguntado: false,
      }
      const nombre = (intent.assignee ?? '').toString().trim()
      if (nombre) {
        const r = resolverPersona(nombre, users, user, lang)
        if (r.error) return r.error
        if (r.noEncontrada) {
          return t(lang, 'person_not_found_create', { nombre, lista: nombres(users) })
        }
        draft.assignee_id = r.user.id
      }
      return avanzarBorrador(phone, user, lang, draft, users, today)
    }

    case 'complete_task': {
      const hint = String(intent.task_hint ?? '').trim()
      let task = pickTaskByHint(hint, openTasks)
      if (!task) task = pickTaskByHint(hint, await openTasksAll())
      if (!task) {
        return `${t(lang, 'complete_not_found', { pista: hint })}\n\n${listText(lang, t(lang, 'title_my_tasks'), openTasks, today)}`
      }
      await completeTask(task.id)
      return t(lang, 'completed', { titulo: task.title })
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
