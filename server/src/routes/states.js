// API de los estados de las tareas (las columnas del tablero).
import { Router } from 'express'
import { requireAuth } from '../auth.js'
import {
  listStates, createState, updateState, deleteState, reorderStates, KINDS, COLORS,
} from '../states.service.js'
import { broadcast } from '../events.js'

export const statesRouter = Router()
statesRouter.use(requireAuth)

statesRouter.get('/', async (_req, res) => {
  res.json({ states: await listStates(), kinds: KINDS, colors: COLORS })
})

statesRouter.post('/', async (req, res) => {
  const estado = await createState(req.body ?? {})
  broadcast()
  res.status(201).json(estado)
})

statesRouter.patch('/:id', async (req, res) => {
  const estado = await updateState(req.params.id, req.body ?? {})
  if (!estado) return res.status(404).json({ error: 'Ese estado no existe' })
  broadcast()
  res.json(estado)
})

// Reordenar toda la lista de una vez: { ids: [...] }
statesRouter.post('/reorder', async (req, res) => {
  const estados = await reorderStates((req.body ?? {}).ids)
  broadcast()
  res.json(estados)
})

statesRouter.delete('/:id', async (req, res) => {
  const r = await deleteState(req.params.id)
  if (!r.deleted) return res.status(404).json({ error: 'Ese estado no existe' })
  broadcast()
  res.json(r)
})
