// ============================================================
// Cliente de tiempo real hacia el OpenWA Gateway (Socket.IO, namespace /events).
// Recibe los mensajes entrantes sin webhook (evita la protección SSRF del
// Gateway y no necesita abrir puertos hacia Amonn).
//
// Protocolo (según src/modules/events/events.gateway.ts del Gateway):
//  - Conexión al namespace "/events" con auth.apiKey (o cabecera X-API-Key).
//  - Tras conectar, el cliente emite "message" con:
//      { type: 'subscribe', sessionId, events: ['message.received'] }
//    y el Gateway responde { type: 'subscribed', sessionId, events, ... }.
//  - Los eventos llegan como "message" con:
//      { type: 'event', payload: { event, sessionId, data }, timestamp }
//  - Los errores llegan como "message" con:
//      { type: 'error', code, message, requestId?, timestamp }
//    y en algunos casos el Gateway cierra la conexión justo después
//    (UNAUTHORIZED, RATE_LIMITED...). Por eso registramos SIEMPRE el motivo.
//
// Límites del Gateway que hay que respetar (ws-rate-limit.ts):
//  - 10 conexiones (handshakes) por minuto y por IP.
//  - 16 sockets simultáneos por API key.
//  Reconectar demasiado deprisa provoca RATE_LIMITED en bucle, así que la
//  reconexión usa espera creciente y, si el Gateway dice RATE_LIMITED, espera
//  más de un minuto.
// ============================================================
import { io } from 'socket.io-client'
import { config } from './config.js'
import { waState } from './whatsapp.js'
import { handleInbound } from './inbound.js'

let socket = null
let lastErrorCode = null
let lastErrorMessage = null
let reconnectDelay = 10_000 // espera actual para reconectar (crece si falla)
let reconnectTimer = null
let subscribeTimer = null
let ackTimer = null // espera del acuse del Gateway al 'subscribe'
let subscribeDelay = 2_000 // espera tras conectar antes de suscribirse (ver abajo)

// ¿Nos ha confirmado el Gateway la suscripción? Estar CONECTADO no basta:
// un socket conectado pero sin suscribir no recibe ningún mensaje y, hasta
// el 15.09.2026, el semáforo lo daba por bueno («Recibiendo mensajes») y el
// asistente se quedaba sordo tras cada reinicio si la suscripción fallaba
// una sola vez (la carrera de la clave) sin que nadie reintentara.
let subscribed = false
let unsubscribedSince = null // desde cuándo estamos conectados sin suscribir
let watchdogTimer = null

// Tiempos. Son reemplazables (connectRealtime({ timings })) para que las
// pruebas no tengan que esperar segundos de reloj.
const T = {
  MIN_DELAY: 10_000,
  MAX_DELAY: 120_000,
  RATE_LIMIT_DELAY: 65_000, // el límite es 10/min: esperamos > 60s
  SUBSCRIBE_DELAY_MIN: 2_000,
  SUBSCRIBE_DELAY_MAX: 15_000,
  ACK_TIMEOUT: 10_000, // si el Gateway no acusa la suscripción, reintentamos
  WATCHDOG_EVERY: 30_000, // cada cuánto vigilamos que sigamos suscritos
  STUCK_AFTER: 120_000, // conectados sin suscribir tanto tiempo → reconexión limpia
}

// ⚠️ Carrera en el Gateway (events.gateway.ts, handleConnection): al conectar,
// valida la API key en su base de datos con `await` y SOLO DESPUÉS guarda la
// clave en la conexión (client.data.rawApiKey). Si nuestra suscripción llega
// antes de que termine, handleSubscribe no encuentra la clave y responde
// UNAUTHORIZED "API key is no longer valid" y nos desconecta (en su registro
// se ve "Client disconnected" ANTES de "Client connected"). Por eso esperamos
// unos segundos tras conectar antes de suscribirnos, y si aun así ocurre,
// reintentamos esperando más.

// ⚠️ El Gateway es NestJS: handleSubscribe hace `return {type:'subscribed'}`.
// En NestJS ese valor NO se emite, viaja por el CALLBACK DE ACUSE de Socket.IO.
// Si emitimos sin callback, la confirmación —y los errores de la suscripción,
// como UNAUTHORIZED o FORBIDDEN_SESSION— se pierden en silencio y parece que
// no pasa nada. Por eso pasamos siempre callback y además vigilamos que llegue.
function subscribe() {
  subscribed = false
  unsubscribedSince ??= Date.now()
  clearTimeout(ackTimer)
  ackTimer = setTimeout(() => {
    ackTimer = null
    console.error(
      `[wa] tiempo real: el Gateway no confirmó la suscripción en ${Math.round(T.ACK_TIMEOUT / 1000)}s; reintento`,
    )
    if (socket?.connected) subscribe()
  }, T.ACK_TIMEOUT)
  socket.emit(
    'message',
    {
      type: 'subscribe',
      sessionId: waState.sessionId,
      events: ['message.received'],
      requestId: `amonn-${Date.now()}`,
    },
    (ack) => {
      clearTimeout(ackTimer)
      ackTimer = null
      handleGatewayMessage(ack)
    },
  )
}

