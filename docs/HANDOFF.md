# HANDOFF — Amonn (tareas de equipo + WhatsApp, auto-alojado en NAS)

> Un solo archivo de traspaso. Se sobreescribe en cada cierre de sesión.
> Última actualización: 2026-09-02 (sesión remota de Claude Code).

## Estado real (verificado en git al cerrar)

- Rama: `claude/job-list-app-whatsapp-av9rwl` · HEAD `1bdfca8` · al día con `origin` (0 sin pushear) · sin cambios locales · 1 worktree.
- PR: **#1** (draft) → `main`. `mergeable_state: clean`. CI verde hasta `af368f9`; el run de `1bdfca8` (workflow *Publicar imagen Docker*) estaba **en curso** al cerrar — ver https://github.com/elpollo619/Amonn-ToDo/actions. Publica `ghcr.io/elpollo619/amonn-todo:sha-1bdfca8` (+ `latest`).
- Prod (NAS UGREEN NASync **DXP6800 Pro**, UGOS, Docker GUI): **no accesible desde esta sesión** (LAN doméstica `192.168.1.9`). Último estado visto por captura: contenedor `amonn-server` **In Betrieb**, imagen nueva arrancando limpia, WhatsApp conecta; **Verificado el 2026-09-02 18:36**: `/api/version` → `af368f9` y el **login se ve en el iPhone por 5G** (acceso remoto vía UCG Max funcionando). La pantalla en blanco está resuelta en prod.

## En curso

Cerrando la cadena de arreglos de la "pantalla en blanco" y del canal de respuestas SÍ/NO de WhatsApp. La causa raíz del blanco fue `crypto.randomUUID` en contexto inseguro (http+IP): arreglada con polyfill + `uid()` sin dependencia. Última mejora (`1bdfca8`): el cliente Socket.IO registra el motivo real cuando el Gateway cierra la conexión y reconecta respetando su límite de 10 conexiones/min.

## Próximo paso concreto

1. Cris se registra en `http://192.168.1.9:8080`, pone su teléfono (+prefijo) en **Mi perfil** y crea una tarea con fecha de hoy asignada a él.
2. Desplegar la última imagen (`sha-3b93d84`: rediseño completo + botón de prueba + arreglo del canal de WhatsApp): en UGOS, **misma carpeta** que la versión actual para conservar `data/`; si dice "la configuración ya existe", **importar** y cambiar solo la línea `image:` a `sha-c459464`. Verificar `/api/version` = `3b93d84`.
3. En **Mi perfil → "Enviar avisos de WhatsApp ahora"** → llega el WhatsApp → responder "Sí" → la tarea pasa a completada. Si no llega, mirar el Protokoll: la versión nueva imprime el motivo exacto del Gateway (`UNAUTHORIZED`, `FORBIDDEN_SESSION`, `RATE_LIMITED`…).

## Hecho en esta sesión (2026-09-02, tarde)

- Rediseño completo de la app orientado a móvil (commit `3b93d84`), verificado con capturas en 390px y 1280px. Cris lo pidió tras ver el login en el iPhone.
- Botón "Enviar avisos ahora" en Mi perfil; cierre de sesión disponible en móvil.

## Pendiente (por prioridad, con criterio de "listo")

1. ~~Confirmar la app en el NAS~~ ✅ hecho (af368f9, login visible desde el iPhone).
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
