# Empieza por aquí

Instrucciones para Claude Code en una sesión nueva. **Cris no es técnico y
escribe en español: háblale en español, un paso cada vez, y haz tú mismo todo
lo que puedas por consola.**

## 1. Ponerte en marcha

```bash
git clone https://github.com/elpollo619/Amonn-ToDo
cd Amonn-ToDo && git checkout claude/job-list-app-whatsapp-av9rwl
```

Lee después `docs/HANDOFF.md` (detalle técnico) y `docs/IDEAS.md` (todo lo
hablado y lo pendiente).

## 2. Acceso al NAS — por Tailscale, desde cualquier sitio

```bash
ssh -i ~/.ssh/id_ed25519_kali Cris@100.77.9.60      # nas-amonn
```

⚠️ **No uses 192.168.1.9.** Esa IP solo se ve estando en la red del NAS, y
Cris trabaja desde tres sitios distintos, varios con el mismo rango
192.168.1.x. Se perdieron horas en tres sesiones por esto antes de instalar
Tailscale (contenedor `tailscale`, `network_mode: host`).

- App: `http://100.77.9.60:8080` · versión: `curl -s .../api/version`
- `docker` va **sin sudo**. Cris **no** puede escribir en `/volume1/docker/data`:
  usa `/home/Cris` o volúmenes con nombre.
- Compose: `/volume1/docker/docker-compose.yaml` — **tiene los secretos
  reales, no lo imprimas ni lo copies al repo.** El servicio se llama
  `server`, no `amonn-server` (eso es el `container_name`).
- **Desplegar = `git push`.** CI publica y Watchtower aplica en ≤5 min. Si
  tienes prisa: `docker pull ghcr.io/elpollo619/amonn-todo:latest && cd
  /volume1/docker && docker compose -p amonn -f docker-compose.yaml up -d`

## 3. Qué hace hoy el asistente de WhatsApp (+41 76 226 04 47)

Todo esto está **desplegado y probado con datos reales**:

| Área | Ejemplos |
|---|---|
| Tareas | «Crea una tarea a Rayna: pintar la fachada, para el lunes» · «Hecha la de la caldera» |
| Retoques | «Cambia el plazo de la caldera al viernes» · «Pásale la caldera a Rayna» · «¿Cómo va la caldera?» · «Qué hay en esperando material» |
| Fotos y voz | Se adjuntan a la tarea. La voz se transcribe (Whisper local) y se ejecuta como orden |
| Avisos | Un mensaje diario por persona: atrasadas · hoy · mañana |
| Residuos Muri | «¿Cuándo sacan el papel?» + aviso la tarde anterior |
| Compra | «Falta café» · «¿Qué falta?» · «Todo comprado» |
| Citas | «Cita con Baumgartner el martes a las 14:00» + calendario `.ics` suscribible |
| Contactos | «Teléfono de Baumgartner» · «Guarda contacto: …» (34 importados) |
| Spesen | «Gasto 37.90 Landi Kabelbinder», o mandar el PDF y contestar importe/día/propiedad |
| Correo | Vigila el buzón y crea tareas de solicitudes, ofertas, facturas y citas |
| Hotel | «¿Cuántos llegan hoy?» · «¿Qué cuartos están sucios?» (falta conectar Apaleo) |

Personas: los 7 trabajadores están dados de alta con teléfono, correo,
idioma y **contraseña propia** (las contraseñas se le dieron a Cris en el
chat; no están en el repo).

## 4. Lo que falta, por orden de lo que más ahorra

1. **Recibos a la carpeta de la empresa.** Hoy se archivan en el NAS
   (`uploads/spesen/26.09/A14 260904 Migros …pdf`), con el nombre y el
   formato de carpeta que ya usa la empresa en Drive. **Falta la ruta
   `\\servidor\…` y un usuario con permiso de escritura.** Cris tiene Claude
   Code en el PC de la oficina, que sí ve esa carpeta: es el camino corto.
