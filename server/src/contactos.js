// ============================================================
// Contactos de obra: quién es quién en cada proyecto.
//
// Vienen de la Adressliste, que está organizada por obra (G60 Muri,
// 770 Bremgarten, I16 Gampelen...) y por BKP, el código suizo de partida de
// obra. Se guardan en la base y NO se escribe en el Excel original: si
// alguien lo tiene abierto mientras el programa escribe, se pisan los
// cambios y se pierde trabajo. Exportar cuando haga falta es más seguro que
// escribir a la vez.
// ============================================================
import { query } from './db.js'
import { broadcast } from './events.js'

export async function addContact({ name, company = null, role = null, bkp = null, project = null, phone = null, mobile = null, email = null, address = null, status = null, notes = null }) {
  const limpio = String(name ?? '').trim()
  if (!limpio) throw Object.assign(new Error('Falta el nombre'), { status: 400 })
  const { rows } = await query(
    `insert into contacts (name, company, role, bkp, project, phone, mobile, email, address, status, notes)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning *`,
    [limpio, company, role, bkp, project, phone, mobile, email, address, status, notes],
  )
  broadcast()
  return rows[0]
}

/**
 * Busca por nombre, empresa, oficio o proyecto. Devuelve los que encajen,
 * los más completos primero: un contacto con teléfono es más útil que uno
 * que solo tiene el nombre.
 */
export async function buscarContactos(texto, limite = 5) {
  const q = `%${String(texto ?? '').trim().toLowerCase()}%`
  const { rows } = await query(
    `select * from contacts
      where lower(name) like $1 or lower(coalesce(company,'')) like $1
         or lower(coalesce(role,'')) like $1 or lower(coalesce(project,'')) like $1
      order by (case when coalesce(mobile, phone) is not null then 0 else 1 end),
               length(name) asc
      limit $2`,
    [q, limite],
  )
  return rows
}

/** Cómo se enseña un contacto por WhatsApp. */
export function formatContacto(c) {
  const l = [`👤 ${c.name}`]
  if (c.company && c.company !== c.name) l.push(`🏢 ${c.company}`)
  if (c.role) l.push(`🔧 ${c.role}`)
  const tel = c.mobile || c.phone
  if (tel) l.push(`📞 ${tel}`)
  if (c.email) l.push(`✉️ ${c.email}`)
  if (c.project) l.push(`🏗️ ${c.project}`)
  if (c.status) l.push(`📋 ${c.status}`)
  return l.join('\n')
}
