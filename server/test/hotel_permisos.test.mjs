// Pruebas del hotel CON credenciales, simulando la respuesta real de Apaleo.
//
// Por qué existe esta batería (08.09.2026): se probó la API de verdad con las
// credenciales que ya tenía Cris en su Mac (app `UCVF-SP-EINKOMMEN_SYNC`) y se
// vio que sus permisos son SOLO `reservations.read` + `accounting.read`. Por
// eso `/inventory/v1/units` responde **403**.
//
// Antes, ese 403 se lanzaba como excepción dentro de un `Promise.all` junto a
// las salidas, así que tumbaba TAMBIÉN las llegadas y las salidas: el parte
// del día entero se convertía en «Apaleo no responde». Aquí se fija que lo que
// sí tenemos se sigue dando, y que la limpieza se explica en vez de romper.
import { initDb, query, pool } from '../src/db.js'
import { processMessage } from '../src/inbound.js'
import { config } from '../src/config.js'

const CRIS = '+41765683445'
let fallos = 0
function check(n, real, debe) {
  const l = Array.isArray(debe) ? debe : [debe]
  const f = l.filter((x) => !String(real).includes(x))
  if (f.length) { fallos++; console.log(`  ✘ ${n}\n      obtenido: ${JSON.stringify(String(real).slice(0, 300))}\n      faltaba:  ${JSON.stringify(f)}`) }
  else console.log(`  ✔ ${n}`)
}
function checkNo(n, real, prohibido) {
  if (String(real).includes(prohibido)) { fallos++; console.log(`  ✘ ${n}\n      no debía contener: ${JSON.stringify(prohibido)}\n      obtenido: ${JSON.stringify(String(real).slice(0, 300))}`) }
  else console.log(`  ✔ ${n}`)
}

// --- Apaleo de mentira, calcado de lo que devuelve el de verdad -------------
const RESERVA = {
  id: 'MAYGXKHG-1',
  status: 'InHouse',
  adults: 2,
  childrenAges: [7],
  unit: { id: 'NSH-HHB', name: '208+210' },
  primaryGuest: { lastName: 'Muster' },
}
let pedidoUnits = 0
globalThis.fetch = async (url) => {
  const u = String(url)
  const json = (o, status = 200) => new Response(JSON.stringify(o), {
    status, headers: { 'content-type': 'application/json' },
  })
  if (u.includes('identity.apaleo.com')) return json({ access_token: 'falso', expires_in: 3600 })
  if (u.includes('/booking/v1/reservations')) {
    // Llegadas trae la reserva; salidas, ninguna: así se distinguen en el parte.
    return json({ reservations: u.includes('dateFilter=Departure') ? [] : [RESERVA] })
  }
  if (u.includes('/inventory/v1/units')) {
    pedidoUnits++
    return new Response('{"messages":["forbidden"]}', { status: 403 })
  }
  return json({}, 404)
}

await initDb()
await query('delete from tasks')
await query('delete from users')
await query(`insert into users (email, password_hash, full_name, phone, language)
  values ('cris@x.com','x','Cristian Amaya',$1,'es')`, [CRIS])
config.apaleo = { clientId: 'UCVF-SP-EINKOMMEN_SYNC', clientSecret: 'x', propertyId: 'NSH' }

console.log('\n1. LAS LLEGADAS FUNCIONAN AUNQUE LA LIMPIEZA ESTÉ PROHIBIDA')
const llegan = await processMessage(CRIS, '¿cuántos llegan hoy al hotel?')
check('cuenta personas, no reservas (2 adultos + 1 niño = 3)', llegan, ['3'])
check('nombra la habitación que da Apaleo', llegan, ['208+210'])
checkNo('no sale el mensaje de avería', llegan, 'no responde')

console.log('\n2. EL PARTE DEL DÍA NO SE CAE POR EL 403')
const parte = await processMessage(CRIS, 'cómo va el hotel')
check('da llegadas y salidas igualmente', parte, ['🛬', '🛫'])
check('explica que falta el permiso de inventario', parte, ['permiso de inventario'])
checkNo('NO se convierte en un error de Apaleo', parte, 'Apaleo no responde')

console.log('\n3. PREGUNTAR SOLO POR LA LIMPIEZA SE EXPLICA CON CLARIDAD')
const sucias = await processMessage(CRIS, '¿qué cuartos están sucios?')
check('dice qué hay que hacer en Apaleo', sucias, ['Connected apps'])
checkNo('no finge que no hay ninguna sucia', sucias, 'No hay ninguna habitación sucia')

console.log(`\n(se pidió /inventory/v1/units ${pedidoUnits} vez/veces — el 403 se absorbe, no se propaga)`)

await pool.end()
console.log(fallos === 0 ? '\n✅ todas las pruebas de permisos del hotel pasan\n' : `\n❌ ${fallos} fallo(s)\n`)
process.exit(fallos === 0 ? 0 : 1)
