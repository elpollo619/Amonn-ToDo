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

## Asistente multiidioma — Entrega 1 HECHA (2026-09-03)

Cris pidió que el asistente hable **alemán, portugués y español**, que tenga
**preguntas estándar** y que **aprenda del equipo**. Es demasiado para un solo
diseño, así que se partió en cuatro entregas. Decisión de Cris: reglas ahora,
**Gemini después**; idioma **guardado por persona**.

### Lo que ya funciona (Entrega 1)

- **`server/src/i18n.js` (nuevo).** Todos los textos del asistente en es/de/pt
  y `t(lang, clave, datos)`. Antes estaban incrustados en `inbound.js`.
  Incluye `detectLanguage()` (solo con mensajes de ≥15 caracteres: un "ok" no
  cambia el idioma de nadie) y `parseLanguageCommand()` ("habla en alemán").
- **Idioma por persona.** Columnas nuevas `users.language` ('es'|'de'|'pt') y
  `users.language_auto`. Se autodetecta **solo mientras nadie lo haya elegido
  a mano**; en cuanto se elige (por WhatsApp o en Mi perfil), se respeta.
- **Comprensión en tres idiomas.** `assistant.js` tiene ahora un juego de
  reglas por idioma (`REGLAS`) con la misma forma. Se prueba primero el idioma
  de la persona y luego los otros dos, así "am Freitag" se entiende en un chat
  en español. `dates.js` entiende fechas en los tres idiomas, incluido el
  `15.10.` alemán con puntos. Sí/no también en los tres (`ja`, `sim`…).
- **Preguntas estándar.** Si falta algo, el asistente **pregunta** en lugar de
  crear a medias: "¿Qué hay que hacer?" → "¿Para quién?" → "¿Para cuándo?" →
  confirmación. **Solo confirma si hubo que preguntar algo**: un mensaje
  completo se crea directo, sin fricción. Se puede cancelar en cualquier punto.
  El estado vive en `wa_conversations` (`conversations.js`) y **caduca a los
  10 minutos**, para que un "sí" de mañana no se enganche a la pregunta de hoy.
- **Los avisos van en el idioma de QUIEN LOS RECIBE**, no en el de quien crea
  la tarea (`notify.js`, `reminders.js`).
- **Mi perfil** tiene un selector de idioma (Español / Deutsch / Português).

### Pruebas

`cd server && npm test` → 28 comprobaciones de fechas + 33 del asistente, sin
base de datos. `npm run test:db` (con `DATABASE_URL`) → 28 del diálogo completo
contra un Postgres real: preguntas, confirmación, cancelación, cambio de
idioma, autodetección, caducidad, y el idioma de los avisos.

### Hoja de ruta acordada (pendiente)

2. **Vocabulario del equipo + aprender de los errores** (sin Gemini): tabla de
   alias ("Jasmi" → Jasmina, "la caldera" → esa tarea), que se llena sola al
   corregir al asistente y es editable en la app. Determinista y auditable.
3. **Gemini enchufado** (necesita la clave de Cris): entra por encima de las
   reglas, usa el vocabulario de la entrega 2 como contexto, y trae la memoria
   de conversación ("y esa mándasela también a Isma").
4. **Tareas que se repiten**: detectar patrones y proponerlas. Va la última a
   propósito: **no funcionará bien hasta que haya meses de historial**, y hoy
   la base de datos está casi vacía. No adelantarla.

## Comentarios y fotos — paso 5 HECHO (2026-09-03)

- **`comments` y `attachments`** + `comments.service.js` + rutas
  `/api/tasks/:id/comments`, `/api/comments/:id`,
  `/api/tasks/:id/attachments`, `/api/attachments/:id` (sirve el fichero) y
  `/api/attachments/status`.
- **Comentarios de texto: funcionan ya.** Desde la app y por WhatsApp
  («comenta en la caldera: falta el diferencial», también `kommentiere zu…` y
  `comenta em…`). Cada comentario guarda su origen ('app'/'whatsapp') y se
  enseña en la app.
- ✅ **ALMACENAMIENTO YA CONFIGURADO EN EL NAS (2026-09-03).** Con permiso de
  Cris se añadió al compose (`/volume1/docker/docker-compose.yaml`, servicio
  `server`): `UPLOAD_DIR: /srv/uploads` y el volumen
  `./data/uploads:/srv/uploads`; copia de seguridad en
  `docker-compose.yaml.bak-antes-uploads`. Recreado con
  `docker compose -p amonn -f /volume1/docker/docker-compose.yaml up -d`.
  ⚠️ El **servicio** se llama `server`, no `amonn-server` (ese es el
  container_name): `--force-recreate amonn-server` falla con "no such service".
  ⚠️ El usuario `Cris` NO puede crear directorios en `/volume1/docker` (hace
  falta root); no importa, Docker crea solo el origen del bind mount.
  **Verificado de verdad**: se escribió un fichero, se recreó el contenedor
  (id distinto) y el fichero seguía ahí. `storageStatus()` devuelve
  `{"ok":true,"dir":"/srv/uploads"}`.
