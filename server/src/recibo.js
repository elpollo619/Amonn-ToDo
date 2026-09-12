// ============================================================
// Leer un recibo en PDF: comercio, fecha, importe e IVA.
//
// Se extrae el texto del PDF sin librerías externas. Un PDF guarda su texto
// en «streams» normalmente comprimidos con zlib; aquí se descomprimen y se
// recogen las cadenas de los operadores de texto (Tj y TJ). Funciona con los
// recibos electrónicos de Coop, Migros, Bauhaus y compañía, que son PDFs de
// verdad y no imágenes.
//
// Con una FOTO de un ticket esto no sirve: ahí no hay texto que extraer,
// haría falta OCR. En ese caso se pregunta el importe, que es más honesto
// que inventarlo.
// ============================================================
import zlib from 'node:zlib'

/** Saca todo el texto que se pueda de un PDF. Nunca lanza. */
export function textoDePdf(buffer) {
  try {
    const bin = buffer.toString('latin1')
    const trozos = []
    // Cada "stream ... endstream" puede llevar texto comprimido.
    const re = /stream\r?\n([\s\S]*?)\r?\nendstream/g
    let m
    while ((m = re.exec(bin)) !== null) {
      const crudo = Buffer.from(m[1], 'latin1')
      let contenido
      try {
        contenido = zlib.inflateSync(crudo).toString('latin1')
      } catch {
        contenido = crudo.toString('latin1') // algunos van sin comprimir
      }
      trozos.push(contenido)
    }
    const texto = trozos.join('\n')
    // Los operadores de texto: (cadena) Tj  y  [(a) -3 (b)] TJ
    const salida = []
    const reTexto = /\(((?:[^()\\]|\\.)*)\)\s*(?:Tj|TJ|'|")/g
    let t
    while ((t = reTexto.exec(texto)) !== null) {
      salida.push(t[1].replace(/\\([()\\])/g, '$1').replace(/\\(\d{3})/g, (_, o) => String.fromCharCode(parseInt(o, 8))))
    }
    // Y los arrays de TJ, que parten la palabra en trozos
    const reArray = /\[((?:[^\][]|\\.)*)\]\s*TJ/g
    while ((t = reArray.exec(texto)) !== null) {
      const partes = [...t[1].matchAll(/\(((?:[^()\\]|\\.)*)\)/g)].map((x) => x[1])
      if (partes.length) salida.push(partes.join(''))
    }
    const resultado = salida.join('\n')

    // ⚠️ Un PDF escaneado no tiene texto, pero sus streams de imagen sí casan
    // a veces con estos patrones y devuelven basura binaria. Aceptar esa
    // basura sería peor que no leer nada: se acabaría sacando de ahí un
    // importe inventado. Por eso se exige que la mayor parte sea legible.
    if (!esTextoDeVerdad(resultado)) return ''
    return resultado
  } catch {
    return ''
  }
}

/**
 * ¿Esto parece texto escrito por una persona, o son bytes de una imagen?
 * Se mide qué proporción son letras, cifras y signos normales.
 */
export function esTextoDeVerdad(s) {
  const t = String(s ?? '')
  if (t.length < 20) return false
  const legibles = (t.match(/[A-Za-zÀ-ÿ0-9 .,:\-\/%'\n]/g) ?? []).length
  const proporcion = legibles / t.length
  // Un recibo de verdad pasa del 90 %; la basura binaria se queda muy por
  // debajo (medido: 45 % en un escaneo real de Media Markt).
  if (proporcion < 0.85) return false
  // Y tiene que haber palabras, no solo símbolos sueltos.
  const palabras = t.match(/[A-Za-zÀ-ÿ]{3,}/g) ?? []
  return palabras.length >= 5
}

/** Comercios que aparecen una y otra vez en los recibos de la empresa. */
const COMERCIOS = [
  'Coop', 'Migros', 'Migrolino', 'Migrol', 'Landi', 'Bauhaus', 'Jumbo', 'IKEA', 'Jysk',
  'Aldi', 'Lidl', 'Otto\'s', 'Ottos', 'Office World', 'Interdiscount', 'Media Markt',
  'Mediamarkt', 'Digitec', 'Post', 'Bigler', 'TopCC', 'Hornbach', 'Micasa', 'Temu',
]

/**
 * Saca los datos de un recibo. Todo puede venir a null: es mejor preguntar
 * que rellenar con algo inventado — un importe mal puesto en la contabilidad
 * cuesta más de arreglar que de escribir.
 */
export function leerRecibo(texto) {
  const t = String(texto ?? '')

  // --- comercio ---
  let comercio = null
  for (const c of COMERCIOS) {
    if (new RegExp(`\\b${c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(t)) { comercio = c; break }
  }

  // --- fecha (dd.mm.yyyy, dd/mm/yy, yyyy-mm-dd) ---
  let fecha = null
  const f1 = t.match(/\b(\d{1,2})[.\/](\d{1,2})[.\/](\d{2,4})\b/)
  const f2 = t.match(/\b(\d{4})-(\d{2})-(\d{2})\b/)
  if (f2) fecha = `${f2[1]}-${f2[2]}-${f2[3]}`
  else if (f1) {
    const [, d, mes, a] = f1
    const anio = a.length === 2 ? `20${a}` : a
    fecha = `${anio}-${String(mes).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  }

  // --- importe: se busca el TOTAL, no cualquier número ---
  let importe = null
  const conEtiqueta = [...t.matchAll(/(?:total|summe|betrag|zu bezahlen|gesamt)[^\d-]{0,20}(\d{1,5}[.,]\d{2})/gi)]
  if (conEtiqueta.length) {
    // El último "total" suele ser el definitivo (antes van subtotales).
    importe = Number(conEtiqueta[conEtiqueta.length - 1][1].replace(',', '.'))
  } else {
    // Sin etiqueta, el importe más alto es casi siempre el total.
    const nums = [...t.matchAll(/\b(\d{1,5}[.,]\d{2})\b/g)].map((x) => Number(x[1].replace(',', '.')))
    if (nums.length) importe = Math.max(...nums)
  }

  // --- IVA: en Suiza 8.1 % normal y 2.6 % reducido (alimentación) ---
  let iva = null
  if (/\b8[.,]1\s*%/.test(t)) iva = '8.1'
  else if (/\b2[.,]6\s*%/.test(t)) iva = '2.6'

  return { comercio, fecha, importe, iva, hayTexto: t.trim().length > 20 }
}
