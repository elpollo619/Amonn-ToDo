// ============================================================
// Leer un recibo ESCANEADO (foto o PDF sin texto) con Gemini vision.
//
// El extractor propio (recibo.js) funciona con PDFs electrónicos de Coop,
// Migros y compañía. Pero los recibos de la empresa suelen ser escaneos —
// ahí no hay texto que extraer y Tesseract da pena con tickets arrugados.
// Gemini ve la imagen y devuelve los cuatro datos que importan. Cuesta
// fracciones de céntimo por recibo y ya tenemos la clave en el NAS.
//
// Se le exige JSON y se valida cada campo con paracaídas: un dato dudoso
// se descarta y se pregunta a la persona, que es más honesto que inventar.
// ============================================================
import { config } from './config.js'

export function visionConfigurada() {
  return Boolean(config.gemini.apiKey)
}

/**
 * Devuelve { comercio, fecha (YYYY-MM-DD), importe (número), iva } con los
 * campos que Gemini haya visto claros, o null si no está configurado o no
 * se fía. Nunca lanza.
 */
export async function leerReciboConGemini(buffer, mime) {
  if (!visionConfigurada()) return null
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.gemini.model)}:generateContent?key=${encodeURIComponent(config.gemini.apiKey)}`
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(25_000),
      body: JSON.stringify({
        contents: [{
          role: 'user',
          parts: [
            { inlineData: { mimeType: mime, data: buffer.toString('base64') } },
            { text: 'Esto es un recibo de compra suizo (puede estar en alemán). Devuelve SOLO un JSON con: "comercio" (nombre de la tienda, ej. "Coop"), "fecha" (YYYY-MM-DD), "importe" (el TOTAL pagado, número con decimales), "iva" ("8.1", "2.6" o null). Si un dato no se lee con claridad, pon null. Nada de texto fuera del JSON.' },
          ],
        }],
        generationConfig: { temperature: 0, responseMimeType: 'application/json' },
      }),
    })
    if (!res.ok) throw new Error(`Gemini respondió ${res.status}`)
    const data = await res.json()
    const out = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') ?? ''
    const j = JSON.parse(out.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim())
    return validarLectura(j)
  } catch (err) {
    console.error('[vision] no pude leer el recibo:', err.message)
    return null
  }
}

/** Paracaídas sobre lo que diga la IA. Puro, para poder probarlo. */
export function validarLectura(j) {
  if (!j || typeof j !== 'object') return null
  const importe = Number(j.importe)
  const out = {
    comercio: typeof j.comercio === 'string' && j.comercio.trim() ? j.comercio.trim().slice(0, 40) : null,
    fecha: /^\d{4}-\d{2}-\d{2}$/.test(String(j.fecha ?? '')) ? j.fecha : null,
    importe: Number.isFinite(importe) && importe > 0 && importe < 100000 ? importe : null,
    iva: j.iva === '8.1' || j.iva === '2.6' ? j.iva : null,
  }
  // Sin importe no hay nada que aprovechar.
  return out.importe ? out : null
}
