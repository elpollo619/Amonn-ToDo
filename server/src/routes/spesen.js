// Descarga del CSV de un cierre de mes del Spesen.
//
// Como el calendario, no lleva la sesión de la app: el enlace se manda por
// WhatsApp y se abre desde el móvil. Cada cierre tiene su propio token
// aleatorio de 32 caracteres que solo aparece en ese mensaje — quien lo
// tenga, ve ese CSV y nada más.
import { Router } from 'express'
import { exportPorToken } from '../gastos.js'

export const spesenRouter = Router()

spesenRouter.get('/:token.csv', async (req, res, next) => {
  try {
    const token = String(req.params.token ?? '')
    // Un token de verdad son 32 caracteres hex; lo demás ni toca la base.
    if (!/^[0-9a-f]{32}$/.test(token)) {
      return res.status(404).type('text/plain').send('not found')
    }
    const exp = await exportPorToken(token)
    if (!exp) return res.status(404).type('text/plain').send('not found')
    res.type('text/csv; charset=utf-8')
    res.set('Content-Disposition', `attachment; filename="Spesen ${exp.month}.csv"`)
    // El BOM hace que Excel abra el UTF-8 con las diéresis bien.
    res.send('﻿' + exp.csv)
  } catch (err) {
    next(err)
  }
})
