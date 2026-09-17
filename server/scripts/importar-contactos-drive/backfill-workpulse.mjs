// Backfill: sube TODOS los contactos de Amonn (/tmp/amonn_contacts.json) a
// WorkPulse, sin duplicar (enlaza los que ya existen por firstName+lastName+
// company; crea los que falten). Escribe /tmp/amonn_wp_updates.sql con los
// UPDATE contacts SET workpulse_id para aplicarlos luego en Amonn.
import { readFileSync, writeFileSync } from 'node:fs'

const URL = (process.env.WORKPULSE_URL || 'https://workpulse.ch').replace(/\/+$/, '')
const EMAIL = process.env.WORKPULSE_EMAIL, PASSWORD = process.env.WORKPULSE_PASSWORD
if (!EMAIL || !PASSWORD) { console.error('Falta WORKPULSE_EMAIL/PASSWORD'); process.exit(1) }

let token = null
async function api(ruta, { method = 'GET', body = null } = {}) {
  const res = await fetch(`${URL}/api${ruta}`, {
    method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const txt = await res.text()
  if (!res.ok) throw new Error(`${method} ${ruta} → ${res.status}: ${txt.slice(0, 150)}`)
  return txt ? JSON.parse(txt) : null
}
const norm = (s) => String(s ?? '').trim().toLowerCase()
const arr = (d, ...k) => (Array.isArray(d) ? d : (k.map((x) => d?.[x]).find(Array.isArray) || []))

function partirNombre(name, company) {
  const p = String(name ?? '').trim().split(/\s+/).filter(Boolean)
  if (p.length >= 2) return { firstName: p[0], lastName: p.slice(1).join(' ') }
  if (p.length === 1) return { firstName: p[0], lastName: '—' }
  const c = String(company ?? 'Kontakt').split(/\s+/).filter(Boolean)
  return c.length >= 2 ? { firstName: c[0], lastName: c.slice(1).join(' ') } : { firstName: c[0] || 'Kontakt', lastName: '—' }
}
function tipo(company = '', role = '') {
  const h = `${company} ${role}`.toLowerCase()
  if (/gemeinde|beh[öo]rde|bkw|swisscom|sunrise|amt|kanton/.test(h)) return 'GEMEINDE'
  if (/baumeister/.test(h)) return 'BAUMEISTER'
  if (/lieferant|storen|k[üu]che|lift|aufzug/.test(h)) return 'LIEFERANT'
  return 'EXTERN'
}

token = (await api('/auth/app-login', { method: 'POST', body: { email: EMAIL, password: PASSWORD } })).accessToken
console.log('✓ login')

const existentes = new Map() // firstName|lastName|company → id
for (const k of arr(await api('/kontakte'), 'kontakte', 'data', 'items')) {
  existentes.set(`${norm(k.firstName)}|${norm(k.lastName)}|${norm(k.company)}`, k.id)
}
console.log(`  kontakte ya en WorkPulse: ${existentes.size}`)

const amonn = JSON.parse(readFileSync('/tmp/amonn_contacts.json', 'utf8'))
let creados = 0, enlazados = 0
const updates = []
for (const c of amonn) {
  const { firstName, lastName } = partirNombre(c.name, c.company)
  const company = c.company || 'Ohne Firma'
  const key = `${norm(firstName)}|${norm(lastName)}|${norm(company)}`
  let wpId = existentes.get(key)
  if (wpId) { enlazados++ }
  else {
    const nota = [c.notes, c.project ? `Projekt: ${c.project}` : null, c.is_responsible ? 'Ansprechperson' : null].filter(Boolean).join(' · ') || undefined
    const k = await api('/kontakte', { method: 'POST', body: {
      firstName, lastName, company, contactType: tipo(company, c.role || ''),
      ...(c.email ? { email: c.email } : {}), ...(c.phone ? { phone: c.phone } : {}),
      ...(c.mobile ? { mobile: c.mobile } : {}), ...(c.role ? { role: c.role } : {}),
      ...(c.address ? { address: c.address } : {}), ...(nota ? { notes: nota } : {}),
    } })
    wpId = k.id || k.kontakt?.id
    existentes.set(key, wpId)
    creados++
  }
  if (wpId) updates.push(`update contacts set workpulse_id='${wpId}' where id='${c.id}';`)
}
writeFileSync('/tmp/amonn_wp_updates.sql', updates.join('\n') + '\n')
console.log(`\n✓ creados: ${creados} · enlazados (ya estaban): ${enlazados} · updates a Amonn: ${updates.length}`)
