// Pruebas de los vigilantes: umbrales de obra del meteo, el extractor del
// Referenzzinssatz y el paracaídas de la lectura de recibos por IA.
// Todo puro: sin red, sin base.
import { alertasDeObra, emojiTiempo } from '../src/meteo.js'
import { extraerZins } from '../src/zins.js'
import { validarLectura } from '../src/vision.js'

let fallos = 0
const eq = (nombre, real, esperado) => {
  const ok = JSON.stringify(real) === JSON.stringify(esperado)
  if (!ok) { fallos++; console.log(`  ✘ ${nombre}\n      obtenido: ${JSON.stringify(real)}\n      esperado: ${JSON.stringify(esperado)}`) }
  else console.log(`  ✔ ${nombre}`)
}

console.log('\n1. METEO: LOS UMBRALES DE OBRA')
const daily = {
  time: ['2026-11-20', '2026-11-21'],
  temperature_2m_min: [4, -2],
  temperature_2m_max: [8, 3],
  precipitation_sum: [2, 18],
  wind_gusts_10m_max: [30, 75],
  snowfall_sum: [0, 2.5],
  weather_code: [3, 73],
}
eq('un día normal no alerta', alertasDeObra(daily, 0), [])
eq('mañana alerta por las cuatro', alertasDeObra(daily, 1).map((a) => a.tipo),
  ['helada', 'lluvia', 'viento', 'nieve'])
eq('0°C ya es helada (hormigón)', alertasDeObra({ temperature_2m_min: [0] }, 0).length, 1)
eq('nieve tiene emoji', emojiTiempo(73), '🌨️')

console.log('\n2. REFERENZZINSSATZ: EL EXTRACTOR')
eq('la página real de hoy', extraerZins('<h2 anchornav="x">Aktueller Referenzzinssatz: 1,25%</h2>'), 1.25)
eq('con punto también', extraerZins('Aktueller Referenzzinssatz: 1.75 %'), 1.75)
eq('sin el texto esperado → null, no un invento', extraerZins('<html>otra página</html>'), null)
eq('un valor absurdo se descarta', extraerZins('Aktueller Referenzzinssatz: 47,50%'), null)

console.log('\n3. LECTURA DE RECIBOS POR IA: EL PARACAÍDAS')
eq('lectura buena pasa', validarLectura({ comercio: 'Coop', fecha: '2026-09-02', importe: 37.9, iva: '8.1' }),
  { comercio: 'Coop', fecha: '2026-09-02', importe: 37.9, iva: '8.1' })
eq('sin importe no hay nada que aprovechar', validarLectura({ comercio: 'Coop', fecha: '2026-09-02', importe: null, iva: null }), null)
eq('una fecha rota se descarta, el resto vale',
  validarLectura({ comercio: 'Coop', fecha: '2/9/26', importe: 12, iva: null }).fecha, null)
eq('un IVA inventado se descarta', validarLectura({ comercio: 'X', fecha: null, importe: 5, iva: '19' }).iva, null)
eq('un importe absurdo tumba la lectura', validarLectura({ comercio: 'X', fecha: null, importe: 250000, iva: null }), null)
eq('basura → null, no excepción', validarLectura('no soy un objeto'), null)

console.log(fallos === 0 ? '\n✅ todas las pruebas de los vigilantes pasan' : `\n❌ ${fallos} fallos`)
process.exit(fallos === 0 ? 0 : 1)
