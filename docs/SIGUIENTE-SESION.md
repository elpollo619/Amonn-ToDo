# Empieza por aquí

Instrucciones para Claude Code en una sesión nueva, en el Mac de Cris (misma
red que el NAS). **Cris no es técnico y escribe en español: háblale en
español, un paso cada vez, y haz tú mismo todo lo que puedas por consola.**

## 1. Ponerte en marcha

```bash
git clone https://github.com/elpollo619/Amonn-ToDo
cd Amonn-ToDo
git checkout claude/job-list-app-whatsapp-av9rwl
```

Lee **`docs/HANDOFF.md` entero** antes de tocar nada. Este fichero solo te
dice dónde seguir; el detalle y los gotchas están allí.

## 2. Acceso al NAS — por Tailscale, desde cualquier sitio

```bash
ssh -i ~/.ssh/id_ed25519_kali Cris@100.77.9.60      # nas-amonn
```

⚠️ **No uses 192.168.1.9.** Esa IP solo se ve estando en la red del NAS, y
Cris trabaja desde la oficina, su casa y casa de sus padres — varias de esas
redes usan también el rango 192.168.1.x, así que ninguna VPN lo arreglaba. Se
perdió mucho tiempo en tres sesiones por esto. Desde el 4 sep 2026 el NAS está
en la tailnet como **`nas-amonn` = 100.77.9.60** (contenedor `tailscale`,
`network_mode: host`, estado en el volumen `tailscale-state`).

El contenedor anuncia la ruta `192.168.1.0/24`, pero **hay que aprobarla en la
consola de Tailscale** para llegar al resto de la red de la oficina; hará falta
para el Netzlaufwerk.

El usuario `Cris` está en el grupo `docker`: **`docker …` va sin `sudo`**.

- App: `http://100.77.9.60:8080` · versión: `curl -s http://100.77.9.60:8080/api/version`
- Gateway de WhatsApp: `http://100.77.9.60:2785` (el panel sale en blanco por
  IP: usa `crypto.randomUUID`, que no existe en contexto no seguro).
- Compose de Amonn: `/volume1/docker/docker-compose.yaml` — **contiene los
  secretos reales, no lo imprimas ni lo copies al repo.**
  ⚠️ El **servicio** se llama `server`, NO `amonn-server` (ese es el
  `container_name`).
- **Desplegar = `git push`.** CI publica `latest` y Watchtower lo aplica en
  ≤5 min.
- ⚠️ Cris NO puede escribir en `/volume1/docker/data` (permisos). Usa su home
  `/home/Cris` o volúmenes Docker con nombre.

## 3. Estado actual (4 sep 2026)

Los cinco pasos del rediseño están **hechos, desplegados y verificados**,
incluidas las fotos entrantes por WhatsApp (probadas con fotos reales de Cris).

Además, ese mismo día:

- **Los 7 trabajadores están dados de alta** con teléfono, correo, color e
  idioma. Contraseña bloqueada a propósito: existen para tareas y WhatsApp,
  pero no pueden entrar a la app hasta que se les dé una.
  ⚠️ Había **dos Cristian Amaya** (uno vacío, con el correo de empresa); por eso
  "crea tarea a cris" preguntaba cuál. Se fusionaron. Si vuelve a pasar con
  otro nombre, mira primero si hay duplicados antes de tocar el código.
- **Cuatro órdenes nuevas** sobre tareas existentes: cambiar plazo, reasignar,
  ver detalle y listar por estado o vencimiento (`test/ordenes.test.mjs`).
- **Notas de voz**: se guardan como adjunto de la tarea. Falta transcribir.
- **Aviso diario agrupado**: un mensaje por persona con atrasadas / hoy /
  mañana, en vez de un mensaje por tarea (`test/avisos.test.mjs`).

⚠️ **La base de datos apareció vacía** el 3 de septiembre (0 tareas, 0
vocabulario; el contenedor `amonn-db-1` se recreó a las 06:01). No se ha
averiguado por qué. Conviene entenderlo antes de cargar datos de verdad.
Hay un respaldo en `/home/Cris/amonn-backup-20260904-0850.sql`.

## 4. LO ÚNICO QUE FALTA: probar las fotos con una foto de verdad

Las fotos entrantes **ya están programadas y probadas** (ver el HANDOFF, que
tiene el detalle). Resumen de lo esencial:

- El Gateway **sí manda la foto**: entera, en base64, dentro del propio
  mensaje, en `metadata.media.data`. No busques ficheros; la carpeta `media/`
  está vacía y no importa.
- Si el pie de foto dice la tarea, se pega ahí. Si no, se guarda igual y el
  asistente pregunta a cuál va, con lista numerada.

