// ============================================================
// Transcripción de notas de voz (Whisper corriendo en el propio NAS).
//
// Se eligió local en vez de un servicio externo: los audios de obra pueden
// llevar nombres de clientes y detalles de trabajos, y así no salen de casa.
// El precio es la velocidad — en el NAS (ARM, 8 núcleos) va a ~2,5x tiempo
// real: una nota de 20 segundos tarda cerca de un minuto.
//
// Si el servicio no está configurado o falla, NO se rompe nada: el audio se
// guarda como adjunto igual que antes. La transcripción es una mejora, no un
// requisito.
// ============================================================
import { config } from './config.js'

// Un audio largo tardaría demasiado y bloquearía la respuesta de WhatsApp.
const MAX_SEGUNDOS_ESPERA = 120

export function transcripcionDisponible() {
  return Boolean(config.whisperUrl)
}

/**
 * Devuelve el texto de un audio, o null si no se puede transcribir.
 * Nunca lanza: quien llama debe poder seguir sin transcripción.
 */
export async function transcribir(buffer, mime = 'audio/ogg', lang = null) {
  if (!config.whisperUrl) return null
  try {
    const form = new FormData()
    form.append('audio_file', new Blob([buffer], { type: mime }), 'nota.ogg')
    const params = new URLSearchParams({ task: 'transcribe', output: 'txt' })
    // Decirle el idioma mejora bastante el resultado; si no lo sabemos, que
    // lo detecte él.
    if (lang) params.set('language', lang)
    const res = await fetch(`${config.whisperUrl}/asr?${params}`, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(MAX_SEGUNDOS_ESPERA * 1000),
    })
    if (!res.ok) {
      console.error(`[voz] el transcriptor respondió ${res.status}`)
      return null
    }
    const texto = (await res.text()).trim()
    return texto || null
  } catch (err) {
    console.error(`[voz] no se pudo transcribir: ${err.message}`)
    return null
  }
}
