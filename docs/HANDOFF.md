# HANDOFF — Amonn (tareas de equipo + WhatsApp, auto-alojado en NAS)

> Un solo archivo de traspaso. Se sobreescribe en cada cierre de sesión.
> Última actualización: 2026-09-03 (sesión remota de Claude Code).

## Estado real

- Rama: `claude/job-list-app-whatsapp-av9rwl`. PR **#1** (draft) → `main`, `mergeable_state: clean`.
- Prod (NAS UGREEN DXP6800 Pro, UGOS, `192.168.1.9`): **`/api/version` = `91fbbac` verificado el 2026-09-03 08:07** (login OK desde el iPhone por 5G). El proyecto `amonn` en UGOS lleva ahora **Watchtower** (`amonn-watchtower`, con `DOCKER_API_VERSION: '1.41'`): cada 5 min descarga `latest` si cambió y reinicia solo `amonn-server`. **Ya no hay que recrear el proyecto para actualizar**: basta con hacer push (CI publica `latest`).
- Cris tiene su teléfono guardado en Mi perfil (2026-09-02).

## En curso

Último push: **asistente de WhatsApp + avisos al asignar + email + preferencias** (ver "Hecho"). CI construye la imagen; Watchtower la aplicará en el NAS en ≤5 min tras publicarse. Verificar con `/api/version` (debe ser el SHA del último commit de la rama).

## Próximo paso concreto

1. Comprobar que `/api/version` en el NAS coincide con el HEAD de la rama (Watchtower lo aplica solo).
2. Cris escribe al número de WhatsApp de Amonn (el del OpenWA Gateway) desde su móvil: «hola» → debe responder el asistente. Luego «crea una tarea a mí: probar el asistente, para mañana» → aparece en la app. Si no responde: Protokoll de `amonn-server` (líneas `[asistente]`/`[wa]`).
3. Cris consigue (a) la clave de Gemini en https://aistudio.google.com/apikey y (b) la contraseña de aplicación de Gmail para `elpollotue@gmail.com`; se ponen en `GEMINI_API_KEY`, `SMTP_USER`, `SMTP_PASS` del compose en UGOS (**cambiar variables de entorno requiere recrear el proyecto**: Watchtower solo actualiza imágenes). Sin ellas, el asistente funciona con reglas y no se envían emails.
4. Añadir `APP_URL: http://192.168.1.9:8080` al compose del NAS (misma recreación que el punto 3) para que los avisos lleven enlace.

## Hecho en esta sesión (2026-09-03)

- Watchtower en `docker-compose.nas.yml` (+ fix `DOCKER_API_VERSION` porque el Docker de UGOS exige API ≥ 1.40).
- **Asistente de WhatsApp** (`server/src/assistant.js` + `inbound.js`): crear tareas en lenguaje normal ("crea una tarea a Luis: revisar la caldera, para el viernes", "necesito que Ana prepare X mañana urgente"), listar ("qué tengo abierto", "tareas de Luis", "tareas del equipo"), completar ("hecha la de la caldera"), sí/no a recordatorios, ayuda. Gemini si hay `GEMINI_API_KEY`; si no (o si falla), reglas en español (`parseWithRules`, probadas con 17 frases). Fechas en español en `dates.js`.
- **Aviso al asignar** (`notify.js`, `tasks.service.js`): al crear/reasignar una tarea a otra persona, WhatsApp y/o email según `users.notify_whatsapp` / `notify_email` (nuevas columnas, default true). Recordatorios también por email si hay SMTP.
- **Email** (`mailer.js`, nodemailer, SMTP Gmail con contraseña de aplicación). `publicUser` ahora incluye `email`.
- App: Mi perfil con interruptores WhatsApp/email y tarjeta explicando el asistente.
- Probado de punta a punta en local (Postgres 5433 + mock del Gateway): 12 mensajes correctos, `scratchpad/e2e.mjs`.

## Pendiente (por prioridad)

1. Probar el asistente en prod con el WhatsApp real (paso 2 de arriba).
2. Claves de Gemini y Gmail en el compose (paso 3). Recomendado Gemini: entiende variaciones que las reglas no.
3. Cuerpo del PR #1 desactualizado (habla de `waautomate`/QR): reescribir antes de sacarlo de draft.
4. Mejora futura: que el asistente pida confirmación antes de crear cuando la frase es ambigua; adjuntos/fotos por WhatsApp.

## Necesita a Cris (acciones humanas)

- Recrear el proyecto en UGOS (desde el navegador de un PC; la app del móvil solo muestra el compose) cuando haya que cambiar variables de entorno.
- Valores 🔴 del compose (contraseña BD, `JWT_SECRET`, `WA_API_KEY`, y ahora `GEMINI_API_KEY`, `SMTP_PASS`): los tiene Cris; **no van en este archivo**.
- Cris mencionó "una API con Google que ya juntamos con el OpenWA": no es visible desde aquí (está en su NAS/Gateway); Amonn necesita su propia clave en `GEMINI_API_KEY` (puede ser la misma clave si es de Google AI Studio).

## Red doméstica (cambió el 2026-09-02)

- Router nuevo: **UniFi Cloud Gateway Max (UCG Max)** en `192.168.1.1`, conectado directo al módem de internet. NAS ("NasBiaundCris", UGREEN NASync DXP6800 Pro) en el puerto 4 (2.5 GbE).
- **La IP del NAS cambió**: ya no es `192.168.254.163`; ahora es **`192.168.1.9`**, ya **fijada** ("Feste IP-Adresse") en UniFi el 2026-09-02, así que no cambiará.
- Acceso remoto propuesto: **Teleport VPN** del UCG Max + app **WiFiman** en el iPhone (no hace falta Tailscale ni abrir puertos). Posible doble NAT si el módem de la operadora también enruta → modo bridge si Teleport no conecta.
- Docker/compose no dependen de la IP del NAS (WA_API_URL usa el nombre de contenedor `openwa-api`): **no hay que redesplegar por el cambio de IP**.

## Gotchas de esta sesión (candidatos a CLAUDE.md si se repiten)

- **UGOS no re-descarga una etiqueta ya en caché** (`latest`) y editar + "Neu bereitstellen" no recreó el contenedor: por eso ahora hay Watchtower. Para cambios de **variables de entorno** sigue haciendo falta **borrar+crear** el proyecto.
- **Watchtower en UGOS** falla con `client version 1.25 is too old` si no se pone `DOCKER_API_VERSION: '1.41'` en su `environment`.
- **UGOS reimporta el compose viejo** si se crea el proyecto en la misma carpeta ("Die Compose-Konfiguration existiert bereits…"): usar carpeta nueva o borrar el `docker-compose.yml` viejo antes.
- **`crypto.randomUUID` solo existe en contexto seguro** (https/localhost). La app se abre por `http://IP`: cualquier API "secure-context-only" deja la pantalla en blanco. Probar siempre por IP no-localhost (repro: `scratchpad/repro_insecure.mjs` con Playwright).
- El OpenWA Gateway (`src/modules/events/events.gateway.ts`) envía `{type:'error',code,...}` antes de `disconnect()`; límites: 10 handshakes/min/IP, 16 sockets/key. `socket.io-client` **no** reconecta solo tras `io server disconnect`.
- Terminal de UGOS falla en `amonn-server`: la imagen es Alpine sin `/bin/bash` (usar `/bin/sh`).
- El PC Windows de Cris estaba en otra red (control remoto): no sirve para probar la LAN; usar el iPhone en WiFi de casa u otro dispositivo de casa.