**Lo que falta es solo comprobarlo en vivo**, porque el código está probado
contra la forma que guarda la base de datos, no contra el evento en directo:

1. Despliega (`git push`; Watchtower lo aplica en ≤5 min).
2. Pide a Cris una foto al +41 76 226 04 47, con y sin pie de foto.
3. Mira que la foto aparece en la tarea dentro de la app.
4. Si no aparece, busca esta línea en `docker logs amonn-server`:
   `[wa] llega algo que parece foto pero sin datos; forma: ...`
   Esa lista de claves dice dónde está realmente la imagen; añade esa ruta al
   array `RUTAS` de `server/src/media.js` y listo.

⚠️ Cris trabaja a veces desde fuera de la oficina y entonces **el NAS no es
alcanzable por SSH** (su casa y la oficina usan el mismo rango 192.168.1.x, así
que ninguna VPN lo arregla). Sí puede entrar por el panel web del NAS. Si hace
falta acceso remoto de verdad, lo que toca es **instalar Tailscale en el NAS**;
Cris ya lo usa en sus otros equipos.

## 4b. Lo añadido el 4 de septiembre (tarde)

- **Citas (Termine)** + **calendario suscribible**: `/calendar/<CALENDAR_TOKEN>.ics`
  con las citas (aviso 1 h antes) y las tareas con plazo (día completo).
  Google Calendar / iPhone / Outlook se suscriben una vez. Se eligió esto en
  lugar de OAuth con Google: sin permisos que caducan. Google refresca cuando
  quiere (horas), así que no vale para cambios de último minuto.
- **Contactos de obra**: 34 importados de la carpeta `06 Kunden` de Drive
  (Adressliste + Kontaktliste 770-lds Seewer), con BKP, obra y **estado de
  oferta**. `server/scripts/importar-contactos.mjs` se puede repetir sin
  duplicar. ⚠️ NO se escribe en los Excel originales a propósito: si alguien
  los tiene abiertos, se pisan los cambios.
- **Residuos de Muri** (`entsorgung.js`) y **lista de la compra**
  (`compras.js`), ambos consultables por WhatsApp.
- **Notas de voz** transcritas con Whisper en el NAS (contenedor `whisper`,
  `WHISPER_URL=http://whisper:9000`, modelo base, ~2,5x tiempo real).

Variables nuevas en el compose del NAS: `WHISPER_URL`, `ENTSORGUNG_TO`,
`CALENDAR_TOKEN`. ⚠️ `create table if not exists` NO añade columnas a una
tabla que ya existe: usa `alter table ... add column if not exists`.

## 5. Pruebas

```bash
cd server && npm test                 # fechas + asistente (sin base de datos)
# con Postgres: DATABASE_URL=… WA_ENABLED=false npm run test:db
cd app && npm test                    # línea de tiempo
cd app && npm run build               # comprueba tipos y compila
```

Para las pruebas con base de datos, levanta un Postgres de usar y tirar:

```bash
export PATH=/opt/homebrew/opt/postgresql@16/bin:$PATH
initdb -D /tmp/pg -U postgres --auth=trust
pg_ctl -D /tmp/pg -o "-p 5433 -k /tmp/pg" -l /tmp/pg/log start
DATABASE_URL="postgres://postgres@127.0.0.1:5433/postgres" WA_ENABLED=false npm run test:db
```

Para ver la app sin credenciales: `cd app && VITE_DEMO=true npm run dev`
(modo demostración, con datos de ejemplo y sin contraseña).

## 6. Trampas que ya han morder una vez

- **`text-transform: capitalize` en español** da "Agosto De 2026". Poner la
  mayúscula inicial en JS. (Ha pasado tres veces.)
- **Regex generadas por script**: revisa que no queden con `\\s` en vez de
  `\s`. Una estuvo rota un paso entero sin que se notara. **Pruébalas siempre
  con una llamada directa después de generarlas.**
- **Formularios anidados**: los componentes de pasos y comentarios viven DENTRO
  del formulario de la tarea. Nada de `<form>` dentro: Enter enviaría el de
  fuera y cerraría el modal.
- **Verbos compartidos en el asistente**: `pon`, `añade` y `anota` sirven para
  crear tareas Y para estados/pasos/comentarios. Las reglas nuevas van antes
  que la de crear pero **exigen** que la cola sea un estado real o que la pista
  señale una tarea existente. Sin eso se malinterpretan.
- **Marcar hecha** debe mover también el estado (clase `done`), o la tarea se
  queda en la columna "Esperando material".
- **Estado y `status` van siempre juntos**: usa `resolveState()` /
  `setTaskState()`, nunca escribas `status` a mano.
- **Aislamiento de los tests con base de datos**: los que reordenan o crean
  estados deben restablecerlos en la preparación, o la pasada siguiente falla.
