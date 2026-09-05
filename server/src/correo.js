// ============================================================
// Vigilante del buzón: convierte los correos que importan en tareas.
//
// Casi todo el trabajo de la casa empieza en un correo — una solicitud de
// habitación, una oferta de un gremio, una factura — y de ahí alguien lo
// copia a mano al Excel, al contrato o al calendario. Cada salto es una
// ocasión de perder algo.
//
// Reglas de la casa:
//  - NO se toca el buzón. No se marca nada como leído ni se mueve: la gente
//    sigue trabajando en su correo como siempre. Lo ya visto se recuerda
//    aquí, en nuestra base.
//  - Solo se miran los correos que encajan con algo conocido. El resto se
//    ignora en silencio: un vigilante que avisa de todo se acaba apagando.
// ============================================================
import { query } from './db.js'

/** Los tipos de correo que sabemos reconocer. */
export const TIPOS = {
  habitacion: {
    // Zimmer-Anfrage: lo más frecuente del hotel.
    asunto: /\b(zimmer|anfrage|reservation|reservierung|buchung|aufenthalt|unterkunft)\b/i,
    titulo: (c) => `Solicitud de habitación — ${c.remitenteNombre || c.remitente}`,
    dias: 1,   // se responde al día siguiente como muy tarde
  },
  oferta: {
    asunto: /\b(offerte|angebot|kostenvoranschlag|preisanfrage)\b/i,
    titulo: (c) => `Oferta recibida — ${c.remitenteNombre || c.remitente}`,
    dias: 3,
  },
  factura: {
    asunto: /\b(rechnung|faktura|zahlungserinnerung|mahnung|invoice)\b/i,
    titulo: (c) => `Factura — ${c.remitenteNombre || c.remitente}`,
    dias: 10,  // suelen tener 30 días, pero no conviene dejarlo al final
  },
  cita: {
    asunto: /\b(termin|besprechung|sitzung|besichtigung)\b/i,
    titulo: (c) => `Cita por correo — ${c.remitenteNombre || c.remitente}`,
    dias: 1,
  },
}

/**
 * Decide de qué va un correo. Devuelve la clave del tipo o null.
 * Se mira el asunto, no el cuerpo: es más fiable y no hace falta leer el
 * contenido de la correspondencia para clasificarla.
 */
export function clasificarCorreo({ asunto = '', remitente = '' } = {}) {
  const a = String(asunto)
  // Las respuestas automáticas de ausencia no son trabajo.
  if (/^(automatische antwort|out of office|abwesenheit|réponse automatique)/i.test(a.trim())) return null
  if (/\bno-?reply\b|\bmailer-daemon\b|\bnewsletter\b/i.test(String(remitente))) return null
  // Los correos entre nosotros son conversación interna, no trabajo que
  // entra: si no, cada respuesta del equipo genera su propia tarea.
  if (/@(reto-amonn\.ch|ns-hotel\.ch)\s*$/i.test(String(remitente).trim())) return null
  for (const [tipo, def] of Object.entries(TIPOS)) {
    if (def.asunto.test(a)) return tipo
  }
  return null
}

/** Saca el nombre de "Sandra Marjanovic <s.marjanovic@workflow.swiss>". */
export function nombreDeRemitente(cabecera) {
  const s = String(cabecera ?? '').trim()
  const m = s.match(/^\s*"?([^"<]+?)"?\s*<([^>]+)>\s*$/)
  if (m) return { nombre: m[1].trim(), correo: m[2].trim().toLowerCase() }
  return { nombre: '', correo: s.replace(/[<>]/g, '').toLowerCase() }
}

/**
 * El asunto sin prefijos de respuesta ni reenvío, para reconocer que
 * "AW: Termin für Beratung" y "Termin für Beratung" son el mismo hilo.
 */
export function claveDeAsunto(asunto) {
  return String(asunto ?? '')
    .replace(/^(\s*(re|aw|antw|wg|fwd|fw|tr)\s*:\s*)+/i, '')
    .toLowerCase().replace(/\s+/g, ' ').trim()
    .slice(0, 180)
}

/** ¿Ya hay una tarea de este hilo en los últimos 30 días? */
export async function hiloYaAbierto(asunto) {
  const clave = claveDeAsunto(asunto)
  if (!clave) return false
  const { rows } = await query(
    "select 1 from seen_mails where subject_key = $1 and seen_at > now() - interval '30 days' limit 1",
    [clave],
  )
  return rows.length > 0
}

