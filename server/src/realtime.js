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

const MIN_DELAY = 10_000
const MAX_DELAY = 120_000
const RATE_LIMIT_DELAY = 65_000 // el límite es 10/min: esperamos > 60s

function subscribe() {
  socket.emit('message', {
    type: 'subscribe',
    sessionId: waState.sessionId,
    events: ['message.received'],
    requestId: `amonn-${Date.now()}`,
  })
}

function scheduleReconnect(reason) {
  if (reconnectTimer) return
  const delay = lastErrorCode === 'RATE_LIMITED' ? RATE_LIMIT_DELAY : reconnectDelay
  console.log(`[wa] tiempo real: reconectaré en ${Math.round(delay / 1000)}s (${reason})`)
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    if (socket && !socket.connected) socket.connect()
  }, delay)
  // Siguiente espera más larga (hasta el tope), por si vuelve a fallar.
  reconnectDelay = Math.min(MAX_DELAY, reconnectDelay * 2)
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
    console.log('[wa] tiempo real conectado; suscribiendo a la sesión')
    lastErrorCode = null
    subscribe()
  })

  socket.on('message', (msg) => {
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
          reconnectDelay = MIN_DELAY // todo bien: reiniciamos la espera
          return
        }
        case 'error': {
          lastErrorCode = msg.code ?? null
          console.error(`[wa] tiempo real: el Gateway devolvió ${msg.code}: ${msg.message}`)
          if (msg.code === 'UNAUTHORIZED') {
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
  })

  socket.on('connect_error', (err) => {
    console.error('[wa] tiempo real: error de conexión:', err.message)
  })

  socket.on('disconnect', (reason) => {
    console.log(`[wa] tiempo real desconectado (${reason})`)
    // Cuando es el SERVIDOR (el Gateway) quien cierra, socket.io-client NO
    // reconecta solo: lo hacemos nosotros, con espera creciente y respetando
    // el límite de conexiones por minuto.
    if (reason === 'io server disconnect') scheduleReconnect(reason)
  })

  return socket
}

// Vuelve a suscribir si cambia la sesión resuelta.
export function resubscribe() {
  if (socket?.connected) subscribe()
}
