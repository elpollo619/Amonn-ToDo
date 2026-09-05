# Empieza por aquí

Instrucciones para Claude Code en una sesión nueva. **Cris no es técnico y
escribe en español: háblale en español, un paso cada vez, y haz tú mismo todo
lo que puedas por consola.**

## 1. Ponerte en marcha

```bash
git clone https://github.com/elpollo619/Amonn-ToDo
cd Amonn-ToDo && git checkout claude/job-list-app-whatsapp-av9rwl
```

Lee después `docs/HANDOFF.md` (detalle técnico), `docs/IDEAS.md` (todo lo
hablado y lo pendiente) y `docs/INVESTIGACION-2026-09.md` (qué integrar
después, con APIs y librerías ya investigadas y vetadas).

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
| Cierre de mes | «Cierra los gastos de agosto» → CSV descargable (enlace con token) + gastos marcados como exportados |
| Resumen semanal | «Resumen semanal» a demanda; los lunes 07:00 automático a los teléfonos de `RESUMEN_TO` |
| Aviso de citas | 1 h antes de cada cita, WhatsApp automático a quien va (cron cada 5 min) |
| Ausencias | «Rayna de vacaciones del 10.10 al 15.10» → sin avisos diarios esos días + advertencia al asignarle tareas |
| Contadores | «Luz 204: 4521» apunta la lectura y enseña la diferencia con la anterior; «lecturas de la 204» |
| Contratos | «Contrato para Max Muster, habitación 204, 850, desde el 1 de octubre» → Google Doc + PDF con los MERGEFIELD reales de la empresa (⚠️ falta conectar Google, ver abajo) |
| Precios | «Precios» / «¿subo o bajo los precios?» → informe de Casa Reto desde PreisPilot (Supabase) con consejos; el hotel espera a Apaleo |
| Secretaria | Gemini ACTIVO (clave en el NAS desde 05.09.2026): cuando las reglas no entienden, responde preguntas libres con el dossier de la empresa (`server/src/empresa.js`) |
| Huéspedes | Espejo cada 15 min de los mensajes de Casa Reto (Beds24 vía Edge Function `guest-messages` con PIN); responder SOLO pueden Cris/Beatriz/Reto/Roberta con «responde al huésped N: …» — el agente jamás escribe solo a huéspedes/inquilinos |
| Meteo | «Tiempo» → parte de 3 días (Open-Meteo, sin clave); alerta 17:00 si mañana hay helada/lluvia fuerte/viento/nieve (METEO_TO) |
| Referenzzinssatz | «Zinssatz» → tipo actual; vigilante mensual del BWO que avisa a RESUMEN_TO si cambia (con la regla del ±3 % por 0.25 pt) |
| OCR recibos | El PDF electrónico se lee solo (extractor propio) y el escaneo/foto lo lee Gemini vision: solo se pregunta la propiedad |
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
2. **Apaleo + LIKE MAGIC (hotel A14, Kerzers).** ⚡ La empresa **YA PAGA los
   dos** (aclarado por Cris el 05.09.2026): no hay coste nuevo, solo pedir
   las llaves de cuentas propias. (a) Apaleo: entrar con LA CUENTA DEL HOTEL
   en apaleo.dev → Apps → Create app → Simple client → `APALEO_CLIENT_ID`,
   `APALEO_CLIENT_SECRET`, `APALEO_PROPERTY_ID`; `server/src/apaleo.js` está
   escrito pero sin probar — **mira primero la respuesta cruda**. Además
   suscribirse a sus webhooks (autoservicio) para estar al día sin sondear.
   (b) LIKE MAGIC: pedir al contacto/soporte de LIKE MAGIC credenciales
   OAuth de su Open API (mencionar la «Integration API» para chatbots y los
   webhooks de Unified Messaging): con eso el asistente VERÁ los mensajes
   con huéspedes; responder seguirá exigiendo orden de un autorizado.
