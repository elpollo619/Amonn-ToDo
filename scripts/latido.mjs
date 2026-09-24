// ============================================================
// El latido: vigila que el asistente esté VIVO y avisa por WhatsApp.
//
// Por qué existe: del 15 al 24.09.2026 el asistente estuvo MUDO NUEVE DÍAS
// (imagen amd64 en un NAS aarch64) y nadie se enteró. Antes, el 08.09, dos
// horas por los permisos de pgdata. Desde fuera los dos apagones se parecen:
// el asistente no contesta y nadie recibe ni un aviso.
//
// ⚠️ REGLA DE ORO DE ESTE FICHERO: el vigilante NO puede depender de lo que
// vigila. Por eso:
//   - corre en su PROPIO contenedor, con la imagen pública `node:22-alpine`,
//     NO con la imagen de la app (si esa imagen está rota —justo el fallo del
//     15.09— el vigilante moriría con ella y no avisaría de nada);
//   - no usa la base de datos, ni config.js, ni ninguna pieza del servidor;
//   - no tiene dependencias npm: solo Node y `fetch`.
// Avisa por el Gateway de WhatsApp (openwa-api), que es otro contenedor y
// siguió en pie durante los dos apagones.
//
// Lo que NO cubre, dicho claro: si se apaga el NAS entero, o si el Gateway
// cae, nadie avisará — el vigilante se habrá ido con ellos. Para eso hace
// falta un servicio de fuera (un «dead man's switch»). Esto cubre el caso
// real que ocurrió dos veces: el resto del NAS vivo y el asistente muerto.
// ============================================================

/** Convierte una duración en algo que se lee en español: «9 días», «2 h 5 min». */
export function duracion(ms) {
  const seg = Math.max(0, Math.round(ms / 1000))
  const min = Math.floor(seg / 60)
  const h = Math.floor(min / 60)
  const d = Math.floor(h / 24)
  if (d >= 1) return d === 1 ? '1 día' : `${d} días`
  if (h >= 1) {
    const restoMin = min - h * 60
    return restoMin ? `${h} h ${restoMin} min` : `${h} h`
  }
  if (min >= 1) return min === 1 ? '1 minuto' : `${min} minutos`
  return `${seg} segundos`
}

/**
 * ¿La respuesta del servidor demuestra que está VIVO de verdad?
 *
 * No basta un 200: durante el apagón de pgdata (08.09) la app respondía por
 * conexiones ya abiertas mientras la base estaba rota. Exigimos el JSON de
 * /api/version con una versión dentro.
 */
export function estaVivo(status, cuerpo) {
  if (status !== 200) return false
  try {
    const j = typeof cuerpo === 'string' ? JSON.parse(cuerpo) : cuerpo
    return Boolean(j && typeof j.version === 'string' && j.version.length > 0)
  } catch {
    return false
  }
}

/**
 * El corazón del vigilante, aislado a propósito para poder probarlo sin red.
 *
 * Recibe el estado anterior y si la comprobación de AHORA salió bien; devuelve
 * el estado nuevo y qué hay que hacer. Decide una sola cosa por vuelta.
 *
 * Reglas:
 *  - Solo avisa al CRUZAR el umbral de fallos seguidos (nada de spam cada vuelta).
 *  - Estando caído, insiste cada `repetirCadaMs` para que no se olvide.
 *  - Al volver, avisa una vez diciendo cuánto estuvo mudo.
 */
