import { Router } from 'express'

// Envuelve un manejador async para que los errores no tumben el servidor,
// sino que pasen al middleware de errores (Express 4 no lo hace solo).
export const ah = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next)

// Router cuyos métodos (get/post/patch/delete/put) envuelven automáticamente
// los manejadores con `ah`, de modo que ningún error async tumbe el proceso.
export function asyncRouter() {
  const router = Router()
  for (const verb of ['get', 'post', 'put', 'patch', 'delete']) {
    const original = router[verb].bind(router)
    router[verb] = (path, ...handlers) =>
      original(path, ...handlers.map((h) => (h.length >= 4 ? h : ah(h))))
  }
  return router
}

// Middleware final de errores.
export function errorHandler(err, _req, res, _next) {
  // 22P02 = texto inválido para el tipo (ej. un UUID mal formado en la URL).
  if (err?.code === '22P02') {
    return res.status(400).json({ error: 'Identificador no válido' })
  }
  console.error('[error]', err?.message ?? err)
  res.status(500).json({ error: 'Error interno del servidor' })
}
