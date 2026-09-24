// ============================================================
// Contratos de alquiler generados desde una plantilla de Google Docs.
//
// «Contrato para Max Muster, habitación 204, 850, desde el 1 de octubre» →
// se copia la plantilla, se rellenan los huecos {{...}} y se contesta con el
// enlace al documento y a su PDF. Solo queda imprimir y firmar.
//
// CÓMO LO HACE LA EMPRESA (estudiado en su Drive, sept 2026): plantillas
// Word «Maske MV …» con campos MERGEFIELD combinados contra el Excel
// maestro Liste Mietvertrag neu.xlsx; el PDF se guarda en la carpeta del
// inquilino (<Edificio>/01 Mieter/<nº> <Nombre>) como «MV <Nombre>.pdf» y,
// firmado, «MV <Nombre> unt.pdf». Aquí se replica lo mismo con Google Docs:
// los huecos de la plantilla llevan LOS MISMOS NOMBRES que sus MERGEFIELD,
// entre dobles llaves: {{M1VName}} {{M1Name}} {{Objekt}} {{Total}}
// {{Depot}} {{Mbeginn}} {{Datum}}. El texto completo de la plantilla
// Longstay, listo para pegar en un Google Doc, está en
// docs/plantillas/mietvertrag-longstay.md.
//
// Se accede con una cuenta de servicio de Google Cloud a la que hay que
// COMPARTIR la plantilla y la carpeta de contratos (como a una persona más,
// con su correo ...@...iam.gserviceaccount.com).
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
  const datos = { nombre: null, habitacion: null, alquiler: null, desde: null, deposito: null }
  const sueltos = []
  for (const tr of trozos) {
    const hab = tr.match(/(?:habitacion|habitación|hab\.?|zimmer|quarto)\s*(?:nr\.?|n[º°]?\.?)?\s*(\S+)/i)
    if (hab && !datos.habitacion) { datos.habitacion = hab[1].toUpperCase(); continue }
    const fecha = parseDateAnyLang(tr, today, lang)
    if (fecha && !datos.desde) { datos.desde = fecha.key; continue }
    // La fianza va con su palabra: «kaution 500», «fianza 500», «depósito 500».
    const kaution = tr.match(/(?:kaution|caucion|caución|deposito|depósito|fianza)\s*(?:de\s+)?(?:chf\s*)?(\d{2,5})/i)
    if (kaution && !datos.deposito) { datos.deposito = kaution[1]; continue }
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

/**
 * Qué se escribe en cada hueco {{...}} de la plantilla. Los nombres son LOS
 * MISMOS que los MERGEFIELD de las «Masken» de Word de la empresa, para que
 * la plantilla de Google Docs sea un calco de la suya y cualquiera de la
 * oficina la reconozca. La fianza sin decir es CHF 500 (su práctica en
 * Longstay: 300–500).
 */
export function camposDePlantilla({ nombre, habitacion, alquiler, desde, deposito }, today = todayKey()) {
  const f = (k) => String(k).slice(0, 10).split('-').reverse().join('.')
  const partes = String(nombre).trim().split(/\s+/)
  const apellido = partes.length > 1 ? partes[partes.length - 1] : ''
  const nombrePila = partes.length > 1 ? partes.slice(0, -1).join(' ') : partes[0]
  return {
    '{{M1VName}}': nombrePila,
    '{{M1Name}}': apellido,
    '{{Objekt}}': `Zimmer Nr. ${habitacion}`,
    '{{Total}}': alquiler,
    '{{Depot}}': deposito ?? '500',
    '{{Mbeginn}}': f(desde),
    '{{Datum}}': f(today),
  }
}

/** Copia la plantilla, rellena los huecos y devuelve los enlaces. */
/**
 * Diagnóstico: prueba la cadena de contratos ESLABÓN A ESLABÓN y dice en qué
 * punto exacto se rompe.
 *
 * Por qué existe: todo esto está escrito contra la documentación pública de
 * Google y nunca se ha ejecutado contra la cuenta real. Cuando Cris ponga la
 * credencial, algo fallará —siempre falla algo: la API sin habilitar, la
 * plantilla sin compartir, la carpeta de otro— y un «Google 403» a secas no
 * le dice qué hacer. Esto sí.
 *
 * Es de solo lectura: no copia nada ni crea ningún documento.
 * Devuelve una lista de pasos con estado 'ok' | 'falla' | 'saltado'.
 */
export async function diagnosticoContratos() {
  const g = config.google ?? {}
  const pasos = []
  const anota = (clave, etiqueta, estado, queHacer = '') =>
    pasos.push({ clave, etiqueta, estado, queHacer })

  // 1. ¿Hay credencial y se puede leer?
  let clave = null
  if (!g.serviceAccountKey) {
    anota('credencial', 'La clave de la cuenta de servicio', 'falla',
      'Falta la variable GOOGLE_SA_KEY en el compose del NAS: el JSON entero de la cuenta de servicio, o ese JSON en base64.')
    return pasos // sin credencial no hay nada más que probar
  }
  try {
    clave = leerClave()
    if (!clave.client_email || !clave.private_key) throw new Error('le faltan client_email o private_key')
    anota('credencial', `La clave de la cuenta de servicio (${clave.client_email})`, 'ok')
  } catch (e) {
    anota('credencial', 'La clave de la cuenta de servicio', 'falla',
      `El JSON no se puede leer (${String(e.message).slice(0, 90)}). Cópialo entero, tal cual lo descargaste, o pásalo a base64.`)
    return pasos
  }

  // 2. ¿Google acepta la credencial? Aquí sale si las APIs están apagadas.
  try {
    await conseguirToken()
    anota('token', 'Google acepta la credencial', 'ok')
  } catch (e) {
    anota('token', 'Google acepta la credencial', 'falla',
      `Google rechaza la clave (${String(e.message).slice(0, 110)}). Comprueba en console.cloud.google.com que están HABILITADAS la API de Google Drive y la de Google Docs, y que la clave no esté revocada.`)
    return pasos
  }

  // 3. ¿La cuenta de servicio VE la plantilla? El fallo más típico: existe,
  //    pero nadie se la compartió — y la cuenta de servicio es un usuario más.
  if (!g.contractTemplateId) {
    anota('plantilla', 'La plantilla del contrato', 'falla',
      'Falta GOOGLE_CONTRACT_TEMPLATE_ID: el id del Google Doc de la plantilla (está en su URL, entre /d/ y /edit).')
  } else {
    try {
      const f = await llamar(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(g.contractTemplateId)}?supportsAllDrives=true&fields=id,name,mimeType`,
      )
      if (f.mimeType !== 'application/vnd.google-apps.document') {
        anota('plantilla', `La plantilla «${f.name}»`, 'falla',
          `Ese fichero no es un Google Doc (es ${f.mimeType}). Si subiste un Word, ábrelo y guárdalo como Documento de Google: la plantilla tiene que ser nativa.`)
      } else {
        anota('plantilla', `La plantilla «${f.name}»`, 'ok')
      }
    } catch (e) {
      anota('plantilla', 'La plantilla del contrato', 'falla',
        `No la puedo abrir (${String(e.message).slice(0, 110)}). Compártela con ${clave.client_email} como si fuera una persona más, con permiso de Lector.`)
    }
  }

  // 4. La carpeta es opcional, pero si se indica tiene que poder ESCRIBIR:
  //    ver la carpeta no basta, y descubrirlo al crear el primer contrato de
  //    verdad sería descubrirlo tarde.
  if (!g.contractsFolderId) {
    anota('carpeta', 'La carpeta donde guardar los contratos', 'saltado',
      'No hay GOOGLE_CONTRACTS_FOLDER_ID. No es obligatorio: sin ella los contratos nacen en el Drive de la cuenta de servicio, donde nadie los ve. Es mejor poner una.')
  } else {
    try {
      const f = await llamar(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(g.contractsFolderId)}?supportsAllDrives=true&fields=id,name,capabilities(canAddChildren)`,
      )
      if (f.capabilities?.canAddChildren === false) {
        anota('carpeta', `La carpeta «${f.name}»`, 'falla',
          `La veo pero no puedo escribir en ella. Compártela con ${clave.client_email} como Editor, no como Lector.`)
      } else {
        anota('carpeta', `La carpeta «${f.name}»`, 'ok')
      }
    } catch (e) {
      anota('carpeta', 'La carpeta de contratos', 'falla',
        `No la puedo abrir (${String(e.message).slice(0, 110)}). Compártela con ${clave.client_email} como Editor.`)
    }
  }

  return pasos
}

