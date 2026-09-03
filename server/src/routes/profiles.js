import { asyncRouter } from '../util.js'
import { query } from '../db.js'
import { requireAuth, publicUser } from '../auth.js'
import { LANGS } from '../i18n.js'

export const profilesRouter = asyncRouter()
profilesRouter.use(requireAuth)

// Listar el equipo.
profilesRouter.get('/', async (_req, res) => {
  const { rows } = await query('select * from users order by full_name asc')
  res.json(rows.map(publicUser))
})

// Editar un perfil. Cada persona solo puede editar el suyo.
profilesRouter.patch('/:id', async (req, res) => {
  if (req.params.id !== req.userId) {
    return res.status(403).json({ error: 'Solo puedes editar tu propio perfil' })
  }
  const b = req.body ?? {}
  const fields = []
  const values = []
  let i = 1
  const set = (col, val) => {
    fields.push(`${col} = $${i++}`)
    values.push(val)
  }
  if (b.full_name !== undefined) set('full_name', b.full_name)
  if (b.phone !== undefined) set('phone', b.phone)
  if (b.avatar_color !== undefined) set('avatar_color', b.avatar_color)
  if (b.notify_whatsapp !== undefined) set('notify_whatsapp', Boolean(b.notify_whatsapp))
  if (b.notify_email !== undefined) set('notify_email', Boolean(b.notify_email))
  // Elegir el idioma a mano desactiva la autodetección: a partir de ahí el
  // asistente respeta la elección aunque escribas puntualmente en otro idioma.
  if (b.language !== undefined && LANGS.includes(b.language)) {
    set('language', b.language)
    set('language_auto', false)
  }
  if (fields.length === 0) {
    return res.status(400).json({ error: 'Nada que actualizar' })
  }
  values.push(req.params.id)
  const { rows } = await query(
    `update users set ${fields.join(', ')} where id = $${i} returning *`,
    values,
  )
  res.json(publicUser(rows[0]))
})
