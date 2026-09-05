// Descarga del PDF de una QR-Rechnung. Mismo patrón que /spesen: token
// aleatorio de 32 hex en la URL, sin sesión de la app.
import { Router } from 'express'
import { facturaPorToken } from '../cobros.js'

export const facturaRouter = Router()

facturaRouter.get('/:token.pdf', async (req, res, next) => {
  try {
    const token = String(req.params.token ?? '')
    if (!/^[0-9a-f]{32}$/.test(token)) {
      return res.status(404).type('text/plain').send('not found')
    }
    const f = await facturaPorToken(token)
    if (!f) return res.status(404).type('text/plain').send('not found')
    res.type('application/pdf')
    res.set('Content-Disposition', `inline; filename="Rechnung ${String(f.created_at).slice(0, 10)}.pdf"`)
    res.send(f.pdf)
  } catch (err) {
    next(err)
  }
})