3. ~~Cerrar el mes de Spesen~~ **HECHO** (sept 2026). «Cierra los gastos de
   agosto» funciona en es/de/pt: genera el CSV (enlace `/spesen/{token}.csv`,
   guardado en la tabla `expense_exports` de la base) y marca los gastos como
   exportados. Sin mes dicho, cierra el mes anterior. El enlace de descarga
   se construye con `APP_URL` (la misma variable que usan los avisos); si no
   está definida, el cierre se hace igual pero sin enlace.
4. **Conectar el generador de contratos a Google** (sept 2026: el código está
   escrito en `server/src/contratos.js`, con pruebas del parseo; solo falta la
   credencial). Pasos con Cris: (a) console.cloud.google.com → proyecto →
   habilitar las APIs de Drive y Docs → cuenta de servicio → clave JSON →
   `GOOGLE_SA_KEY` (el JSON entero o en base64); (b) crear la plantilla en
   Google Docs con los huecos `{{NAME}} {{ZIMMER}} {{MIETE}} {{BEGINN}}
   {{DATUM}}` → su id a `GOOGLE_CONTRACT_TEMPLATE_ID` (opcional carpeta:
   `GOOGLE_CONTRACTS_FOLDER_ID`); (c) **compartir** plantilla y carpeta con el
   correo de la cuenta de servicio. ⚠️ Rutas según docs públicas, sin probar:
   mira la respuesta cruda la primera vez. Pedir a Cris un contrato real de
   ejemplo para copiar el formato en la plantilla.
5. ~~Rondas de control (Duschen-Kontrolle)~~ **descartado** por decisión de
   Cris (sept 2026). ⚠️ Sigue pendiente en la vida real: las habitaciones
   **206 y 207** llevan desde el 31.08.2026 con fuga de agua.
6. **Aviso del día 25** de alquileres impagados (los contratos exigen pago
   antes del 28 para renovarse). 503 contratos en `Liste Mietvertrag neu.xlsx`.
7. ~~Clave de Gemini~~ **HECHO** (05.09.2026): `GEMINI_API_KEY` metida en el
   compose del NAS (hay copia en `docker-compose.yaml.bak-gemini`). Las
   reglas siguen yendo primero; Gemini entra de secretaria cuando no
   entienden, con el dossier de `server/src/empresa.js` (mantenerlo al día;
   ahí NO van secretos).
   ⚠️ Cómo se hicieron los contratos de verdad (estudiado en el Drive):
   mail-merge Word contra `Immobilien/01 Mietverträge/Liste Mietvertrag
   neu.xlsx` (hoja `Liste aktuell`, 58 columnas = MERGEFIELD), plantillas
   «01 Maske MV Longstay.docx» etc., archivo por inquilino en
   `<Edificio>/01 Mieter/<nº> <Nombre>`, firmado = `MV <Nombre> unt.pdf`.
   La plantilla Longstay convertida a Google Docs está en
   `docs/plantillas/mietvertrag-longstay.md`.
8. **OCR de recibos** (Tesseract en el NAS, como Whisper) y **el tablero web
   desde fuera** (`cloudflared` ya está instalado en el NAS).
9. **Variables nuevas opcionales** en el compose del NAS: `RESUMEN_TO`
   (teléfonos, separados por comas, que reciben el resumen del lunes) y
   `RESUMEN_CRON` (por defecto `0 7 * * 1`).

## 5. Pruebas

```bash
cd server && npm test                 # sin base de datos
export PATH=/opt/homebrew/opt/postgresql@16/bin:$PATH
initdb -D /tmp/pg -U postgres --auth=trust && pg_ctl -D /tmp/pg -o "-p 5433 -k /tmp/pg" -l /tmp/pg/log start
DATABASE_URL="postgres://postgres@127.0.0.1:5433/postgres" WA_ENABLED=false npm run test:db
```

**22 baterías** (3 sin base + 19 con base), todas en verde. Si tocas el asistente, ejecútalas: varias
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
