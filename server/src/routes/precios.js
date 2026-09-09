// ============================================================
// La hoja de precios de la web.
//
// Leer los precios lo puede hacer cualquiera del equipo: saber a cuánto está
// la casa no es información delicada y ayuda a todos.
//
// FIJAR un precio exige el permiso «dinero», el mismo que las facturas y los
// impagos: lo que se guarda aquí acaba en Beds24 en el siguiente pase del
// cron y es dinero real.
// ============================================================
import { asyncRouter } from '../util.js'
import { requireAuth } from '../auth.js'
import { tienePermiso } from '../permisos.js'
import { query } from '../db.js'
import {
  fetchDashboard, analizarPrecios, fijarPrecio, overridesConfigurados,
} from '../precios.js'
import { todayKey } from '../dates.js'

export const preciosRouter = asyncRouter()
preciosRouter.use(requireAuth)

async function puedeEditar(userId) {
  return (await tienePermiso(userId, 'dinero')) || (await tienePermiso(userId, 'admin'))
}

// El calendario, el análisis y lo que hay fijado a mano.
preciosRouter.get('/', async (req, res) => {
  try {
    const datos = await fetchDashboard()
    const analisis = analizarPrecios(datos, todayKey())
    res.json({
      propiedad: 'Casa Reto',
      analisis,
      overrides: datos?.overrides ?? {},
      calendario: (datos?.calendar ?? []).filter((n) => n.d >= todayKey()),
      puedeEditar: await puedeEditar(req.userId),
      // Sin PIN la hoja se ve igual, pero el botón de guardar se apaga en vez
      // de fallar al pulsarlo.
      editable: overridesConfigurados(),
    })
  } catch (err) {
    res.status(502).json({ error: `No se pudo leer PreisPilot: ${err.message}` })
  }
})

// Fijar o quitar el precio de una noche.
preciosRouter.post('/override', async (req, res) => {
  if (!(await puedeEditar(req.userId))) {
    return res.status(403).json({ error: 'Necesitas el permiso «dinero» para cambiar precios' })
  }
  if (!overridesConfigurados()) {
    return res.status(503).json({ error: 'Falta PREISPILOT_PIN en el servidor' })
  }
  const { rows } = await query('select full_name from users where id = $1', [req.userId])
  try {
    const overrides = await fijarPrecio({
      fecha: req.body?.fecha,
      precio: req.body?.precio ?? null,
      minStay: req.body?.min_stay ?? null,
      nota: req.body?.nota ?? null,
      quien: rows[0]?.full_name ?? null,
    })
    res.json({ ok: true, overrides })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})
