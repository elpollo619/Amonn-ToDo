// ============================================================
// Vigilante del hypothekarischer Referenzzinssatz (BWO).
//
// Es EL número del alquiler suizo: cuando baja, el inquilino puede exigir
// rebaja; cuando sube, el arrendador puede subir (≈3% de renta por cada
// 0.25 puntos, más ajustes de IPC y costes). Con ~500 contratos, un cambio
// no aplicado es dinero real cada mes.
//
// El BWO NO tiene API: se publica en bwo.admin.ch unas 4 veces al año
// (marzo/junio/sept/dic). Aquí se lee la página una vez al mes con una
// regex defensiva; si la página cambia de forma, se registra el fallo y NO
// se molesta a nadie (peor un falso aviso que un mes sin mirar).
// ============================================================
import cron from 'node-cron'
import { config } from './config.js'
import { query } from './db.js'
import { sendWhatsApp } from './whatsapp.js'
import { t as tr, safeLang } from './i18n.js'

const URL_BWO = 'https://www.bwo.admin.ch/de/referenzzinssatz'

/** Saca el tipo del HTML del BWO. Puro; null si no lo encuentra claro. */
export function extraerZins(html) {
  const m = String(html ?? '').match(/Aktueller[\s-]*Referenzzinssatz:?[\s-]*([0-9]+[.,][0-9]{1,2})\s*%/i)
  if (!m) return null
  const v = Number(m[1].replace(',', '.'))
  // Paracaídas: el tipo real vive entre 0 y 5; otra cosa es un fallo de parseo.
  return Number.isFinite(v) && v > 0 && v < 5 ? v : null
}

export async function fetchZins() {
  const res = await fetch(URL_BWO, {
    headers: { 'User-Agent': 'AmonnAssistent/1.0' },
    signal: AbortSignal.timeout(20_000),
  })
  if (!res.ok) throw new Error(`BWO respondió ${res.status}`)
  return extraerZins(await res.text())
}

export async function zinsGuardado() {
  const { rows } = await query("select value from app_state where key = 'referenzzinssatz'")
  return rows[0]?.value ?? null
}

async function guardarZins(valor) {
  await query(
    `insert into app_state (key, value, updated_at) values ('referenzzinssatz', $1, now())
     on conflict (key) do update set value = $1, updated_at = now()`,
    [JSON.stringify({ valor, visto: new Date().toISOString().slice(0, 10) })],
  )
}

/**
 * Una pasada del vigilante. Primer valor: se guarda en silencio. Cambio:
 * se guarda y se avisa a los del resumen semanal (RESUMEN_TO).
 */
export async function runVigilanteZins() {
  const actual = await fetchZins()
  if (actual === null) {
    console.error('[zins] no pude leer el tipo en la página del BWO (¿cambió el formato?)')
    return { valor: null, cambio: false }
  }
  const previo = await zinsGuardado()
  if (!previo) {
    await guardarZins(actual)
    console.log(`[zins] primer valor guardado: ${actual}%`)
    return { valor: actual, cambio: false }
  }
  if (previo.valor === actual) return { valor: actual, cambio: false }

  await guardarZins(actual)
  const subida = actual > previo.valor
  const destinos = (process.env.RESUMEN_TO ?? '').split(',').map((x) => x.trim()).filter(Boolean)
  for (const phone of destinos) {
    const { rows } = await query('select language from users where phone = $1', [phone])
    const lang = safeLang(rows[0]?.language ?? 'es')
    try {
      await sendWhatsApp(phone, tr(lang, subida ? 'zins_up' : 'zins_down', {
        antes: String(previo.valor).replace('.', ','),
        ahora: String(actual).replace('.', ','),
      }))
    } catch (err) {
      console.error(`[zins] no se pudo avisar a ${phone}: ${err.message}`)
    }
  }
  console.log(`[zins] CAMBIO ${previo.valor}% → ${actual}% · avisados: ${destinos.length}`)
  return { valor: actual, cambio: true, previo: previo.valor }
}

export function scheduleVigilanteZins() {
  // El día 2 de cada mes: los anuncios del BWO son trimestrales a principios
  // de mes, y mirar 12 veces al año no le duele a nadie.
  cron.schedule('0 9 2 * *', () => {
    runVigilanteZins().catch((e) => console.error('[zins]', e.message))
  }, { timezone: config.timezone })
  console.log('[zins] vigilante del Referenzzinssatz: día 2 de cada mes')
}
