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

  // ─── Adjuntos (fotos de obra, PDFs) ──────────────────────────
  // Directorio donde se guardan. DEBE apuntar a un volumen del contenedor:
  // sin volumen, los ficheros se pierden cuando Watchtower lo recrea. Si no
  // se define, los adjuntos quedan desactivados a propósito (los
  // comentarios de texto siguen funcionando).
  uploadDir: process.env.UPLOAD_DIR ?? '',
  // Whisper en el NAS para las notas de voz. Vacío = sin transcripción.
  whisperUrl: (process.env.WHISPER_URL ?? '').replace(/\/$/, ''),
  // Contratos desde una plantilla de Google Docs. Sin credenciales, la
  // orden «contrato para …» explica qué falta en vez de activarse.
  google: {
    // Clave JSON de la cuenta de servicio (el fichero entero, en una sola
    // variable: tal cual o en base64). Hay que compartir la plantilla y la
    // carpeta con el correo ...@...iam.gserviceaccount.com de esa cuenta.
    serviceAccountKey: process.env.GOOGLE_SA_KEY ?? '',
    // Id del Google Doc plantilla (lo que va entre /d/ y /edit en su URL).
    contractTemplateId: process.env.GOOGLE_CONTRACT_TEMPLATE_ID ?? '',
    // Carpeta de Drive donde dejar los contratos generados (opcional).
    contractsFolderId: process.env.GOOGLE_CONTRACTS_FOLDER_ID ?? '',
  },
  // PreisPilot: el motor de precios de Casa Reto (Supabase, proyecto
  // hansamonn-vermietung). Su función `dashboard` es pública, por eso la
  // URL puede ir aquí como valor por defecto: no es un secreto.
  preispilot: {
    dashboardUrl: process.env.PREISPILOT_URL ??
      'https://teioztcidolgyqlwzlrb.supabase.co/functions/v1/dashboard',
  },
  // Apaleo (el sistema del hotel). Sin credenciales, no se activa.
  apaleo: {
    clientId: process.env.APALEO_CLIENT_ID ?? '',
    clientSecret: process.env.APALEO_CLIENT_SECRET ?? '',
    propertyId: process.env.APALEO_PROPERTY_ID ?? '',
  },
  // Vigilante del buzón. Sin estos datos, simplemente no se activa.
  mailWatch: {
    host: process.env.MAIL_HOST ?? '',
    port: Number(process.env.MAIL_PORT ?? 993),
    user: process.env.MAIL_USER ?? '',
    pass: process.env.MAIL_PASS ?? '',
    buzon: process.env.MAIL_BOX ?? 'INBOX',
    avisarA: process.env.MAIL_NOTIFY_TO ?? '',
  },

  // ─── Asistente (entiende los mensajes de WhatsApp en lenguaje normal) ───
  // Con GEMINI_API_KEY usa Google Gemini para interpretar "crea una tarea a
  // Cristian: … para el viernes". Sin clave, usa reglas sencillas (funciona,
  // pero entiende menos variaciones).
  gemini: {
    apiKey: process.env.GEMINI_API_KEY ?? '',
    model: process.env.GEMINI_MODEL ?? 'gemini-2.5-flash',
  },

  // ─── Email (avisos por correo) ─────────────────────────────
  // Con SMTP_USER + SMTP_PASS se activan los avisos por email. Para Gmail:
  // SMTP_USER = tu@gmail.com y SMTP_PASS = "contraseña de aplicación".
  mail: {
    host: process.env.SMTP_HOST ?? 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT ?? 465),
    user: process.env.SMTP_USER ?? '',
    pass: process.env.SMTP_PASS ?? '',
    from: process.env.MAIL_FROM ?? process.env.SMTP_USER ?? '',
    get enabled() {
      return Boolean(this.user && this.pass)
    },
  },

  // URL pública de la app (para poner enlaces en los avisos). Ej: http://192.168.1.9:8080
  appUrl: (process.env.APP_URL ?? '').replace(/\/+$/, ''),

  // Cron de recordatorios (formato cron). Por defecto: L-V a las 9:00.
  reminderCron: process.env.REMINDER_CRON ?? '0 9 * * 1-5',
  // Horas mínimas entre dos recordatorios de la misma tarea.
  reminderCooldownHours: Number(process.env.REMINDER_COOLDOWN_HOURS ?? 20),
  // Zona horaria para el cron.
  timezone: process.env.TZ ?? 'Europe/Madrid',
}
