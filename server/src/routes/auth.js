import { asyncRouter } from '../util.js'
import { query } from '../db.js'
import {
  hashPassword,
  verifyPassword,
  signToken,
  requireAuth,
  publicUser,
  randomColor,
} from '../auth.js'

export const authRouter = asyncRouter()

// Registro de una persona del equipo.
authRouter.post('/register', async (req, res) => {
  const { email, password, full_name } = req.body ?? {}
  if (!email || !password) {
    return res.status(400).json({ error: 'Email y contraseña son obligatorios' })
  }
  if (String(password).length < 6) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' })
  }
  const exists = await query('select 1 from users where email = $1', [email])
  if (exists.rowCount > 0) {
    return res.status(409).json({ error: 'Ya existe una cuenta con ese email' })
  }
  const hash = await hashPassword(password)
  const name = full_name?.trim() || String(email).split('@')[0]
  const { rows } = await query(
    `insert into users (email, password_hash, full_name, avatar_color)
     values ($1, $2, $3, $4) returning *`,
    [email, hash, name, randomColor()],
  )
  const user = rows[0]
  res.json({ token: signToken(user.id), user: publicUser(user) })
})

// Inicio de sesión.
authRouter.post('/login', async (req, res) => {
  const { email, password } = req.body ?? {}
  const { rows } = await query('select * from users where email = $1', [email])
  const user = rows[0]
  if (!user || !(await verifyPassword(password ?? '', user.password_hash))) {
    return res.status(401).json({ error: 'Email o contraseña incorrectos' })
  }
  res.json({ token: signToken(user.id), user: publicUser(user) })
})

// Datos de la sesión actual.
authRouter.get('/me', requireAuth, async (req, res) => {
  const { rows } = await query('select * from users where id = $1', [req.userId])
  if (!rows[0]) return res.status(404).json({ error: 'Usuario no encontrado' })
  res.json({ user: publicUser(rows[0]) })
})
