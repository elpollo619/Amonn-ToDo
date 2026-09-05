// Pruebas del lector de extractos camt.053 y de la conciliación.
// El XML de ejemplo sigue la estructura ISO 20022 real: un abono con
// referencia QRR, un lote con dos pagos (TxDtls) y un cargo que se ignora.
import { initDb, query, pool } from '../src/db.js'
import { esCamt, parseCamt, conciliarPagos } from '../src/camt.js'
import { estadoDeCobros, formatImpagos } from '../src/impagos.js'

let fallos = 0
function checkIgual(n, real, debe) {
  if (JSON.stringify(real) === JSON.stringify(debe)) console.log(`  ✔ ${n}`)
  else { fallos++; console.log(`  ✘ ${n}\n      obtenido: ${JSON.stringify(real)}\n      esperado: ${JSON.stringify(debe)}`) }
}

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.08">
<BkToCstmrStmt><Stmt>
<Acct><Id><IBAN>CH4431999123000889012</IBAN></Id></Acct>
<Ntry>
  <Amt Ccy="CHF">800.00</Amt><CdtDbtInd>CRDT</CdtDbtInd>
  <BookgDt><Dt>2026-09-01</Dt></BookgDt>
  <NtryDtls><TxDtls>
    <Amt Ccy="CHF">800.00</Amt><CdtDbtInd>CRDT</CdtDbtInd>
    <RltdPties><Dbtr><Nm>Aymen Zaghouani</Nm></Dbtr></RltdPties>
    <RmtInf><Strd><CdtrRefInf><Ref>909090123456789012345678901</Ref></CdtrRefInf></Strd></RmtInf>
  </TxDtls></NtryDtls>
</Ntry>
<Ntry>
  <Amt Ccy="CHF">5236.00</Amt><CdtDbtInd>CRDT</CdtDbtInd>
  <BookgDt><Dt>2026-09-02</Dt></BookgDt>
  <NtryDtls>
  <TxDtls>
    <Amt Ccy="CHF">2798.00</Amt><CdtDbtInd>CRDT</CdtDbtInd>
    <RltdPties><Dbtr><Nm>Koubaa Kamal</Nm></Dbtr></RltdPties>
    <RmtInf><Ustrd>Miete September</Ustrd></RmtInf>
  </TxDtls>
  <TxDtls>
    <Amt Ccy="CHF">2438.00</Amt><CdtDbtInd>CRDT</CdtDbtInd>
    <RltdPties><Dbtr><Nm>Persona Desconocida GmbH</Nm></Dbtr></RltdPties>
  </TxDtls>
  </NtryDtls>
</Ntry>
<Ntry>
  <Amt Ccy="CHF">120.00</Amt><CdtDbtInd>DBIT</CdtDbtInd>
  <BookgDt><Dt>2026-09-02</Dt></BookgDt>
</Ntry>
</Stmt></BkToCstmrStmt></Document>`

console.log('\n1. RECONOCER Y LEER EL FICHERO')
checkIgual('un camt se reconoce', esCamt(Buffer.from(XML)), true)
checkIgual('un PDF no', esCamt(Buffer.from('%PDF-1.4 hola')), false)
const { iban, entradas } = parseCamt(XML)
checkIgual('el IBAN de la cuenta', iban, 'CH4431999123000889012')
checkIgual('cuatro movimientos (el lote se abre en dos)', entradas.length, 4)
checkIgual('la referencia QRR se lee', entradas[0].referencia, '909090123456789012345678901')
checkIgual('el pagador se lee', entradas[1].quien, 'Koubaa Kamal')
checkIgual('el cargo va marcado DBIT', entradas[3].tipo, 'DBIT')

console.log('\n2. CONCILIAR: FACTURA POR REFERENCIA, CONTRATO POR NOMBRE')
await initDb()
for (const t of ['bank_entries', 'qr_bills', 'mietvertraege']) await query(`delete from ${t}`)
await query(`insert into qr_bills (token, amount_cents, debtor, reference, pdf)
  values ('a1b2c3d4a1b2c3d4a1b2c3d4a1b2c3d4', 80000, 'Aymen Zaghouani', '909090123456789012345678901', '\\x25')`)
await query(`insert into mietvertraege (objgrp, objcode, m1vname, m1name, total)
  values ('A4','A4-11.1','Kamal','Koubaa',2798)`)

const r = await conciliarPagos(entradas)
checkIgual('tres abonos nuevos (el cargo no cuenta)', r.creditos, 3)
checkIgual('la factura queda cobrada', r.facturas.length, 1)
const pagada = (await query('select paid_at from qr_bills')).rows[0]
checkIgual('con paid_at puesto', pagada.paid_at !== null, true)
checkIgual('el nombre casa con la Liste', r.contratos[0]?.contrato?.objcode, 'A4-11.1')
checkIgual('lo que no casa se dice', r.desconocidos.length, 1)

console.log('\n3. REENVIAR EL MISMO FICHERO NO CUENTA DOS VECES')
const r2 = await conciliarPagos(entradas)
checkIgual('cero abonos nuevos', r2.creditos, 0)
checkIgual('tres repetidos', r2.repetidos, 3)

console.log('\n4. "¿QUIÉN NO HA PAGADO?" SOBRE LOS EXTRACTOS VISTOS')
// Un contrato más SIN abono este mes: debe salir en la lista.
await query(`insert into mietvertraege (objgrp, objcode, m1vname, m1name, total)
  values ('B22','B22-036','Rita','Exemplo',750)`)
const e = await estadoDeCobros('2026-09-25')
checkIgual('Koubaa pagó (nombre casa) y no sale', e.impagados.some((v) => v.m1name === 'Koubaa'), false)
checkIgual('Exemplo no pagó y sale', e.impagados.some((v) => v.m1name === 'Exemplo'), true)
const texto = formatImpagos(e, 'es')
checkIgual('el texto avisa de en qué se basa', texto.includes('abonos vistos'), true)
checkIgual('y de que es pista, no juicio', texto.includes('pista'), true)
const sinDatos = await estadoDeCobros('2019-01-25')
checkIgual('sin extractos del mes no se inventa nada', formatImpagos(sinDatos, 'es').includes('mándame primero'), true)

await pool.end()
console.log(fallos === 0 ? '\n✅ todas las pruebas del extracto pasan\n' : `\n❌ ${fallos} fallo(s)\n`)
process.exit(fallos === 0 ? 0 : 1)
