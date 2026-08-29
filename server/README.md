# Amonn — Servidor (backend)

Node + Express (JavaScript, ESM). Expone la API de tareas, gestiona el login del
equipo, sirve la app web compilada y contiene el **agente de WhatsApp** (OpenWA):
recordatorios programados y webhook de respuestas.

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
| `WA_API_URL` | `http://localhost:8080` | URL de OpenWA (EASY API) |
| `WA_API_KEY` | *(vacío)* | Clave de OpenWA (flag `-k`) |
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
