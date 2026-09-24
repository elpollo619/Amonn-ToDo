// API del vocabulario del equipo. La pantalla para gestionarlo llegará con el
// rediseño; el backend ya está listo para ella.
import { Router } from 'express'
import { requireAuth } from '../auth.js'
import { listAliases, learn, forget } from '../aliases.js'

export const aliasesRouter = Router()
aliasesRouter.use(requireAuth)

aliasesRouter.get('/', async (_req, res) => {
  res.json(await listAliases())
})

aliasesRouter.post('/', async (req, res) => {
  const { kind, phrase, user_id: userId = null, keywords = null } = req.body ?? {}
  if (!['person', 'task'].includes(kind)) {
    return res.status(400).json({ error: 'kind debe ser "person" o "task"' })
  }
  if (kind === 'person' && !userId) {
    return res.status(400).json({ error: 'Un alias de persona necesita user_id' })
  }
  const row = await learn({ kind, phrase, userId, keywords, createdBy: req.userId })
  if (!row) return res.status(400).json({ error: 'Frase demasiado corta o inválida' })
  res.status(201).json(row)
})

aliasesRouter.delete('/:id', async (req, res) => {
  await forget(req.params.id)
  res.status(204).end()
})
