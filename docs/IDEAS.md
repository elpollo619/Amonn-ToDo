# Lo hablado y lo pendiente

Recogido el 4 de septiembre de 2026, para que no se pierda. Lo de arriba
está hecho; lo de abajo, no.

## Hecho y funcionando

| Qué | Cómo se usa |
|---|---|
| Tareas por WhatsApp | «Crea una tarea a Rayna: pintar la fachada, para el lunes» |
| Plazos, reasignar, detalle, listar | «Cambia el plazo de la caldera al viernes» · «Pásale la caldera a Rayna» · «¿Cómo va la caldera?» · «Qué hay en esperando material» |
| Fotos y notas de voz | Se adjuntan a la tarea. La voz además se transcribe (Whisper en el NAS) y se ejecuta como orden |
| Aviso diario agrupado | Un mensaje por persona: atrasadas · hoy · mañana |
| Residuos de Muri | «¿Cuándo sacan el papel?» + aviso la tarde anterior |
| Lista de la compra | «Falta café» · «¿Qué falta?» · «Todo comprado» |
| Citas y calendario | «Cita con Baumgartner el martes a las 14:00» + calendario suscribible |
| Contactos de obra | «Teléfono de Baumgartner». 34 importados con BKP, obra y estado de oferta |
| Spesen | «Gasto 37.90 Landi Kabelbinder» o mandar el PDF y contestar los datos |
| Vigilante del buzón | Convierte en tarea las solicitudes de habitación, ofertas, facturas y citas |

## Pendiente, por orden de lo que más ahorra

1. **Recibos directos a la carpeta de la empresa.** Hoy se archivan en el NAS
   con el nombre y la carpeta correctos (`26.09/A14 260904 Migros …pdf`), pero
   no en el Netzlaufwerk. **Falta:** la ruta `\\servidor\…` y un usuario con
   permiso de escritura. Cris tiene Claude en el PC de la oficina, que ve esa
   carpeta — es el camino más corto.

2. **Rondas de control.** El Excel «Duschen-Kontrolle» (36 habitaciones,
   101–118 y 201–218) como lista que se marca desde el móvil con foto.
   ⚠️ Las habitaciones **206 y 207** llevan desde el 31.08.2026 con
   «Wasser tritt aus – neue Kittfuge noch nicht gemacht» y no están como
   tarea en ningún sitio.

3. **Control de alquileres.** Los contratos dicen que el pago debe llegar
   **antes del día 28** para que se renueve solo. Hoy alguien tiene que
   comprobarlo a mano. La lista `Liste Mietvertrag neu.xlsx` tiene 503
   contratos (B22: 91 · A14: 81 · B4: 58 · A4: 40 · B7: 21 · S17 · A12 · H8).

4. **Seguimiento de ofertas.** La Kontaktliste del proyecto Seewer ya lleva el
   estado de cada gremio (sin respuesta · oferta recibida · adjudicado).
   Avisar de «llevas tres semanas esperando oferta de Rascor» convierte ese
   Excel en algo que trabaja solo.

5. **OCR de recibos.** Los recibos de la empresa son escaneos, no PDFs con
   texto (comprobado con dos reales). Con Tesseract en el NAS —como ya se hizo
   con Whisper— se podría leer el importe en vez de preguntarlo.

6. **Contratos de habitación.** La máscara «01 Maske MV Longstay» tiene ocho
   huecos: nombre y dirección, habitación y planta, fecha, precio, fianza,
   código A14-nnn y llaves. Generar el MV en PDF, crear la carpeta
   `A14-nnn Nombre` y dejar también la RG con su QR suizo.

7. ~~**El tablero web desde fuera.**~~ **HECHO** (09.09.2026): resuelto con
   el **Tailscale Funnel**, no con cloudflared. La app está en
   https://nas-amonn.tail850d70.ts.net y `APP_URL` apunta ahí.

8. **Más cosas del día a día.** ~~Kilometraje («120 km a Gampelen», columna
   URE FZ)~~ **HECHO** (08.09.2026) · ~~«¿cuánto gastamos en IKEA este
   año?»~~ **HECHO** (08.09.2026) · horas por obra · control de llaves del
   Longstay · ~~cerrar el mes de Spesen~~ **HECHO**.
   La tarifa del kilometraje es **CHF 0.80/km** (confirmada por Cris el
   09.09.2026): `KM_RAPPEN: 80` en el compose del NAS. El valor por defecto
   del código sigue siendo 70, así que si algún día se recrea el compose sin
   esa variable, los kilómetros se pagarían de menos: mantenerla.

## Decisiones tomadas, para no volver a discutirlas

- **Sin IA de pago.** El asistente funciona solo con reglas escritas a mano:
  responde al instante, no manda datos de clientes a nadie y no cuesta nada.
  El código admite Gemini si algún día hace falta para frases libres.
- **No se escribe en los Excel originales.** Ni el Spesen ni las listas de
  contactos. Tienen fórmulas y los abre gente: escribir mientras alguien los
  tiene abiertos pisa el trabajo sin avisar. Se exporta cuando toca.
- **El calendario se publica, no se conecta.** Un `.ics` al que Google se
  suscribe, en vez de pedir permisos a la cuenta de Google. Sin credenciales
  que caducan. A cambio, Google refresca cuando quiere.
- **El buzón no se toca.** El vigilante no marca nada como leído ni mueve
  correos; recuerda lo visto en su propia base.
- **Nunca se descarta un adjunto.** Foto o recibo se guardan ANTES de
  preguntar nada, para que sobrevivan aunque nadie conteste.
