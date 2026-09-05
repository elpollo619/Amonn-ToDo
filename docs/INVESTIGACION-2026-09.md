# Investigación (05.09.2026): qué integrar después

> **Corrección de Cris (mismo día):** la empresa **YA PAGA Apaleo y LIKE
> MAGIC** para el N's Hotel (A14, Kerzers) — integrarlos no cuesta nada
> nuevo, solo pedir credenciales API de cuentas propias. Lo que aún NO
> está contratado del todo es **Beds24** para Casa Reto (cuenta a medio
> crear, canales sin conectar): ese sí sería un gasto nuevo (~CHF 10–15/mes)
> cuando se remate.

Dos barridos hechos con agentes: ideas de negocio (APIs suizas) y
herramientas open-source (GitHub/npm). Resumen accionable; los detalles y
fuentes están en el historial de la sesión del 05.09.2026.

## El paquete estrella: cobros (ideas 1–3, coste 0)

1. **QR-Rechnung** con la librería npm `swissqrbill` (MIT, activa, genera
   PDF/SVG, spec SIX v2.3). «Factura A4-11 septiembre» → PDF por WhatsApp.
   *Falta de Cris: el IBAN-QR del banco de la empresa.*
2. **Conciliación camt.053/054**: descargar el XML del e-banking (o
   reenviarlo al buzón IMAP que ya vigilamos) → el server marca quién pagó.
   Parser propio con `fast-xml-parser` (los paquetes camt de npm están
   muertos). La referencia QRR de cada factura identifica al inquilino.
3. **Mahnwesen**: día 28+3 sin pago → 1./2. Mahnung por plantilla Google
   Docs (misma vía que los contratos) con QR-bill nueva + aviso al equipo.

Con ~500 contratos, esto es el mini-Mietinkasso completo sin coste mensual.

## Victorias rápidas (medio día cada una, coste 0)

- **Meteo de obra**: Open-Meteo expone el modelo ICON de MeteoSwiss por
  JSON sin clave (open-meteo.com/en/docs/meteoswiss-api). Alerta la tarde
  antes: helada/lluvia fuerte/viento en Muri → «no hormigonar».
- **Vigilante del Referenzzinssatz** (BWO, sin API → scraping 1×/mes de
  bwo.admin.ch) + IPC del BFS (sí tiene API): avisa cuando cambia y calcula
  el ajuste legal de renta por contrato. Dinero real con 500 contratos.

## Pendientes conocidos, mejor camino confirmado

- **OCR de recibos**: NO Tesseract como principal — foto → **Gemini vision**
  (la clave ya está en el NAS) → JSON {fecha, importe, IVA, comercio}.
  Céntimos al mes. Si hiciera falta offline: contenedor `jbarlow83/ocrmypdf`
  con `-l deu` (no tesseract.js: WASM lento en NAS).
- **Beds24 mensajería**: la API v2 (que ya usamos para precios) tiene
  `GET/POST /bookings/messages` con Airbnb/Booking/Expedia integrados →
  los mensajes de huéspedes de Casa Reto entran y salen por WhatsApp.
  Activar los canales se hace dentro de Beds24, sin código nuevo.
- **Apaleo**: confirmado API-first, sandbox gratis (apaleo.dev), webhooks,
  Housekeeping API (avisar por WhatsApp qué habitaciones limpiar). Generar
  cliente propio desde su OpenAPI oficial; los clientes de GitHub tienen ≤6★.
- **Tassa di soggiorno Tessin**: sin API pública de la OTR; lo automatizable
  es contar pernoctaciones desde Beds24 y generar el resumen anual (antes
  del 5 de enero).

## Firma electrónica de contratos

**DeepSign** (Abacus, hosting suizo) gana en precio: 5 firmas gratis, luego
~CHF 0.20–1.80/firma, API REST. Skribble desde ~CHF 20/mes. Matiz legal: el
Mietvertrag no exige forma escrita → basta firma simple/avanzada (barata);
la QES solo donde la ley pide firma manuscrita.

## WhatsApp: dónde estamos parados

open-wa sigue mantenido (push sep 2026); whatsapp-web.js y Baileys también.
Sin urgencia de migrar. Si OpenWA muriera: **Baileys** (MIT, socket puro,
11 deps). La única vía sin riesgo de ban es la Cloud API oficial de Meta
(de pago por plantilla; exigiría un SEGUNDO número verificado — el actual
no puede seguir en la app normal). Recomendación: híbrido solo si algún día
se quiere mandar avisos masivos a inquilinos.

## Librerías vetadas (y por qué)

- `xlsx`/SheetJS de npm: congelada en 0.18.5 (2022) con CVEs. Usar `exceljs`.
- `pdf-parse` v1: abandonada; solo vale la v2 (2025, sobre pdfjs-dist).
- microrealestate: licencia SUL, prohíbe nuestro uso comercial. Solo ideas.
- tesseract.js como OCR principal; PaddleOCR (demasiado pesado para el NAS).
- DOCX: si algún día hace falta, `docxtemplater` core (MIT, tags/loops
  gratis) o `easy-template-x` (MIT, también imágenes).

## Orden recomendado

1. QR-bill + camt + Mahnwesen (pedir IBAN-QR a Cris)
2. Meteo + Referenzzinssatz (sin bloqueos)
3. OCR de recibos con Gemini vision (sin bloqueos)
4. Beds24 mensajería + conteo Tessin
5. Estratégicas con compromiso: Apaleo (adoptar PMS) · DeepSign · Cloud API
