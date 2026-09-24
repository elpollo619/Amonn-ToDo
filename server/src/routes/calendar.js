// Publica el calendario en formato iCalendar para suscribirse desde Google
// Calendar, el iPhone o Outlook.
//
// No lleva la sesión de la app: quien se suscribe es el calendario, no una
// persona con su contraseña. Por eso la dirección incluye un token secreto
// y largo — quien lo tenga, ve la agenda. Se compara en tiempo constante
// para no filtrar el token a base de medir cuánto tarda en fallar.
import { Router } from 'express'
import crypto from 'node:crypto'
import { eventosDelCalendario, construirIcs } from '../agenda.js'

export const calendarRouter = Router()

function tokenValido(recibido) {
  const esperado = process.env.CALENDAR_TOKEN ?? ''
  if (!esperado || esperado.length < 16) return false // sin token no se publica
  const a = Buffer.from(String(recibido ?? ''))
  const b = Buffer.from(esperado)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

calendarRouter.get('/:token.ics', async (req, res, next) => {
  try {
    if (!tokenValido(req.params.token)) {
      return res.status(404).type('text/plain').send('not found')
    }
    const datos = await eventosDelCalendario()
    const ics = construirIcs(datos)
    res.type('text/calendar; charset=utf-8')
    res.set('Cache-Control', 'no-cache')
    res.send(ics)
  } catch (err) {
    next(err)
  }
})
