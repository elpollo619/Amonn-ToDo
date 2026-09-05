// Pruebas de las fechas en los tres idiomas. Fecha fija para que el
// resultado no dependa del día en que se ejecuten.
import { parseDate, parseDateAnyLang, describeDue, saysNoDate, monthKeyFromText } from '../src/dates.js'

const HOY = '2026-09-03' // jueves
let fallos = 0
const eq = (nombre, real, esperado) => {
  const ok = JSON.stringify(real) === JSON.stringify(esperado)
  if (!ok) { fallos++; console.log(`  ✘ ${nombre}\n      obtenido: ${JSON.stringify(real)}\n      esperado: ${JSON.stringify(esperado)}`) }
  else console.log(`  ✔ ${nombre}`)
}
const key = (texto, lang) => parseDate(texto, HOY, lang)?.key ?? null

console.log('\nESPAÑOL')
eq('hoy', key('para hoy', 'es'), HOY)
eq('mañana', key('revisar la caldera mañana', 'es'), '2026-09-04')
eq('pasado mañana', key('pasado mañana', 'es'), '2026-09-05')
eq('en 3 días', key('en 3 dias', 'es'), '2026-09-06')
eq('el viernes', key('para el viernes', 'es'), '2026-09-04')
eq('el jueves (hoy) → el que viene', key('el jueves', 'es'), '2026-09-10')
eq('15/10', key('el 15/10', 'es'), '2026-10-15')
eq('5 de septiembre', key('5 de septiembre', 'es'), '2026-09-05')
eq('sin fecha detectada', key('revisar la caldera', 'es'), null)

console.log('\nALEMÁN')
eq('heute', key('heute', 'de'), HOY)
eq('morgen', key('bis morgen', 'de'), '2026-09-04')
eq('übermorgen', key('übermorgen', 'de'), '2026-09-05')
eq('in 3 Tagen', key('in 3 tagen', 'de'), '2026-09-06')
eq('am Freitag', key('am freitag', 'de'), '2026-09-04')
eq('15.10 (puntos)', key('am 15.10', 'de'), '2026-10-15')
eq('5. September', key('5. september', 'de'), '2026-09-05')

console.log('\nPORTUGUÉS')
eq('hoje', key('hoje', 'pt'), HOY)
eq('amanhã', key('para amanhã', 'pt'), '2026-09-04')
eq('depois de amanhã', key('depois de amanhã', 'pt'), '2026-09-05')
eq('em 3 dias', key('em 3 dias', 'pt'), '2026-09-06')
eq('na sexta', key('na sexta', 'pt'), '2026-09-04')
eq('sexta-feira', key('sexta-feira', 'pt'), '2026-09-04')
eq('5 de setembro', key('5 de setembro', 'pt'), '2026-09-05')

console.log('\nMEZCLA DE IDIOMAS (alguien escribe en alemán en un chat español)')
eq('"am Freitag" con idioma es', parseDateAnyLang('am freitag', HOY, 'es')?.key, '2026-09-04')
eq('"mañana" con idioma de', parseDateAnyLang('mañana', HOY, 'de')?.key, '2026-09-04')

console.log('\n"SIN FECHA" EXPLÍCITO')
eq('es', saysNoDate('sin fecha', 'es'), true)
eq('de', saysNoDate('ohne datum', 'de'), true)
eq('pt', saysNoDate('sem data', 'pt'), true)
eq('no es "sin fecha"', saysNoDate('para el viernes', 'es'), false)

console.log('\nTEXTO DE LA FECHA')
eq('hoy es', describeDue(HOY, HOY, 'es'), 'hoy')
eq('mañana de', describeDue('2026-09-04', HOY, 'de'), 'morgen')
eq('futuro pt', describeDue('2026-09-11', HOY, 'pt'), 'sex 11 set')
eq('vencida es', describeDue('2026-09-01', HOY, 'es'), 'mar 1 sep (vencida hace 2 días)')

console.log('\nEL MES DEL CIERRE DE SPESEN')
eq('mes pasado', monthKeyFromText('cierra los gastos de agosto', HOY), '2026-08')
eq('en alemán', monthKeyFromText('spesen august abschliessen', HOY), '2026-08')
eq('el mes en curso, por su nombre', monthKeyFromText('cierra los gastos de septiembre', HOY), '2026-09')
eq('un mes "futuro" es el del año pasado', monthKeyFromText('cierra los gastos de diciembre', HOY), '2025-12')
eq('sin nombre → el mes anterior', monthKeyFromText('cierra los gastos', HOY), '2026-08')
eq('sin nombre en enero → diciembre anterior', monthKeyFromText('cierra los gastos', '2027-01-05'), '2026-12')

console.log(fallos === 0 ? '\n✅ todas las pruebas de fechas pasan' : `\n❌ ${fallos} fallos`)
process.exit(fallos === 0 ? 0 : 1)
