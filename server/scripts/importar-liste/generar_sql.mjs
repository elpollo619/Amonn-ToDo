// Convierte liste.json en un SQL idempotente para la tabla mietvertraege.
import fs from 'node:fs'

const { datos } = JSON.parse(fs.readFileSync('/tmp/liste.json', 'utf8'))
const esc = (v) => {
  if (v === null || v === undefined || v === '') return 'null'
  return `'${String(v).replace(/'/g, "''")}'`
}
const num = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? String(n) : 'null'
}
const fecha = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v ?? '')) ? `'${v}'` : 'null')

const filas = datos.map((d) =>
  `(${esc(d.objgrp)},${esc(d.objcode)},${esc(d.m1vname)},${esc(d.m1name)},${esc(d.m1tel)},${esc(d.m1email)},${fecha(d.mbeginn)},${esc(d.frist)},${num(d.mnetto)},${num(d.total)},${num(d.depot)},${esc(d.objekt)},${esc(d.objektzus)},${esc(d.objadr)},${esc(d.objort)},${esc(d.bemerkungen)})`,
)

const sql = `
create table if not exists mietvertraege (
  id uuid primary key default gen_random_uuid(),
  objgrp text, objcode text not null, m1vname text, m1name text,
  m1tel text, m1email text, mbeginn date, frist text,
  mnetto numeric, total numeric, depot numeric,
  objekt text, objektzus text, objadr text, objort text, bemerkungen text,
  imported_at timestamptz not null default now()
);
create index if not exists mietvertraege_objcode on mietvertraege (lower(objcode));
create index if not exists mietvertraege_grupo on mietvertraege (lower(coalesce(objgrp,'')));
begin;
delete from mietvertraege;
insert into mietvertraege (objgrp,objcode,m1vname,m1name,m1tel,m1email,mbeginn,frist,mnetto,total,depot,objekt,objektzus,objadr,objort,bemerkungen) values
${filas.join(',\n')};
commit;
select count(*) as importados from mietvertraege;
`
fs.writeFileSync('/tmp/liste.sql', sql)
console.log('filas:', filas.length)
