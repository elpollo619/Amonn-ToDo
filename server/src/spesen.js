// ============================================================
// Spesen: los gastos que alguien adelanta de su bolsillo y luego se le
// devuelven.
//
// Cómo se hace hoy en Hans Amonn AG (leído del Spesen 2026.xlsx y de cómo
// están archivados los recibos en Drive):
//
//  1. Alguien compra algo y guarda el recibo.
//  2. El PDF se archiva con el nombre  «CÓDIGO YYMMDD Comercio Concepto.pdf»
//     — por ejemplo «HAAG 250429 Coop Blau Kraft.pdf».
//  3. En el Excel, cada persona tiene su hoja y cada gasto es una fila:
//     Code · Datum · Bemerkung, y el importe cae en la COLUMNA de su
//     categoría, que ya lleva su cuenta contable y su tipo de IVA.
//
// Lo difícil no es apuntar el importe: es acertar la columna. Por eso aquí
// el catálogo es explícito y el programa PROPONE, nunca decide solo.
// ============================================================

/**
 * Códigos de la primera columna. Dicen a qué edificio o entidad se carga.
 */
export const CODIGOS = {
  HAAG: 'Hans Amonn AG (oficina y general)',
  A14: "A14 · N's Hotel, Allmendstrasse 14",
  B22: 'B22 · HIAG',
  A4: 'A4',
  CR: 'CR',
  SWE: 'SWE',
  Privat: 'Privado (ram)',
}

/**
 * Las columnas del Excel, con su cuenta contable y los tipos de IVA que
 * admiten. `iva: []` significa que esa columna no separa por IVA.
 */
export const CATEGORIAS = [
  { key: 'ure_allg', col: 'URE Allg.', cuenta: '6100', iva: ['2.6', '8.1'], codigos: ['HAAG'] },
  { key: 'a14_material', col: 'A14 Hotel Material', cuenta: '6502', iva: ['2.6', '8.1'], codigos: ['HAAG', 'A14'] },
  { key: 'ure_edv', col: 'URE EDV', cuenta: '6110', iva: [], codigos: ['HAAG'] },
  { key: 'ure_fz', col: 'URE FZ', cuenta: '6200', iva: [], codigos: ['HAAG'] },
  { key: 'benzin', col: 'Benzin', cuenta: '6210', iva: [], codigos: ['HAAG'] },
  { key: 'entsorgung', col: 'Entsorgung', cuenta: '6460', iva: [], codigos: ['HAAG'] },
  { key: 'buero', col: 'Büro', cuenta: '6500', iva: [], codigos: ['HAAG'] },
  { key: 'komm', col: 'Komm.', cuenta: '6510', iva: [], codigos: ['HAAG'] },
  { key: 'porti', col: 'Porti', cuenta: '6512', iva: [], codigos: ['HAAG'] },
  { key: 'it_hard', col: 'IT Hard', cuenta: '6550', iva: [], codigos: ['HAAG'] },
  { key: 'it_soft', col: 'IT Soft', cuenta: '6540', iva: [], codigos: ['HAAG'] },
  { key: 'kueche', col: 'Küche', cuenta: '5900', iva: ['2.6', '8.1'], codigos: ['HAAG'] },
  { key: 'var_spesen', col: 'Var. Spesen', cuenta: '6640', iva: [], codigos: ['HAAG'] },
  { key: 'essen', col: 'Essen', cuenta: '5802', iva: ['2.6', '8.1'], codigos: ['HAAG'] },
  // B22 (HIAG) — cuentas 4221xx
  { key: 'b22_reinigung', col: 'Reinigung', cuenta: '422110', iva: [], codigos: ['B22'] },
  { key: 'b22_kueche', col: 'Küche', cuenta: '422111', iva: ['2.6', '8.1'], codigos: ['B22'] },
  { key: 'b22_verbr', col: 'Verbr. Mat.', cuenta: '422112', iva: [], codigos: ['B22'] },
  { key: 'b22_waesche', col: 'Wäsche', cuenta: '422114', iva: [], codigos: ['B22'] },
  { key: 'b22_kehricht', col: 'Kehricht', cuenta: '422116', iva: [], codigos: ['B22'] },
  { key: 'b22_rep', col: 'Rep/Ersatz', cuenta: '422140', iva: [], codigos: ['B22'] },
  { key: 'b22_einr', col: 'Einrichtungen', cuenta: '422141', iva: ['2.6', '8.1'], codigos: ['B22'] },
  { key: 'b22_divers', col: 'Divers.', cuenta: '422142', iva: [], codigos: ['B22'] },
  // A4 — cuentas 4321xx, mismas categorías
  { key: 'a4_reinigung', col: 'Reinigung', cuenta: '432110', iva: [], codigos: ['A4'] },
  { key: 'a4_kueche', col: 'Küche', cuenta: '432111', iva: ['2.6', '8.1'], codigos: ['A4'] },
  { key: 'a4_verbr', col: 'Verbr. Mat.', cuenta: '432112', iva: [], codigos: ['A4'] },
  { key: 'a4_waesche', col: 'Wäsche', cuenta: '432114', iva: [], codigos: ['A4'] },
  { key: 'a4_kehricht', col: 'Kehricht', cuenta: '432116', iva: [], codigos: ['A4'] },
  { key: 'a4_rep', col: 'Rep/Ersatz', cuenta: '432140', iva: [], codigos: ['A4'] },
  { key: 'a4_einr', col: 'Einrichtungen', cuenta: '432141', iva: ['2.6', '8.1'], codigos: ['A4'] },
  { key: 'a4_divers', col: 'Divers.', cuenta: '432142', iva: [], codigos: ['A4'] },
]