- ⚠️ **Por qué los adjuntos siguen estando condicionados en el código:**
  `amonn-server` **no tiene NINGÚN volumen** (comprobado con `docker inspect`),
  así que cualquier fichero escrito dentro se pierde cuando Watchtower recrea
  el contenedor, o sea, **en cada despliegue**. Guardar fotos ahí sería perder
  material de obra sin avisar. Por eso los adjuntos solo se aceptan si
  `UPLOAD_DIR` existe y es escribible; si no, la API responde 503 con el
  motivo y la app oculta el botón de foto y lo explica.
- **Para activarlas** hay que tocar el compose del NAS (`/volume1/docker/
  docker-compose.yaml`) y recrear el proyecto:
  ```yaml
  amonn-server:
    environment:
      UPLOAD_DIR: /srv/uploads
    volumes:
      - ./data/uploads:/srv/uploads
  ```
  y luego `docker compose -p amonn -f /volume1/docker/docker-compose.yaml up -d`.
  **Pendiente de decidir con Cris**: ese fichero tiene los secretos reales y
  recrear el proyecto tumba la app un momento, así que no se tocó sin permiso.
- Detalles de seguridad ya resueltos: el nombre del fichero en disco lo genera
  el servidor (nunca el del cliente), se comprueba que la ruta resuelta sigue
  dentro de `UPLOAD_DIR`, solo se admiten jpg/png/webp/heic/pdf, tope de 12 MB,
  y borrar un comentario o una tarea borra también sus ficheros del disco.
- **NO hecho todavía**: bajar automáticamente las fotos que llegan por
  WhatsApp. Necesita primero el volumen y además mirar la API de medios del
  Gateway. Se dejó fuera a propósito en vez de dejarlo a medio cablear.

Pruebas: 20 en `test/comentarios.test.mjs` (incluida la de que sin
almacenamiento se rechaza la subida con el motivo correcto).

## Línea de tiempo — paso 4 HECHO (2026-09-03)

- **Sin cambios de servidor**: se apoya entera en los plazos del paso 1.
- **`app/src/lib/timeline.ts`** tiene TODA la aritmética separada de la
  pantalla (recortar barras que se salen de la ventana, repartir las que se
  solapan en carriles, contar solo días laborables) para poder probarla sin
  navegador. **`app/src/pages/Timeline.tsx`** solo pinta. Ruta `/tiempo`.
- **Solo días laborables**: el taller no trabaja el fin de semana, y dedicarle
  dos columnas de siete a algo siempre vacío desperdicia la mitad del ancho.
  Una tarea que empieza en sábado se engancha al lunes siguiente; una que
  acaba en domingo, al viernes anterior.
- Barras recortadas en los bordes de la ventana, con el lado cortado en línea
  discontinua y sin esquina redondeada para que se vea que la tarea sigue.
- Reparto en carriles voraz (primer carril libre). Fila extra para lo que no
  tiene responsable, que es lo que suele quedarse olvidado. Aviso al pie con
  las tareas abiertas **sin fecha de fin**, que por definición no pueden salir.
- Navegación por semanas, botón «Hoy», y 2 o 4 semanas a la vista. En el móvil
  se desplaza a lo ancho: comprimir dos semanas en 390 px dejaría las barras
  ilegibles.
- ⚠️ Las guías verticales son el **fondo** de la fila, no elementos de la
  rejilla: como elementos alteraban la altura de las filas y aplastaban las
  barras.
- ⚠️ Tercera vez que aparece: `text-transform: capitalize` en español produce
  "Agosto De 2026". La mayúscula inicial se pone en JS.

Pruebas: 22 en `app/test/timeline.test.ts`. Se ejecutan con `npm test` dentro
de `app/` (se compila con esbuild vía npx y se corre con node; el proyecto no
tiene runner de tests de frontend).

### Siguiente en el orden acordado
5. Comentarios y fotos (la más pesada: guardar ficheros en el NAS y bajar las
   imágenes que llegan por WhatsApp).

## Subtareas / pasos — paso 3 HECHO (2026-09-03)

- **Tabla `subtasks`** + `subtasks.service.js` + `/api/tasks/:id/subtasks` y
  `/api/subtasks/:id`.
- **Decisión de diseño: un paso NO es una tarea.** No se asigna, no tiene
  plazo y no genera avisos. Es una lista de comprobación dentro de la tarea, y
  lo que aporta es el avance del conjunto ("2 de 5"). Hacerlos tareas de
  verdad habría duplicado media aplicación para nada.