export function decidir(estado, vivo, ahora, opciones = {}) {
  const umbral = opciones.umbral ?? 3
  const repetirCadaMs = opciones.repetirCadaMs ?? 6 * 60 * 60 * 1000
  const prev = {
    fallos: estado?.fallos ?? 0,
    avisado: estado?.avisado ?? false,
    caidoDesde: estado?.caidoDesde ?? null,
    ultimoAviso: estado?.ultimoAviso ?? null,
  }

  if (vivo) {
    // Se recupera: solo se anuncia si llegamos a avisar de la caída. Si
    // parpadeó sin cruzar el umbral, nadie necesita saberlo.
    if (prev.avisado) {
      return {
        estado: { fallos: 0, avisado: false, caidoDesde: null, ultimoAviso: null },
        accion: 'recuperado',
        desde: prev.caidoDesde,
        duracionMs: prev.caidoDesde ? ahora - prev.caidoDesde : 0,
      }
    }
    return { estado: { fallos: 0, avisado: false, caidoDesde: null, ultimoAviso: null }, accion: 'nada' }
  }

  const fallos = prev.fallos + 1
  // El instante de la caída es el del PRIMER fallo, no el del aviso: así la
  // duración que se anuncia es la real, no la que tardamos en darnos cuenta.
  const caidoDesde = prev.caidoDesde ?? ahora

  if (!prev.avisado && fallos >= umbral) {
    return {
      estado: { fallos, avisado: true, caidoDesde, ultimoAviso: ahora },
      accion: 'caido',
      desde: caidoDesde,
      duracionMs: ahora - caidoDesde,
    }
  }

  if (prev.avisado && prev.ultimoAviso !== null && ahora - prev.ultimoAviso >= repetirCadaMs) {
    return {
      estado: { fallos, avisado: true, caidoDesde, ultimoAviso: ahora },
      accion: 'sigue-caido',
      desde: caidoDesde,
      duracionMs: ahora - caidoDesde,
    }
  }

  return { estado: { fallos, avisado: prev.avisado, caidoDesde, ultimoAviso: prev.ultimoAviso }, accion: 'nada' }
}

/**
 * El texto del aviso. Escrito para Cris, que no es técnico y probablemente lo
 * lee en el móvil: qué pasa, desde cuándo, y los DOS sitios donde mirar —
 * porque los dos apagones conocidos se parecen desde fuera pero se curan
 * distinto.
 */
export function mensaje(accion, { duracionMs = 0, detalle = '' } = {}) {
  if (accion === 'recuperado') {
    return `✅ El asistente vuelve a responder.\n\nEstuvo sin contestar ${duracion(duracionMs)}.`
  }
  const cabecera = accion === 'sigue-caido'
    ? `🔴 El asistente SIGUE sin responder (van ${duracion(duracionMs)}).`
    : `🔴 El asistente ha dejado de responder (desde hace ${duracion(duracionMs)}).`
  return [
    cabecera,
    '',
    'Qué mirar, por orden (en el NAS):',
    '1) "docker ps" — si amonn-server pone «Restarting», mira',
    '   "docker logs --tail 20 amonn-server".',
    '   • «exec format error» = la imagen es de otra arquitectura.',
    '     El NAS es arm64. Se arregla en el CI, no en el NAS.',
    '   • «42501» o «pg_filenode.map» = los permisos de pgdata.',
    '     Se devuelven al uid 70 (está escrito en el manual).',
    '2) Si el contenedor está «Up» pero no contesta, mira la base:',
    '   "docker logs --tail 20 amonn-db-1".',
    detalle ? `\nDetalle técnico: ${detalle}` : '',
  ].filter((l) => l !== '').join('\n')
}

/** De la lista del Gateway, la sesión utilizable. `ready` manda; si no, la primera. */
export function elegirSesion(sesiones) {
  const lista = (Array.isArray(sesiones) ? sesiones : []).filter((s) => s && (s.id || s.sessionId))
  const id = (s) => s.id || s.sessionId
  const lista2 = lista.find((s) => s.status === 'ready')
  if (lista2) return id(lista2)
  return lista.length > 0 ? id(lista[0]) : null
}

// ── De aquí abajo, los efectos: red y bucle. No se prueban solos. ──────────

