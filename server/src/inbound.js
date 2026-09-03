// Procesa un mensaje entrante de WhatsApp (llega por tiempo real o webhook):
// identifica a la persona por su teléfono, interpreta lo que pide (assistant.js)
// y actúa: crea tareas, las lista, las completa o responde a un recordatorio.
import { query } from './db.js'
import { config } from './config.js'
import { sendWhatsApp, chatIdToPhone } from './whatsapp.js'
import { interpret, matchUser, pickTaskByHint } from './assistant.js'
import {
  createTask, completeTask, openTasksFor, openTasksAll, listUsers,
} from './tasks.service.js'
import { firstName, taskSummary } from './notify.js'
import { describeDue } from './dates.js'

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
    reply = 'Uy, algo ha fallado al procesar tu mensaje 😅. Inténtalo de nuevo en un momento.'
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

function helpText(user) {
  return (
    `¡Hola ${firstName(user)}! Soy el asistente de Amonn 🤖. Puedes escribirme, por ejemplo:\n\n` +
    `• "Crea una tarea a Luis: revisar la caldera, para el viernes"\n` +
    `• "Necesito que Ana prepare el presupuesto Gómez mañana, urgente"\n` +
    `• "¿Qué tengo abierto?" o "Tareas de Luis" o "Tareas del equipo"\n` +
    `• "Hecha la de la caldera"\n\n` +
    `Y cuando te pregunte por una tarea, responde SÍ o NO.`
  )
}

function listText(title, tasks) {
  if (tasks.length === 0) return `${title}: nada pendiente 🎉`
  const lines = tasks.slice(0, 15).map((t, i) => {
    const who = t.assignee_name ? ` · ${t.assignee_name.split(' ')[0]}` : ''
    const prio = t.priority === 'high' ? ' 🔴' : ''
    return `${i + 1}. ${t.title}${prio} · ${describeDue(t.due_date)}${who}`
  })
  const more = tasks.length > 15 ? `\n… y ${tasks.length - 15} más` : ''
  return `${title} (${tasks.length}):\n${lines.join('\n')}${more}`
}

// ─── Lógica principal ─────────────────────────────────────────
async function processMessage(phone, text) {
  const user = await findUserByPhone(phone)
  if (!user) {
    return 'No te reconozco en Amonn 🤔. Pon este número (con +34) en "Mi perfil" dentro de la app y vuelve a escribirme.'
  }
  const users = await listUsers()
  const openTasks = await openTasksFor(user.id)
  const intent = await interpret(text, { sender: user, users, openTasks })

  switch (intent.action) {
    case 'help':
      return helpText(user)

    case 'list_tasks': {
      const who = (intent.who ?? '').toString().trim()
      if (/^(equipo|todos|todas|all)$/i.test(who)) {
        return listText('Tareas abiertas del equipo', await openTasksAll())
      }
      if (who && !/^(yo|mi|mias|mías)$/i.test(who)) {
        const m = matchUser(who, users, user)
        if (!m.user) return `No encuentro a "${who}" en el equipo. Personas: ${users.map((u) => u.full_name).join(', ')}.`
        return listText(`Tareas abiertas de ${firstName(m.user)}`, await openTasksFor(m.user.id))
      }
      return listText('Tus tareas abiertas', openTasks)
    }

    case 'create_task': {
      const title = String(intent.title ?? '').trim()
      if (!title) {
        return 'Entiendo que quieres crear una tarea, pero no sé cuál 🤔. Ejemplo: "Crea una tarea a Luis: revisar la caldera, para el viernes".'
      }
      let assignee = null
      const name = (intent.assignee ?? '').toString().trim()
      if (name) {
        const m = matchUser(name, users, user)
        if (m.candidates.length > 1) {
          return `¿A quién te refieres con "${name}"? Hay varias personas: ${m.candidates.map((u) => u.full_name).join(', ')}. Escríbelo con el nombre completo.`
        }
        if (!m.user) {
          return `No encuentro a "${name}" en el equipo, así que no he creado la tarea. Personas registradas: ${users.map((u) => u.full_name).join(', ')}. Cada persona tiene que crear su cuenta en Amonn.`
        }
        assignee = m.user
      }
      const task = await createTask(
        {
          title,
          description: intent.description || null,
          assignee_id: assignee?.id ?? null,
          due_date: intent.due || null,
          priority: intent.priority || 'medium',
        },
        user.id,
        { source: 'whatsapp' },
      )
      const forWhom = assignee
        ? assignee.id === user.id ? 'para ti' : `para ${firstName(assignee)}`
        : 'sin responsable (asígnala desde la app)'
      let note = ''
      if (assignee && assignee.id !== user.id) {
        const canWa = assignee.notify_whatsapp !== false && assignee.phone
        const canMail = assignee.notify_email !== false && assignee.email && config.mail.enabled
        note = canWa || canMail
          ? `\n\nLe he avisado por ${[canWa && 'WhatsApp', canMail && 'email'].filter(Boolean).join(' y ')}.`
          : `\n\n⚠️ ${firstName(assignee)} no tiene avisos activos (sin teléfono en su perfil), lo verá al abrir la app.`
      }
      const link = config.appUrl ? `\n\nVerla: ${config.appUrl}` : ''
      return `✅ Tarea creada ${forWhom}:\n\n${taskSummary(task)}${note}${link}`
    }

    case 'complete_task': {
      const hint = String(intent.task_hint ?? '').trim()
      // Primero entre las suyas; si no, entre las que creó o las del equipo.
      let task = pickTaskByHint(hint, openTasks)
      if (!task) task = pickTaskByHint(hint, await openTasksAll())
      if (!task) {
        return `No encuentro ninguna tarea abierta que encaje con "${hint}" 🤔.\n\n${listText('Tus tareas abiertas', openTasks)}`
      }
      await completeTask(task.id)
      return `✅ Hecho: "${task.title}" marcada como completada. ¡Buen trabajo!`
    }

    case 'reply_done':
    case 'reply_not_done': {
      // Se refiere a la tarea por la que se le preguntó más recientemente.
      const { rows } = await query(
        `select * from tasks
          where assignee_id = $1 and status in ('open','in_progress')
          order by last_reminder_at desc nulls last, due_date asc nulls last
          limit 1`,
        [user.id],
      )
      const task = rows[0]
      if (!task) return `¡Hola ${firstName(user)}! No tienes tareas abiertas ahora mismo 🎉`
      if (intent.action === 'reply_done') {
        await completeTask(task.id)
        return `¡Genial! ✅ He marcado "${task.title}" como completada. ¡Buen trabajo!`
      }
      return `De acuerdo, dejo "${task.title}" como abierta. ¡Ánimo! 💪`
    }

    default:
      return (
        `No te he entendido 🤔. Prueba con algo como:\n` +
        `• "Crea una tarea a Luis: revisar la caldera, para el viernes"\n` +
        `• "¿Qué tengo abierto?"\n` +
        `• "Hecha la de la caldera"\n\n` +
        `Escribe "ayuda" para ver más ejemplos.`
      )
  }
}
