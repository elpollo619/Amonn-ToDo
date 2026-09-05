// ============================================================
// Contratos de alquiler generados desde una plantilla de Google Docs.
//
// «Contrato para Max Muster, habitación 204, 850, desde el 1 de octubre» →
// se copia la plantilla, se rellenan los huecos {{...}} y se contesta con el
// enlace al documento y a su PDF. Solo queda imprimir y firmar.
//
// La plantilla vive en Google Docs y debe tener estos huecos, escritos tal
// cual: {{NAME}}, {{ZIMMER}}, {{MIETE}}, {{BEGINN}} y {{DATUM}} (el día en
// que se genera). Se accede con una cuenta de servicio de Google Cloud a la
// que hay que COMPARTIR la plantilla y la carpeta de contratos (como a una
// persona más, con su correo ...@...iam.gserviceaccount.com).
//
// ⚠️ Escrito según la documentación pública de Google (Drive v3 + Docs v1),
// SIN probar contra la cuenta real: la primera vez, mira la respuesta cruda
// antes de fiarte. El token se firma a mano (RS256 con node:crypto) para no
// arrastrar el SDK entero de Google por tres llamadas.
// ============================================================
import crypto from 'node:crypto'
import { config } from './config.js'
import { parseDateAnyLang, todayKey } from './dates.js'

export function contratosConfigurados() {
  const g = config.google ?? {}
  return Boolean(g.serviceAccountKey && g.contractTemplateId)
}

let token = null
let caduca = 0

/** La clave de la cuenta de servicio, venga como JSON directo o en base64. */
function leerClave() {
  const cruda = config.google.serviceAccountKey
  const texto = cruda.trim().startsWith('{')
    ? cruda
    : Buffer.from(cruda, 'base64').toString('utf8')
  return JSON.parse(texto)
}

/** Token OAuth de la cuenta de servicio (JWT RS256), cacheado ~1 hora. */
async function conseguirToken() {
  const ahora = Date.now()
  if (token && ahora < caduca - 60_000) return token
  const clave = leerClave()
  const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url')
  const iat = Math.floor(ahora / 1000)
  const sinFirmar = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({
    iss: clave.client_email,
    scope: 'https://www.googleapis.com/auth/documents https://www.googleapis.com/auth/drive',
    aud: 'https://oauth2.googleapis.com/token',
    iat, exp: iat + 3600,
  })}`
  const firma = crypto.sign('RSA-SHA256', Buffer.from(sinFirmar), clave.private_key)
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${sinFirmar}.${firma.toString('base64url')}`,
    }),
    signal: AbortSignal.timeout(20_000),
  })
  if (!res.ok) throw new Error(`Google no dio token (${res.status}): ${(await res.text()).slice(0, 200)}`)
  const j = await res.json()
  token = j.access_token
  caduca = ahora + (j.expires_in ?? 3600) * 1000
  return token
}

async function llamar(url, opciones = {}) {
  const t = await conseguirToken()
  const res = await fetch(url, {
    ...opciones,
    headers: {
      Authorization: `Bearer ${t}`, 'Content-Type': 'application/json',
      ...(opciones.headers ?? {}),
    },
    signal: AbortSignal.timeout(30_000),
  })
  if (!res.ok) {
    const detalle = await res.text().catch(() => '')
    throw new Error(`Google ${res.status}: ${detalle.slice(0, 200)}`)
  }
  return res.json()
}

/**
 * Saca los datos del contrato de lo que escribió la persona, separado por
 * comas: «Max Muster, habitación 204, 850, desde el 1 de octubre».
 * La habitación exige su palabra (habitación/Zimmer/quarto) para no
 * confundirse con el alquiler: 204 y 850 son los dos números igual de
 * válidos. Devuelve { nombre, habitacion, alquiler, desde, faltan: [...] }.
 */
export function parseContrato(texto, today = todayKey(), lang = 'es') {
  const trozos = String(texto ?? '').split(',').map((x) => x.trim()).filter(Boolean)
  const datos = { nombre: null, habitacion: null, alquiler: null, desde: null }
  const sueltos = []
  for (const tr of trozos) {
    const hab = tr.match(/(?:habitacion|habitación|hab\.?|zimmer|quarto)\s*(?:nr\.?|n[º°]?\.?)?\s*(\S+)/i)
    if (hab && !datos.habitacion) { datos.habitacion = hab[1].toUpperCase(); continue }
    const fecha = parseDateAnyLang(tr, today, lang)
    if (fecha && !datos.desde) { datos.desde = fecha.key; continue }
    // El alquiler tiene que ser un trozo que sea SOLO un importe («850»,
    // «CHF 850», «850.50 chf»): si lleva más palabras, no se adivina.
    const importe = tr.match(/^(?:chf\s*)?(\d{2,5})(?:[.,](\d{2}))?\s*(?:chf|fr\.?)?$/i)
    if (importe && !datos.alquiler) {
      datos.alquiler = `${importe[1]}${importe[2] ? '.' + importe[2] : ''}`
      continue
    }
    sueltos.push(tr)
  }
  if (!datos.nombre && sueltos.length) datos.nombre = sueltos[0]
  const faltan = []
  if (!datos.nombre) faltan.push('nombre')
  if (!datos.habitacion) faltan.push('habitacion')
  if (!datos.alquiler) faltan.push('alquiler')
  if (!datos.desde) faltan.push('desde')
  return { ...datos, faltan }
}

/** Qué se escribe en cada hueco {{...}} de la plantilla. */
export function camposDePlantilla({ nombre, habitacion, alquiler, desde }, today = todayKey()) {
  const f = (k) => String(k).slice(0, 10).split('-').reverse().join('.')
  return {
    '{{NAME}}': nombre,
    '{{ZIMMER}}': habitacion,
    '{{MIETE}}': alquiler,
    '{{BEGINN}}': f(desde),
    '{{DATUM}}': f(today),
  }
}

/** Copia la plantilla, rellena los huecos y devuelve los enlaces. */
export async function generarContrato(datos, today = todayKey()) {
  const g = config.google
  const nombreDoc = `Mietvertrag ${datos.habitacion} ${datos.nombre} ${String(datos.desde).slice(0, 10)}`
  // 1. Copiar la plantilla (a la carpeta de contratos, si hay).
  const copia = await llamar(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(g.contractTemplateId)}/copy?supportsAllDrives=true`,
    {
      method: 'POST',
      body: JSON.stringify({
        name: nombreDoc,
        ...(g.contractsFolderId ? { parents: [g.contractsFolderId] } : {}),
      }),
    },
  )
  // 2. Rellenar los huecos.
  const campos = camposDePlantilla(datos, today)
  await llamar(`https://docs.googleapis.com/v1/documents/${encodeURIComponent(copia.id)}:batchUpdate`, {
    method: 'POST',
    body: JSON.stringify({
      requests: Object.entries(campos).map(([hueco, valor]) => ({
        replaceAllText: {
          containsText: { text: hueco, matchCase: true },
          replaceText: String(valor),
        },
      })),
    }),
  })
  return {
    id: copia.id,
    nombre: nombreDoc,
    docUrl: `https://docs.google.com/document/d/${copia.id}/edit`,
    pdfUrl: `https://docs.google.com/document/d/${copia.id}/export?format=pdf`,
    crudo: copia,
  }
}
