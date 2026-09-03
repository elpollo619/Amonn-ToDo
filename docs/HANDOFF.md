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

0. Verificar que con el último HEAD el Protokoll de `amonn-server` muestre `tiempo real suscrito a ["message.received"]` y ya no el bucle `UNAUTHORIZED: API key is no longer valid` (carrera del Gateway, ver Gotchas).
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

## 🖥️ Sesión LOCAL en el PC de Cris (misma red que el NAS) — instrucciones para Claude Code

Cris tiene Claude Code instalado en su PC de casa. Desde ahí SÍ se llega al NAS
(`192.168.1.9`). Objetivo de la sesión local: **operar el NAS directamente sin
pedir capturas a Cris**. Cris es no técnico y escribe en español: hablarle en
español, un paso cada vez, y hacer uno mismo todo lo que se pueda por consola.

### 1. Preparar el repo
```
git clone https://github.com/elpollo619/Amonn-ToDo
cd Amonn-ToDo
git checkout claude/job-list-app-whatsapp-av9rwl
```
Leer este archivo entero antes de tocar nada.

### 2. Acceso al NAS por SSH
- Si `ssh` no entra: en UGOS (navegador) → Systemsteuerung / Panel de control → **Terminal** → activar **SSH** (puerto 22). Usuario = el administrador de UGOS (Cris lo sabe). Docker requiere `sudo`.
- Comprobar: `ssh USUARIO@192.168.1.9 'sudo docker ps'` → deben verse `amonn-server`, `amonn-db-1`, `amonn-watchtower`, `openwa-api`.
- Compose de Amonn en el NAS: carpeta compartida `docker` → probablemente `/volume1/docker/docker-compose.yaml` (contiene los secretos reales; **no copiarlo al repo**). El proyecto se creó desde la GUI de UGOS con nombre `amonn`; si se recrea por CLI usar `sudo docker compose -p amonn -f /volume1/docker/docker-compose.yaml up -d`.
- Sin SSH, alternativa peor: la GUI de UGOS (Docker → Container → Terminal) — `amonn-server` es Alpine (`/bin/sh`), `openwa-api` tiene `/bin/bash`.

### 3. Comandos de diagnóstico
```
curl -s http://192.168.1.9:8080/api/version          # versión que corre (SHA corto)
ssh USUARIO@192.168.1.9 'sudo docker logs --tail 80 amonn-server'
ssh USUARIO@192.168.1.9 'sudo docker logs --tail 40 openwa-api'
ssh USUARIO@192.168.1.9 'sudo docker logs --tail 20 amonn-watchtower'
```
Estado bueno en `amonn-server`: `[wa] sesión seleccionada: 8baec4ba-…` y
`[wa] tiempo real suscrito a ["message.received"]`. Estado malo (problema
abierto al cerrar esta sesión): bucle `el Gateway devolvió UNAUTHORIZED: API
key is no longer valid` → ver Gotchas (carrera del Gateway). La clave
`WA_API_KEY` ES válida (verificado en `api_keys` de `/app/data/main.sqlite`
del contenedor `openwa-api`: activa, sin caducidad, sin IPs).

### 4. Problema abierto y cómo seguir
1. Confirmar con `docker logs amonn-server` si tras `ede447f` (espera 2 s → 4 → 8 → 15 s antes de suscribirse) llega a `tiempo real suscrito`. Cris dijo "sigue lo mismo" pero sin captura: verificar.
2. Si sigue fallando incluso con 15 s: mirar en `docker logs openwa-api` si ahora "Client connected" aparece ANTES de "Client disconnected" (entonces NO es la carrera: `validateApiKey` lanza en la ruta WebSocket; comparar `resolveClientIp` de `events.gateway.js` con `getClientIp` de `api-key.guard.js`, y probar a quitar `extraHeaders` dejando solo `auth.apiKey`, o al revés).
3. Prueba directa del canal desde el NAS (sin Amonn): un script Node con `socket.io-client` dentro de `amonn-server` (`docker exec -it amonn-server sh`, `node -e ...` con `/app/node_modules`) que conecte a `http://openwa-api:2785/events`, espere N s y envíe el subscribe; ver qué responde.
4. Plan B si el tiempo real no es fiable: sondeo (polling) por REST cada 10 s de los mensajes recientes de la sesión (el Gateway tiene `GET /api/sessions/:id/messages/:chatId/history`; ver `/app/dist/modules` para un listado global) o webhook a un nombre no privado (el Gateway bloquea destinos internos por SSRF: "Destination address is not allowed").
5. Después: probar el asistente escribiendo «hola» al número desde el móvil de Cris; crear tarea por WhatsApp; comprobar aviso al asignar.