2. **Apaleo (hotel).** `server/src/apaleo.js` está escrito pero **sin probar
   contra la cuenta real**. Faltan `APALEO_CLIENT_ID`, `APALEO_CLIENT_SECRET`
   y `APALEO_PROPERTY_ID` (apaleo.dev → Apps → Create app → Simple client).
   Al conectar, **mira primero la respuesta cruda** antes de fiarte de las
   rutas: están puestas según la documentación pública, no verificadas.
3. **Cerrar el mes de Spesen.** «Cierra los gastos de agosto» → CSV +
   marcarlos como exportados. `exportarCsv()` ya existe en `gastos.js`.
4. **Rondas de control.** El Excel «Duschen-Kontrolle» (36 habitaciones) como
   lista que se marca desde el móvil. ⚠️ Las **206 y 207** llevan desde el
   31.08.2026 con fuga de agua y no son tarea de nadie.
5. **Aviso del día 25** de alquileres impagados (los contratos exigen pago
   antes del 28 para renovarse). 503 contratos en `Liste Mietvertrag neu.xlsx`.
6. **Clave de Gemini** (`GEMINI_API_KEY`, aistudio.google.com/apikey). Ya está
   enchufado como RESPALDO: las reglas responden primero y Gemini solo entra
   cuando no entienden.
7. **OCR de recibos** (Tesseract en el NAS, como Whisper) y **el tablero web
   desde fuera** (`cloudflared` ya está instalado en el NAS).

## 5. Pruebas

```bash
cd server && npm test                 # sin base de datos
export PATH=/opt/homebrew/opt/postgresql@16/bin:$PATH
initdb -D /tmp/pg -U postgres --auth=trust && pg_ctl -D /tmp/pg -o "-p 5433 -k /tmp/pg" -l /tmp/pg/log start
DATABASE_URL="postgres://postgres@127.0.0.1:5433/postgres" WA_ENABLED=false npm run test:db
```

**18 baterías**, todas en verde. Si tocas el asistente, ejecútalas: varias
existen porque un cambio rompió algo silenciosamente.

## 6. Trampas que ya han mordido

- **`create table if not exists` NO añade columnas** a una tabla que ya
  existe. Usa `alter table … add column if not exists`.
- **El campo es `due_date`, no `dueDate`.** Escribirlo mal no da error: la
  tarea nace sin plazo y todo *parece* funcionar.
- **El Gateway devuelve el array de sesiones DIRECTAMENTE**, sin envolver. Y
  suscribirse con `sessionId: "auto"` se acusa como correcto pero **no llega
  ningún evento**.
- **Los recibos de la empresa son escaneos**, no PDFs con texto. Un extractor
  propio devolvía basura binaria diciendo haber leído: exige texto legible
  antes de fiarte.
- **`text-transform: capitalize` en español** da "Agosto De 2026". Mayúscula
  inicial en JS.
- **`restoreCase()` es para títulos de tarea**, no para contactos: rompe
  nombres y capitaliza correos. Usa el texto crudo.
- **Verbos compartidos**: «pon», «añade», «pasa», «cambia», «asigna» sirven
  para crear tareas Y para otras cosas. Toda regla nueva exige que la pista
  señale una tarea existente. Hay pruebas que vigilan que crear siga creando.
- **Formularios anidados**: pasos y comentarios viven DENTRO del formulario
  de la tarea. Nada de `<form>` dentro.

## 7. Decisiones tomadas (no volver a discutirlas)

- **Sin IA de pago por defecto.** Reglas primero; Gemini solo de respaldo.
- **No se escribe en los Excel originales** (Spesen, contactos): tienen
  fórmulas y los abre gente.
- **El calendario se publica** (`.ics` con token), no se conecta a Google.
- **El buzón no se toca**: nada se marca leído; lo visto se recuerda en la
  base por Message-ID.
- **Nunca se descarta un adjunto**: foto o recibo se guardan ANTES de
  preguntar nada.
