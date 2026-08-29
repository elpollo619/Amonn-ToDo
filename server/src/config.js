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

  // ─── WhatsApp / OpenWA ───────────────────────────────────
  whatsapp: {
    // URL interna del contenedor de OpenWA (EASY API). En docker-compose el
    // host es el nombre del servicio: "waautomate".
    apiUrl: process.env.WA_API_URL ?? 'http://localhost:8080',
    // Debe coincidir con la clave con la que arranca OpenWA (flag -k).
    apiKey: process.env.WA_API_KEY ?? '',
    // Si es false, el agente de WhatsApp queda desactivado (útil para probar
    // solo la app web sin conectar el teléfono todavía).
    enabled: process.env.WA_ENABLED !== 'false',
  },

  // Cron de recordatorios (formato cron). Por defecto: L-V a las 9:00.
  reminderCron: process.env.REMINDER_CRON ?? '0 9 * * 1-5',
  // Horas mínimas entre dos recordatorios de la misma tarea.
  reminderCooldownHours: Number(process.env.REMINDER_COOLDOWN_HOURS ?? 20),
  // Zona horaria para el cron.
  timezone: process.env.TZ ?? 'Europe/Madrid',
}
