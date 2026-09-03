import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import express from 'express'
import cors from 'cors'
import { config } from './config.js'
import { initDb } from './db.js'
import { addClient } from './events.js'
import { requireAuth } from './auth.js'
import { authRouter } from './routes/auth.js'
import { tasksRouter } from './routes/tasks.js'
import { profilesRouter } from './routes/profiles.js'
import { aliasesRouter } from './routes/aliases.js'
import { statesRouter } from './routes/states.js'
import { subtasksRouter } from './routes/subtasks.js'
import { webhookRouter } from './routes/webhook.js'
import { scheduleReminders, runReminders } from './reminders.js'
import {
  resolveSession,
  ensureWebhookRegistered,
  getSessionStatus,
  startSessionWatch,
} from './whatsapp.js'
import { connectRealtime, realtimeConnected } from './realtime.js'
import { mailEnabled } from './mailer.js'
import { errorHandler } from './util.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()

app.use(cors())
// Guardamos el cuerpo crudo para poder verificar la firma HMAC del webhook.
app.use(
  express.json({
    limit: '1mb',
    verify: (req, _res, buf) => {
      req.rawBody = buf
    },
  }),
)

// ─── API ──────────────────────────────────────────────────
app.get('/api/health', (_req, res) => res.json({ ok: true }))
// Qué versión está corriendo (SHA del commit inyectado al construir la imagen).
app.get('/api/version', (_req, res) => {
  const sha = process.env.APP_VERSION ?? 'dev'
  res.json({ version: sha.slice(0, 7), sha })
})

app.use('/api/auth', authRouter)
app.use('/api/tasks', tasksRouter)
app.use('/api/profiles', profilesRouter)
app.use('/api/aliases', aliasesRouter)
app.use('/api/states', statesRouter)
// Los pasos cuelgan de /api/tasks/:id/subtasks y de /api/subtasks/:id.
app.use('/api', subtasksRouter)

// OpenWA envía aquí las respuestas entrantes (webhook, sin auth de usuario).
app.use('/api/whatsapp/webhook', webhookRouter)

// Tiempo real (SSE): el navegador se suscribe a los cambios de tareas.
app.get('/api/events', requireAuth, (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  })
  res.flushHeaders?.()
  res.write('data: connected\n\n')
  addClient(res)
})

// Disparar recordatorios manualmente (para probar).
app.post('/api/reminders/run', requireAuth, async (_req, res) => {
  try {
    const result = await runReminders()
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Estado de WhatsApp (¿sigue vinculado el número?) para mostrarlo en la app.
app.get('/api/whatsapp/status', requireAuth, async (_req, res) => {
  const base = {
    enabled: config.whatsapp.enabled,
    realtime: realtimeConnected(),
    assistant: config.gemini.apiKey ? 'gemini' : 'reglas',
    email: mailEnabled(),
  }
  if (!config.whatsapp.enabled) return res.json({ ...base, connected: false, status: 'desactivado' })
  try {
    res.json({ ...base, ...(await getSessionStatus()) })
  } catch (err) {
    res.json({ ...base, connected: false, status: 'sin conexión con el Gateway', error: err.message })
  }
})

// ─── Frontend estático ────────────────────────────────────
const publicDir = process.env.PUBLIC_DIR ?? path.join(__dirname, '..', 'public')
if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir))
  // SPA: cualquier ruta no-API devuelve index.html.
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next()
    res.sendFile(path.join(publicDir, 'index.html'))
  })
}

// Manejador final de errores (evita que cualquier fallo tumbe el servidor).
app.use(errorHandler)

// ─── Arranque ─────────────────────────────────────────────
async function start() {
  await initDb()
  scheduleReminders()
  app.listen(config.port, () => {
    console.log(`[amonn] servidor escuchando en el puerto ${config.port}`)
    console.log(`[amonn] WhatsApp ${config.whatsapp.enabled ? 'activado' : 'desactivado'}`)
  })
  // Configuración automática de WhatsApp (best-effort: no debe tumbar el arranque).
  if (config.whatsapp.enabled) {
    setupWhatsApp()
  }
}

// Detecta la sesión y registra el webhook en el Gateway. Reintenta de forma
// indefinida (con espera creciente, tope 60s) por si el Gateway aún está
// arrancando o se reinicia: así WhatsApp se reconecta solo, sin rendirse nunca.
async function setupWhatsApp(attempt = 1) {
  try {
    await resolveSession()
  } catch (err) {
    const delay = Math.min(60_000, 5_000 * attempt)
    console.error(
      `[wa] no pude conectar con el Gateway (intento ${attempt}): ${err.message}. ` +
        `Reintento en ${Math.round(delay / 1000)}s`,
    )
    setTimeout(() => setupWhatsApp(attempt + 1), delay)
    return
  }
  // Tiempo real (recomendado): recibe los mensajes por Socket.IO.
  connectRealtime()
  // Vigila que el teléfono siga vinculado y avisa en cuanto deje de estarlo.
  startSessionWatch()
  // Webhook (opcional y alternativo): solo si se configura una URL de destino.
  // Su fallo no afecta al tiempo real.
  if (config.whatsapp.webhookUrl) {
    ensureWebhookRegistered().catch((err) =>
      console.error(`[wa] no pude registrar el webhook (opcional): ${err.message}`),
    )
  }
}

// Red de seguridad: un fallo suelto (p. ej. en la conexión con el Gateway de
// WhatsApp) NUNCA debe tumbar el servidor web. Lo registramos y seguimos.
process.on('unhandledRejection', (reason) => {
  console.error('[amonn] promesa no gestionada (ignorada para no tumbar el servidor):', reason)
})
process.on('uncaughtException', (err) => {
  console.error('[amonn] excepción no capturada (ignorada para no tumbar el servidor):', err)
})

start().catch((err) => {
  console.error('[amonn] error al arrancar:', err)
  process.exit(1)
})