export const porKey = (key) => CATEGORIAS.find((c) => c.key === key) ?? null

/**
 * Qué categorías tienen sentido para un código. Sin esto, la lista de 30
 * columnas es inmanejable por WhatsApp; con esto, para B22 son ocho.
 */
export function categoriasDe(codigo) {
  const c = String(codigo ?? 'HAAG').toUpperCase()
  return CATEGORIAS.filter((x) => x.codigos.some((k) => k.toUpperCase() === c))
}

/**
 * Reglas aprendidas del histórico del Spesen 2026: qué comercio suele ir a
 * qué categoría. Es una PROPUESTA, y por eso siempre se enseña antes de
 * guardar: el mismo Migros puede ser cocina, limpieza o material de A14.
 */
const PISTAS = [
  [/migrol|coop pronto|ruedi r|tankstelle|benzin|shell|avia|socar/i, 'benzin'],
  [/bauhaus|jumbo|landi|hornbach|obi|baumaterial|toom/i, 'ure_allg'],
  [/ikea|jysk|micasa|einrichtung|lattenrost|möbel|moebel/i, 'a14_material'],
  [/office world|ottos|papeterie|büro|buero|stift|tipp-ex/i, 'buero'],
  [/post|porto|briefmarke/i, 'porti'],
  [/restaurant|essen|pizzeria|kebab|thai|krone|schwanen|que rico|bahnhof/i, 'essen'],
  [/interdiscount|inter discount|mediamarkt|media markt|digitec|pc |laptop|drucker/i, 'it_hard'],
  [/kehrichtmarke|gebührenmarke|gebuehrenmarke|entsorgung|containermarke/i, 'entsorgung'],
  // La limpieza tiene columna propia en B22 y A4, pero no en HAAG. Se
  // intenta primero la específica; si ese código no la tiene, cae en Küche.
  [/putzmittel|reinigung|wc-papier|toilettenpapier/i, 'b22_reinigung'],
  [/waschmittel|putzmittel|wc-papier|toilettenpapier/i, 'kueche'],
  [/swisscom|sunrise|salt|telefon/i, 'komm'],
  [/bigler/i, 'entsorgung'],
]

/** Propone una categoría a partir del texto del recibo. Puede no acertar. */
export function proponerCategoria(texto, codigo = 'HAAG') {
  const t = String(texto ?? '')
  const permitidas = new Set(categoriasDe(codigo).map((c) => c.key))
  for (const [re, key] of PISTAS) {
    if (!re.test(t)) continue
    if (permitidas.has(key)) return key
    // La misma idea en otro edificio: "limpieza" existe en HAAG, B22 y A4.
    const equivalente = CATEGORIAS.find(
      (c) => c.col === porKey(key)?.col && c.codigos.some((k) => k.toUpperCase() === String(codigo).toUpperCase()),
    )
    if (equivalente) return equivalente.key
  }
  return null
}

/**
 * El nombre con el que se archiva el recibo, siguiendo la convención que ya
 * se usa: «HAAG 250429 Coop Blau Kraft.pdf».
 */
export function nombreDeArchivo({ codigo, fecha, concepto, ext = 'pdf' }) {
  const d = String(fecha).slice(2, 10).replace(/-/g, '') // YYYY-MM-DD → YYMMDD
  const limpio = String(concepto ?? '').replace(/[\\/:*?"<>|]/g, '').trim()
  return `${codigo} ${d} ${limpio}.${ext}`.replace(/\s{2,}/g, ' ')
}