/** Cierra el socket y programa una conexión nueva (respeta los límites). */
function reconnectCleanly(reason) {
  if (!socket) return
  subscribed = false
  console.log(`[wa] tiempo real: reconexión limpia (${reason})`)
  try { socket.disconnect() } catch {}
  scheduleReconnect(reason)
}

/**
 * Vigilante: cada T.WATCHDOG_EVERY comprueba que, si estamos conectados,
 * también estemos suscritos. Si no, resuscribe; y si llevamos demasiado
 * tiempo conectados sin suscribir, abre una conexión nueva. Así un fallo
 * puntual tras un reinicio ya no deja el asistente sordo hasta el siguiente.
 */
function watchdog() {
  if (!socket?.connected || subscribed) { if (subscribed) unsubscribedSince = null; return }
  const desde = unsubscribedSince ?? (unsubscribedSince = Date.now())
  if (Date.now() - desde > T.STUCK_AFTER) {
    unsubscribedSince = null
    reconnectCleanly('conectado sin suscribir demasiado tiempo')
    return
  }
  if (!ackTimer && !subscribeTimer) {
    console.log('[wa] tiempo real: conectado pero sin suscribir; resuscribo')
    subscribe()
  }
}

function scheduleReconnect(reason) {
  if (reconnectTimer) return
  let delay = reconnectDelay
  if (lastErrorCode === 'RATE_LIMITED') delay = T.RATE_LIMIT_DELAY
  // Tras la carrera de la suscripción no hace falta esperar más: la
  // conexión en sí fue aceptada. Reconectamos pronto (respetando 10/min).
  if (lastErrorCode === 'SUBSCRIBE_RACE') delay = T.MIN_DELAY
  console.log(`[wa] tiempo real: reconectaré en ${Math.round(delay / 1000)}s (${reason})`)
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    if (socket && !socket.connected) socket.connect()
  }, delay)
  // Siguiente espera más larga (hasta el tope), por si vuelve a fallar.
  if (lastErrorCode !== 'SUBSCRIBE_RACE') reconnectDelay = Math.min(T.MAX_DELAY, reconnectDelay * 2)
}

/**
 * Procesa un mensaje del Gateway. Se usa DOS veces: para los mensajes que el
 * Gateway empuja (`socket.on('message')`, por donde llegan los eventos reales
 * y los avisos de expulsión) y para el acuse del `subscribe`, que en NestJS
 * llega por el callback y no por un emit.
 */
function handleGatewayMessage(msg) {
  try {
    if (!msg || typeof msg !== 'object') return
    switch (msg.type) {
      case 'event': {
        if (!msg.payload) return
        const { event, data } = msg.payload
        if (event && !String(event).toLowerCase().includes('message')) return
        handleInbound(data).catch((e) =>
          console.error('[wa] error procesando mensaje en tiempo real:', e.message),
        )
        return
      }
      case 'subscribed': {
        console.log(
          `[wa] tiempo real suscrito a ${JSON.stringify(msg.events ?? [])} (sesión ${msg.sessionId})`,
        )
        reconnectDelay = T.MIN_DELAY // todo bien: reiniciamos las esperas
        subscribeDelay = T.SUBSCRIBE_DELAY_MIN
        subscribed = true
        unsubscribedSince = null
        return
      }
      case 'error': {
        lastErrorCode = msg.code ?? null
        lastErrorMessage = msg.message ?? null
        subscribed = false
        console.error(`[wa] tiempo real: el Gateway devolvió ${msg.code}: ${msg.message}`)
        if (msg.code === 'UNAUTHORIZED' && /no longer valid/i.test(msg.message ?? '')) {
          // Casi seguro la carrera descrita arriba (la clave sí es válida:
          // el propio Gateway aceptó la conexión). Reintentar esperando más.
          subscribeDelay = Math.min(T.SUBSCRIBE_DELAY_MAX, subscribeDelay * 2)
          lastErrorCode = 'SUBSCRIBE_RACE'
          console.error(
            `[wa] el Gateway aún no había terminado de validar la clave al recibir la suscripción; ` +
              `reintento esperando ${Math.round(subscribeDelay / 1000)}s tras conectar`,
          )
        } else if (msg.code === 'UNAUTHORIZED') {
          console.error('[wa] revisa WA_API_KEY: el Gateway no acepta la clave para el tiempo real')
        } else if (msg.code === 'FORBIDDEN_SESSION') {
          console.error(
            `[wa] la API key no tiene permiso para la sesión ${waState.sessionId}; ` +
              'en el Gateway, permite esa sesión (o todas) para esta clave',
          )
        }
        // Antes aquí se acababa todo: se confiaba en que el Gateway nos
        // desconectara para reintentar. Si no lo hace, quedábamos conectados
        // y sordos. Ahora se reintenta SIEMPRE: la carrera se resuelve
        // resuscribiendo sobre la misma conexión; el resto, con una conexión
        // nueva y espera creciente (una clave mala solo seguirá avisando).
        if (socket?.connected) {
          if (lastErrorCode === 'SUBSCRIBE_RACE') {
            clearTimeout(subscribeTimer)
            subscribeTimer = setTimeout(() => { if (socket?.connected) subscribe() }, subscribeDelay)
          } else if (msg.code !== 'RATE_LIMITED') {
            reconnectCleanly(`suscripción rechazada (${msg.code})`)
          }
        }
        return
      }
      default:
        return
    }
  } catch (e) {
    console.error('[wa] error en evento de tiempo real:', e.message)
  }
}

