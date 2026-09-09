// ============================================================
// Apaleo: el sistema donde vive el hotel (reservas, habitaciones, limpieza).
//
// Autenticación OAuth "client credentials": se pide un token con el Client
// ID y el Secret, vale una hora y se reutiliza mientras dure. Documentación:
// https://apaleo.dev/guides/api/overview.html
//
// ⚠️ Las rutas concretas de cada consulta están puestas según la
// documentación pública, pero NO se han probado contra la cuenta real: hasta
// tener credenciales no se puede saber cómo devuelve exactamente los datos
// este hotel. Por eso cada función devuelve también `crudo`, para poder mirar
// la respuesta de verdad la primera vez y ajustar sin adivinar.
// ============================================================
import { config } from './config.js'

const IDENTIDAD = 'https://identity.apaleo.com/connect/token'
const API = 'https://api.apaleo.com'

let token = null
let caduca = 0

export function apaleoConfigurado() {
  const { clientId, clientSecret } = config.apaleo ?? {}
  return Boolean(clientId && clientSecret)
}

/** Token de acceso, reutilizado mientras siga valiendo. */
async function conseguirToken() {
  const ahora = Date.now()
  if (token && ahora < caduca - 60_000) return token
  const { clientId, clientSecret } = config.apaleo
  const cred = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
  const res = await fetch(IDENTIDAD, {
    method: 'POST',
    headers: { Authorization: `Basic ${cred}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
    signal: AbortSignal.timeout(20_000),
  })
  if (!res.ok) throw new Error(`Apaleo no dio token (${res.status})`)
  const j = await res.json()
  token = j.access_token
  caduca = ahora + (j.expires_in ?? 3600) * 1000
  return token
}

/** Una consulta cualquiera a la API. Devuelve el JSON tal cual. */
export async function apaleoGet(ruta, params = {}) {
  const t = await conseguirToken()
  const url = new URL(ruta.startsWith('http') ? ruta : `${API}${ruta}`)
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v))
  }
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${t}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(30_000),
  })
  if (!res.ok) {
    const detalle = await res.text().catch(() => '')
    const err = new Error(`Apaleo ${res.status} en ${ruta}: ${detalle.slice(0, 200)}`)
    // El código va aparte: un 403 no es una avería, es un permiso que falta.
    err.status = res.status
    throw err
  }
  return res.json()
}

const dia = (d) => String(d).slice(0, 10)

/** Reservas que ENTRAN en una fecha. */
export async function llegadas(fecha, propertyId = config.apaleo.propertyId) {
  const j = await apaleoGet('/booking/v1/reservations', {
    propertyId, from: `${dia(fecha)}T00:00:00Z`, to: `${dia(fecha)}T23:59:59Z`,
    dateFilter: 'Arrival', pageSize: 100,
  })
  return { reservas: j.reservations ?? [], crudo: j }
}

/** Reservas que SALEN en una fecha. */
export async function salidas(fecha, propertyId = config.apaleo.propertyId) {
  const j = await apaleoGet('/booking/v1/reservations', {
    propertyId, from: `${dia(fecha)}T00:00:00Z`, to: `${dia(fecha)}T23:59:59Z`,
    dateFilter: 'Departure', pageSize: 100,
  })
  return { reservas: j.reservations ?? [], crudo: j }
}

/**
 * Habitaciones y su estado de limpieza.
 *
 * ⚠️ COMPROBADO CONTRA LA CUENTA REAL (08.09.2026): con los permisos que hoy
 * tiene la app de Apaleo (`reservations.read` + `accounting.read`) esta ruta
 * responde **403**. Para que la limpieza funcione hay que añadir en Apaleo el
 * scope de inventario a la app `UCVF-SP-EINKOMMEN_SYNC`.
 *
 * Por eso el 403 NO se lanza como error: se devuelve `sinPermiso: true`. Así
 * lo que sí funciona (llegadas, salidas, quién está en casa) sigue
 * respondiendo aunque la limpieza no esté disponible.
 */
export async function habitaciones(propertyId = config.apaleo.propertyId) {
  try {
    const j = await apaleoGet('/inventory/v1/units', { propertyId, pageSize: 200 })
    return { unidades: j.units ?? [], sinPermiso: false, crudo: j }
  } catch (err) {
    if (err.status === 403) return { unidades: [], sinPermiso: true, crudo: null }
    throw err
  }
}

/**
 * Las propiedades (hoteles) de la cuenta. Sirve para averiguar el
 * `propertyId` sin tener que adivinarlo: en la cuenta real devuelve `NSH`.
 */
export async function propiedades() {
  const j = await apaleoGet('/inventory/v1/properties', {})
  return { propiedades: j.properties ?? [], crudo: j }
}

/** Cuántas personas llegan: se suman adultos y niños de cada reserva. */
export function contarPersonas(reservas) {
  return reservas.reduce((n, r) => n + (r.adults ?? 0) + (r.childrenAges?.length ?? 0), 0)
}

/**
 * Separa las habitaciones por su estado de limpieza.
 *
 * Los estados salen de la especificación oficial de Apaleo
 * (`api.apaleo.com/swagger/inventory-v1/swagger.json`, `UnitStatusModel`), y
 * son **exactamente tres**:
 *
 *   `Clean` · `CleanToBeInspected` · `Dirty`
 *
 * ⚠️ El comentario anterior decía «Clean / Dirty / CleaningInProgress /
 * Inspected»: dos de esos cuatro no existen. Se escribió de memoria, sin
 * mirar la fuente, y habría contado mal las habitaciones el día que se
 * concediera el permiso `units.read`. Si hay que tocar esto, mirar el
 * swagger, no la memoria.
 *
 * Una habitación por inspeccionar ya está limpia (solo falta que la gobernanta
 * la revise), así que cuenta como limpia y además se devuelve aparte por si
 * se quiere mostrar el matiz.
 */
export function porEstadoDeLimpieza(unidades) {
  const sucias = [], limpias = [], porInspeccionar = [], otras = []
  for (const u of unidades) {
    const c = String(u.condition ?? u.status?.condition ?? '').toLowerCase()
    if (c === 'dirty') sucias.push(u)
    else if (c === 'cleantobeinspected') { limpias.push(u); porInspeccionar.push(u) }
    else if (c === 'clean') limpias.push(u)
    else otras.push(u)
  }
  return { sucias, limpias, porInspeccionar, otras }
}

/**
 * Habitaciones fuera de servicio por avería o mantenimiento. Apaleo lo trae
 * en `status.maintenance` de cada unidad.
 *
 * Útil de verdad: en septiembre de 2026 las habitaciones 206 y 207 llevaban
 * semanas con una fuga de agua y eso no lo veía nadie desde el móvil.
 */
export function enMantenimiento(unidades) {
  return unidades.filter((u) => u.status?.maintenance ?? u.maintenance)
}

// ─── Precios del hotel ───────────────────────────────────────
// Apaleo guarda los precios en «rate plans» (planes de tarifa), no en la
// habitación: un plan se aplica a un tipo de habitación y a un rango de
// fechas. Por eso aquí no se habla de «cuarto 204» sino de plan + fecha.
//
// ⚠️ El formato del importe NO se inventa. Se LEE la tarifa que Apaleo tiene
// hoy y se devuelve la misma estructura con el importe cambiado. La
// documentación pública no fija los nombres del objeto `price`, y adivinarlos
// sería exactamente el error contra el que avisa este repo.
//
// Todo esto necesita el scope `rates.manage`, que la app aún no tiene: hasta
// entonces `puedeCambiarPrecios()` devuelve false y nadie llama a lo demás.

export async function planesDeTarifa(propertyId = config.apaleo.propertyId) {
  const r = await apaleoGet('/rateplan/v1/rate-plans', { propertyId, pageSize: 100 })
  return r.ratePlans ?? []
}

export async function tarifas(ratePlanId, desde, hasta) {
  const r = await apaleoGet(`/rateplan/v1/rate-plans/${encodeURIComponent(ratePlanId)}/rates`, {
    from: `${dia(desde)}T00:00:00Z`,
    to: `${dia(hasta)}T00:00:00Z`,
  })
  return r.rates ?? []
}

/**
 * Copia un objeto de precio cambiando SOLO el importe, sea cual sea el nombre
 * que use Apaleo (grossAmount, netAmount, amount…). Si no reconoce ninguno,
 * avisa en vez de mandar un precio que se ignoraría en silencio.
 */
export function conNuevoImporte(price, importe) {
  if (!price || typeof price !== 'object') throw new Error('La tarifa no trae precio')
  const claves = ['grossAmount', 'netAmount', 'amount', 'value']
  const clave = claves.find((k) => typeof price[k] === 'number')
  if (!clave) {
    throw new Error(`No reconozco el precio de Apaleo: ${Object.keys(price).join(', ')}`)
  }
  return { ...price, [clave]: importe }
}

/** ¿Puede esta app cambiar precios? Depende del scope `rates.manage`. */
export async function puedeCambiarPrecios() {
  if (!apaleoConfigurado()) return false
  try {
    // Se pregunta por los planes: si falta el permiso, Apaleo responde 403 y
    // eso se distingue de una avería (que sería 5xx o un fallo de red).
    await apaleoGet('/rateplan/v1/rate-plans', { propertyId: config.apaleo.propertyId, pageSize: 1 })
    return true
  } catch (err) {
    if (err.status === 403 || err.status === 401) return false
    throw err
  }
}

/**
 * Fija el precio de unas fechas en un plan de tarifa.
 *
 * `cambios` es { 'AAAA-MM-DD': importe }. Se leen las tarifas de esos días,
 * se cambia el importe conservando el resto (restricciones, moneda, franjas
 * horarias) y se devuelven con PUT. Las fechas que Apaleo no tenga se avisan
 * en vez de crearse a ciegas: una tarifa inventada puede dejar una noche a la
 * venta a un precio que nadie ha decidido.
 */
export async function fijarPreciosHotel({ ratePlanId, cambios, ensayo = false }) {
  const fechas = Object.keys(cambios).sort()
  if (fechas.length === 0) return { cambiadas: 0, sinTarifa: [], ensayo }

  const existentes = await tarifas(ratePlanId, fechas[0], fechas[fechas.length - 1])
  const porDia = new Map(existentes.map((r) => [dia(r.from), r]))

  const sinTarifa = []
  const nuevas = []
  for (const f of fechas) {
    const actual = porDia.get(f)
    if (!actual) { sinTarifa.push(f); continue }
    nuevas.push({ ...actual, price: conNuevoImporte(actual.price, cambios[f]) })
  }

  if (ensayo || nuevas.length === 0) {
    return { cambiadas: nuevas.length, sinTarifa, ensayo: true, muestra: nuevas.slice(0, 3) }
  }

  const t = await conseguirToken()
  const res = await fetch(`${API}/rateplan/v1/rate-plans/${encodeURIComponent(ratePlanId)}/rates`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(nuevas),
    signal: AbortSignal.timeout(60_000),
  })
  if (!res.ok) {
    const detalle = await res.text().catch(() => '')
    const err = new Error(`Apaleo ${res.status} al fijar precios: ${detalle.slice(0, 200)}`)
    err.status = res.status
    throw err
  }
  return { cambiadas: nuevas.length, sinTarifa, ensayo: false }
}
