// ============================================================
// La hoja de precios de la web.
//
// Leer los precios lo puede hacer cualquiera del equipo: saber a cuánto está
// la casa no es información delicada y ayuda a todos.
//
// APROBAR un precio es SOLO de admin (decisión de Cris, 09.09.2026). No vale
// el permiso «dinero»: poner precios no es lo mismo que emitir una factura.
//
// Y desde esa misma fecha **nada se envía solo**: el cron de PreisPilot que
// aplicaba a Beds24 dos veces al día está desactivado (`cron.job` id 1,
// `active = false`). Los precios los manda una persona, a mano, desde aquí.
// ============================================================
import { asyncRouter } from '../util.js'
import { requireAuth } from '../auth.js'
import { tienePermiso } from '../permisos.js'
import { query } from '../db.js'
import {
  fetchDashboard, analizarPrecios, fijarPrecio, overridesConfigurados,
  porSemanas, proximosEventos, enviarABeds24, recomendarSemanas, coberturaCompetencia,
} from '../precios.js'
import { todayKey, addDays } from '../dates.js'
import {
  apaleoConfigurado, puedeCambiarPrecios, planesDeTarifa, tarifas, fijarPreciosHotel,
} from '../apaleo.js'

export const preciosRouter = asyncRouter()
preciosRouter.use(requireAuth)

async function puedeEditar(userId) {
  return tienePermiso(userId, 'admin')
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
      semanas: recomendarSemanas(datos?.calendar, todayKey()),
      competencia: coberturaCompetencia(datos?.calendar, todayKey()),
      eventos: proximosEventos(datos?.calendar, todayKey()),
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
    return res.status(403).json({ error: 'Solo un administrador puede cambiar precios' })
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

// Aprobar los precios y mandarlos a Beds24. Solo admin, y solo a mano: es
// el sustituto del cron que se apagó el 09.09.2026.
preciosRouter.post('/enviar', async (req, res) => {
  if (!(await puedeEditar(req.userId))) {
    return res.status(403).json({ error: 'Solo un administrador puede enviar precios a Beds24' })
  }
  if (!overridesConfigurados()) {
    return res.status(503).json({ error: 'Falta PREISPILOT_PIN en el servidor' })
  }
  try {
    const r = await enviarABeds24({
      meses: Number(req.body?.meses) || 12,
      // El ensayo enseña qué se enviaría sin escribir nada en Beds24.
      ensayo: Boolean(req.body?.ensayo),
    })
    res.json({ ok: true, resultado: r })
  } catch (err) {
    res.status(502).json({ error: err.message })
  }
})

// ─── El hotel (Apaleo) ───────────────────────────────────────
// Casa Reto y el hotel son dos mundos distintos: la casa se alquila entera y
// su precio vive en PreisPilot; el hotel va por planes de tarifa en Apaleo.
// Por eso son dos rutas y no una con un parámetro.

preciosRouter.get('/hotel', async (req, res) => {
  if (!apaleoConfigurado()) {
    return res.json({ disponible: false, motivo: 'Falta configurar Apaleo en el servidor' })
  }
  try {
    const puede = await puedeCambiarPrecios()
    if (!puede) {
      return res.json({
        disponible: false,
        // Se distingue del error de verdad: esto se arregla en apaleo.dev, no aquí.
        motivo: 'A la app de Apaleo le faltan los permisos rates.read y rates.manage',
        puedeEditar: false,
      })
    }
    const planes = await planesDeTarifa()
    const hoy = todayKey()
    const hasta = addDays(hoy, 30)
    const conTarifas = await Promise.all(planes.slice(0, 6).map(async (p) => ({
      id: p.id,
      nombre: p.name ?? p.id,
      tarifas: (await tarifas(p.id, hoy, hasta)).slice(0, 31),
    })))
    res.json({
      disponible: true,
      puedeEditar: await puedeEditar(req.userId),
      desde: hoy,
      hasta,
      planes: conTarifas,
    })
  } catch (err) {
    res.status(502).json({ disponible: false, motivo: `Apaleo: ${err.message.slice(0, 160)}` })
  }
})

// Fijar precios del hotel. Solo admin, igual que Casa Reto, y con ensayo.
preciosRouter.post('/hotel/fijar', async (req, res) => {
  if (!(await puedeEditar(req.userId))) {
    return res.status(403).json({ error: 'Solo un administrador puede cambiar precios' })
  }
  const { ratePlanId, cambios, ensayo } = req.body ?? {}
  if (!ratePlanId || !cambios || typeof cambios !== 'object') {
    return res.status(400).json({ error: 'Faltan el plan de tarifa o las fechas' })
  }
  try {
    const r = await fijarPreciosHotel({ ratePlanId, cambios, ensayo: Boolean(ensayo) })
    res.json({ ok: true, ...r })
  } catch (err) {
    res.status(err.status === 403 ? 403 : 502).json({ error: err.message.slice(0, 200) })
  }
})