/** ¿Ya habíamos procesado este correo? Se recuerda por su Message-ID. */
export async function yaVisto(messageId) {
  if (!messageId) return true // sin identificador, mejor no arriesgarse a duplicar
  const { rows } = await query('select 1 from seen_mails where message_id = $1', [messageId])
  return rows.length > 0
}

export async function marcarVisto(messageId, tipo, taskId = null, asunto = '') {
  await query(
    `insert into seen_mails (message_id, kind, task_id, subject_key) values ($1,$2,$3,$4)
     on conflict (message_id) do nothing`,
    [messageId, tipo, taskId, claveDeAsunto(asunto)],
  )
}

// ---------- Conexión al buzón ----------
import { ImapFlow } from 'imapflow'
import { config } from './config.js'
import { createTask } from './tasks.service.js'
import { sendWhatsApp } from './whatsapp.js'
import { todayKey } from './dates.js'

function masDias(fecha, dias) {
  const d = new Date(`${fecha}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

export function correoConfigurado() {
  const { host, user, pass } = config.mailWatch ?? {}
  return Boolean(host && user && pass)
}

/**
 * Mira los correos recientes del buzón y crea una tarea por cada uno que
 * encaje. Devuelve un resumen. No lanza: si el buzón no responde, se anota
 * y se reintenta en la siguiente pasada.
 */
export async function revisarCorreo({ dias = 2 } = {}) {
  if (!correoConfigurado()) return { revisados: 0, nuevos: 0, motivo: 'sin configurar' }
  const { host, port, user, pass, buzon } = config.mailWatch
  const cliente = new ImapFlow({
    host, port: port || 993, secure: true,
    auth: { user, pass },
    logger: false,
  })

  const nuevos = []
  let revisados = 0
  try {
    await cliente.connect()
    // Solo lectura: así no hay forma de tocar el buzón sin querer.
    const cerrojo = await cliente.getMailboxLock(buzon || 'INBOX', { readOnly: true })
    try {
      const desde = new Date(Date.now() - dias * 86400000)
      for await (const msg of cliente.fetch({ since: desde }, { envelope: true })) {
        revisados++
        const env = msg.envelope ?? {}
        const de = env.from?.[0] ?? {}
        const correo = {
          messageId: env.messageId,
          asunto: env.subject ?? '',
          remitente: de.address ?? '',
          remitenteNombre: de.name ?? '',
          fecha: env.date ?? new Date(),
        }
        const tipo = clasificarCorreo(correo)
        if (!tipo) continue
        if (await yaVisto(correo.messageId)) continue
        // Un hilo con cinco respuestas es un trabajo, no cinco.
        if (await hiloYaAbierto(correo.asunto)) {
          await marcarVisto(correo.messageId, tipo, null, correo.asunto)
          continue
        }

        const def = TIPOS[tipo]
        const hoy = todayKey()
        const tarea = await createTask(
          {
            title: def.titulo(correo).slice(0, 200),
            description: `${correo.asunto}\n\nDe: ${correo.remitenteNombre || ''} <${correo.remitente}>`.trim(),
            due_date: masDias(hoy, def.dias),
          },
          null,
          { source: 'email' },
        )
        await marcarVisto(correo.messageId, tipo, tarea?.id ?? null, correo.asunto)
        nuevos.push({ tipo, asunto: correo.asunto, de: correo.remitente })
      }
    } finally {
      cerrojo.release()
    }
    await cliente.logout()
  } catch (err) {
    console.error(`[correo] no se pudo revisar el buzón: ${err.message}`)
    return { revisados, nuevos: nuevos.length, error: err.message }
  }

  if (nuevos.length) {
    console.log(`[correo] ${revisados} revisados · ${nuevos.length} nuevos: ${nuevos.map((n) => n.tipo).join(', ')}`)
    const aviso = (config.mailWatch.avisarA ?? '').split(',').map((x) => x.trim()).filter(Boolean)
    const texto = `📧 ${nuevos.length} correo(s) que necesitan algo:\n` +
      nuevos.slice(0, 6).map((n) => `• ${n.asunto} (${n.de})`).join('\n')
    for (const tel of aviso) {
      try { await sendWhatsApp(tel, texto) } catch (e) { console.error('[correo] aviso:', e.message) }
    }
  }
  return { revisados, nuevos: nuevos.length }
}
