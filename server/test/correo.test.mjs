// Pruebas del vigilante del buzón.
// Los asuntos son REALES, sacados del buzón de la empresa (últimos 14 días).
import { initDb, query, pool } from '../src/db.js'
import { clasificarCorreo, nombreDeRemitente, yaVisto, marcarVisto, TIPOS, claveDeAsunto, hiloYaAbierto } from '../src/correo.js'

let fallos = 0
function checkIgual(n, real, debe) {
  if (real === debe) console.log(`  ✔ ${n}`)
  else { fallos++; console.log(`  ✘ ${n}\n      obtenido: ${JSON.stringify(real)}\n      esperado: ${JSON.stringify(debe)}`) }
}

console.log('\n1. RECONOCER DE QUÉ VA CADA CORREO (asuntos reales)')
checkIgual('Zimmer-Reservierung → habitación', clasificarCorreo({ asunto: 'Zimmer-Reservierung' }), 'habitacion')
checkIgual('Anfrage N‘s Hotel Kerzers → habitación', clasificarCorreo({ asunto: 'Anfrage N‘s Hotel Kerzers' }), 'habitacion')
checkIgual('zimmer (en minúscula) → habitación', clasificarCorreo({ asunto: 'zimmer' }), 'habitacion')
checkIgual('Triflex ... Besichtigung und Offerte → oferta',
  clasificarCorreo({ asunto: "WG: Triflex-Beschichtung N's Hotel Kerzers, Hoteleingang (ca. 10 m²) - Besichtigung und Offerte" }), 'oferta')
checkIgual('Rechnung Aufenthaltstaxe → factura', clasificarCorreo({ asunto: 'Rechnung Aufenthaltstaxe 2026009492' }), 'factura')
checkIgual('Termin für Beratung → cita', clasificarCorreo({ asunto: 'AW: Termin für Beratung - Projekt Ländlistrasse 123a' }), 'cita')

console.log('\n2. LO QUE NO DEBE MOLESTAR')
checkIgual('las respuestas de ausencia se ignoran',
  clasificarCorreo({ asunto: 'Automatische Antwort: Zimmer-Anfrage / Zimmer-Reservation' }), null)
checkIgual('los no-reply se ignoran',
  clasificarCorreo({ asunto: 'Ihre Rechnung', remitente: 'no-reply@ejemplo.ch' }), null)
checkIgual('los boletines se ignoran',
  clasificarCorreo({ asunto: 'Angebot der Woche', remitente: 'newsletter@tienda.ch' }), null)
checkIgual('un correo cualquiera no genera nada', clasificarCorreo({ asunto: 'Mittagessen?' }), null)

console.log('\n3. EL REMITENTE')
checkIgual('nombre y correo por separado',
  JSON.stringify(nombreDeRemitente('Sandra Marjanovic <s.marjanovic@workflow.swiss>')),
  JSON.stringify({ nombre: 'Sandra Marjanovic', correo: 's.marjanovic@workflow.swiss' }))
checkIgual('solo el correo también vale',
  nombreDeRemitente('office@bhtech.ch').correo, 'office@bhtech.ch')

console.log('\n4. NO REPETIR EL MISMO CORREO')
await initDb()
await query('delete from seen_mails')
checkIgual('uno nuevo no está visto', await yaVisto('<abc@ejemplo.ch>'), false)
await marcarVisto('<abc@ejemplo.ch>', 'habitacion')
checkIgual('después de marcarlo, sí', await yaVisto('<abc@ejemplo.ch>'), true)
await marcarVisto('<abc@ejemplo.ch>', 'habitacion')  // no debe romper
checkIgual('marcarlo dos veces no rompe', await yaVisto('<abc@ejemplo.ch>'), true)
checkIgual('sin identificador se considera visto (no duplicar)', await yaVisto(null), true)

console.log('\n4b. NO MOLESTAR CON LO NUESTRO NI REPETIR HILOS')
// Las respuestas entre el equipo no son trabajo que entra.
checkIgual('un correo de un compañero se ignora',
  clasificarCorreo({ asunto: 'AW: Termin für Beratung', remitente: 'mridha@reto-amonn.ch' }), null)
checkIgual('y los del hotel también', clasificarCorreo({ asunto: 'Zimmer frei?', remitente: 'info@ns-hotel.ch' }), null)
checkIgual('pero uno de fuera sí cuenta',
  clasificarCorreo({ asunto: 'Zimmer-Reservierung', remitente: 's.marjanovic@workflow.swiss' }), 'habitacion')
// Un hilo largo es un trabajo, no cinco.
checkIgual('el asunto se limpia de prefijos',
  claveDeAsunto('AW: WG: Termin für Beratung'), 'termin für beratung')
checkIgual('respuesta y original son el mismo hilo',
  claveDeAsunto('Re: Zimmer-Reservierung') === claveDeAsunto('Zimmer-Reservierung'), true)
await query('delete from seen_mails')
checkIgual('un hilo nuevo no está abierto', await hiloYaAbierto('Zimmer-Reservierung'), false)
await marcarVisto('<uno@x.ch>', 'habitacion', null, 'Zimmer-Reservierung')
checkIgual('tras el primero, la respuesta ya no crea otra tarea',
  await hiloYaAbierto('Re: Zimmer-Reservierung'), true)

console.log('\n5. LOS PLAZOS TIENEN SENTIDO')
checkIgual('una solicitud de habitación se responde al día siguiente', TIPOS.habitacion.dias, 1)
checkIgual('una factura tiene más margen', TIPOS.factura.dias > TIPOS.habitacion.dias, true)

await pool.end()
console.log(fallos === 0 ? '\n✅ todas las pruebas del vigilante pasan\n' : `\n❌ ${fallos} fallo(s)\n`)
process.exit(fallos === 0 ? 0 : 1)
