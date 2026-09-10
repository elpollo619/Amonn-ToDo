// ============================================================
// Puente con WorkPulse.
//
// Decisión de Cris (09.09.2026): WorkPulse es el sistema, y el asistente de
// WhatsApp es su boca y sus orejas. Los datos de negocio dejan de vivir en el
// NAS y pasan a la base de WorkPulse (Hetzner, https://workpulse.ch).
//
// El asistente entra con un USUARIO DE SERVICIO propio —no la cuenta de nadie—
// por `/api/auth/app-login`, que WorkPulse ya trae hecho para apps externas.
// Así todo lo que llega por WhatsApp queda firmado como «asistente» y se puede
// revocar sin tocar a las personas.
//
// El token de acceso dura 15 minutos y el de refresco 7 días: aquí se renueva
// solo, porque un asistente que se cae cada cuarto de hora no sirve de nada.
// ============================================================
import { config } from './config.js'

let sesion = null   // { accessToken, refreshToken, expiraEn }

export function workpulseConfigurado() {
  return Boolean(config.workpulse.url && config.workpulse.email && config.workpulse.password)
}

async function pedir(ruta, { method = 'GET', body = null, token = null } = {}) {
  const res = await fetch(`${config.workpulse.url}/api${ruta}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20_000),
  })
  const datos = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(datos.error ?? datos.message ?? `WorkPulse respondió ${res.status}`)
  }
  return datos
}

/** Entra con el usuario de servicio. Devuelve el token de acceso. */
async function entrar() {
  if (!workpulseConfigurado()) throw new Error('Falta configurar WorkPulse en el servidor')
  const r = await pedir('/auth/app-login', {
    method: 'POST',
    body: { email: config.workpulse.email, password: config.workpulse.password },
  })
  if (!r.accessToken) throw new Error('WorkPulse no devolvió token')
  sesion = {
    accessToken: r.accessToken,
    refreshToken: r.refreshToken ?? null,
    // Un minuto de margen: más vale renovar de más que fallar una escritura.
    expiraEn: Date.now() + 14 * 60_000,
  }
  return sesion.accessToken
}

async function refrescar() {
  if (!sesion?.refreshToken) return entrar()
  try {
    const r = await pedir('/auth/app-refresh', {
      method: 'POST',
      body: { refreshToken: sesion.refreshToken },
    })
    if (!r.accessToken) throw new Error('sin token')
    sesion = {
      accessToken: r.accessToken,
      refreshToken: r.refreshToken ?? sesion.refreshToken,
      expiraEn: Date.now() + 14 * 60_000,
    }
    return sesion.accessToken
  } catch {
    // Si el refresco falla (7 días caducados, contraseña cambiada), se entra
    // de cero en vez de dejar al asistente mudo.
    return entrar()
  }
}

async function token() {
  if (!sesion) return entrar()
  if (Date.now() >= sesion.expiraEn) return refrescar()
  return sesion.accessToken
}

/** Solo para las pruebas: olvida la sesión en memoria. */
export function _olvidarSesion() { sesion = null }

/**
 * Llama a WorkPulse reintentando UNA vez si el token había caducado antes de
 * lo previsto (reloj desajustado, reinicio de WorkPulse).
 */
async function conSesion(ruta, opciones = {}) {
  try {
    return await pedir(ruta, { ...opciones, token: await token() })
  } catch (err) {
    if (!/401|403|token/i.test(err.message)) throw err
    sesion = null
    return pedir(ruta, { ...opciones, token: await entrar() })
  }
}

// ─── Gastos (Spesen) ─────────────────────────────────────────
// Primer módulo que se muda, por ser el que más se duplicaba.

/**
 * Crea un gasto en WorkPulse.
 *
 * `kontoKey` es la columna real del Spesen («ure_allg», «b22_reinigung»…), la
 * misma clave que usa el catálogo del asistente. WorkPulse la conoce desde
 * 09.09.2026 y de ella saca la cuenta contable, el edificio y el IVA. Sin
 * ella el gasto se guarda igual, pero llega a la contabilidad sin cuenta.
 */
export async function crearGasto({ concepto, categoria, importeCents, fecha, km = null, recibo = null, kontoKey = null }) {
  return conSesion('/spesen', {
    method: 'POST',
    body: {
      description: concepto,
      category: categoria,
      ...(kontoKey ? { kontoKey } : {}),
      // WorkPulse trabaja en francos con decimales; el asistente, en céntimos.
      amount: Number((importeCents / 100).toFixed(2)),
      currency: 'CHF',
      date: fecha,
      ...(km != null ? { kilometers: km } : {}),
      ...(recibo ? { receiptUrl: recibo } : {}),
    },
  })
}

export async function listarGastos() {
  return conSesion('/spesen')
}

// ============================================================
// Puente #2: Tareas → Aufgaben de WorkPulse (una dirección). Amonn crea/actualiza;
// WorkPulse es el registro. El responsable se mapea por email (misma persona en
// los dos sistemas).
// ============================================================

let _usuariosWp = null // cache email(minúsculas) → id de usuario en WorkPulse
async function usuarioWpPorEmail(email) {
  if (!email) return null
  if (!_usuariosWp) {
    try {
      const lista = await conSesion('/users')
      const arr = Array.isArray(lista) ? lista : (lista?.users || lista?.data || lista?.items || [])
      _usuariosWp = new Map(arr.filter((u) => u.email).map((u) => [String(u.email).toLowerCase(), u.id]))
    } catch { _usuariosWp = new Map() }
  }
  return _usuariosWp.get(String(email).toLowerCase()) || null
}
export function _olvidarUsuariosWp() { _usuariosWp = null }

const PRIO_WP = { low: 'LOW', medium: 'MEDIUM', high: 'HIGH', urgent: 'URGENT' }
const EST_WP = { open: 'OPEN', in_progress: 'IN_PROGRESS', done: 'DONE', cancelled: 'CANCELLED' }

/** Crea la Aufgabe espejo en WorkPulse. Devuelve la respuesta (con .id). */
export async function crearAufgabe({ title, description = null, priority = null, dueDate = null, assigneeEmail = null }) {
  const assignedToId = await usuarioWpPorEmail(assigneeEmail)
  return conSesion('/aufgaben', {
    method: 'POST',
    body: {
      title,
      ...(description ? { description } : {}),
      priority: PRIO_WP[String(priority || '').toLowerCase()] || 'MEDIUM',
      // WorkPulse valida ISO datetime; la tarea de Amonn guarda YYYY-MM-DD.
      ...(dueDate ? { dueDate: new Date(dueDate).toISOString() } : {}),
      ...(assignedToId ? { assignedToId } : {}),
    },
  })
}

/** Actualiza estado/prioridad de la Aufgabe espejo. */
export async function actualizarAufgabe(id, { status = null, priority = null } = {}) {
  const body = {}
  if (status && EST_WP[String(status).toLowerCase()]) body.status = EST_WP[String(status).toLowerCase()]
  if (priority && PRIO_WP[String(priority).toLowerCase()]) body.priority = PRIO_WP[String(priority).toLowerCase()]
  if (Object.keys(body).length === 0) return null
  return conSesion(`/aufgaben/${id}`, { method: 'PATCH', body })
}
