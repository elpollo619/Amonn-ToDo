import { createHmac, timingSafeEqual } from 'node:crypto'
import { Router } from 'express'
import { config } from '../config.js'
import { handleInbound } from '../inbound.js'

export const webhookRouter = Router()

// El OpenWA Gateway puede hacer POST aquí en cada evento (message.received),
// como alternativa al tiempo real. Requiere desactivar la protección SSRF del
// Gateway para destinos internos; por defecto se usa Socket.IO (realtime.js).
webhookRouter.post('/', async (req, res) => {
  // Si hay secreto configurado, verificamos la firma HMAC del Gateway.
  if (!verifySignature(req)) {
    return res.status(401).json({ error: 'Firma no válida' })
  }
  // Respondemos rápido para no bloquear al Gateway; procesamos aparte.
  res.json({ ok: true })
  try {
    const body = req.body ?? {}
    const event = body.event ?? body.eventName ?? body.ev ?? ''
    if (event && !String(event).toLowerCase().includes('message')) return
    await handleInbound(body.data ?? body.message ?? body)
  } catch (err) {
    console.error('[wa] error procesando webhook:', err.message)
  }
})

// Verifica la cabecera X-OpenWA-Signature (formato "sha256=<hex>") sobre el
// cuerpo crudo con el secreto del webhook. Si no hay secreto, no se verifica.
function verifySignature(req) {
  const secret = config.whatsapp.webhookSecret
  if (!secret) return true
  const header = req.get('x-openwa-signature') ?? ''
  const expected =
    'sha256=' + createHmac('sha256', secret).update(req.rawBody ?? Buffer.from('')).digest('hex')
  try {
    const a = Buffer.from(header)
    const b = Buffer.from(expected)
    return a.length === b.length && timingSafeEqual(a, b)
  } catch {
    return false
  }
}