- **El avance viene en la consulta**, no con una consulta por tarea:
  `SUBTASK_COUNTS_SQL` se engancha a las tres consultas de tareas
  (`/api/tasks`, `openTasksFor`, `openTasksAll`).
- **Por WhatsApp**: "añade a la caldera: cambiar el diferencial" (y
  `füge zu … :`, `adiciona a … :`). Mismo guardarraíl que con los estados:
  «añade» también sirve para crear una tarea, así que solo cuenta como paso si
  la pista señala una tarea existente y la frase no lleva el sustantivo
  "tarea". Las listas enseñan `2/5` solo si la tarea tiene pasos.
- App: sección «Pasos» en la tarea (solo al EDITAR: una tarea nueva aún no
  tiene id al que colgarlos), con barra de avance, marcar/desmarcar y borrar.
  Chip `2/5` en las tarjetas del tablero y en Hoy.
- ⚠️ **Dos fallos que costaron tiempo y conviene recordar:**
  1. Las expresiones regulares insertadas por script quedaron con **doble
     barra invertida** (`\\s` en vez de `\s`), así que no coincidían nunca.
     `createNoun` estuvo roto sin que se notara porque otras condiciones
     tapaban el fallo. **Verificar siempre las regex con una prueba directa
     después de generarlas.**
  2. El formulario de los pasos estaba **anidado dentro** del formulario de la
     tarea (HTML inválido): Enter enviaba el de fuera, guardaba la tarea y
     cerraba el modal sin crear el paso. Ahora es un `<div>` con Enter
     manejado a mano.

Pruebas: 17 nuevas en `test/pasos.test.mjs`.

### Siguiente en el orden acordado
4. Línea de tiempo. 5. Comentarios y fotos.

## Estados propios del taller — paso 2 HECHO (2026-09-03)

- **`task_states` + `tasks.state_id`.** El equipo define los nombres de las
  columnas ("Esperando material", "Pendiente de cliente", "Por facturar").
- **La pieza clave es `kind`.** Cada estado pertenece a una de las tres CLASES
  que el resto del sistema ya entendía (`open` / `in_progress` / `done`), y el
  servidor mantiene `tasks.status` igual a la clase del estado. Por eso el
  asistente de WhatsApp, los recordatorios y las consultas siguen funcionando
  sin cambios: **no hay dos fuentes de verdad**. Todo pasa por
  `resolveState()` / `setTaskState()`; nunca se escribe `status` a mano.
- **Por WhatsApp**: "pon la caldera en esperando material" (y `setze … auf …`,
  `põe … em …`). Si el estado no existe, lo dice y enumera los que hay; si la
  frase encaja con varios, pregunta en vez de elegir.
  ⚠️ `pon` es TAMBIÉN verbo de crear, así que la regla de estado va antes que
  la de crear pero **exige que la cola sea un estado real o que la pista
  señale una tarea existente**. Sin esa condición, "pon una tarea a Isma: X"
  se interpretaría como cambio de estado.
- Marcar una tarea como hecha (por WhatsApp o en la app) mueve **también** el
  estado al de clase `done`; si no, una tarea cerrada seguiría en la columna
  "Esperando material".
- Borrar un estado reubica sus tareas en el primero de su clase (no se pierde
  ninguna) y **no se puede borrar el último de una clase**.
- App: el tablero pinta una columna por estado y ahora **se desplaza a lo
  ancho** (antes era una rejilla de tres y la cuarta caía debajo). Botón
  «Editar estados» en el tablero. Selector de estado en la tarea. Chip del
  estado en las tarjetas y en Hoy, **solo si no es uno de los de serie**
  (por clase no valdría: "Por facturar" es de clase `open` y sí hay que verlo).
- ⚠️ Otra corrección de la misma familia que las anteriores: una pregunta
  pendiente ("¿para quién es?") ya no se traga un mensaje que claramente es
  otra cosa (una consulta, un saludo, otro cambio de estado).

Pruebas: 22 nuevas en `test/estados.test.mjs`.

### Siguiente en el orden acordado
3. Subtareas. 4. Línea de tiempo. 5. Comentarios y fotos.

## Rediseño — dirección elegida y paso 1 HECHO (2026-09-03)

Cris eligió una **mezcla de la A y la B**, y pidió además: plazos con **inicio
y fin**, **línea de tiempo**, **subtareas**, **comentarios con fotos** y
**estados propios del taller** (mencionó Jira como referencia de ideas; NO se
copia su interfaz). Diseño completo en el lienzo, página «La mezcla A+B».

