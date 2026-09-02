# HANDOFF — Amonn (tareas de equipo + WhatsApp, auto-alojado en NAS)

> Un solo archivo de traspaso. Se sobreescribe en cada cierre de sesión.
> Última actualización: 2026-09-02 (sesión remota de Claude Code).

## Estado real (verificado en git al cerrar)

- Rama: `claude/job-list-app-whatsapp-av9rwl` · HEAD `1bdfca8` · al día con `origin` (0 sin pushear) · sin cambios locales · 1 worktree.
- PR: **#1** (draft) → `main`. `mergeable_state: clean`. CI verde hasta `af368f9`; el run de `1bdfca8` (workflow *Publicar imagen Docker*) estaba **en curso** al cerrar — ver https://github.com/elpollo619/Amonn-ToDo/actions. Publica `ghcr.io/elpollo619/amonn-todo:sha-1bdfca8` (+ `latest`).
- Prod (NAS UGREEN NASync **DXP6800 Pro**, UGOS, Docker GUI): **no accesible desde esta sesión** (LAN doméstica `192.168.1.9`). Último estado visto por captura: contenedor `amonn-server` **In Betrieb**, imagen nueva arrancando limpia, WhatsApp conecta; `Versionsnummer` aún **sin confirmar** con `/api/version`.

## En curso

Cerrando la cadena de arreglos de la "pantalla en blanco" y del canal de respuestas SÍ/NO de WhatsApp. La causa raíz del blanco fue `crypto.randomUUID` en contexto inseguro (http+IP): arreglada con polyfill + `uid()` sin dependencia. Última mejora (`1bdfca8`): el cliente Socket.IO registra el motivo real cuando el Gateway cierra la conexión y reconecta respetando su límite de 10 conexiones/min.

## Próximo paso concreto (cuando Cris esté en el WiFi de casa)

1. Desplegar la imagen `sha-1bdfca8` en UGOS: **Docker → Projekt → Crear** con el compose de `docker-compose.nas.yml` (rellenar 🔴 con los valores de Cris), **carpeta nueva** (p. ej. `docker/amonn2`) para que UGOS no reimporte el compose viejo. No pulsar "diese Konfiguration importieren".
2. Verificar: `http://192.168.1.9:8080/api/version` → `{"version":"1bdfca8"}` y `http://192.168.1.9:8080` → login. Si `version` no coincide, el NAS no cogió la imagen: repetir 1.
3. Registrarse, poner teléfono en **Mi perfil**, crear tarea con fecha de hoy y probar el flujo: `POST /api/reminders/run` (con token) → llega WhatsApp → responder "Sí" → tarea marcada.

## Pendiente (por prioridad, con criterio de "listo")

1. **Confirmar la app en el NAS** — listo cuando `/api/version` = `1bdfca8` y se ve el login desde el iPhone en WiFi de casa.
2. **Respuestas SÍ/NO fiables** — listo cuando en el Protokoll se vea `tiempo real suscrito a ["message.received"]` y, tras contestar "Sí" en WhatsApp, la tarea pase a completada. Si aparece `el Gateway devolvió UNAUTHORIZED/FORBIDDEN_SESSION/RATE_LIMITED`, ese código dice qué tocar (clave, permisos de sesión de la API key en el Gateway, o esperar al límite).
3. **Acceso desde fuera de casa** (Cris lo pidió) — propuesta: Tailscale en NAS + iPhone; listo cuando `http://100.x.x.x:8080` abre la app con 4G. Alternativa: Cloudflare Tunnel con HTTPS.
4. Cuerpo del PR #1 desactualizado (habla de `waautomate`/QR): reescribir con la arquitectura actual (OpenWA Gateway existente + Socket.IO) antes de sacarlo de draft.
5. Mejora menor: healthcheck ya añadido al compose del NAS; comprobar que UGOS lo muestra en verde.

## Necesita a Cris (acciones humanas)

- Estar en el WiFi de casa (o tener Tailscale) para probar: la IP `192.168.1.9` es interna.
- Hacer el despliegue en la GUI de UGOS (no hay acceso remoto al NAS desde Claude Code).
- Valores 🔴 del compose (contraseña de BD, `JWT_SECRET`, `WA_API_KEY`): los tiene Cris; **no van en este archivo**.
- Decidir la opción de acceso remoto (Tailscale recomendado).
- Sobre "darle una llave de acceso a Claude para que lo haga todo": desde la sesión remota no hay ruta de red a la LAN; una clave sola no sirve y exponer SSH/Docker a internet no es recomendable. Camino seguro: ejecutar Claude Code en un PC de casa (misma red) con acceso SSH al NAS.

## Red doméstica (cambió el 2026-09-02)

- Router nuevo: **UniFi Cloud Gateway Max (UCG Max)** en `192.168.1.1`, conectado directo al módem de internet. NAS ("NasBiaundCris", UGREEN NASync DXP6800 Pro) en el puerto 4 (2.5 GbE).
- **La IP del NAS cambió**: ya no es `192.168.254.163`; ahora es **`192.168.1.9`**, ya **fijada** ("Feste IP-Adresse") en UniFi el 2026-09-02, así que no cambiará.
- Acceso remoto propuesto: **Teleport VPN** del UCG Max + app **WiFiman** en el iPhone (no hace falta Tailscale ni abrir puertos). Posible doble NAT si el módem de la operadora también enruta → modo bridge si Teleport no conecta.
- Docker/compose no dependen de la IP del NAS (WA_API_URL usa el nombre de contenedor `openwa-api`): **no hay que redesplegar por el cambio de IP**.

## Gotchas de esta sesión (candidatos a CLAUDE.md si se repiten)

- **UGOS no re-descarga una etiqueta ya en caché** (`latest`): fijar siempre `sha-XXXXXXX` y **borrar+crear** el proyecto; editar + "Starten" no aplica cambios de imagen.
- **UGOS reimporta el compose viejo** si se crea el proyecto en la misma carpeta ("Die Compose-Konfiguration existiert bereits…"): usar carpeta nueva o borrar el `docker-compose.yml` viejo antes.
- **`crypto.randomUUID` solo existe en contexto seguro** (https/localhost). La app se abre por `http://IP`: cualquier API "secure-context-only" deja la pantalla en blanco. Probar siempre por IP no-localhost (repro: `scratchpad/repro_insecure.mjs` con Playwright).
- El OpenWA Gateway (`src/modules/events/events.gateway.ts`) envía `{type:'error',code,...}` antes de `disconnect()`; límites: 10 handshakes/min/IP, 16 sockets/key. `socket.io-client` **no** reconecta solo tras `io server disconnect`.
- Terminal de UGOS falla en `amonn-server`: la imagen es Alpine sin `/bin/bash` (usar `/bin/sh`).
- El PC Windows de Cris estaba en otra red (control remoto): no sirve para probar la LAN; usar el iPhone en WiFi de casa u otro dispositivo de casa.
