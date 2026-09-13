// ============================================================
// Fase 1 del asistente: borradores y traducciones.
//
// Estas dos capacidades NO envían nada: devuelven el texto listo para que una
// persona lo revise y lo copie. Usan Gemini como redactor (texto normal, sin
// JSON), a diferencia de assistant.js, que lo usa para interpretar intenciones.
//
// Sin GEMINI_API_KEY ambas funciones devuelven null y el handler muestra el
// aviso "la IA no está configurada".
// ============================================================
import { config } from './config.js'
import { DOSSIER } from './empresa.js'

/**
 * Le pide a Gemini un texto plano (no JSON). Mismo fetch que parseWithGemini,
 * pero con temperatura 0.3 (algo de gracia para redactar) y SIN
 * responseMimeType: aquí queremos prosa, no un objeto.
 */
async function geminiTexto(prompt) {
  const { apiKey, model } = config.gemini
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15_000)
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3 },
      }),
    })
    if (!res.ok) throw new Error(`Gemini respondió ${res.status}: ${(await res.text()).slice(0, 200)}`)
    const data = await res.json()
    const out = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') ?? ''
    return out.trim()
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Traduce un texto a otro idioma conservando el tono. Devuelve SOLO la
 * traducción. Sin clave de Gemini devuelve null.
 */
export async function traducir(texto, idiomaDestino) {
  if (!config.gemini.apiKey) return null
  const prompt = `Traduce el siguiente texto a ${idiomaDestino}, manteniendo el tono del original. Devuelve SOLO la traducción, sin comillas ni explicación.

Texto:
${texto}`
  return geminiTexto(prompt)
}

/**
 * Redacta un borrador (mensaje, correo…) listo para revisar. No lo envía a
 * nadie. Sin clave de Gemini devuelve null.
 */
export async function redactarBorrador({ tipo = 'mensaje', para = null, tema, idioma = 'de' }) {
  if (!config.gemini.apiKey) return null
  const destinatario = para ? ` dirigido a ${para}` : ''
  const prompt = `Redacta un ${tipo} en ${idioma}${destinatario} sobre: ${tema}. Tono profesional y cordial, listo para revisar. Devuelve solo el texto del ${tipo}, sin comillas ni explicaciones.`
  return geminiTexto(prompt)
}

/**
 * Redacta un DOCUMENTO de muestra (contrato, protocolo de entrega, carta…)
 * listo para revisar. A diferencia de contrato_add, NO da de alta nada en la
 * base de datos ni envía nada: devuelve el texto con marcadores [entre
 * corchetes] para los datos que falten. Conoce los tipos de contrato de la
 * empresa a través del dossier. Sin clave de Gemini devuelve null.
 */
export async function redactarDocumento({ tipo = 'documento', sobre, idioma = 'de' }) {
  if (!config.gemini.apiKey) return null
  const prompt = `Eres la secretaria de Hans Amonn AG. Redacta un ${tipo} en ${idioma}, listo para que una persona lo revise.

LO QUE SABES DE LA EMPRESA (úsalo solo si es relevante para el documento):
${DOSSIER}

PETICIÓN DEL EQUIPO:
${sobre}

REGLAS:
- Es una MUESTRA/borrador para revisar, no un documento definitivo. No inventes datos personales, direcciones ni importes reales: pon marcadores [entre corchetes] (p. ej. [Nombre del inquilino], [importe CHF], [fecha de inicio]).
- Si es un contrato de alquiler, elige el tipo correcto según el dossier: Longstay (habitación amueblada, mensual, prórroga al pagar antes del 28, fianza 300–500 CHF) o vivienda (modelo HEV, preaviso 3 meses, fianza ~3 meses). Incluye los apartados habituales: partes, objeto (edificio/habitación), importe y forma de pago (CHF), inicio y duración, fianza, obligaciones y firmas.
- Estructura clara con apartados. Idioma: ${idioma}.
- Devuelve SOLO el texto del ${tipo}, sin comillas ni explicaciones alrededor.`
  return geminiTexto(prompt)
}
