# 🤖 Agente de WhatsApp — Guía de configuración

Este directorio contiene las dos Edge Functions que forman el "agente" de
WhatsApp de Amonn:

| Función | Qué hace |
|---|---|
| `whatsapp-reminders` | Recorre las tareas abiertas que vencen y envía un WhatsApp preguntando *"¿Has completado la tarea X?"*. Se ejecuta programada (cron). |
| `whatsapp-webhook` | Recibe las respuestas del equipo (SÍ/NO) y marca la tarea como completada o la deja abierta. |

Funciona con **Twilio** (recomendado para empezar) o con la **Meta Cloud API**.
Elige el proveedor con la variable `WHATSAPP_PROVIDER`.

---

## 1. Requisitos previos

- Un proyecto de Supabase (ver `../README.md`).
- La [CLI de Supabase](https://supabase.com/docs/guides/cli) instalada y
  enlazada al proyecto: `supabase link --project-ref TU_REF`.
- Una cuenta de WhatsApp Business API (Twilio o Meta).

---

## 2. Variables de entorno (secrets)

Configúralas con la CLI. **No** hace falta poner `SUPABASE_URL` ni
`SUPABASE_SERVICE_ROLE_KEY`: Supabase las inyecta automáticamente.

### Opción A — Twilio (recomendada para empezar)

```bash
supabase secrets set \
  WHATSAPP_PROVIDER=twilio \
  TWILIO_ACCOUNT_SID=ACxxxxxxxx \
  TWILIO_AUTH_TOKEN=xxxxxxxx \
  TWILIO_WHATSAPP_FROM="whatsapp:+14155238886" \
  REMINDER_SECRET="una-frase-larga-secreta"
```

Para probar sin dar de alta un número, usa el **Sandbox de WhatsApp** de Twilio
(Console → Messaging → Try it out → WhatsApp). El número `+14155238886` es el
del sandbox y el equipo debe unirse enviando el código `join <palabra>` una vez.

En el sandbox puedes enviar texto libre; en producción, para **iniciar** una
conversación (los recordatorios), necesitas una **plantilla aprobada**. Si usas
plantilla, añade y activa:

```bash
supabase secrets set WHATSAPP_USE_TEMPLATE=true TWILIO_TEMPLATE_SID=HXxxxxxxxx
```

### Opción B — Meta Cloud API

```bash
supabase secrets set \
  WHATSAPP_PROVIDER=meta \
  META_PHONE_NUMBER_ID=xxxxxxxx \
  META_ACCESS_TOKEN=xxxxxxxx \
  META_VERIFY_TOKEN="un-token-de-verificacion" \
  META_TEMPLATE_NAME=tarea_recordatorio \
  META_TEMPLATE_LANG=es \
  WHATSAPP_USE_TEMPLATE=true \
  REMINDER_SECRET="una-frase-larga-secreta"
```

---

## 3. Desplegar las funciones

```bash
supabase functions deploy whatsapp-webhook
supabase functions deploy whatsapp-reminders
```

Las URLs quedan así:
`https://TU_REF.functions.supabase.co/whatsapp-webhook`

---

## 4. Conectar el webhook (respuestas entrantes)

- **Twilio:** Console → tu número/Sandbox de WhatsApp → *"When a message comes
  in"* → pega la URL de `whatsapp-webhook` (método `POST`).
- **Meta:** WhatsApp → Configuration → Webhook → Callback URL = la URL de
  `whatsapp-webhook`, Verify token = `META_VERIFY_TOKEN`. Suscríbete al campo
  `messages`.

---

## 5. Programar los recordatorios (cron)

Ejecuta `whatsapp-reminders` cada cierto tiempo. La forma más sencilla es con
`pg_cron` + `pg_net` desde el SQL Editor de Supabase (una sola vez):

```sql
select cron.schedule(
  'amonn-recordatorios',
  '0 9 * * 1-5',   -- de lunes a viernes a las 9:00
  $$
  select net.http_post(
    url     := 'https://TU_REF.functions.supabase.co/whatsapp-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-reminder-secret', 'una-frase-larga-secreta'
    )
  );
  $$
);
```

> Requiere activar las extensiones `pg_cron` y `pg_net` (Database → Extensions).

También puedes llamarla manualmente para probar:

```bash
curl -X POST https://TU_REF.functions.supabase.co/whatsapp-reminders \
  -H "x-reminder-secret: una-frase-larga-secreta"
```

---

## 6. Cómo funciona la conversación

1. El cron dispara `whatsapp-reminders`.
2. Busca tareas **abiertas o en curso**, con **fecha de hoy o vencida**, cuyo
   responsable tiene **teléfono** y a las que no se recordó en las últimas 20 h.
3. Envía: *"Hola Ana 👋 ¿Has completado la tarea 'Revisar nave 3'? Responde SÍ o NO."*
4. La persona responde por WhatsApp. `whatsapp-webhook` interpreta la respuesta
   (`SÍ`, `hecho`, `listo`… → completada; `NO`, `pendiente`… → sigue abierta) y
   actualiza la tarea. Los cambios aparecen al instante en la app.

Puedes ajustar el texto y la lógica en `whatsapp-reminders/index.ts`,
`whatsapp-webhook/index.ts` y `_shared/`.
