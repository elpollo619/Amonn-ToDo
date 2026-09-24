// Sube los contactos de /tmp/contactos.json a WorkPulse (workpulse.ch) por su
// API, separados por proyecto. WorkPulse es "el sistema"; esto usa el mismo
// usuario de servicio del puente que ya usa el asistente para los gastos.
//
// Necesita en el entorno: WORKPULSE_URL, WORKPULSE_EMAIL, WORKPULSE_PASSWORD.
// Idempotente: no duplica proyectos ni contactos (comprueba antes de crear).
import { readFileSync } from 'node:fs'

const URL = (process.env.WORKPULSE_URL || 'https://workpulse.ch').replace(/\/+$/, '')
const EMAIL = process.env.WORKPULSE_EMAIL
const PASSWORD = process.env.WORKPULSE_PASSWORD
if (!EMAIL || !PASSWORD) { console.error('Falta WORKPULSE_EMAIL / WORKPULSE_PASSWORD'); process.exit(1) }

// Proyecto de Amonn → proyecto de WorkPulse. El 770 ya existe; los demás se crean.
const YA_EXISTE = { '770 Bremgarten (Seewer)': 'Neubau Seewer Bremgarten' }

let token = null
async function api(ruta, { method = 'GET', body = null } = {}) {
  const res = await fetch(`${URL}/api${ruta}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const txt = await res.text()
  let data = null
  try { data = txt ? JSON.parse(txt) : null } catch { data = txt }
  if (!res.ok) throw new Error(`${method} ${ruta} → ${res.status}: ${String(txt).slice(0, 200)}`)
  return data
}

const norm = (s) => String(s ?? '').trim().toLowerCase()

function splitName(name, company) {
  const n = String(name ?? '').trim()
  const p = n.split(/\s+/).filter(Boolean)
  if (p.length >= 2) return { firstName: p[0], lastName: p.slice(1).join(' ') }
  if (p.length === 1) return { firstName: p[0], lastName: '—' }
  const c = String(company ?? 'Kontakt').split(/\s+/).filter(Boolean)
  return c.length >= 2 ? { firstName: c[0], lastName: c.slice(1).join(' ') } : { firstName: c[0] || 'Kontakt', lastName: '—' }
}

function contactType(c) {
  if (c.project === 'SWE A4') return 'LIEFERANT'
  const hay = norm(`${c.company} ${c.role}`)
  if (/gemeinde|beh[öo]rde|bkw|swisscom|sunrise|rsta|bauinspektor/.test(hay)) return 'GEMEINDE'
  if (/baumeister/.test(hay)) return 'BAUMEISTER'
  if (/lieferant|storen|k[üu]che|lift|aufzug/.test(hay)) return 'LIEFERANT'
  return 'EXTERN'
}

function buildNotes(c) {
  return [c.notes, c.bkp ? `BKP ${c.bkp}` : null, c.status ? `Status: ${c.status}` : null]
    .filter(Boolean).join(' · ') || undefined
}

// ---- Login ----
const login = await api('/auth/app-login', { method: 'POST', body: { email: EMAIL, password: PASSWORD } })
token = login.accessToken || login.token || login.access_token
if (!token) { console.error('login sin token'); process.exit(1) }
console.log('✓ login')

// ---- Proyectos: mapear y crear los que falten ----
const projRes = await api('/projects')
const projects = Array.isArray(projRes) ? projRes : (projRes.projects || projRes.data || projRes.items || [])
const byName = new Map(projects.map((p) => [norm(p.name), p.id]))

const { datos } = JSON.parse(readFileSync('/tmp/contactos.json', 'utf8'))
const proyectosAmonn = [...new Set(datos.map((c) => c.project))]

// El usuario de servicio no puede CREAR proyectos (403). Solo se enlaza a los
// que ya existen (770). Para el resto, el proyecto se anota en las notas.
const mapProyecto = {}   // proyecto Amonn → projectId WorkPulse (o undefined)
for (const pa of proyectosAmonn) {
  const wpName = YA_EXISTE[pa] || pa
  mapProyecto[pa] = byName.get(norm(wpName)) || null
  console.log(`  proyecto «${pa}» → ${mapProyecto[pa] ? 'enlazado' : 'sin proyecto (se anota en notas)'}`)
}

// ---- Contactos existentes (para no duplicar) ----
const konRes = await api('/kontakte')
const kontakte = Array.isArray(konRes) ? konRes : (konRes.kontakte || konRes.data || konRes.items || [])
const existentes = new Set(kontakte.map((k) => `${norm(k.firstName)}|${norm(k.lastName)}|${norm(k.company)}`))

// ---- Crear y enlazar ----
let creados = 0, saltados = 0, enlazados = 0
for (const c of datos) {
  const { firstName, lastName } = splitName(c.name, c.company)
  const company = c.company || 'Ohne Firma'
  const clave = `${norm(firstName)}|${norm(lastName)}|${norm(company)}`
  if (existentes.has(clave)) { saltados++; continue }
  const pid = mapProyecto[c.project]
  // Si no se puede enlazar al proyecto, se anota en las notas para no perderlo.
  const notasBase = buildNotes(c)
  const notes = pid ? notasBase : [`Projekt: ${c.project}`, notasBase].filter(Boolean).join(' · ')
  const k = await api('/kontakte', {
    method: 'POST',
    body: {
      firstName, lastName, company,
      email: c.email || undefined,
      phone: c.phone || undefined,
      mobile: c.mobile || undefined,
      role: c.role || undefined,
      contactType: contactType(c),
      address: c.address || undefined,
      notes: notes || undefined,
    },
  })
  const kid = k.id || k.kontakt?.id
  existentes.add(clave)
  creados++
  if (kid && pid) {
    try { await api(`/kontakte/${kid}/projects`, { method: 'POST', body: { projectId: pid, role: c.role || undefined } }); enlazados++ }
    catch (e) { console.log(`  ! no se pudo enlazar ${firstName} ${lastName}: ${e.message}`) }
  }
}

console.log(`\n✓ contactos creados: ${creados} · ya estaban: ${saltados} · enlazados a proyecto: ${enlazados}`)