/** El diagnóstico, escrito para leerlo en el móvil. */
export function formatDiagnosticoContratos(pasos, lang = 'es') {
  const de = lang === 'de'
  const icono = { ok: '✅', falla: '❌', saltado: '➖' }
  const cabecera = de ? '*Mietverträge — Prüfung*' : '*Contratos — comprobación*'
  const lineas = pasos.map((p) => {
    const base = `${icono[p.estado] ?? '•'} ${p.etiqueta}`
    return p.queHacer ? `${base}\n   ↳ ${p.queHacer}` : base
  })
  const fallos = pasos.filter((p) => p.estado === 'falla').length
  const cierre = fallos === 0
    ? (de ? '\nAlles bereit: ich kann Verträge erstellen.' : '\nTodo listo: ya puedo generar contratos.')
    : (de ? `\nEs fehlen noch ${fallos} Punkt(e).` : `\nQuedan ${fallos} cosa(s) por arreglar.`)
  return [cabecera, '', ...lineas, cierre].join('\n')
}

export async function generarContrato(datos, today = todayKey()) {
  const g = config.google
  // «MV <Nombre Apellido>»: el nombre que dicta el manual de la empresa
  // (Anleitung Mietvertrag erstellen). El «unt.» lo añaden ellos al archivar
  // la versión firmada.
  const nombreDoc = `MV ${datos.nombre}`
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