export function connectRealtime({ io: ioFactory = io, timings = null } = {}) {
  if (!config.whatsapp.enabled || !config.whatsapp.realtime) return
  if (socket) return socket // ya conectado: evita sockets duplicados
  if (timings) Object.assign(T, timings)
  reconnectDelay = T.MIN_DELAY
  subscribeDelay = T.SUBSCRIBE_DELAY_MIN
  const { apiUrl, apiKey } = config.whatsapp

  socket = ioFactory(`${apiUrl}/events`, {
    transports: ['websocket', 'polling'],
    auth: apiKey ? { apiKey } : {},
    extraHeaders: apiKey ? { 'X-API-Key': apiKey } : {},
    // Reconexión automática (para cortes de red). Espaciada para no superar
    // el límite de 10 conexiones/minuto del Gateway.
    reconnection: true,
    reconnectionDelay: T.MIN_DELAY,
    reconnectionDelayMax: T.MAX_DELAY,
    randomizationFactor: 0.3,
  })

  socket.on('connect', () => {
    console.log(
      `[wa] tiempo real conectado; suscribiendo a la sesión en ${Math.round(subscribeDelay / 1000)}s`,
    )
    lastErrorCode = null
    subscribed = false
    unsubscribedSince = Date.now()
    clearTimeout(subscribeTimer)
    subscribeTimer = setTimeout(() => {
      subscribeTimer = null
      if (socket?.connected) subscribe()
    }, subscribeDelay)
  })

  clearInterval(watchdogTimer)
  watchdogTimer = setInterval(watchdog, T.WATCHDOG_EVERY)
  watchdogTimer.unref?.()

  socket.on('message', handleGatewayMessage)

  socket.on('connect_error', (err) => {
    console.error('[wa] tiempo real: error de conexión:', err.message)
  })

  socket.on('disconnect', (reason) => {
    clearTimeout(subscribeTimer); subscribeTimer = null
    clearTimeout(ackTimer); ackTimer = null
    subscribed = false
    unsubscribedSince = null
    console.log(`[wa] tiempo real desconectado (${reason})`)
    // Cuando es el SERVIDOR (el Gateway) quien cierra, socket.io-client NO
    // reconecta solo: lo hacemos nosotros, con espera creciente y respetando
    // el límite de conexiones por minuto.
    if (reason === 'io server disconnect') scheduleReconnect(reason)
  })

  return socket
}

/**
 * ¿Está el canal de tiempo real REALMENTE recibiendo mensajes? Solo si el
 * socket está conectado Y el Gateway confirmó la suscripción. (Antes bastaba
 * con estar conectado, y eso daba el semáforo en verde con el asistente sordo.)
 */
export function realtimeConnected() {
  return Boolean(socket?.connected) && subscribed
}

/** Detalle del estado, para /api/health y /api/whatsapp/status. */
export function realtimeState() {
  return {
    connected: Boolean(socket?.connected),
    subscribed,
    lastError: lastErrorCode ? { code: lastErrorCode, message: lastErrorMessage } : null,
    unsubscribedForMs: socket?.connected && !subscribed && unsubscribedSince ? Date.now() - unsubscribedSince : 0,
  }
}

/** Solo para pruebas: olvida el socket actual y los temporizadores. */
export function _resetRealtimeForTests() {
  clearInterval(watchdogTimer); watchdogTimer = null
  clearTimeout(reconnectTimer); reconnectTimer = null
  clearTimeout(subscribeTimer); subscribeTimer = null
  clearTimeout(ackTimer); ackTimer = null
  socket = null; subscribed = false; unsubscribedSince = null; lastErrorCode = null; lastErrorMessage = null
}

// Vuelve a suscribir si cambia la sesión resuelta.
export function resubscribe() {
  if (socket?.connected) subscribe()
}
