# HANDOFF — Amonn (tareas de equipo + WhatsApp, auto-alojado en NAS)

> Un solo archivo de traspaso. Se sobreescribe en cada cierre de sesión.
> Última actualización: 2026-09-03 (sesión LOCAL en el Mac de Cris, con acceso SSH al NAS).

## Estado real

- Rama: `claude/job-list-app-whatsapp-av9rwl`. PR **#1** (draft) → `main`, `mergeable_state: clean`.
- Prod (NAS UGREEN DXP6800 Pro, UGOS, `192.168.1.9`): **`/api/version` = `91fbbac` verificado el 2026-09-03 08:07** (login OK desde el iPhone por 5G). El proyecto `amonn` en UGOS lleva ahora **Watchtower** (`amonn-watchtower`, con `DOCKER_API_VERSION: '1.41'`): cada 5 min descarga `latest` si cambió y reinicia solo `amonn-server`. **Ya no hay que recrear el proyecto para actualizar**: basta con hacer push (CI publica `latest`).
- Cris tiene su teléfono guardado en Mi perfil (2026-09-02).

## En curso

Último push: **asistente de WhatsApp + avisos al asignar + email + preferencias** (ver "Hecho"). CI construye la imagen; Watchtower la aplicará en el NAS en ≤5 min tras publicarse. Verificar con `/api/version` (debe ser el SHA del último commit de la rama).

## Próximo paso concreto

**Solo falta una acción humana: volver a vincular el teléfono de WhatsApp (escanear el QR).**

1. Cris abre `http://192.168.1.9:2785` (panel del OpenWA Gateway) desde un
   navegador de casa, entra en la sesión `biacris` y escanea el código QR con
   el WhatsApp del número **+41 76 226 04 47**. (También hay una copia del QR
   en `~/Desktop/amonn-whatsapp-qr.png` del Mac, pero el QR caduca: mejor el
   panel, que lo refresca solo.)
2. Comprobar que quedó bien: `docker logs --tail 5 amonn-server` debe decir
   `[wa] la sesión de WhatsApp está conectada (estado: connected)`.
3. Cris escribe «hola» a ese número desde su móvil → debe responder el
   asistente. Luego «crea una tarea a mí: probar el asistente, para mañana».
4. Claves de Gemini y Gmail en el compose (ver "Necesita a Cris") + `APP_URL`.

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
- **Ya funciona desde el Mac de Cris, sin contraseña ni `sudo`:**
  `ssh -i ~/.ssh/id_ed25519_kali Cris@192.168.1.9` (el usuario `Cris` está en el
  grupo `docker`, así que `docker ...` va sin `sudo`). La clave es la misma que
  el `~/.ssh/config` tenía apuntando a la IP vieja `192.168.254.163`.
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

### 4. El problema del tiempo real: RESUELTO (2026-09-03)

Diagnóstico hecho por SSH desde el Mac de Cris. **No era la clave ni la
carrera del Gateway.** Eran tres fallos, los tres del mismo tipo: código que
trataba un fallo como si fuera éxito.

1. **El acuse del `subscribe` se perdía.** El Gateway es NestJS y
   `handleSubscribe` hace `return {type:'subscribed'}`. En NestJS ese valor
   **no se emite**: viaja por el *callback de acuse* de Socket.IO. `realtime.js`
   emitía sin callback → la confirmación (y los errores de la suscripción) se
   descartaban en silencio, y el `case 'subscribed'` era código muerto. Por eso
   el registro se quedaba en "suscribiendo en 2s" para siempre. **La
   suscripción sí funcionaba**: el Protokoll del Gateway lo demuestra
   (`Client … subscribed to: session:…:message.received`, 2 s después de
   conectar). Comprobado con una sonda: con callback llega
   `{"type":"subscribed",…}`; sin callback, nada.
2. **Una sesión averiada se veía como sana.** `resolveSession()` hacía
   `connected ?? list[0]`: si ninguna sesión estaba conectada cogía la primera
   igualmente y solo registraba el id. Ahora registra el estado y avisa.
3. **`qr_ready` se daba por conectada**, porque contiene la subcadena `ready`
   y `CONNECTED_RE` la aceptaba. Corregido con `isConnectedStatus()`.

Arreglado en el commit `fix(wa): recibir el acuse del subscribe…` y
**verificado contra el Gateway real**: el registro ya muestra
`[wa] tiempo real suscrito a ["message.received"]`.

### 4b. La avería de fondo: la sesión de WhatsApp está desvinculada

Al consultar `GET /api/sessions` apareció lo importante:

```
name: biacris   status: "failed"   phone: 41762260447
lastActive: 2026-08-08   ← casi un mes sin actividad
```

**El Gateway no tiene línea con WhatsApp desde el 8 de agosto**, así que no
llegaría ningún mensaje aunque el socket estuviera perfecto. Se hizo
`POST /api/sessions/{id}/start` y la sesión pasó a `initializing` → `qr_ready`:
está esperando que alguien escanee el QR. **Eso solo lo puede hacer Cris**
(ver "Próximo paso concreto"). El nuevo `startSessionWatch()` avisará en el
Protokoll si el teléfono se vuelve a desvincular, para que no pasen otras
semanas en silencio.

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
- **NestJS y los acuses de Socket.IO**: un `@SubscribeMessage` que hace `return`
  NO emite nada; el valor va por el callback de acuse. Si el cliente emite sin
  callback, la respuesta se pierde en silencio. (Este fue el fallo del tiempo
  real.)
- **Cuidado con las subcadenas en los estados**: `qr_ready` contiene `ready` y
  `disconnected` contiene `connect`. Descartar primero los estados de avería.
- **El panel del OpenWA Gateway está en `http://192.168.1.9:2785`** (puerto
  publicado): desde ahí se ve la sesión y se escanea el QR.
- **Una sesión de WhatsApp puede morirse sin ruido.** Estuvo `failed` desde el
  8 de agosto y nada lo decía. Ahora `startSessionWatch()` lo registra.
