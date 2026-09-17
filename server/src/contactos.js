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
import { crearKontakt, workpulseConfigurado } from './workpulse.js'

export async function addContact({ name, company = null, role = null, bkp = null, project = null, phone = null, mobile = null, email = null, address = null, status = null, notes = null, is_responsible = false }) {
  const limpio = String(name ?? '').trim()
  if (!limpio) throw Object.assign(new Error('Falta el nombre'), { status: 400 })
  const { rows } = await query(
    `insert into contacts (name, company, role, bkp, project, phone, mobile, email, address, status, notes, is_responsible)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) returning *`,
    [limpio, company, role, bkp, project, phone, mobile, email, address, status, notes, Boolean(is_responsible)],
  )
  broadcast()
  const c = rows[0]
  // Puente #3: crear el Kontakt espejo en WorkPulse y guardar su id (para no
  // duplicar). Best-effort y en segundo plano.
  if (workpulseConfigurado()) {
    ;(async () => {
      try {
        const wp = await crearKontakt({
          name: c.name, company: c.company, email: c.email, phone: c.phone,
          mobile: c.mobile, role: c.role, address: c.address, notes: c.notes,
          isResponsible: c.is_responsible,
        })
        const wpId = wp?.id ?? wp?.kontakt?.id
        if (wpId) await query('update contacts set workpulse_id = $2 where id = $1', [c.id, wpId])
      } catch (e) {
        console.error('[workpulse] kontakt no creado:', e.message)
      }
    })()
  }
  return c
}

/**
 * Todos los contactos de una empresa. A diferencia de buscarContactos (que
 * busca "a lo ancho" por nombre/oficio/proyecto), aquí se lista una empresa
 * concreta: "muéstrame los contactos de R. Baumgartner AG". Los responsables
 * van primero, y luego los que tienen teléfono.
 */
export async function listByCompany(empresa, limite = 25) {
  const q = `%${String(empresa ?? '').trim().toLowerCase()}%`
  const { rows } = await query(
    `select * from contacts
      where lower(coalesce(company,'')) like $1
      order by is_responsible desc,
               (case when coalesce(mobile, phone) is not null then 0 else 1 end),
               length(name) asc
      limit $2`,
    [q, limite],
  )
  return rows
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
  const nombre = c.is_responsible ? `👤 ${c.name} ⭐` : `👤 ${c.name}`
  const l = [nombre]
  if (c.company && c.company !== c.name) l.push(`🏢 ${c.company}`)
  if (c.role) l.push(`🔧 ${c.role}`)
  // Oficina y privado por separado, pero sin repetir si es el mismo número.
  if (c.phone && c.mobile && c.phone !== c.mobile) {
    l.push(`📞 ${c.phone} (Büro)`)
    l.push(`📱 ${c.mobile} (privat)`)
  } else if (c.mobile || c.phone) {
    l.push(`📞 ${c.mobile || c.phone}`)
  }
  if (c.email) l.push(`✉️ ${c.email}`)
  if (c.project) l.push(`🏗️ ${c.project}`)
  if (c.status) l.push(`📋 ${c.status}`)
  return l.join('\n')
}
