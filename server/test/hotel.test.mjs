// Pruebas del hotel (Apaleo). La API real necesita credenciales que aún no
// tenemos, así que aquí se simula: lo que se prueba es NUESTRA parte —
// contar personas, separar sucias de limpias, y que sin credenciales lo diga
// en vez de romperse.
import { initDb, query, pool } from '../src/db.js'
import { processMessage } from '../src/inbound.js'
import { contarPersonas, porEstadoDeLimpieza, enMantenimiento, apaleoConfigurado } from '../src/apaleo.js'
import { config } from '../src/config.js'

const CRIS = '+41765683445'
let fallos = 0
function check(n, real, debe) {
  const l = Array.isArray(debe) ? debe : [debe]
  const f = l.filter((x) => !String(real).includes(x))
  if (f.length) { fallos++; console.log(`  ✘ ${n}\n      obtenido: ${JSON.stringify(String(real).slice(0,200))}\n      faltaba:  ${JSON.stringify(f)}`) }
  else console.log(`  ✔ ${n}`)
}
function checkIgual(n, real, debe) {
  if (real === debe) console.log(`  ✔ ${n}`)
  else { fallos++; console.log(`  ✘ ${n}\n      obtenido: ${JSON.stringify(real)}\n      esperado: ${JSON.stringify(debe)}`) }
}

console.log('\n1. CONTAR PERSONAS, NO RESERVAS')
// Una reserva puede traer varias personas: lo que importa para la limpieza
// y el desayuno es cuánta gente entra, no cuántas reservas hay.
checkIgual('dos adultos y un niño en una reserva son tres',
  contarPersonas([{ adults: 2, childrenAges: [7] }]), 3)
checkIgual('varias reservas se suman',
  contarPersonas([{ adults: 2 }, { adults: 1, childrenAges: [4, 9] }]), 5)
checkIgual('sin reservas, cero', contarPersonas([]), 0)
checkIgual('una reserva sin datos no rompe', contarPersonas([{}]), 0)

console.log('\n2. SEPARAR SUCIAS DE LIMPIAS')
// Los estados son los TRES de la especificación oficial de Apaleo
// (swagger inventory-v1, UnitStatusModel): Clean, CleanToBeInspected, Dirty.
// Antes esta prueba usaba «CleaningInProgress» e «Inspected», que Apaleo no
// devuelve nunca: comprobaba un comportamiento que no iba a darse jamás.
const unidades = [
  { name: '101', condition: 'Clean' },
  { name: '102', condition: 'Dirty' },
  { name: '103', condition: 'CleanToBeInspected' },
  { name: '104', status: { condition: 'Clean' } },
  { name: '105', status: { condition: 'Dirty' } },
  { name: '106', condition: 'LoQueSea' },
]
const { sucias, limpias, porInspeccionar, otras } = porEstadoDeLimpieza(unidades)
checkIgual('dos sucias', sucias.length, 2)
checkIgual('la que espera inspección ya está limpia', limpias.length, 3)
checkIgual('y además se puede ver aparte', porInspeccionar.map((u) => u.name).join(','), '103')
checkIgual('un estado desconocido no se cuela en ningún lado', otras.length, 1)
checkIgual('funciona aunque el estado venga anidado', sucias.map((u) => u.name).join(','), '102,105')

console.log('\n2b. HABITACIONES EN MANTENIMIENTO (la fuga de la 206/207)')
checkIgual('las saca de status.maintenance',
  enMantenimiento([
    { name: '205', status: { condition: 'Clean' } },
    { name: '206', status: { condition: 'Dirty', maintenance: { id: 'm1' } } },
    { name: '207', status: { condition: 'Dirty', maintenance: { id: 'm2' } } },
  ]).map((u) => u.name).join(','), '206,207')
checkIgual('sin averías, lista vacía', enMantenimiento([{ name: '205', status: {} }]).length, 0)

console.log('\n3. SIN CREDENCIALES LO DICE, NO SE ROMPE')
await initDb()
for (const t of ['tasks']) await query(`delete from ${t}`)
await query('delete from users')
await query(`insert into users (email, password_hash, full_name, phone, language)
  values ('cris@x.com','x','Cristian Amaya',$1,'es')`, [CRIS])
config.apaleo = { clientId: '', clientSecret: '', propertyId: '' }
checkIgual('no está configurado', apaleoConfigurado(), false)
check('"¿cuántos llegan hoy al hotel?"', await processMessage(CRIS, '¿cuántos llegan hoy al hotel?'),
  ['Todavía no está conectado'])
check('"¿qué cuartos están sucios?"', await processMessage(CRIS, '¿qué cuartos están sucios?'),
  ['Todavía no está conectado'])

await pool.end()
console.log(fallos === 0 ? '\n✅ todas las pruebas del hotel pasan\n' : `\n❌ ${fallos} fallo(s)\n`)
process.exit(fallos === 0 ? 0 : 1)
