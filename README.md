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
- **🤖 Agente de WhatsApp (OpenWA)**: recordatorios automáticos ("¿Has
  completado la tarea X?") y respuestas SÍ/NO que actualizan la tarea desde el
  chat, usando **tu propio número** (sin costes ni verificación de Meta).
- **⚡ Tiempo real**: los cambios aparecen al instante en todos los navegadores.

## 🏗️ Arquitectura (3 contenedores en el NAS)

```
┌─────────────┐     ┌──────────────────────┐     ┌──────────────────┐
│  Postgres   │◄────│  Servidor (API+web)  │◄────│  OpenWA (WhatsApp)│
│  (db)       │     │  Node + Express      │     │  tu número (QR)   │
│  tareas     │     │  sirve la app web    │     │                   │
└─────────────┘     └──────────────────────┘     └──────────────────┘
        └───────── datos guardados en ./data del NAS ─────────┘
```

## 🗂️ Estructura del proyecto

```
app/        Aplicación web (React + Vite + TypeScript)
server/     Backend: API de tareas + agente de WhatsApp (Node)
deploy/     Guía de instalación en el NAS
Dockerfile          Imagen de la app+servidor
docker-compose.yml  Los 3 contenedores juntos
.env.example        Configuración (contraseñas, puerto…)
```

## 🚀 Instalar en tu NAS Ugreen

Sigue la guía paso a paso: **[deploy/README-NAS.md](deploy/README-NAS.md)**.

Resumen:
```bash
cp .env.example .env      # pon tus contraseñas
docker compose up -d      # arranca todo
# abre http://IP-DEL-NAS:8080  y escanea el QR de WhatsApp (ver la guía)
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

OpenWA es una integración **no oficial** (automatiza WhatsApp Web) — gratis y
con tu número, pero con un pequeño riesgo de bloqueo del número. Detalles y
alternativa oficial en la [guía del NAS](deploy/README-NAS.md#️-aviso-sobre-whatsapp-openwa).

## 📌 Estado

MVP funcional y probado de punta a punta (app + API + base de datos + flujo de
WhatsApp). Ideas de mejora: comentarios/adjuntos en tareas, roles/permisos,
notificaciones dentro de la app y panel de estado del agente de WhatsApp.
