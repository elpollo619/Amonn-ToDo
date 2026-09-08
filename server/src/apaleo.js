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

/** Separa las habitaciones por su estado de limpieza. */
export function porEstadoDeLimpieza(unidades) {
  const sucias = [], limpias = [], otras = []
  for (const u of unidades) {
    // Apaleo usa condition: Clean / Dirty / CleaningInProgress / Inspected
    const c = String(u.condition ?? u.status?.condition ?? '').toLowerCase()
    if (c === 'dirty') sucias.push(u)
    else if (c === 'clean' || c === 'inspected') limpias.push(u)
    else otras.push(u)
  }
  return { sucias, limpias, otras }
}
