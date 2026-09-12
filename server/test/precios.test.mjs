// Pruebas del consejero de precios: el análisis es puro, así que se prueba
// con un dashboard de mentira sin llamar a PreisPilot.
import { analizarPrecios } from '../src/precios.js'

const HOY = '2026-09-03'
let fallos = 0
const eq = (nombre, real, esperado) => {
  const ok = JSON.stringify(real) === JSON.stringify(esperado)
  if (!ok) { fallos++; console.log(`  ✘ ${nombre}\n      obtenido: ${JSON.stringify(real)}\n      esperado: ${JSON.stringify(esperado)}`) }
  else console.log(`  ✔ ${nombre}`)
}

const noche = (d, p, extra = {}) => ({ d, p, w: '', we: 0, ev: '', ...extra })
const DASH = {
  status: {
    property: 'Casa Reto', base: 300, min: 180, max: 720, hi: 475,
    weekdayAvg: 290, weekendAvg: 336, generated: '2026-08-01',
  },
  calendar: [
    noche('2026-09-01', 280),                         // pasada: se ignora
    noche('2026-09-03', 320),                         // cercana, cara, sin evento
    noche('2026-09-04', 330),                         // cercana, cara, sin evento
    noche('2026-09-05', 336, { we: 1 }),              // finde: no cuenta como cara
    noche('2026-09-20', 310, { ev: 'Herbstmesse' }),  // evento barato (< base*1.25)
    noche('2026-12-24', 475, { ev: 'Weihnachten' }),  // lejos de la ventana de 60 días
  ],
  lastApply: { ok: true, at: '2026-09-03T04:15:00Z' },
}

console.log('\n1. LOS NÚMEROS')
const a = analizarPrecios(DASH, HOY)
eq('las noches pasadas no cuentan', a.prox7.length, 3)
eq('media de 7 días', a.media7, Math.round((320 + 330 + 336) / 3))
eq('eventos en 30 días', a.eventosProx30, 1)
eq('último envío ok', a.aplicado, true)

console.log('\n2. LOS CONSEJOS')
const tipos = a.consejos.map((c) => c.tipo)
eq('cálculo viejo (33 días) → recalcular', tipos.includes('stale'), true)
eq('2 noches cercanas caras → bajar', tipos.includes('bajar'), true)
eq('evento barato a la vista → subir', tipos.includes('subir'), true)
eq('el finde caro NO cuenta para bajar', a.consejos.find((c) => c.tipo === 'bajar').noches, 2)
eq('el evento lejano no entra en subir', a.consejos.find((c) => c.tipo === 'subir').noches, 1)

console.log('\n3. CUANDO TODO ESTÁ BIEN, NO SE INVENTA NADA')
const tranquilo = analizarPrecios({
  status: { ...DASH.status, generated: '2026-09-01' },
  calendar: [noche('2026-09-03', 280)],
  lastApply: { ok: true },
}, HOY)
eq('sin consejos', tranquilo.consejos.length, 0)

console.log('\n4. EL ENVÍO FALLIDO SE AVISA')
const roto = analizarPrecios({ status: DASH.status, calendar: [], lastApply: { ok: false } }, HOY)
eq('consejo de revisar', roto.consejos.some((c) => c.tipo === 'apply_failed'), true)

console.log(fallos === 0 ? '\n✅ todas las pruebas de precios pasan' : `\n❌ ${fallos} fallos`)
process.exit(fallos === 0 ? 0 : 1)