### 5. Cambios de configuración en el NAS
- Imagen: automática (Watchtower cada 5 min tras cada push a la rama; CI publica `latest`).
- Variables (`GEMINI_API_KEY`, `SMTP_USER`, `SMTP_PASS`, `APP_URL`, `WA_API_KEY`…): editar el compose del NAS y recrear: `sudo docker compose -p amonn -f /volume1/docker/docker-compose.yaml up -d` (la GUI de UGOS con "Neu bereitstellen" NO aplicó cambios de entorno). Los datos están en `./data/pgdata` junto al compose: no borrar.
- Claves que faltan y debe conseguir Cris: Gemini (https://aistudio.google.com/apikey) y contraseña de aplicación de Gmail para `elpollotue@gmail.com`.

## Red doméstica (cambió el 2026-09-02)

- Router nuevo: **UniFi Cloud Gateway Max (UCG Max)** en `192.168.1.1`, conectado directo al módem de internet. NAS ("NasBiaundCris", UGREEN NASync DXP6800 Pro) en el puerto 4 (2.5 GbE).
- **La IP del NAS cambió**: ya no es `192.168.254.163`; ahora es **`192.168.1.9`**, ya **fijada** ("Feste IP-Adresse") en UniFi el 2026-09-02, así que no cambiará.
- Acceso remoto propuesto: **Teleport VPN** del UCG Max + app **WiFiman** en el iPhone (no hace falta Tailscale ni abrir puertos). Posible doble NAT si el módem de la operadora también enruta → modo bridge si Teleport no conecta.
- Docker/compose no dependen de la IP del NAS (WA_API_URL usa el nombre de contenedor `openwa-api`): **no hay que redesplegar por el cambio de IP**.

## Gotchas de esta sesión (candidatos a CLAUDE.md si se repiten)

- **UGOS no re-descarga una etiqueta ya en caché** (`latest`) y editar + "Neu bereitstellen" no recreó el contenedor: por eso ahora hay Watchtower. Para cambios de **variables de entorno** sigue haciendo falta **borrar+crear** el proyecto.
- **Carrera en el OpenWA Gateway** (`events.gateway.js` `handleConnection`): valida la API key con `await` y solo después guarda `client.data.rawApiKey`; si la suscripción llega antes, responde `UNAUTHORIZED "API key is no longer valid"` y desconecta (en su log: "Client disconnected" ANTES de "Client connected"). La clave NO es el problema (tabla `api_keys` en `/app/data/main.sqlite`, leída con `sqlite3` de `/app/node_modules`). Amonn espera 2 s (hasta 15 s) tras conectar antes de suscribirse (`realtime.js`).
- **Watchtower en UGOS** falla con `client version 1.25 is too old` si no se pone `DOCKER_API_VERSION: '1.41'` en su `environment`.
- **UGOS reimporta el compose viejo** si se crea el proyecto en la misma carpeta ("Die Compose-Konfiguration existiert bereits…"): usar carpeta nueva o borrar el `docker-compose.yml` viejo antes.
- **`crypto.randomUUID` solo existe en contexto seguro** (https/localhost). La app se abre por `http://IP`: cualquier API "secure-context-only" deja la pantalla en blanco. Probar siempre por IP no-localhost (repro: `scratchpad/repro_insecure.mjs` con Playwright).
- El OpenWA Gateway (`src/modules/events/events.gateway.ts`) envía `{type:'error',code,...}` antes de `disconnect()`; límites: 10 handshakes/min/IP, 16 sockets/key. `socket.io-client` **no** reconecta solo tras `io server disconnect`.
- Terminal de UGOS falla en `amonn-server`: la imagen es Alpine sin `/bin/bash` (usar `/bin/sh`).
- El PC Windows de Cris estaba en otra red (control remoto): no sirve para probar la LAN; usar el iPhone en WiFi de casa u otro dispositivo de casa.
