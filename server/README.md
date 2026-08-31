# Amonn — Servidor (backend)

Node + Express (JavaScript, ESM). Expone la API de tareas, gestiona el login del
equipo, sirve la app web compilada y contiene el **agente de WhatsApp**:
recordatorios programados y webhook de respuestas. Para WhatsApp se conecta a un
**OpenWA Gateway** (open-wa.org) ya existente — no incluye su propio WhatsApp.

## Ejecutar en local

```bash
npm install
DATABASE_URL=postgres://amonn:amonn@localhost:5432/amonn WA_ENABLED=false npm run dev
```

Necesita un Postgres accesible. El esquema (`schema.sql`) se aplica solo al
arrancar. `WA_ENABLED=false` desactiva el envío real de WhatsApp (solo lo
registra en el log), útil para desarrollar sin el teléfono.

## Variables de entorno

| Variable | Por defecto | Descripción |
|---|---|---|
| `PORT` | `4000` | Puerto del servidor |
| `DATABASE_URL` | `postgres://amonn:amonn@localhost:5432/amonn` | Conexión a Postgres |
| `JWT_SECRET` | *(cámbialo)* | Secreto para firmar las sesiones |
| `WA_API_URL` | `http://localhost:2785` | URL del OpenWA Gateway |
| `WA_API_KEY` | *(vacío)* | Clave del Gateway (cabecera `X-API-Key`) |
| `WA_SESSION_ID` | `auto` | Id de la sesión; `auto` = la detecta sola |
| `WA_WEBHOOK_URL` | *(vacío)* | Si se pone, Amonn registra el webhook solo al arrancar |
| `WA_WEBHOOK_SECRET` | *(vacío)* | Secreto HMAC del webhook (si se pone, se verifica la firma) |
| `WA_ENABLED` | `true` | `false` desactiva el envío de WhatsApp |
| `REMINDER_CRON` | `0 9 * * 1-5` | Cuándo enviar recordatorios |
| `REMINDER_COOLDOWN_HOURS` | `20` | Horas mínimas entre avisos de una tarea |
| `TZ` | `Europe/Madrid` | Zona horaria del cron |

## API

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/api/auth/register` | Crear cuenta |
| POST | `/api/auth/login` | Iniciar sesión (devuelve token) |
| GET | `/api/auth/me` | Usuario actual |
| GET | `/api/tasks` | Listar tareas |
| POST | `/api/tasks` | Crear tarea |
| PATCH | `/api/tasks/:id` | Editar tarea |
| DELETE | `/api/tasks/:id` | Eliminar tarea |
| GET | `/api/profiles` | Listar equipo |
| PATCH | `/api/profiles/:id` | Editar el propio perfil |
| GET | `/api/events` | Tiempo real (SSE) |
| POST | `/api/reminders/run` | Disparar recordatorios (prueba) |
| POST | `/api/whatsapp/webhook` | Entrada de OpenWA (respuestas) |

## Mapa del código

```
src/
├── index.js        Arranque, montaje de rutas, SSE, estáticos
├── config.js       Configuración desde variables de entorno
├── db.js           Pool de Postgres + aplicación del esquema
├── auth.js         Registro/login, hash de contraseña, JWT
├── events.js       Hub de tiempo real (SSE)
├── whatsapp.js     Envío por OpenWA + interpretación de respuestas
├── reminders.js    Cron de recordatorios
├── util.js         Router async seguro + manejador de errores
└── routes/         auth · tasks · profiles · webhook
```
