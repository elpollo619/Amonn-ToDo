// ============================================================
// Cliente de tiempo real hacia el OpenWA Gateway (Socket.IO, namespace /events).
// Recibe los mensajes entrantes sin webhook (evita la protección SSRF del
// Gateway y no necesita abrir puertos hacia Amonn).
//
// Protocolo (según events.gateway.ts del Gateway):
//  - Conexión al namespace "/events" con auth.apiKey.
//  - Tras conectar, el cliente emite "message" con:
//      { type: 'subscribe', sessionId, events: ['message.received'] }
//  - El servidor emite "message" con:
//      { type: 'event', payload: { event, sessionId, data }, timestamp }
// ============================================================
import { io } from 'socket.io-client'
import { config } from './config.js'
import { waState } from './whatsapp.js'
import { handleInbound } from './inbound.js'

let socket = null

export function connectRealtime() {
  if (!config.whatsapp.enabled || !config.whatsapp.realtime) return
  if (socket) return socket // ya conectado: evita sockets duplicados
  const { apiUrl, apiKey } = config.whatsapp

  socket = io(`${apiUrl}/events`, {
    transports: ['websocket', 'polling'],
    auth: apiKey ? { apiKey } : {},
    extraHeaders: apiKey ? { 'X-API-Key': apiKey } : {},
    reconnection: true,
    reconnectionDelay: 3000,
    reconnectionDelayMax: 15000,
  })

  socket.on('connect', () => {
    console.log('[wa] tiempo real conectado; suscribiendo a la sesión')
    socket.emit('message', {
      type: 'subscribe',
      sessionId: waState.sessionId,
      events: ['message.received'],
    })
  })

  socket.on('message', (msg) => {
    try {
      if (!msg || msg.type !== 'event' || !msg.payload) return
      const { event, data } = msg.payload
      if (event && !String(event).toLowerCase().includes('message')) return
      handleInbound(data).catch((e) =>
        console.error('[wa] error procesando mensaje en tiempo real:', e.message),
      )
    } catch (e) {
      console.error('[wa] error en evento de tiempo real:', e.message)
    }
  })

  socket.on('connect_error', (err) => {
    console.error('[wa] tiempo real: error de conexión:', err.message)
  })
  socket.on('disconnect', (reason) => {
    console.log(`[wa] tiempo real desconectado (${reason}); reintentando…`)
    // Cuando es el SERVIDOR (el Gateway) quien cierra la conexión
    // ("io server disconnect"), socket.io-client NO reconecta solo: hay que
    // volver a conectar nosotros. Lo hacemos con una pequeña espera.
    if (reason === 'io server disconnect') {
      setTimeout(() => {
        if (socket && !socket.connected) socket.connect()
      }, 5000)
    }
  })

  return socket
}

// Vuelve a suscribir si cambia la sesión resuelta.
export function resubscribe() {
  if (socket?.connected) {
    socket.emit('message', {
      type: 'subscribe',
      sessionId: waState.sessionId,
      events: ['message.received'],
    })
  }
}
