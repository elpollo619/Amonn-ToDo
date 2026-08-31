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
import { webhookRouter } from './routes/webhook.js'
import { scheduleReminders, runReminders } from './reminders.js'
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

app.use('/api/auth', authRouter)
app.use('/api/tasks', tasksRouter)
app.use('/api/profiles', profilesRouter)

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
}

start().catch((err) => {
  console.error('[amonn] error al arrancar:', err)
  process.exit(1)
})
