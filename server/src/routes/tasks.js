import { asyncRouter } from '../util.js'
import { query } from '../db.js'
import { requireAuth } from '../auth.js'
import { broadcast } from '../events.js'
import { createTask, getUser, STATUSES, PRIORITIES } from '../tasks.service.js'
import { notifyTaskAssigned } from '../notify.js'

export const tasksRouter = asyncRouter()
tasksRouter.use(requireAuth)

// Listar todas las tareas del equipo.
tasksRouter.get('/', async (_req, res) => {
  const { rows } = await query('select * from tasks order by created_at desc')
  res.json(rows)
})

// Crear una tarea (avisa al responsable por WhatsApp/email si no es quien la crea).
tasksRouter.post('/', async (req, res) => {
  const b = req.body ?? {}
  if (!b.title || !String(b.title).trim()) {
    return res.status(400).json({ error: 'El título es obligatorio' })
  }
  const task = await createTask(b, req.userId)
  res.json(task)
})

// Editar una tarea (campos parciales).
tasksRouter.patch('/:id', async (req, res) => {
  const b = req.body ?? {}
  const before = (await query('select assignee_id from tasks where id = $1', [req.params.id])).rows[0]
  const fields = []
  const values = []
  let i = 1

  const set = (col, val) => {
    fields.push(`${col} = $${i++}`)
    values.push(val)
  }

  if (b.title !== undefined) set('title', b.title)
  if (b.description !== undefined) set('description', b.description)
  if (b.priority !== undefined && PRIORITIES.includes(b.priority)) set('priority', b.priority)
  if (b.assignee_id !== undefined) set('assignee_id', b.assignee_id || null)
  if (b.due_date !== undefined) set('due_date', b.due_date || null)
  if (b.status !== undefined && STATUSES.includes(b.status)) {
    set('status', b.status)
    set('completed_at', b.status === 'done' ? new Date().toISOString() : null)
  }
  if (b.last_reminder_at !== undefined) set('last_reminder_at', b.last_reminder_at)

  if (fields.length === 0) {
    return res.status(400).json({ error: 'Nada que actualizar' })
  }
  set('updated_at', new Date().toISOString())
  values.push(req.params.id)

  const { rows } = await query(
    `update tasks set ${fields.join(', ')} where id = $${i} returning *`,
    values,
  )
  if (!rows[0]) return res.status(404).json({ error: 'Tarea no encontrada' })
  broadcast()
  // Si se ha asignado a otra persona, avisarla.
  const task = rows[0]
  if (
    b.assignee_id !== undefined && task.assignee_id &&
    task.assignee_id !== before?.assignee_id && task.assignee_id !== req.userId &&
    task.status !== 'done'
  ) {
    const [assignee, creator] = await Promise.all([getUser(task.assignee_id), getUser(req.userId)])
    notifyTaskAssigned(task, assignee, creator).catch(() => {})
  }
  res.json(task)
})

// Eliminar una tarea.
tasksRouter.delete('/:id', async (req, res) => {
  await query('delete from tasks where id = $1', [req.params.id])
  broadcast()
  res.json({ ok: true })
})
