// Pruebas de la lectura AMPLIADA del hotel: «que el agente pueda mirar todo
// en Apaleo». Simulan un Apaleo con TODOS los permisos concedidos (el estado
// al que se llega marcando los scopes en apaleo.dev) y comprueban cada rama
// nueva: diagnóstico de permisos, alojados ahora, cuartos libres, buscar una
// reserva por nombre y la línea de habitaciones fuera de servicio.
//
// El diagnóstico se prueba en los dos mundos: con inventario concedido (✅) y
// con inventario denegado (🔒 + nombre del scope que falta), porque ese es
// justo el interruptor que sólo puede tocar Cris en Apaleo.
import { initDb, query, pool } from '../src/db.js'
import { processMessage } from '../src/inbound.js'
import { config } from '../src/config.js'

const CRIS = '+41765683446'
let fallos = 0
function check(n, real, debe) {
  const l = Array.isArray(debe) ? debe : [debe]
  const f = l.filter((x) => !String(real).includes(x))
  if (f.length) { fallos++; console.log(`  ✘ ${n}\n      obtenido: ${JSON.stringify(String(real).slice(0, 320))}\n      faltaba:  ${JSON.stringify(f)}`) }
  else console.log(`  ✔ ${n}`)
}
function checkNo(n, real, prohibido) {
  if (String(real).includes(prohibido)) { fallos++; console.log(`  ✘ ${n}\n      no debía contener: ${JSON.stringify(prohibido)}`) }
  else console.log(`  ✔ ${n}`)
}

// --- Apaleo de mentira, con todos los scopes salvo el que apaguemos ---------
let denegarInventario = false
const UNIDADES = [
  { id: 'NSH-101', name: '101', condition: 'Dirty', status: { maintenance: false } },
  { id: 'NSH-102', name: '102', condition: 'Clean', status: { maintenance: false } },
  { id: 'NSH-206', name: '206', condition: 'Clean', status: { maintenance: true } },
]
const RES_INHOUSE = {
  id: 'MAYGXKHG-1', status: 'InHouse', arrival: '2026-09-11T15:00:00Z', departure: '2026-09-14T11:00:00Z',
  adults: 2, childrenAges: [7], unit: { id: 'NSH-HHB', name: '208+210' }, primaryGuest: { firstName: 'Anna', lastName: 'Muster' },
}
const RES_GARCIA = {
  id: 'GARCIA-9', status: 'Confirmed', arrival: '2026-09-20T15:00:00Z', departure: '2026-09-22T11:00:00Z',
  adults: 1, unit: { id: 'NSH-12', name: '12' }, primaryGuest: { firstName: 'Luis', lastName: 'García' },
}

globalThis.fetch = async (url) => {
  const u = String(url)
  const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } })
  if (u.includes('identity.apaleo.com')) return json({ access_token: 'falso', expires_in: 3600 })
  if (u.includes('/booking/v1/reservations')) {
    if (/status=InHouse/.test(u)) return json({ reservations: [RES_INHOUSE] })
    if (/textSearch=/.test(u)) return json({ reservations: [RES_GARCIA] })
    if (/dateFilter=Departure/.test(u)) return json({ reservations: [] })
    return json({ reservations: [RES_INHOUSE] }) // Arrival / Stay
  }
  if (u.includes('/inventory/v1/units')) {
    if (denegarInventario) return new Response('{"messages":["forbidden"]}', { status: 403 })
    return json({ units: UNIDADES })
  }
  if (u.includes('/availability/v1/unit-groups')) {
    return json({ unitGroups: [
      { unitGroup: { id: 'DBL', name: 'Doble' }, availableCount: 3 },
      { unitGroup: { id: 'SGL', name: 'Individual' }, availableCount: 1 },
    ] })
  }
  if (u.includes('/rateplan/v1/rate-plans')) return json({ ratePlans: [{ id: 'RP1' }] })
  if (u.includes('/finance/v1/folios')) return json({ folios: [] })
  return json({}, 404)
}

await initDb()
await query('delete from tasks')
await query('delete from users')
await query(`insert into users (email, password_hash, full_name, phone, language)
  values ('cris@x.com','x','Cristian Amaya',$1,'es')`, [CRIS])
config.apaleo = { clientId: 'UCVF-SP-EINKOMMEN_SYNC', clientSecret: 'x', propertyId: 'NSH' }

console.log('\n1. DIAGNÓSTICO CON TODO CONCEDIDO')
denegarInventario = false
const diag = await processMessage(CRIS, '¿qué ves en apaleo?')
check('lista las cinco áreas en verde', diag, ['✅ Reservas', '✅ Habitaciones', '✅ Cuartos libres', '✅ Precios', '✅ Cuentas'])
check('no falta ninguno', diag, ['Faltan 0'])

console.log('\n2. DIAGNÓSTICO CON EL INVENTARIO DENEGADO')
denegarInventario = true
const diag2 = await processMessage(CRIS, 'diagnóstico del hotel')
check('marca el inventario con candado y el scope que falta', diag2, ['🔒 Habitaciones', 'inventory.read'])
check('cuenta uno que falta', diag2, ['Faltan 1'])
denegarInventario = false

console.log('\n3. ALOJADOS AHORA MISMO')
const encasa = await processMessage(CRIS, '¿quién está alojado ahora?')
check('cuenta personas (2 adultos + 1 niño = 3)', encasa, ['3'])
check('nombra al huésped y su unidad', encasa, ['Muster', '208+210'])

console.log('\n4. CUARTOS LIBRES')
const libres = await processMessage(CRIS, '¿qué cuartos libres hay?')
check('muestra los tipos con su número', libres, ['Doble: 3', 'Individual: 1'])

console.log('\n5. BUSCAR UNA RESERVA POR NOMBRE')
const reserva = await processMessage(CRIS, 'reserva de García')
check('encuentra a García con su unidad', reserva, ['García', '12'])
checkNo('no dice que no encuentra', reserva, 'No encuentro')

console.log('\n6. EL PARTE DEL DÍA MUESTRA LO FUERA DE SERVICIO')
const parte = await processMessage(CRIS, 'cómo va el hotel')
check('línea de fuera de servicio con la 206', parte, ['Fuera de servicio', '206'])
check('sigue dando sucias y limpias', parte, ['🧹', '✅'])

await pool.end()
console.log(fallos === 0 ? '\n✅ todas las pruebas de la lectura ampliada del hotel pasan\n' : `\n❌ ${fallos} fallo(s)\n`)
process.exit(fallos === 0 ? 0 : 1)