**Orden acordado con Cris** (cada paso deja algo usable):
1. ✅ **Plazos + pantalla de inicio nueva** — HECHO, ver abajo.
2. Estados propios del taller.
3. Subtareas.
4. Línea de tiempo (necesita los plazos, ya están).
5. Comentarios y fotos (la más pesada: guardar ficheros en el NAS y bajar las
   imágenes que llegan por WhatsApp).

### Paso 1, lo que ya está

- **`tasks.start_date` y `tasks.work_days`.** `due_date` pasa a significar la
  fecha de FIN. Si no hay `start_date`, la tarea es de un solo día.
  `work_days` son los días de trabajo, y es lo que mide la carga real: siete
  tareas de media hora no son siete de dos días.
- **El asistente entiende plazos**: "del lunes al jueves", "vom Montag bis
  Donnerstag", "de segunda a quinta", y duraciones ("3 días de trabajo").
  `parseRange()` en `dates.js` no usa una gramática por idioma: busca la
  primera fecha y, si tras ella hay una palabra de unión, busca una segunda.
- **Pantalla de inicio nueva** (`app/src/pages/Today.tsx`), que es ya la
  portada; el tablero antiguo se movió a `/tablero` y sigue funcionando.
  Estructura por URGENCIA (vencidas / hoy / esta semana / más adelante), tres
  cifras arriba, carga del equipo **en días** con aviso de sobrecarga, y una
  línea para apuntar en segundos con la sintaxis `@persona /plazo !`
  (`app/src/lib/quickAdd.ts`, resuelto en el navegador, sin ida y vuelta).
- **Paleta y tipografías del rediseño aplicadas a toda la app**
  (`index.css`): papel cálido, tinta casi negra, un solo acento verde,
  Instrument Sans + IBM Plex Sans/Mono. Todos los textos pasan contraste AA.
  Claro y oscuro.
- `TaskModal` gana los campos «Empieza» y «Días de trabajo».

Pruebas: `npm test` (fechas + asistente) y `npm run test:db`
(diálogo + vocabulario + plazos).

## Vocabulario del equipo — Entrega 2 HECHA (2026-09-03)

- **`aliases` (tabla nueva) + `server/src/aliases.js`.** Dos tipos:
  `person` ("jasmi" → Jasmina) y `task` ("la caldera" → las palabras que
  identifican esa tarea). Los alias de tarea **no** apuntan a una tarea
  concreta a propósito: las tareas se completan y se repiten cada mes, pero la
  forma de nombrarlas dura.
- **Aprende de las correcciones.** Antes, un nombre no reconocido abortaba la
  creación ("no encuentro a X, así que no he creado la tarea"). Ahora
  **pregunta** y guarda la respuesta: la siguiente vez "Chispas" ya es Isma.
  Igual con las tareas: si no sabe cuál es "la de calefacción", enseña una
  lista numerada y aprende de la elección.
- **Enseñanza a mano:** "Jasmi es Jasmina" (también `ist` y `é`). Se exige que
  la parte derecha sea una persona real y que ambas partes sean cortas, para
  no confundir "la caldera es urgente" con una enseñanza.
- **API** `GET/POST/DELETE /api/aliases`. **La pantalla para gestionarlo NO
  está hecha a propósito**: entra con el rediseño, para no construirla dos veces.
- ⚠️ **Detalle de seguridad de uso que descubrió una prueba:** si el asistente
  preguntaba "¿cuál de estas?" y la persona escribía otra cosa, la coincidencia
  floja podía **completar una tarea que nadie pidió**. Ahora solo acepta un
  número o un texto que identifique UNA candidata sin ambigüedad; cualquier
  otra cosa abandona la pregunta y se trata como mensaje nuevo.

Pruebas: `npm run test:db` → 28 del diálogo + 16 del vocabulario.

## Rediseño del tool — propuesta entregada (2026-09-03)

Cris pidió un diseño desde cero. Se le entregaron **tres direcciones** en un
lienzo (ordenador + móvil de cada una), pendientes de que elija:
**A · Hoy primero** (agenda por urgencia, misma forma en las dos pantallas —
recomendada), **B · Panel del taller** (denso, oscuro, escritorio primero,
la mejor para "quién hace qué"), **C · Bandeja** (una línea por tarea, creación
escribiendo `@persona /fecha !urgente`).
Cris respondió que usan móvil y ordenador **por igual** y que le estorban las
cuatro cosas: urgencia poco visible, crear tareas lento, no se ve quién hace
qué, y el aspecto. **No empezar a construir hasta que elija dirección.**

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
- **Los textos de cara al usuario van en `i18n.js`**, nunca incrustados en la
  lógica. Si añades un mensaje, añádelo en los tres idiomas.
- **Cuidado al detectar idioma con mensajes cortos**: "ok", "sí", "ja" no dan
  señal. Por eso `detectLanguage()` exige ≥15 caracteres y devuelve null.
