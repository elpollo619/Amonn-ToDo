// API de los pasos de una tarea.
import { asyncRouter } from '../util.js'
import { requireAuth } from '../auth.js'
import {
  listSubtasks, createSubtask, updateSubtask, deleteSubtask, reorderSubtasks,
} from '../subtasks.service.js'

export const subtasksRouter = asyncRouter()
subtasksRouter.use(requireAuth)

subtasksRouter.get('/tasks/:taskId/subtasks', async (req, res) => {
  res.json(await listSubtasks(req.params.taskId))
})

subtasksRouter.post('/tasks/:taskId/subtasks', async (req, res) => {
  const paso = await createSubtask(req.params.taskId, {
    title: (req.body ?? {}).title,
    createdBy: req.userId,
  })
  res.status(201).json(paso)
})

subtasksRouter.post('/tasks/:taskId/subtasks/reorder', async (req, res) => {
  res.json(await reorderSubtasks(req.params.taskId, (req.body ?? {}).ids))
})

subtasksRouter.patch('/subtasks/:id', async (req, res) => {
  const paso = await updateSubtask(req.params.id, req.body ?? {})
  if (!paso) return res.status(404).json({ error: 'Ese paso no existe' })
  res.json(paso)
})

subtasksRouter.delete('/subtasks/:id', async (req, res) => {
  const ok = await deleteSubtask(req.params.id)
  if (!ok) return res.status(404).json({ error: 'Ese paso no existe' })
  res.status(204).end()
})
