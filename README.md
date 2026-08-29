# Amonn · Tareas del equipo con avisos por WhatsApp

App web para gestionar las **tareas / trabajos abiertos** de la empresa: todo
el equipo puede escribir tareas, asignarlas a una persona, verlas en un
**calendario**, y un **agente de WhatsApp** envía recordatorios preguntando si
la tarea está completada — y actualiza el estado según la respuesta.

## ✨ Qué incluye

- **📋 Tablero de tareas** compartido (abiertas · en curso · completadas), con
  responsable, prioridad, fecha y buscador.
- **📅 Calendario** mensual con las tareas por fecha; clic en un día para crear.
- **👥 Equipo**: personas de la empresa, su teléfono y sus tareas abiertas.
- **⚙️ Perfil**: nombre, color y teléfono de WhatsApp.
- **🤖 Agente de WhatsApp**: recordatorios automáticos ("¿Has completado la
  tarea X?") y respuestas SÍ/NO que marcan la tarea desde el chat.
- **☁️ Datos compartidos en tiempo real** con Supabase (con **modo demo** para
  probar sin configurar nada).

## 🗂️ Estructura

```
app/         Aplicación web (React + Vite + TypeScript)
supabase/    Base de datos (SQL) y agente de WhatsApp (Edge Functions)
```

## 🚀 Empezar en 1 minuto (modo demo)

```bash
cd app
npm install
npm run dev
```

Abre la URL que muestra la terminal. Arranca en **modo demostración** con datos
de ejemplo (se guardan solo en tu navegador), así puedes ver todo funcionando
sin configurar la nube.

## ☁️ Pasar a producción (equipo real, tiempo real, WhatsApp)

1. **Base de datos y login del equipo** → sigue [`supabase/README.md`](supabase/README.md).
2. **Agente de WhatsApp** → sigue [`supabase/functions/README.md`](supabase/functions/README.md).

## 🛠️ Tecnología

- **Frontend:** React 19, Vite, TypeScript, React Router, date-fns.
- **Backend:** Supabase (Postgres + Auth + Realtime + Edge Functions en Deno).
- **WhatsApp:** Twilio o Meta Cloud API (intercambiable por configuración).

## 📌 Estado

MVP funcional. La app web está completa; el agente de WhatsApp está
implementado y listo para conectar en cuanto tengas la cuenta de Twilio o Meta
(ver la guía). Ideas de mejora: comentarios en tareas, adjuntos, roles/permisos
y notificaciones dentro de la app.
