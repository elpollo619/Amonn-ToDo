import { Router } from 'express'
import { query } from '../db.js'
import { broadcast } from '../events.js'
import { sendWhatsApp, chatIdToPhone, interpretReply } from '../whatsapp.js'

export const webhookRouter = Router()

// OpenWA (flag -w) hace POST aquí en cada evento. Aceptamos varias formas de
// payload porque cambian entre versiones.
webhookRouter.post('/', async (req, res) => {
  // Respondemos rápido para no bloquear a OpenWA; procesamos aparte.
  res.json({ ok: true })
  try {
    await handleEvent(req.body)
  } catch (err) {
    console.error('[wa] error procesando webhook:', err.message)
  }
})

async function handleEvent(body) {
  if (!body || typeof body !== 'object') return
  const event = body.event ?? body.eventName ?? body.ev ?? ''
  const msg = body.data ?? body.message ?? body

  // Solo nos interesan mensajes entrantes de texto.
  if (event && !String(event).toLowerCase().includes('message')) return
  if (!msg || typeof msg !== 'object') return
  if (msg.fromMe) return
  const from = msg.from ?? ''
  if (!from || String(from).endsWith('@g.us')) return // ignora grupos
  const text = msg.body ?? msg.content ?? ''
  if (!text) return

  const phone = chatIdToPhone(from)
  const reply = await processReply(phone, text)
  if (reply) {
    try {
      await sendWhatsApp(phone, reply)
    } catch (err) {
      console.error('[wa] no se pudo responder:', err.message)
    }
  }
}

// Localiza a la persona por teléfono, decide sobre su tarea abierta más
// recientemente recordada y devuelve el texto de confirmación.
async function processReply(phone, text) {
  const digits = phone.replace(/[^\d]/g, '')
  const { rows: users } = await query(
    `select * from users
     where regexp_replace(coalesce(phone,''), '[^0-9]', '', 'g') = $1
     limit 1`,
    [digits],
  )
  const user = users[0]
  if (!user) {
    return 'No te reconozco en Amonn 🤔. Pide a tu equipo que registre este número en tu perfil.'
  }

  const { rows: tasks } = await query(
    `select * from tasks
     where assignee_id = $1 and status in ('open','in_progress')
     order by last_reminder_at desc nulls last, due_date asc nulls last
     limit 1`,
    [user.id],
  )
  const task = tasks[0]
  const firstName = (user.full_name ?? '').split(' ')[0]
  if (!task) {
    return `¡Hola ${firstName}! No tienes tareas abiertas ahora mismo 🎉`
  }

  const intent = interpretReply(text)
  if (intent === 'done') {
    await query(
      `update tasks set status='done', completed_at=now(), updated_at=now() where id=$1`,
      [task.id],
    )
    broadcast()
    return `¡Genial! ✅ He marcado "${task.title}" como completada. ¡Buen trabajo!`
  }
  if (intent === 'not_done') {
    return `De acuerdo, dejo "${task.title}" como abierta. ¡Ánimo! 💪`
  }
  return (
    `No te he entendido 🤔. Sobre la tarea "${task.title}":\n` +
    `Responde SÍ si ya la completaste, o NO si sigue pendiente.`
  )
}
