# Empieza por aquí

> **FUNNEL ENCENDIDO (09.09.2026).** La app es pública en
> **https://nas-amonn.tail850d70.ts.net** y `APP_URL` ya está en el compose
> del NAS, así que los enlaces del asistente (PDFs de facturas y Mahnungen,
> CSVs de gastos) se abren desde cualquier móvil. Para apagarlo:
> `docker exec tailscale tailscale funnel --https=443 off`.
>
> **PISTA GORDA — RESUELTA EL 08.09.2026.** Se siguió el rastro del Cockpit
> y el resultado cambia el plan: **las credenciales de Apaleo YA EXISTEN y
> funcionan.** No hay que pedirle nada a nadie. Qué se encontró:
>
> - El Cockpit (https://web-silk-sigma-66.vercel.app/Cockpit.html) **no
>   consulta ninguna API**: es HTML estático, sin `fetch` y sin Supabase, con
>   los Excel incrustados como `data:` URI. Lo **regenera y republica** cada
>   hora un pipeline.
> - Ese pipeline es el repo **`elpollo619/ns-hotel-tool`** (privado):
>   `scripts/apaleo_sync.py` + `daily_report.py` + `publish_web.py`, y
>   `.github/workflows/update.yml` lo corre en GitHub Actions con los secrets
>   `APALEO_CONFIG` y `VERCEL_TOKEN` (puestos el 06.07.2026).
> - Las credenciales están en el Mac de Cris:
>   `~/Documents/Claude/Projects/Einkommen N's Hotel/apaleo_config.json`
>   → app Apaleo **`UCVF-SP-EINKOMMEN_SYNC`**, account `UCVF`.
>
> **Probado contra la API de verdad el 08.09.2026** (`identity.apaleo.com`
> responde, token de 1 h):
>
> | Comprobación | Resultado |
> |---|---|
> | Scopes reales de la app | **solo `reservations.read` + `accounting.read`** |
> | `propertyId` | **`NSH`** — ⚠️ en `apaleo_config.json` está **vacío** |
> | `/inventory/v1/properties` | ✅ 200 (N's Hotel, Allmendstrasse 14, Kerzers) |
> | `/booking/v1/reservations` | ✅ 200, datos reales (unit `208+210`, `InHouse`) |
> | `/inventory/v1/units` | ❌ **403** — falta permiso |
>
> Consecuencia práctica: **«¿cuántos llegan hoy?» ya puede funcionar hoy
> mismo**; **«¿qué cuartos están sucios?» NO**, hasta que se añada el permiso
> de inventario a esa app en Apaleo (Apps → Connected apps → scopes).
>
> ✅ **ENCENDIDO EN EL NAS el 08.09.2026.** Las tres variables ya están en el
> compose (copia previa en `docker-compose.yaml.bak-apaleo-20260908`):
> `APALEO_CLIENT_ID: UCVF-SP-EINKOMMEN_SYNC`, `APALEO_CLIENT_SECRET` (el de
> `apaleo_config.json`, **nunca** en el repo) y `APALEO_PROPERTY_ID: NSH`.
> Probado en producción contra Apaleo de verdad: **6 llegadas / 9 personas y
> 4 salidas**, con nombres y habitaciones (208+210, 201, 209, 102, 203) — los
> mismos números que enseña el Cockpit («Heute An / Ab: 6 / 4»). La limpieza
> devuelve 403 y el asistente lo explica en vez de romperse, como se diseñó.
>
> ⚠️ **INCIDENTE DEL MISMO DÍA, ajeno a esto: la base de datos se cayó.** De
> 14:05 a 16:05 (hora suiza) el asistente estuvo MUDO. Los 1416 ficheros de
> `/volume1/docker/data/pgdata` habían pasado a pertenecer a `root`, y
> Postgres corre como **uid 70**: no podía leer sus propios ficheros
> (`42501` · `could not open file "global/pg_filenode.map"`). Ojo: el
> contenedor de la BD seguía marcándose «healthy». Arreglado con
> `docker run --rm -v /volume1/docker/data/pgdata:/d alpine sh -c "chown -R
> 70:70 /d && chmod 700 /d"` + reiniciar `db` y `server`.
> **No se supo qué los reasignó a root.** Si el asistente vuelve a enmudecer,
> mirar esto primero.
>
> **Nuevo el 08.09.2026:** kilometraje y consulta de gasto por comercio, y
> tres fallos silenciosos corregidos (ver «Arreglado» abajo). 20 baterías de
> pruebas en verde.
>
> Todo lo demás del 05-06.09 está DESPLEGADO y en verde: cobros completos
> (facturas QR con la cuenta HIAG WIR confirmada, extractos camt, impagos
> día 25, Mahnwesen, Mietertrag, Vorsteuer), permisos por WhatsApp (admin
> Cris), secretaria Gemini, precios Casa Reto, espejo huéspedes, meteo,
> Referenzzinssatz, OCR recibos, alerta de fuga en contadores, backup
> nocturno y 222 contratos importados. 28 baterías de pruebas.

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
| Kilometraje | «120 km a Gampelen» → fila del Spesen en URE FZ (cuenta 6200) a la tarifa de `KM_RAPPEN` = **80 rp/km** (CHF 0.80, confirmada por Cris el 09.09.2026 y puesta en el compose del NAS; el valor por defecto del código es 70); «kilómetros» o «kilómetros 2026» suma el año |
| Gasto por comercio | «¿cuánto gastamos en IKEA este año?» · «gasto en Coop este mes» → total, número de gastos y los cinco últimos |
| Precios del hotel | Pestaña **N's Hotel** en /precios: planes de tarifa de Apaleo y fijar precios (`server/src/apaleo.js` → `fijarPreciosHotel`). ⚠️ **Apagado hasta que la app de Apaleo tenga `rates.manage`**; hasta entonces la pestaña explica qué falta en vez de dar error |
| Puente con WorkPulse | `server/src/workpulse.js` — entra con el usuario de servicio `asistente@hansamonn.ch` y crea gastos en WorkPulse. Probado en producción desde el NAS. Aún NO se usa para guardar: espera a la migración de las 30 columnas |
| Hoja de precios (web) | Página **/precios**: el precio de cada noche, el desglose de por qué sale ese, y fijar uno a mano (permiso «dinero»). Va a `casa_overrides` de PreisPilot vía `seed` con `PREISPILOT_PIN` (en el compose del NAS, NUNCA en el navegador); el cron lo respeta y sale a Beds24 en el siguiente pase |
| Contraseña (web) | En **Perfil** cada uno cambia la suya; se exige la actual aunque la sesión esté abierta |
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
| Facturas QR | «Factura 850 para Max Muster, alquiler octubre» → PDF con QR-Rechnung y referencia QRR en `/factura/{token}.pdf` (permiso dinero; ✅ ENCENDIDO 06.09.2026 con la cuenta confirmada por Cris: Hans Amonn Immobilien AG · CH85 0839 1671 7337 4180 0, WIR Bank — la del boletín «HIAG WIR» de los contratos. Ninguna cuenta de la empresa es QR-IBAN → boletines sin referencia estructurada y conciliación por nombre; si se quiere referencia automática, pedir un QR-IBAN al banco. Las 23 cuentas encontradas están en `- 01 Büro/- 02 Bank/Einzahlungsschein/` del Drive) |
| Contratos (consulta) | «Contrato de la 204» / «contrato de Koubaa» / «alquileres de B22» — foto de la Liste (222 activos, importados 05.09.2026); reimportar: `server/scripts/importar-liste/` |
| Extractos bancarios | Mandar el camt.053/054 del e-banking por WhatsApp (solo autorizados) → quién pagó: facturas QR cobradas por referencia (paid_at) + pistas por nombre contra la Liste; reenviar el fichero no duplica (bank_entries) |
| Impagos | «¿Quién no ha pagado?» (permiso dinero) → contratos sin abono que les case este mes, según los extractos recibidos; el día 25 a las 09:00 va solo a RESUMEN_TO y SOLO si hay extractos del mes (sin datos, silencio) |
| Mahnwesen | «Mahnung a la A4-11.1» / «2. mahnung a Koubaa» (permiso dinero) → carta en alemán + QR del alquiler; 2.ª con recargo CHF 50 y OR 257d; enviarla es decisión humana |
| Mietertrag | «Mietertrag 2026-09» (permiso dinero) → CSV de los alquileres del mes con total (paso 7 del manual) |
| Backup | Copia nocturna 03:30 de toda la base a `uploads/backups/*.json.gz` (14 días) |
| Permisos | Cris (admin) reparte accesos POR WHATSAPP: «dale acceso al dinero a Jasmina», «quita…», «accesos». Catálogo: admin, dinero, huespedes, hotel, accesos, contratos (los tres últimos, listos para cuando Apaleo/SALTO/Google se conecten). Siembra al arrancar: ADMIN_PHONE (Cris) + GUEST_TEAM con dinero+huéspedes, solo si no tienen nada |
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
   dos** (aclarado por Cris el 05.09.2026): no hay coste nuevo.
   (a) ~~Apaleo: crear la app y pedir las llaves~~ **YA NO HACE FALTA**
   (08.09.2026): la app **`UCVF-SP-EINKOMMEN_SYNC`** existe desde junio,
   funciona, y sus credenciales están en el Mac de Cris
   (`~/Documents/Claude/Projects/Einkommen N's Hotel/apaleo_config.json`).
   `server/src/apaleo.js` ya está **probado contra la cuenta real**: se miró
   la respuesta cruda y se corrigió con lo que de verdad devuelve. El
   `propertyId` es **`NSH`** (ojo: en `apaleo_config.json` está vacío).
   **Solo falta meter las 3 variables en el compose del NAS** (arriba del
   todo están escritas) y reiniciar `server`.
   ⚠️ Con los permisos actuales (`reservations.read` + `accounting.read`)
   funcionan llegadas/salidas/in-house, pero **NO** el estado de limpieza:
   `/inventory/v1/units` da **403**. El asistente ya lo explica solo en vez
   de dar error.
   **Para encender la limpieza, Cris tiene que marcar un permiso** en
   app.apaleo.com → Apps → Connected apps → app `UCVF-SP-EINKOMMEN_SYNC`
   (¡editar la que ya hay, no crear otra!) → scopes → **`units.read`**
   (vale también `setup.read`; nada de `*.manage` ni `admin`). No hay que
   volver a copiar el secret: los permisos se aplican en el siguiente token,
   como mucho una hora. Comprobado en el swagger oficial
   `api.apaleo.com/swagger/inventory-v1/swagger.json`.
   Ese permiso trae por unidad: `status.condition`, `status.isOccupied` y
   `status.maintenance` (habitaciones fuera de servicio → función
   `enMantenimiento()`, pensada para casos como la fuga de la 206/207).
   Pendiente aún: suscribirse a los webhooks (autoservicio) para estar al día
   sin sondear.
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
9. **Export contable a Infoniqa ONE 50** (el software del Treuhänder, ex
   Sage 50 — investigado 06.09.2026). El import va por CSV `sfbbuch.csv`
   (Extras → Buchungen importieren; `;`, ANSI **no UTF-8**, fechas
   dd.mm.jjjj, importes 1234.50, todo-o-nada, cuentas y códigos MwSt deben
   existir en el mandante). ⚠️ El layout exacto NO es público — y el layout
   de 31 campos del Hilfe-Center es de ONE **Start**, no de ONE 50: no
   calcárselo. Camino correcto: pedir al Treuhänder (a) un
   `sfbbuch.csv` de ejemplo exportado desde SU ONE 50 con 3–4 asientos
   variados (el export ES la especificación), (b) su lista de
   Steuerschlüssel (típicos: USt81/USt26/USt38, VSM81, VSB81…) y (c) el
   plan de cuentas. Con eso se calca el fichero desde Node (iconv-lite
   para ANSI) y se prueba en un mandante de prueba con Beleggruppe propia.
10. **Variables nuevas opcionales** en el compose del NAS: `RESUMEN_TO`
   (teléfonos, separados por comas, que reciben el resumen del lunes) y
   `RESUMEN_CRON` (por defecto `0 7 * * 1`).

## 4b. Arreglado el 08.09.2026 (fallos silenciosos que ya mordían)

- **«del lunes al jueves» dicho un martes** daba un rango invertido: el
  lunes era el de la semana siguiente y el jueves el de esta. `parseRange`
  devolvía `null`, pero el título ya se había limpiado → la tarea nacía
  como «Revisar la caldera, del al» y **sin plazo**. Ahora el fin se empuja
  siete días cuando es un día de la semana, y `limpiaConectores()` barre las
  preposiciones huérfanas.
- **Pedir una Mahnung reventaba el asistente** si la cuenta es un QR-IBAN:
  swissqrbill exige referencia QRR y `mahnung.js` no la ponía (las facturas
  de `cobros.js` sí). Ahora usa la misma regla y guarda la referencia.
- **«mietertrag 2026-09»** —la forma que documenta este mismo manual— caía
  en «no te he entendido»: la regla usaba `\w+`, que no admite el guion.
- Dos pruebas se ataban al entorno (fechas fijas del día en que se
  escribieron, y el separador de miles de `de-CH`, que cambia según el ICU
  de cada Node). Ahora comprueban la forma, no la máquina.

## 4c. La hoja de precios — lo que falta y las trampas (09.09.2026)

🔴 **CAMBIO DE POLÍTICA (09.09.2026, decisión de Cris): los precios ya NO se
aplican solos.** El job de pg_cron `preispilot-apply-casa-reto` (cron.job id
1) está **`active = false`**. Se reactiva con
`select cron.alter_job(1, active := true);` en el Supabase de PreisPilot.
Ahora los precios llegan a Beds24 SOLO cuando un **admin** pulsa «Aprobar y
enviar» en /precios. Consecuencia: **si nadie pulsa, Beds24 se queda con los
últimos precios enviados.** Conviene mirarlo de vez en cuando.
Aprobar precios exige **admin**, ya no el permiso «dinero».

🔴 **NO existe ningún radar de competencia automático**, pese a que se creía
que sí. Lo único que hay es `data/comp-data.json` en `preispilot-engine`,
**rellenado a mano, con 6 fechas**. Medido sobre el calendario real: solo
**6 de 364 noches** llevan el paso `Wettbewerb`. Por eso la hoja enseña un
nivel de fiabilidad (alta/media/baja) por semana en vez de un número seco.
Para tener exactitud de verdad hacen falta datos de mercado (PriceLabs,
AirDNA…) o alguien rellenando esa tabla a conciencia. **Raspar Booking o
Airbnb no es el camino**: va contra sus términos y se rompe cada dos por
tres.

⚠️ **El botón «volver a mirar la competencia a fondo» que pidió Cris no se
pudo hacer**, por lo de arriba: no hay fuente que consultar. Y *recalcular*
el calendario tampoco se puede desde el NAS: el motor (`gen-calendar.js`)
vive en el contenedor de Cowork, no en Supabase. Lo que sí se hizo es el
botón de **enviar** lo ya calculado, con ensayo previo.

- **El hotel A14 NO está en la hoja.** Cris lo pidió, pero sus precios viven
  en Apaleo (tarifas y planes), que es otro modelo distinto del calendario
  noche-a-noche de PreisPilot. Es una segunda fase de verdad, no un añadido:
  hay que decidir qué es «el precio» de una habitación de hotel antes de
  pintarlo. Las credenciales de Apaleo ya funcionan.
- ⚠️ **`seed` reescribe la clave entera**, no una fecha: se lee el mapa de
  overrides completo y se vuelve a guardar completo. Si dos personas fijan
  precios a la vez, la última pisa a la primera. Con unas pocas fechas
  compensa la sencillez; con cientos, habrá que cambiarlo.
- ⚠️ **Recordatorio de PreisPilot:** la casa tiene `numAvail: 0` y CERO
  reservas en Beds24. Los precios son correctos, pero **la unidad no es
  reservable**: fijar precios no producirá ninguna reserva hasta que se abra
  la disponibilidad.
- Los topes `min`/`max` del motor se validan en el servidor ANTES de mandar
  nada. Un dedazo (20 en vez de 200) llegaría a Beds24 esa misma noche.

## 4d. Lo que está escrito pero AÚN NO ENCENDIDO (09.09.2026)

Dos cosas terminadas y probadas que esperan una acción de Cris. Ninguna
necesita más código: se encienden solas cuando llegue el permiso.

1. **Precios del hotel** (`apaleo.js`). Espera los scopes `rates.manage`,
   `rates.read` y `availability.read`. `puedeCambiarPrecios()` lo detecta
   solo: hoy devuelve `false` contra el Apaleo real (comprobado), y pasará a
   `true` sin tocar nada.
   ⚠️ Detalle que decide si funciona: **el formato del importe no se
   inventa**. Se lee la tarifa actual y se devuelve la misma estructura con
   el importe cambiado, porque la documentación pública no fija los nombres
   del objeto `price`. Mandar `amount` donde Apaleo espera `grossAmount` se
   aceptaría y el precio NO cambiaría — fallo silencioso sobre dinero.
2. **Gastos en WorkPulse** (`workpulse.js`). Espera a que se aplique la
   migración `20260909120000_spesen_konten_haag` (rama
   `feat/spesen-katalog-haag` del repo workpulse) y a fusionarla. Hasta
   entonces los gastos siguen guardándose en el NAS a propósito: no se
   cambia dónde vive un dato de la empresa hasta que exista la tabla al otro
   lado.
   ⚠️ En WorkPulse hay **dos migraciones más acumuladas sin aplicar**
   (nextcloud y HAAG modules, según su CLAUDE.md). Van todas juntas: hacerlo
   acompañado, no a ciegas.

## 5. Pruebas

```bash
cd server && npm test                 # sin base de datos
export PATH=/opt/homebrew/opt/postgresql@16/bin:$PATH
initdb -D /tmp/pg -U postgres --auth=trust && pg_ctl -D /tmp/pg -o "-p 5433 -k /tmp/pg" -l /tmp/pg/log start
DATABASE_URL="postgres://postgres@127.0.0.1:5433/postgres" WA_ENABLED=false npm run test:db
```

**31 baterías** (8 sin base + 23 con base), todas en verde. Si tocas el asistente, ejecútalas: varias
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
- **`Promise.all` con una llamada que puede no tener permiso**: el parte del
  hotel pedía salidas Y limpieza a la vez; como Apaleo niega la limpieza con
  un 403, se perdía TAMBIÉN lo que sí teníamos y salía «Apaleo no responde».
  Lo prescindible va aparte, con su propio `catch` (08.09.2026).
- **Una prueba puede pasar por el motivo equivocado.** `hotel.test.mjs`
  comprobaba «¿qué cuartos están sucios?» sin credenciales: la guarda de
  «no configurado» cortaba al principio, así que la regla de limpieza nunca
  se ejecutaba. Escondía que el filtro decía `/sucia/` y la pregunta natural
  —la del propio README— es «suci**os**»: nunca entraba. Si una prueba
  depende de una guarda temprana, hace falta otra que recorra el camino
  entero (`hotel_permisos.test.mjs`).
- **⚠️ FALLO PENDIENTE, ajeno a lo anterior:** `test/plazos.test.mjs` da
  **4 fallos** desde antes de esta sesión (comprobado en el árbol limpio).
  Los rangos de fecha se parsean mal: «del … al jueves» deja el inicio vacío
  («Revisar la caldera, del al jueves») y el plazo se va a la semana
  siguiente. Parece dependiente de la fecha del día. Merece una sesión.

## 7. Decisiones tomadas (no volver a discutirlas)

- **Sin IA de pago por defecto.** Reglas primero; Gemini solo de respaldo.
- **No se escribe en los Excel originales** (Spesen, contactos): tienen
  fórmulas y los abre gente.
- **El calendario se publica** (`.ics` con token), no se conecta a Google.
- **El buzón no se toca**: nada se marca leído; lo visto se recuerda en la
  base por Message-ID.
- **Nunca se descarta un adjunto**: foto o recibo se guardan ANTES de
  preguntar nada.