const env = (n, d = '') => process.env[n] ?? d
const CONF = {
  saludUrl: env('SALUD_URL', 'http://amonn-server:4000/api/version'),
  waUrl: env('WA_API_URL', 'http://openwa-api:2785'),
  waKey: env('WA_API_KEY', ''),
  sesionFija: env('WA_SESSION_ID', 'auto'),
  destinos: env('LATIDO_TO', '').split(',').map((x) => x.trim()).filter(Boolean),
  intervaloMs: Number(env('LATIDO_INTERVALO_SEG', '120')) * 1000,
  umbral: Number(env('LATIDO_UMBRAL', '3')),
  repetirCadaMs: Number(env('LATIDO_REPETIR_H', '6')) * 3600 * 1000,
}

const chatId = (tel) => `${String(tel).replace(/[^\d]/g, '')}@c.us`

async function sesionActiva() {
  if (CONF.sesionFija && CONF.sesionFija !== 'auto') return CONF.sesionFija
  const res = await fetch(`${CONF.waUrl}/api/sessions`, { headers: { 'x-api-key': CONF.waKey } })
  if (!res.ok) throw new Error(`el Gateway devolvió ${res.status} al listar sesiones`)
  // El Gateway devuelve el array DIRECTAMENTE, sin envolver (trampa conocida).
  return elegirSesion(await res.json())
}

async function avisar(texto) {
  if (CONF.destinos.length === 0) {
    console.warn('[latido] no hay LATIDO_TO: no puedo avisar a nadie')
    return
  }
  const sid = await sesionActiva()
  if (!sid) throw new Error('el Gateway no tiene ninguna sesión')
  for (const tel of CONF.destinos) {
    const res = await fetch(`${CONF.waUrl}/api/sessions/${encodeURIComponent(sid)}/messages/send-text`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': CONF.waKey },
      body: JSON.stringify({ chatId: chatId(tel), text: texto }),
    })
    if (!res.ok) console.error(`[latido] no pude avisar a ${tel}: ${res.status}`)
    else console.log(`[latido] aviso enviado a ${tel}`)
  }
}

async function comprobar() {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 10_000)
  try {
    const res = await fetch(CONF.saludUrl, { signal: ctrl.signal })
    const cuerpo = await res.text()
    return { vivo: estaVivo(res.status, cuerpo), detalle: `HTTP ${res.status}` }
  } catch (e) {
    return { vivo: false, detalle: e.name === 'AbortError' ? 'sin respuesta en 10 s' : String(e.message || e) }
  } finally {
    clearTimeout(t)
  }
}

async function bucle() {
  console.log(`[latido] vigilando ${CONF.saludUrl} cada ${CONF.intervaloMs / 1000}s ` +
    `(aviso tras ${CONF.umbral} fallos seguidos, recordatorio cada ${CONF.repetirCadaMs / 3600000} h)`)
  console.log(`[latido] avisaré a: ${CONF.destinos.join(', ') || '(NADIE — falta LATIDO_TO)'}`)
  let estado = { fallos: 0, avisado: false, caidoDesde: null, ultimoAviso: null }
  for (;;) {
    const { vivo, detalle } = await comprobar()
    const r = decidir(estado, vivo, Date.now(), { umbral: CONF.umbral, repetirCadaMs: CONF.repetirCadaMs })
    estado = r.estado
    if (r.accion !== 'nada') {
      console.log(`[latido] ${r.accion} (${detalle})`)
      // Que el aviso falle NO debe matar al vigilante: se reintenta a la vuelta
      // siguiente. Un vigilante que se muere al primer tropiezo no es vigilante.
      try {
        await avisar(mensaje(r.accion, { duracionMs: r.duracionMs, detalle }))
      } catch (e) {
        console.error(`[latido] no pude enviar el aviso: ${e.message}`)
        if (r.accion === 'caido') estado = { ...estado, avisado: false, fallos: CONF.umbral }
      }
    }
    await new Promise((r2) => setTimeout(r2, CONF.intervaloMs))
  }
}

// Solo arranca si se ejecuta directamente; importarlo (en las pruebas) no hace nada.
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) bucle()
