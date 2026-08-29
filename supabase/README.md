# Supabase — Base de datos y backend de Amonn

Aquí vive todo lo que corre en la nube: el esquema de la base de datos
(`migrations/`) y las funciones del agente de WhatsApp (`functions/`).

## Puesta en marcha (una sola vez)

1. **Crea un proyecto** en [supabase.com](https://supabase.com) (el plan
   gratuito sirve para empezar).

2. **Crea las tablas.** Abre *SQL Editor* en el panel de Supabase, pega el
   contenido de `migrations/0001_init.sql` y ejecútalo. (O con la CLI:
   `supabase db push`.)

3. **Conecta la app web.** En Supabase, *Project Settings → API*, copia la
   `Project URL` y la `anon public key` al archivo `app/.env`:

   ```
   VITE_SUPABASE_URL=https://TU-PROYECTO.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
   ```

   Reinicia `npm run dev`. La app dejará el "modo demo" y empezará a compartir
   datos entre todo el equipo en tiempo real.

4. **Invita a tu equipo.** Cada persona se registra con su email desde la
   pantalla de acceso. Se crea su perfil automáticamente; luego cada quien
   añade su teléfono en *Mi perfil* para recibir los avisos de WhatsApp.

5. **(Opcional) Activa WhatsApp.** Sigue `functions/README.md`.

## Estructura

```
supabase/
├── config.toml              Configuración del proyecto y funciones
├── migrations/
│   └── 0001_init.sql        Tablas, seguridad (RLS), triggers, realtime
└── functions/
    ├── _shared/             Envío de WhatsApp + interpretación de respuestas
    ├── whatsapp-reminders/  Cron: "¿Has completado la tarea X?"
    └── whatsapp-webhook/    Recibe las respuestas (SÍ/NO) y actualiza tareas
```
