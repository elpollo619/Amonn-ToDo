// /tmp/contactos.json  →  /tmp/contactos_sql.sql
// SQL idempotente: cada contacto se inserta SOLO si no existe ya uno con el
// mismo nombre en el mismo proyecto. Se puede aplicar varias veces sin duplicar.
import { readFileSync, writeFileSync } from 'node:fs'

const { datos } = JSON.parse(readFileSync('/tmp/contactos.json', 'utf8'))

const q = (v) => (v == null || v === '' ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`)

const lineas = ['begin;']
for (const c of datos) {
  const cols = ['name', 'company', 'role', 'bkp', 'project', 'phone', 'mobile', 'email', 'address', 'status', 'notes']
  const vals = cols.map((k) => q(c[k])).join(', ')
  lineas.push(
    `insert into contacts (${cols.join(', ')})\n` +
    `select ${vals}\n` +
    `where not exists (select 1 from contacts where lower(name)=lower(${q(c.name)}) ` +
    `and coalesce(lower(project),'')=coalesce(lower(${q(c.project)}),''));`,
  )
}
lineas.push('commit;')

writeFileSync('/tmp/contactos_sql.sql', lineas.join('\n') + '\n')
console.log(`SQL escrito: /tmp/contactos_sql.sql · ${datos.length} contactos`)
