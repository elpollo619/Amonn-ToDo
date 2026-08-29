// Hub de eventos en tiempo real mediante SSE (Server-Sent Events).
// Cuando una tarea cambia, avisamos a todos los navegadores conectados para
// que refresquen la lista al instante (sin recargar la página).

const clients = new Set()

export function addClient(res) {
  clients.add(res)
  res.on('close', () => clients.delete(res))
}

export function broadcast(event = 'tasks') {
  for (const res of clients) {
    try {
      res.write(`data: ${event}\n\n`)
    } catch {
      clients.delete(res)
    }
  }
}
