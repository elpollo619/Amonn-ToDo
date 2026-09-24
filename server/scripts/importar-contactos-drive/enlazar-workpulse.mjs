// Enlaza en WorkPulse los contactos que quedaron SIN proyecto (los que llevan
// "Projekt: <X>" en las notas) al proyecto correspondiente, una vez que esos
// proyectos ya existen. Idempotente: si ya está enlazado, no repite.
//
// Entorno: WORKPULSE_URL, WORKPULSE_EMAIL, WORKPULSE_PASSWORD.
const URL = (process.env.WORKPULSE_URL || 'https://workpulse.ch').replace(/\/+$/, '')
const EMAIL = process.env.WORKPULSE_EMAIL
const PASSWORD = process.env.WORKPULSE_PASSWORD
if (!EMAIL || !PASSWORD) { console.error('Falta WORKPULSE_EMAIL / WORKPULSE_PASSWORD'); process.exit(1) }

let token = null
async function api(ruta, { method = 'GET', body = null } = {}) {
  const res = await fetch(`${URL}/api${ruta}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const txt = await res.text()
  if (!res.ok) throw new Error(`${method} ${ruta} → ${res.status}: ${String(txt).slice(0, 160)}`)
  return txt ? JSON.parse(txt) : null
}
const norm = (s) => String(s ?? '').trim().toLowerCase()
const arr = (d, ...k) => (Array.isArray(d) ? d : (k.map((x) => d?.[x]).find(Array.isArray) || []))

token = (await api('/auth/app-login', { method: 'POST', body: { email: EMAIL, password: PASSWORD } })).accessToken
console.log('✓ login')

const projects = arr(await api('/projects'), 'projects', 'data', 'items')
const byName = new Map(projects.map((p) => [norm(p.name), p.id]))

const kontakte = arr(await api('/kontakte'), 'kontakte', 'data', 'items')
let enlazados = 0, sinProyecto = 0, yaOk = 0
for (const k of kontakte) {
  const m = /^Projekt:\s*([^·]+?)(?:\s*·|$)/.exec(k.notes || '')
  if (!m) continue
  const nombreProj = m[1].trim()
  const pid = byName.get(norm(nombreProj))
  if (!pid) { sinProyecto++; continue }              // ese proyecto aún no existe
  if ((k.projects || []).some((p) => p.projectId === pid || p.project?.id === pid)) { yaOk++; continue }
  await api(`/kontakte/${k.id}/projects`, { method: 'POST', body: { projectId: pid, role: k.role || undefined } })
  enlazados++
  console.log(`  ✓ ${k.firstName} ${k.lastName} → ${nombreProj}`)
}
console.log(`\n✓ enlazados ahora: ${enlazados} · ya estaban: ${yaOk} · proyecto aún no existe: ${sinProyecto}`)
