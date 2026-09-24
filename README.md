# Amonn · Tareas del equipo con WhatsApp — 100% auto-alojado

App web para gestionar los **trabajos abiertos** de la empresa: todo el equipo
escribe tareas, las asigna a una persona, las ve en un **calendario**, y un
**agente de WhatsApp** pregunta si están completadas y actualiza el estado según
la respuesta.

**Todo corre en tu NAS.** La base de datos (donde viven las tareas), la app y el
agente de WhatsApp funcionan con Docker en tu propio servidor. **Tus datos nunca
salen de casa.**

## ✨ Qué incluye

- **📋 Tablero de tareas** compartido (abiertas · en curso · completadas), con
  responsable, prioridad, fecha, buscador y filtro por persona.
- **📅 Calendario** mensual con las tareas por fecha.
- **👥 Equipo** y **⚙️ Perfil** (con el teléfono de WhatsApp de cada uno).
- **🤖 Agente de WhatsApp**: recordatorios automáticos ("¿Has completado la
  tarea X?") y respuestas SÍ/NO que actualizan la tarea desde el chat. Se conecta
  a un **OpenWA Gateway** (open-wa.org) que ya tengas, usando **tu propio número**.
- **⚡ Tiempo real**: los cambios aparecen al instante en todos los navegadores.

## 🏗️ Arquitectura (2 contenedores + tu OpenWA Gateway)

```
┌─────────────┐     ┌──────────────────────┐     ┌────────────────────────┐
│  Postgres   │◄────│  Servidor (API+web)  │◄───►│  OpenWA Gateway         │
│  (db)       │     │  Node + Express      │ API │  (open-wa.org, ya tuyo) │
│  tareas     │     │  sirve la app web    │ HTTP│  vinculado a tu número  │
└─────────────┘     └──────────────────────┘     └────────────────────────┘
        └──── datos en ./data del NAS ────┘         (Socket.IO en tiempo real)
```

Amonn no incluye su propio WhatsApp: **reutiliza un OpenWA Gateway existente**
vía su API HTTP (envío de recordatorios) y **Socket.IO en tiempo real** (las
respuestas SÍ/NO). Así no hay que escanear un QR nuevo si tu Gateway ya está
vinculado, ni abrir puertos ni configurar webhooks.

## 🗂️ Estructura del proyecto

```
app/        Aplicación web (React + Vite + TypeScript)
server/     Backend: API de tareas + integración con el OpenWA Gateway (Node)
deploy/     Guía de instalación en el NAS
Dockerfile              Imagen de la app+servidor
docker-compose.nas.yml  Para pegar en la GUI del NAS (usa la imagen publicada)
docker-compose.yml      Versión que compila desde el código (db + server)
.env.example            Configuración (contraseñas, datos del Gateway…)
```

## 🚀 Instalar en tu NAS Ugreen

Sigue la guía paso a paso: **[deploy/README-NAS.md](deploy/README-NAS.md)**.

Resumen:
```bash
cp .env.example .env      # pon tus contraseñas y los datos de tu OpenWA Gateway
docker compose up -d      # arranca db + server
# abre http://IP-DEL-NAS:8080  y regístrate (WhatsApp se conecta solo, ver guía)
```

## 🧪 Probar en tu ordenador (modo demo, sin backend)

```bash
cd app
npm install
echo "VITE_DEMO=true" > .env
npm run dev
```
Arranca con datos de ejemplo (guardados solo en el navegador) para ver la app
sin montar nada.

## 🛠️ Desarrollo local con el backend completo

```bash
# Terminal 1 — base de datos (necesitas Docker o un Postgres local)
docker run -e POSTGRES_USER=amonn -e POSTGRES_PASSWORD=amonn -e POSTGRES_DB=amonn -p 5432:5432 postgres:16-alpine

# Terminal 2 — servidor
cd server && npm install && DATABASE_URL=postgres://amonn:amonn@localhost:5432/amonn WA_ENABLED=false npm run dev

# Terminal 3 — frontend (proxy a :4000 ya configurado)
cd app && npm install && npm run dev
```

## 🔒 Sobre WhatsApp

Amonn se conecta a un **OpenWA Gateway** (open-wa.org), que es una integración
**no oficial** de WhatsApp (motor Baileys) — gratis y con tu número, pero con un
pequeño riesgo de bloqueo del número. Configura `WA_API_URL` y `WA_API_KEY`
(la sesión se detecta sola; ver `.env.example`). Detalles en la
[guía del NAS](deploy/README-NAS.md#️-aviso-sobre-whatsapp-openwa-gateway).

## 📌 Estado

MVP funcional y probado de punta a punta (app + API + base de datos + flujo de
WhatsApp). Ideas de mejora: comentarios/adjuntos en tareas, roles/permisos,
notificaciones dentro de la app y panel de estado del agente de WhatsApp.
