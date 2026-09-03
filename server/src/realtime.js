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
let reconnectDelay = 10_000 // espera actual para reconectar (crece si falla)
let reconnectTimer = null
let subscribeTimer = null
let ackTimer = null // espera del acuse del Gateway al 'subscribe'
let subscribeDelay = 2_000 // espera tras conectar antes de suscribirse (ver abajo)

const MIN_DELAY = 10_000
const MAX_DELAY = 120_000
const RATE_LIMIT_DELAY = 65_000 // el límite es 10/min: esperamos > 60s
const SUBSCRIBE_DELAY_MIN = 2_000
const SUBSCRIBE_DELAY_MAX = 15_000
const ACK_TIMEOUT = 10_000 // si el Gateway no acusa la suscripción, reintentamos

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
  clearTimeout(ackTimer)
  ackTimer = setTimeout(() => {
    console.error(
      `[wa] tiempo real: el Gateway no confirmó la suscripción en ${Math.round(ACK_TIMEOUT / 1000)}s; reintento`,
    )
    if (socket?.connected) subscribe()
  }, ACK_TIMEOUT)
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
      handleGatewayMessage(ack)
    },
  )
}

function scheduleReconnect(reason) {
  if (reconnectTimer) return
  let delay = reconnectDelay
  if (lastErrorCode === 'RATE_LIMITED') delay = RATE_LIMIT_DELAY
  // Tras la carrera de la suscripción no hace falta esperar más: la
  // conexión en sí fue aceptada. Reconectamos pronto (respetando 10/min).
  if (lastErrorCode === 'SUBSCRIBE_RACE') delay = MIN_DELAY
  console.log(`[wa] tiempo real: reconectaré en ${Math.round(delay / 1000)}s (${reason})`)
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    if (socket && !socket.connected) socket.connect()
  }, delay)
  // Siguiente espera más larga (hasta el tope), por si vuelve a fallar.
  if (lastErrorCode !== 'SUBSCRIBE_RACE') reconnectDelay = Math.min(MAX_DELAY, reconnectDelay * 2)
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
        reconnectDelay = MIN_DELAY // todo bien: reiniciamos las esperas
        subscribeDelay = SUBSCRIBE_DELAY_MIN
        return
      }
      case 'error': {
        lastErrorCode = msg.code ?? null
        console.error(`[wa] tiempo real: el Gateway devolvió ${msg.code}: ${msg.message}`)
        if (msg.code === 'UNAUTHORIZED' && /no longer valid/i.test(msg.message ?? '')) {
          // Casi seguro la carrera descrita arriba (la clave sí es válida:
          // el propio Gateway aceptó la conexión). Reintentar esperando más.
          subscribeDelay = Math.min(SUBSCRIBE_DELAY_MAX, subscribeDelay * 2)
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
        return
      }
      default:
        return
    }
  } catch (e) {
    console.error('[wa] error en evento de tiempo real:', e.message)
  }
}

export function connectRealtime() {
  if (!config.whatsapp.enabled || !config.whatsapp.realtime) return
  if (socket) return socket // ya conectado: evita sockets duplicados
  const { apiUrl, apiKey } = config.whatsapp

  socket = io(`${apiUrl}/events`, {
    transports: ['websocket', 'polling'],
    auth: apiKey ? { apiKey } : {},
    extraHeaders: apiKey ? { 'X-API-Key': apiKey } : {},
    // Reconexión automática (para cortes de red). Espaciada para no superar
    // el límite de 10 conexiones/minuto del Gateway.
    reconnection: true,
    reconnectionDelay: MIN_DELAY,
    reconnectionDelayMax: MAX_DELAY,
    randomizationFactor: 0.3,
  })

  socket.on('connect', () => {
    console.log(
      `[wa] tiempo real conectado; suscribiendo a la sesión en ${Math.round(subscribeDelay / 1000)}s`,
    )
    lastErrorCode = null
    clearTimeout(subscribeTimer)
    subscribeTimer = setTimeout(() => {
      if (socket?.connected) subscribe()
    }, subscribeDelay)
  })

  socket.on('message', handleGatewayMessage)

  socket.on('connect_error', (err) => {
    console.error('[wa] tiempo real: error de conexión:', err.message)
  })

  socket.on('disconnect', (reason) => {
    clearTimeout(subscribeTimer)
    clearTimeout(ackTimer)
    console.log(`[wa] tiempo real desconectado (${reason})`)
    // Cuando es el SERVIDOR (el Gateway) quien cierra, socket.io-client NO
    // reconecta solo: lo hacemos nosotros, con espera creciente y respetando
    // el límite de conexiones por minuto.
    if (reason === 'io server disconnect') scheduleReconnect(reason)
  })

  return socket
}

/** ¿Está conectado ahora mismo el canal de tiempo real con el Gateway? */
export function realtimeConnected() {
  return Boolean(socket?.connected)
}

// Vuelve a suscribir si cambia la sesión resuelta.
export function resubscribe() {
  if (socket?.connected) subscribe()
}
