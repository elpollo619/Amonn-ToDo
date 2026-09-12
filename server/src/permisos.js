// ============================================================
// Permisos del asistente, gestionados por WhatsApp.
//
// Cris pidió (05.09.2026) decidir ÉL quién accede a qué, sin tocar el NAS:
// «dale acceso al dinero a Jasmina» y listo. Tres permisos:
//   - admin:     puede dar/quitar accesos, y lo implica todo.
//   - dinero:    facturas QR, extractos bancarios, impagos.
//   - huespedes: ver los mensajes de huéspedes y ordenar respuestas.
//
// La verdad vive en la tabla permissions. Al arrancar se siembra lo mínimo
// para no dejar a nadie fuera: ADMIN_PHONE (Cris) como admin y los
// teléfonos de GUEST_TEAM con dinero+huéspedes — solo si aún no tienen
// nada, para no resucitar accesos que un admin quitó a propósito.
// ============================================================
import { config } from './config.js'
import { query } from './db.js'

// El catálogo completo. Los que aún no tienen función detrás (hotel,
// accesos, contratos) ya se pueden repartir: cuando Apaleo/SALTO/Google se
// conecten, sus puertas leerán estos mismos permisos.
export const PERMISOS = ['admin', 'dinero', 'huespedes', 'hotel', 'accesos', 'contratos']

// Cómo llama la gente a cada permiso, en los tres idiomas.
export const NOMBRES_PERMISO = {
  dinero: 'dinero', finanzas: 'dinero', geld: 'dinero', finanzen: 'dinero', dinheiro: 'dinero',
  huespedes: 'huespedes', gaste: 'huespedes', gasten: 'huespedes', hospedes: 'huespedes',
  hotel: 'hotel',
  accesos: 'accesos', puertas: 'accesos', turen: 'accesos', zutritt: 'accesos', portas: 'accesos', llaves: 'accesos',
  contratos: 'contratos', vertrage: 'contratos',
  admin: 'admin', todo: 'admin', alles: 'admin', tudo: 'admin',
}

/** ¿Tiene la persona este permiso (o es admin)? */
export async function tienePermiso(userId, perm) {
  if (!userId) return false
  const { rows } = await query(
    "select 1 from permissions where user_id = $1 and perm in ($2, 'admin') limit 1",
    [userId, perm],
  )
  return rows.length > 0
}

export async function darPermiso(userId, perm, byUserId = null) {
  await query(
    `insert into permissions (user_id, perm, granted_by) values ($1,$2,$3)
     on conflict (user_id, perm) do nothing`,
    [userId, perm, byUserId],
  )
}

export async function quitarPermiso(userId, perm) {
  const { rowCount } = await query(
    'delete from permissions where user_id = $1 and perm = $2',
    [userId, perm],
  )
  return rowCount > 0
}

/** Quién tiene qué, para «accesos». */
export async function listarPermisos() {
  const { rows } = await query(
    `select u.full_name, array_agg(p.perm order by p.perm) as perms
       from permissions p join users u on u.id = p.user_id
      group by u.full_name order by u.full_name`,
  )
  return rows
}

/** Teléfonos con un permiso (para el espejo de huéspedes y avisos). */
export async function telefonosConPermiso(perm) {
  const { rows } = await query(
    `select distinct u.phone from permissions p
       join users u on u.id = p.user_id
      where p.perm in ($1, 'admin') and u.phone is not null and u.phone <> ''`,
    [perm],
  )
  return rows.map((r) => r.phone)
}

/**
 * Siembra inicial, idempotente y respetuosa: solo añade permisos a quien
 * no tiene NINGUNO todavía. Así la primera arrancada deja el sistema como
 * estaba (los 4 de GUEST_TEAM + Cris admin) y las decisiones posteriores
 * de un admin no se deshacen en cada reinicio.
 */
export async function sembrarPermisos() {
  const admin = process.env.ADMIN_PHONE ?? '+41765683445' // Cris
  const equipo = (process.env.GUEST_TEAM ?? '').split(',').map((x) => x.trim()).filter(Boolean)
  let sembrados = 0
  for (const [phone, perms] of [[admin, ['admin']], ...equipo.map((p) => [p, ['dinero', 'huespedes']])]) {
    const { rows } = await query('select id from users where phone = $1', [phone])
    const u = rows[0]
    if (!u) continue
    const { rows: ya } = await query('select 1 from permissions where user_id = $1 limit 1', [u.id])
    if (ya.length) continue
    for (const perm of perms) {
      await darPermiso(u.id, perm)
      sembrados++
    }
  }
  if (sembrados) console.log(`[permisos] siembra inicial: ${sembrados} permiso(s)`)
}
