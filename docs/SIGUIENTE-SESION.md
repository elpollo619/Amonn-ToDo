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

## 2. Acceso al NAS (funciona, sin contraseña)

```bash
ssh -i ~/.ssh/id_ed25519_kali Cris@192.168.1.9
```

El usuario `Cris` está en el grupo `docker`: **`docker …` va sin `sudo`**.

- App: `http://192.168.1.9:8080` · versión: `curl -s http://192.168.1.9:8080/api/version`
- Panel del Gateway de WhatsApp: `http://192.168.1.9:2785`
  (⚠️ **sale en blanco** abierto por IP: usa `crypto.randomUUID`, que no existe
  en contexto no seguro. El túnel SSH no vale: el NAS bloquea el reenvío de
  puertos.)
- Compose de Amonn: `/volume1/docker/docker-compose.yaml` — **contiene los
  secretos reales, no lo imprimas ni lo copies al repo.**
  ⚠️ El **servicio** se llama `server`, NO `amonn-server` (ese es el
  `container_name`): `--force-recreate amonn-server` falla con "no such service".
- **Desplegar = `git push`.** CI publica `latest` y Watchtower lo aplica en
  ≤5 min. Solo hay que recrear el proyecto si cambian variables o volúmenes:
  `cd /volume1/docker && docker compose -p amonn -f /volume1/docker/docker-compose.yaml up -d`

## 3. Estado actual (2026-09-03)

Rediseño acordado con Cris: mezcla de las direcciones **A y B** (lienzo:
https://claude.ai/code/artifact/471f85da-75d0-4ea2-806e-1a6f26ae1c1c).
Cinco pasos acordados; **los cinco están hechos y desplegados** salvo un
trozo:

| Paso | Estado |
|---|---|
| 1. Plazos (inicio→fin) + pantalla de inicio nueva | ✅ |
| 2. Estados propios del taller | ✅ |
| 3. Subtareas / pasos | ✅ |
| 4. Línea de tiempo | ✅ |
| 5. Comentarios y fotos | ✅ texto y fotos desde la app · ❌ **fotos entrantes por WhatsApp** |

Antes de eso, en la misma sesión, se arregló el tiempo real de WhatsApp y se
revinculó la sesión (Cris escaneó el QR). El asistente habla **español, alemán
y portugués**, aprende apodos y correcciones, y entiende plazos, estados,
pasos y comentarios por mensaje.

## 4. LO ÚNICO QUE FALTA: fotos entrantes por WhatsApp

El almacenamiento de Amonn **ya está resuelto**: el contenedor tiene el volumen
`/volume1/docker/data/uploads → /srv/uploads` y `UPLOAD_DIR` puesto
(verificado: un fichero sobrevive a recrear el contenedor).
`createAttachment()` en `server/src/comments.service.js` ya guarda ficheros.
Lo que falta es **sacar los bytes de la foto del Gateway**.

**Lo ya averiguado (no lo repitas):**

- El Gateway **no tiene ninguna ruta REST de descarga de medios**. La única
  ruta con imágenes en `message.controller.js` es `POST send-image` (enviar).
- Sus datos están en el volumen `openwa_openwa-data` → `/app/data`, con un
  directorio `media/` que **está vacío (0 ficheros)**.
- `STORAGE_TYPE` y `STORAGE_LOCAL_PATH` existen como variables del Gateway
  pero **están sin definir**. Sospecha principal: no guarda medios por defecto.
- En sus payloads de mensaje solo aparece `mimetype`. No hay `mediaUrl`,
  `mediaId` ni `hasMedia`.
- `better-sqlite3` NO está en `/app/node_modules` del Gateway; usa `sqlite3`.

**Primer paso, y es el que lo decide todo:** pídele a Cris que **envíe una foto
al número de Amonn (+41 76 226 04 47)** y captura el payload CRUDO del evento
`message.received`. La forma rápida: una sonda con `socket.io-client` dentro de
`amonn-server` que imprima el evento entero (el patrón está en la sección del
tiempo real del HANDOFF), o un `console.log` temporal del payload en
`server/src/realtime.js`.

**Tres caminos según lo que veas**, de mejor a peor:

1. La foto viene en el propio evento → llamar a `createAttachment()` y ya está;
   todo lo demás existe.
2. El Gateway la guarda en su volumen → montar `openwa_openwa-data` en
   `amonn-server` **en solo lectura** y copiar el fichero (otro cambio de
   compose de Amonn).
3. No guarda nada → activar `STORAGE_TYPE`/`STORAGE_LOCAL_PATH` en el compose
   del **Gateway** (`/volume1/docker/OpenWA-main/docker-compose.yml`) y
   recrearlo. Ojo: eso es tocar el Gateway, no Amonn. **Pide permiso a Cris.**

Cuando llegue la foto, engánchala como comentario de la tarea que corresponda
(mira cómo lo hace `add_comment` en `server/src/inbound.js`) y decide con Cris
a qué tarea se asocia si el mensaje no lo dice.

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
