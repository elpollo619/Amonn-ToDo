import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { config } from './config.js'

const AVATAR_COLORS = [
  '#6366f1', '#0ea5e9', '#10b981', '#f59e0b',
  '#ef4444', '#ec4899', '#8b5cf6', '#14b8a6',
]

export function randomColor() {
  return AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)]
}

export async function hashPassword(plain) {
  return bcrypt.hash(plain, 10)
}

export async function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash)
}

export function signToken(userId) {
  return jwt.sign({ sub: userId }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  })
}

function tokenFromRequest(req) {
  const header = req.headers.authorization
  if (header?.startsWith('Bearer ')) return header.slice(7)
  // Para SSE (EventSource no permite cabeceras) aceptamos ?token=
  if (req.query?.token) return String(req.query.token)
  return null
}

/** Middleware: exige un token válido y añade req.userId. */
export function requireAuth(req, res, next) {
  const token = tokenFromRequest(req)
  if (!token) return res.status(401).json({ error: 'No autenticado' })
  try {
    const payload = jwt.verify(token, config.jwtSecret)
    req.userId = payload.sub
    next()
  } catch {
    res.status(401).json({ error: 'Sesión no válida' })
  }
}

/** Quita el hash de contraseña antes de enviar un usuario al cliente. */
export function publicUser(row) {
  if (!row) return null
  const { password_hash, email, ...rest } = row
  void password_hash
  void email
  return rest
}
