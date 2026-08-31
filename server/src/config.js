// Configuración central leída de variables de entorno (definidas en el .env
// que usa docker-compose). Valores por defecto pensados para desarrollo local.

export const config = {
  port: Number(process.env.PORT ?? 4000),

  // Base de datos Postgres
  databaseUrl:
    process.env.DATABASE_URL ??
    'postgres://amonn:amonn@localhost:5432/amonn',

  // Secreto para firmar los tokens de sesión (JWT). CÁMBIALO en producción.
  jwtSecret: process.env.JWT_SECRET ?? 'cambia-esto-en-produccion',
  jwtExpiresIn: '30d',

  // ─── WhatsApp: OpenWA Gateway (open-wa.org) ──────────────
  // Amonn se conecta a un OpenWA - WhatsApp API Gateway ya existente
  // (self-hosted). No incluye su propio WhatsApp: reutiliza tu Gateway.
  whatsapp: {
    // URL base del Gateway. Ej: http://IP-DEL-NAS:2785  (o el nombre del
    // contenedor si comparten red docker, ej: http://openwa-api:2785).
    apiUrl: process.env.WA_API_URL ?? 'http://localhost:2785',
    // Clave del Gateway (cabecera X-API-Key). La ves en su panel o en data/.api-key.
    apiKey: process.env.WA_API_KEY ?? '',
    // Id de la sesión de WhatsApp dentro del Gateway. Si es "auto" (o vacío),
    // Amonn la detecta sola preguntando al Gateway (GET /api/sessions).
    sessionId: process.env.WA_SESSION_ID ?? 'auto',
    // URL a la que el Gateway debe enviar los mensajes entrantes (webhook).
    // Si se pone, Amonn registra el webhook solo al arrancar. En docker suele
    // ser el nombre del contenedor: http://amonn-server:4000/api/whatsapp/webhook
    // (Alternativa al tiempo real; normalmente se deja vacío y se usa realtime.)
    webhookUrl: process.env.WA_WEBHOOK_URL ?? '',
    // Recibir mensajes en tiempo real por Socket.IO (namespace /events). Es la
    // vía recomendada: no necesita webhook ni abrir puertos. true por defecto.
    realtime: process.env.WA_REALTIME !== 'false',
    // Secreto del webhook (para verificar la firma HMAC de los mensajes que
    // entran). Debe coincidir con el "secret" que pongas al crear el webhook.
    // Si se deja vacío, no se verifica la firma.
    webhookSecret: process.env.WA_WEBHOOK_SECRET ?? '',
    // Si es false, el agente de WhatsApp queda desactivado (útil para probar
    // solo la app web sin conectar WhatsApp todavía).
    enabled: process.env.WA_ENABLED !== 'false',
  },

  // Cron de recordatorios (formato cron). Por defecto: L-V a las 9:00.
  reminderCron: process.env.REMINDER_CRON ?? '0 9 * * 1-5',
  // Horas mínimas entre dos recordatorios de la misma tarea.
  reminderCooldownHours: Number(process.env.REMINDER_COOLDOWN_HOURS ?? 20),
  // Zona horaria para el cron.
  timezone: process.env.TZ ?? 'Europe/Madrid',
}
