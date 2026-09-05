// ============================================================
// Consejero de precios: «¿subo o bajo los precios?»
//
// Los datos vienen de PreisPilot, el motor de precios de Casa Reto que vive
// en Supabase (proyecto hansamonn-vermietung) y escribe a Beds24 dos veces
// al día. Su Edge Function `dashboard` es pública y devuelve el estado, el
// calendario de 365 noches (con desglose por noche) y el último envío.
//
// El análisis es una función PURA sobre ese JSON: así se prueba con datos
// fijos sin llamar a nadie. Los consejos son heurísticos y lo dicen: la
// ocupación real (reservas) aún no está conectada, y sin ella un consejo
// solo puede basarse en el propio calendario y los eventos.
//
// El hotel (A14) va aparte: sus precios viven en Apaleo, y hasta tener las
// credenciales el asistente lo dice en vez de inventar.
// ============================================================
import { config } from './config.js'
import { todayKey, addDays } from './dates.js'

export async function fetchDashboard() {
  const res = await fetch(config.preispilot.dashboardUrl, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(20_000),
  })
  if (!res.ok) throw new Error(`PreisPilot respondió ${res.status}`)
  return res.json()
}

const media = (xs) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0)

/**
 * Analiza el calendario y devuelve datos + consejos. Puro: sin red ni reloj
 * (el día se pasa por parámetro).
 */
export function analizarPrecios({ status, calendar, lastApply }, hoy = todayKey()) {
  const st = status ?? {}
  const noches = (calendar ?? []).filter((n) => n.d >= hoy).sort((a, b) => (a.d < b.d ? -1 : 1))
  const en = (dias) => noches.filter((n) => n.d < addDays(hoy, dias))

  const prox7 = en(7)
  const prox30 = en(30)
  const consejos = []

  // 1. ¿El cálculo está viejo? El cron reenvía cada día lo que haya, pero si
  //    nadie recalcula, los eventos y el horizonte se van quedando atrás.
  const dias = st.generated
    ? Math.round((Date.parse(hoy) - Date.parse(st.generated)) / 86400000)
    : null
  if (dias !== null && dias > 14) consejos.push({ tipo: 'stale', dias })

  // 2. Noches cercanas sin evento y por encima de la media de entre semana:
  //    a 7 días vista, sin reserva, lo que no se vende a precio alto se
  //    queda sin vender. Candidatas a bajar.
  const caras = prox7.filter((n) => !n.ev && !n.we && st.weekdayAvg && n.p > st.weekdayAvg * 1.05)
  if (caras.length >= 2) {
    consejos.push({ tipo: 'bajar', noches: caras.length, hasta: st.min ?? null })
  }

  // 3. Eventos en los próximos 60 días que siguen baratos: candidatos a
  //    subir mientras queda tiempo de venderlos caros.
  const eventosBaratos = en(60).filter((n) => n.ev && st.base && n.p < st.base * 1.25)
  if (eventosBaratos.length) {
    consejos.push({
      tipo: 'subir',
      noches: eventosBaratos.length,
      ejemplo: eventosBaratos[0],
      techo: st.hi ?? st.max ?? null,
    })
  }

  // 4. ¿Beds24 recibió el último envío?
  const aplicado = lastApply?.ok === true
  if (!aplicado) consejos.push({ tipo: 'apply_failed' })

  return {
    propiedad: st.property ?? 'Casa Reto',
    generado: st.generated ?? null,
    diasDesdeCalculo: dias,
    base: st.base ?? null, min: st.min ?? null, max: st.max ?? null,
    media7: media(prox7.map((n) => n.p)),
    media30: media(prox30.map((n) => n.p)),
    weekdayAvg: st.weekdayAvg ?? null,
    weekendAvg: st.weekendAvg ?? null,
    eventosProx30: prox30.filter((n) => n.ev).length,
    prox7,
    ultimoEnvio: lastApply?.at ? String(lastApply.at).slice(0, 10) : null,
    aplicado,
    consejos,
  }
}
