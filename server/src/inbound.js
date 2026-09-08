// ============================================================
// Procesa un mensaje entrante de WhatsApp (llega por tiempo real o webhook):
// identifica a la persona por su teléfono, decide en qué idioma hablarle,
// interpreta lo que pide (assistant.js) y actúa: crea tareas, las lista, las
// completa o responde a un recordatorio.
//
// Novedades respecto a la primera versión:
//  - Habla español, alemán y portugués (i18n.js). El idioma se guarda por
//    persona y se detecta solo del primer mensaje con cuerpo suficiente.
//  - Si falta información para crear una tarea, PREGUNTA en lugar de rendirse
//    o de crear algo a medias. La conversación a medias vive en
//    conversations.js y caduca a los 10 minutos.
// ============================================================
import { query } from './db.js'
import { config } from './config.js'
import { sendWhatsApp, chatIdToPhone, interpretReply } from './whatsapp.js'
import { interpret, matchUser, pickTaskByHint, parseWithRules } from './assistant.js'
import {
  createTask, completeTask, setTaskState, openTasksFor, openTasksAll, listUsers,
  setDue, reassignTask, getTask, openTasksByState, openTasksDueBy,
} from './tasks.service.js'
import { firstName, taskSummary } from './notify.js'
import { describeRange, monthKeyFromText, parseDateAnyLang, parseRange, saysNoDate, todayKey, normalize } from './dates.js'
import { t, safeLang, detectLanguage, parseLanguageCommand } from './i18n.js'
import { getPending, setPending, clearPending } from './conversations.js'
import { loadAliases, learn, touch, normalizePhrase } from './aliases.js'
import { listStates, matchStateByName } from './states.service.js'
import { createSubtask, listSubtasks } from './subtasks.service.js'
import { transcribir, transcripcionDisponible } from './transcribe.js'
import { NOMBRES as BASURA_NOMBRES, proximaDe, proximas, masDias } from './entsorgung.js'
import { addCompra, listCompras, markComprado } from './compras.js'
import { createAppointment, listAppointments } from './agenda.js'
import { addContact, buscarContactos, formatContacto } from './contactos.js'
import { addGasto, cerrarMes, gastosAbiertos, saldos, chf, vorsteuerTrimestre, addKilometraje, kmResumen, kmRappen, gastoPorComercio } from './gastos.js'
import { componerResumenSemanal } from './reminders.js'
import { addAbsence, listAbsences, ausenciaDe } from './ausencias.js'
import { addReading, listReadings, detectarAnomalia, serieDe, TIPOS, NOMBRES as NOMBRES_CONTADOR } from './contadores.js'
import { contratosConfigurados, parseContrato, generarContrato } from './contratos.js'
import { fetchDashboard, analizarPrecios } from './precios.js'
import { huespedesConfigurado, listarMensajes, responderHuesped } from './huespedes.js'
import { tienePermiso, darPermiso, quitarPermiso, listarPermisos, NOMBRES_PERMISO, PERMISOS } from './permisos.js'
import { fetchMeteo, formatearParte } from './meteo.js'
import { fetchZins, zinsGuardado } from './zins.js'
import { textoDePdf, leerRecibo } from './recibo.js'
import { leerReciboConGemini } from './vision.js'
import { cobrosConfigurados, parseFactura, crearFactura } from './cobros.js'
import { buscarVertraege, sumaAlquileres, formatVertrag } from './vertraege.js'
import { esCamt, parseCamt, conciliarPagos } from './camt.js'
import { estadoDeCobros, formatImpagos } from './impagos.js'
import { parseMahnung, crearMahnung } from './mahnung.js'
import { mietertragCsv } from './vertraege.js'
import { apaleoConfigurado, llegadas, salidas, habitaciones, contarPersonas, porEstadoDeLimpieza } from './apaleo.js'
import { CODIGOS, categoriasDe, porKey, proponerCategoria, nombreDeArchivo } from './spesen.js'
import { listComments } from './comments.service.js'
import { createComment, createAttachment, storageStatus, MIMES } from './comments.service.js'
import {
  extraerFoto, pareceAdjunto, describirForma, motivoRechazo,
  guardarPendiente, leerPendiente, borrarPendiente, archivarRecibo,
} from './media.js'

/**
 * Procesa un mensaje entrante. `msg` trae al menos { from, body } y
 * opcionalmente { fromMe, isGroup }. Ignora mensajes propios y de grupos.
 */
export async function handleInbound(msg) {
  if (!msg || typeof msg !== 'object') return
  if (msg.fromMe) return
  const from = msg.from ?? ''
  if (!from || msg.isGroup || String(from).endsWith('@g.us')) return // ignora grupos
  const bruto = msg.body ?? msg.content ?? msg.text ?? ''
  const text = typeof bruto === 'string' ? bruto : ''

  // Una foto SIN pie de foto es un mensaje sin texto: antes se descartaba aquí
  // mismo y se perdía. Ahora el mensaje sigue adelante si trae imagen.
  const foto = extraerFoto(msg)
  if (!foto && pareceAdjunto(msg)) {
    // Parece una foto pero no encontramos los bytes. Dejamos constancia de la
    // FORMA del mensaje (nunca su contenido) para saber dónde mirar.
    console.warn(`[wa] llega algo que parece foto o audio pero sin datos; forma: ${describirForma(msg).join(' ')}`)
  }
  if (!text && !foto) return

  const phone = chatIdToPhone(from)

  // Una nota de voz se intenta convertir en texto. Si sale, se trata como si
  // se hubiera escrito: así se puede crear una tarea hablando. Si no sale
  // —servicio caído, audio ininteligible—, el audio se guarda como adjunto,
  // que es lo que se hacía antes: la transcripción mejora, no condiciona.
  let transcripcion = null
  const esNotaDeVoz = foto && String(foto.mime ?? '').startsWith('audio/')
  if (esNotaDeVoz && !text && transcripcionDisponible()) {
    transcripcion = await transcribir(foto.buffer, foto.mime)
    if (transcripcion) console.log(`[voz] transcrito (${transcripcion.length} caracteres)`)
  }

  let reply
  try {
    reply = transcripcion
      // Se enseña SIEMPRE lo que se entendió: si la transcripción falla en una
      // palabra, quien la lee lo ve al momento en vez de descubrirlo luego.
      ? `🎤 «${transcripcion}»\n\n${await processMessage(phone, transcripcion)}`
      : await processMessage(phone, text, { foto })
  } catch (err) {
    console.error('[asistente] error procesando el mensaje:', err.message)
    // Aún sin saber quién es, respondemos en el idioma que parezca.
    reply = t(detectLanguage(text) ?? 'es', 'error')
  }
  if (reply) {
    try {
      await sendWhatsApp(phone, reply)
    } catch (err) {
      console.error('[wa] no se pudo responder:', err.message)
    }
  }
}

async function findUserByPhone(phone) {
  const digits = phone.replace(/[^\d]/g, '')
  const { rows } = await query(
    `select * from users
     where regexp_replace(coalesce(phone,''), '[^0-9]', '', 'g') = $1
     limit 1`,
    [digits],
  )
  return rows[0] ?? null
}

async function saveLanguage(userId, lang, auto) {
  await query('update users set language = $2, language_auto = $3 where id = $1', [userId, lang, auto])
}

// ─── Listas ───────────────────────────────────────────────────
function listText(lang, titulo, tasks, today) {
  if (tasks.length === 0) return t(lang, 'list_empty', { titulo })
  const lines = tasks.slice(0, 15).map((task, i) => {
    const who = task.assignee_name ? ` · ${task.assignee_name.split(' ')[0]}` : ''
    const prio = task.priority === 'high' ? ' 🔴' : ''
    // Se enseña el estado salvo que sea uno de los de serie (Abierta / En
    // curso / Hecha): si no, todas las líneas dirían "Abierta" y no aportaría
    // nada. Ojo: no vale filtrar por clase, porque un estado propio como
    // "Por facturar" es de clase 'open' y sí hay que verlo.
    const estado = task.state_name && !task.state_is_default ? ` · ${task.state_name}` : ''
    // El avance solo se enseña si la tarea tiene pasos.
    const pasos = Number(task.subtasks_total) > 0
      ? ` · ${task.subtasks_done}/${task.subtasks_total}`
      : ''
    return `${i + 1}. ${task.title}${prio} · ${describeRange(task.start_date, task.due_date, today, lang, t)}${estado}${pasos}${who}`
  })
  const more = tasks.length > 15 ? t(lang, 'list_more', { resto: tasks.length - 15 }) : ''
  return `${t(lang, 'list_header', { titulo, total: tasks.length })}\n${lines.join('\n')}${more}`
}

const nombres = (users) => users.map((u) => u.full_name).filter(Boolean).join(', ')

// "jasmi es Jasmina" / "jasmi ist Jasmina" / "jasmi é a Jasmina".
// Se exige que la parte izquierda sea corta y la derecha una persona real,
// para no confundirlo con una frase normal ("la caldera es urgente").
const ENSENAR_RE = /^(.{2,28}?)\s+(?:es|significa|ist|bedeutet|e|é)\s+(?:el |la |o |a |der |die |das )?(.{2,28})$/i

/** ¿Es un intento de enseñar vocabulario? Devuelve {frase, nombre} o null. */
function parseTeach(text) {
  const m = String(text ?? '').trim().match(ENSENAR_RE)
  if (!m) return null
  const frase = m[1].trim()
  const nombre = m[2].trim()
  if (frase.split(/\s+/).length > 3 || nombre.split(/\s+/).length > 3) return null
  return { frase, nombre }
}

/** Palabras que identifican una tarea, para recordar cómo la llama el equipo. */
function keywordsDe(task) {
  return normalize(`${task.title} ${task.description ?? ''}`)
    .split(' ')
    .filter((w) => w.length >= 4)
    .slice(0, 4)
    .join(' ')
}

// ─── Crear una tarea (con preguntas si falta algo) ─────────────
/**
 * Decide el siguiente paso de un borrador de tarea: preguntar lo que falta,
 * pedir confirmación, o crearla. `preguntado` indica si ya hubo que preguntar
 * algo (entonces se confirma al final; si el mensaje venía completo, no).
 */
async function avanzarBorrador(phone, user, lang, draft, users, today) {
  if (!draft.title) {
    await setPending(phone, user.id, { ...draft, esperando: 'what', preguntado: true })
    return t(lang, 'ask_what')
  }
  if (!draft.assignee_id && !draft.sin_responsable) {
    await setPending(phone, user.id, { ...draft, esperando: 'who', preguntado: true })
    // Si veníamos de un nombre que no reconocimos, se dice: es más claro que
    // preguntar en seco, y avisa de que hay un apodo por aprender.
    return draft.nombre_no_reconocido
      ? t(lang, 'ask_person_again', { nombre: draft.nombre_no_reconocido, lista: nombres(users) })
      : t(lang, 'ask_who', { titulo: draft.title })
  }
  if (draft.due === undefined) {
    await setPending(phone, user.id, { ...draft, esperando: 'when', preguntado: true })
    return t(lang, 'ask_when')
  }
  // Solo se confirma cuando hubo que preguntar algo. Si el mensaje ya venía
  // completo, se crea directamente: preguntar "¿seguro?" siempre cansa.
  if (draft.preguntado && !draft.confirmado) {
    await setPending(phone, user.id, { ...draft, esperando: 'confirm' })
    const resumen = taskSummary(
      {
        title: draft.title,
        description: draft.description,
        due_date: draft.due,
        start_date: draft.start,
        work_days: draft.work_days,
        priority: draft.priority ?? 'medium',
      },
      lang,
    )
    return t(lang, 'confirm', { resumen })
  }
  await clearPending(phone)
  return crearTarea(user, lang, draft, users, today)
}

async function crearTarea(user, lang, draft, users, today) {
  const assignee = draft.assignee_id ? users.find((u) => u.id === draft.assignee_id) ?? null : null
  const task = await createTask(
    {
      title: draft.title,
      description: draft.description || null,
      assignee_id: assignee?.id ?? null,
      due_date: draft.due || null,
      start_date: draft.start || null,
      work_days: draft.work_days ?? null,
      priority: draft.priority || 'medium',
    },
    user.id,
    { source: 'whatsapp' },
  )
  const para = assignee
    ? assignee.id === user.id ? t(lang, 'for_you') : t(lang, 'for_person', { nombre: firstName(assignee) })
    : t(lang, 'for_nobody')
  let nota = ''
  if (assignee && assignee.id !== user.id) {
    const canWa = assignee.notify_whatsapp !== false && assignee.phone
    const canMail = assignee.notify_email !== false && assignee.email && config.mail.enabled
    const canales = [canWa && t(lang, 'channel_whatsapp'), canMail && t(lang, 'channel_email')].filter(Boolean)
    nota = canales.length
      ? t(lang, 'notified', { canales: canales.join(' + ') })
      : t(lang, 'not_notified', { nombre: firstName(assignee) })
  }
  // Si el asignado está ausente (hoy o el día del plazo), se avisa a quien
  // crea la tarea — pero la tarea se crea igual: la decisión es suya.
  if (assignee && assignee.id !== user.id) {
    const fuera = await ausenciaDe(assignee.id, draft.due || today)
    if (fuera) {
      nota += t(lang, 'abs_warn', {
        nombre: firstName(assignee),
        hasta: String(fuera.ends_on).slice(0, 10).split('-').reverse().slice(0, 2).join('/'),
      })
    }
  }
  const link = config.appUrl ? t(lang, 'see_link', { url: config.appUrl }) : ''
  const aprendido = draft.aprendido
    ? t(lang, 'learned_person', { frase: draft.aprendido.frase, nombre: draft.aprendido.nombre })
    : ''
  return t(lang, 'created', { para, resumen: taskSummary(task, lang) }) + nota + link + aprendido
}

/** Convierte lo que dijo la persona sobre "para quién" en un id de usuario. */
function resolverPersona(texto, users, sender, lang, aliases = []) {
  const m = matchUser(texto, users, sender, aliases)
  if (m.candidates.length > 1) {
    return { error: t(lang, 'person_ambiguous', { nombre: texto, lista: nombres(m.candidates) }) }
  }
  if (!m.user) return { error: null, noEncontrada: true }
  return { user: m.user }
}

// ─── Continuar una conversación a medias ──────────────────────
async function continuarPendiente(phone, user, lang, pending, texto, users, today, aliases = []) {
  const t0 = normalize(texto)
  // Cancelar en cualquier momento.
  if (/^(cancela|cancelar|olvidalo|dejalo|abbrechen|vergiss es|cancel|esquece)\b/.test(t0)) {
    await clearPending(phone)
    return t(lang, 'cancelled')
  }

  // "¿Cuál de estas?" tras no saber a qué tarea se refería. No es un
  // borrador de tarea, así que se resuelve aparte.
  if (pending.esperando === 'gasto_datos') {
    // Si el recibo ya se leyó solo (importe/fecha/comercio), lo leído se
    // antepone a la respuesta: contestar «A14» basta para cerrar el gasto.
    // PERO si la persona escribe su propio importe, está corrigiendo, y lo
    // suyo manda: no se antepone nada.
    const corrigiendo = /\d{1,5}[.,]\d{2}/.test(String(texto ?? ''))
    const conLeido = pending.leido && !corrigiendo ? `${pending.leido} ${texto}` : texto
    const r = await intentarGasto(phone, user, lang, conLeido, today, pending)
    if (r) return r
  }

  if (pending.esperando === 'which_task') {
    const todas = await openTasksAll()
    const candidatas = todas.filter((x) => (pending.ids ?? []).includes(x.id))
    // Solo se acepta un número, o un texto que identifique UNA sola candidata
    // sin ambigüedad. Una coincidencia floja no vale: completar la tarea
    // equivocada porque alguien ignoró la pregunta y escribió otra cosa es
    // mucho peor que volver a preguntar.
    const soloDigitos = /^\s*\d{1,2}\s*$/.test(t0)
    const n = soloDigitos ? Number.parseInt(t0.trim(), 10) : NaN
    let elegida = n >= 1 && n <= (pending.ids ?? []).length ? pending.ids[n - 1] : null
    if (!elegida) {
      const palabras = t0.split(' ').filter((w) => w.length >= 4)
      const exactas = palabras.length
        ? candidatas.filter((c) => {
            const titulo = normalize(`${c.title} ${c.description ?? ''}`)
            return palabras.every((w) => titulo.includes(w))
          })
        : []
      if (exactas.length === 1) elegida = exactas[0].id
    }
    if (!elegida) {
      // Ni número ni coincidencia clara: se abandona la pregunta y el mensaje
      // se trata como uno nuevo, en lugar de secuestrarlo.
      await clearPending(phone)
      return null
    }
    await clearPending(phone)
    const task = candidatas.find((x) => x.id === elegida)
    let extra = ''
    if (pending.hint && task) {
      await learn({ kind: 'task', phrase: pending.hint, keywords: keywordsDe(task), createdBy: user.id })
      extra = t(lang, 'learned_task', { pista: normalizePhrase(pending.hint) })
    }
    // La pregunta pudo venir de una foto que no sabíamos dónde poner.
    if (pending.foto_id) {
      const guardada = leerPendiente(pending.foto_id)
      if (!guardada) return t(lang, 'photo_no_storage', { motivo: 'la foto ya no está guardada' })
      await createAttachment(elegida, {
        buffer: guardada.buffer,
        mime: guardada.mime,
        filename: `whatsapp.${guardada.mime.split('/')[1] ?? 'jpg'}`,
        userId: user.id,
      })
      borrarPendiente(pending.foto_id)
      return t(lang, 'photo_added', { titulo: task?.title ?? '' }) + extra
    }

    // La pregunta pudo venir de "márcala hecha" o de "ponla en X".
    if (pending.estado_id) {
      const estado = (await listStates()).find((e) => e.id === pending.estado_id)
      if (estado) {
        await setTaskState(elegida, estado)
        return t(lang, 'state_changed', { titulo: task?.title ?? '', estado: estado.name }) + extra
      }
    }
    await completeTask(elegida)
    return t(lang, 'completed', { titulo: task?.title ?? '' }) + extra
  }

  // Si el mensaje es claramente OTRA cosa (una pregunta, un saludo, otra
  // tarea), se abandona la pregunta en vez de tragárselo como respuesta. Es la
  // misma lección que en "¿cuál de estas?": secuestrar un mensaje es peor que
  // perder el hilo.
  if (pending.esperando === 'who' || pending.esperando === 'what') {
    const otra = parseWithRules(texto, {
      sender: user, users, aliases, today, lang, openTasks: [], states: [],
    })
    if (['list_tasks', 'help', 'complete_task', 'set_state'].includes(otra.action)) {
      await clearPending(phone)
      return null
    }
  }

  const draft = { ...pending }
  delete draft.esperando

  switch (pending.esperando) {
    case 'what':
      draft.title = texto.trim()
      break

    case 'who': {
      const r = resolverPersona(texto, users, user, lang, aliases)
      if (r.error) return r.error
      if (r.noEncontrada) {
        // Se puede dejar sin responsable diciéndolo explícitamente.
        if (/^(nadie|sin responsable|niemand|ninguem|ninguém)\b/.test(t0)) {
          draft.sin_responsable = true
          break
        }
        await setPending(phone, user.id, { ...draft, esperando: 'who' })
        return t(lang, 'ask_person_again', { nombre: texto.trim(), lista: nombres(users) })
      }
      draft.assignee_id = r.user.id
      // Aprender de la corrección: si preguntamos porque no reconocimos un
      // nombre ("jasmi") y ahora sí sabemos a quién se refiere, se anota.
      if (draft.nombre_no_reconocido) {
        await learn({
          kind: 'person',
          phrase: draft.nombre_no_reconocido,
          userId: r.user.id,
          createdBy: user.id,
        })
        draft.aprendido = { frase: normalizePhrase(draft.nombre_no_reconocido), nombre: firstName(r.user) }
        delete draft.nombre_no_reconocido
      }
      break
    }

    case 'when': {
      if (saysNoDate(texto, lang)) {
        draft.due = null
      } else {
        // También aquí se admite un plazo entero: "del lunes al jueves".
        const rango = parseRange(texto, today, lang)
        if (rango) {
          draft.start = rango.start
          draft.due = rango.end
        } else {
          const d = parseDateAnyLang(texto, today, lang)
          draft.due = d ? d.key : null
        }
      }
      break
    }

    case 'confirm': {
      const r = interpretReply(texto)
      if (r === 'done') {
        draft.confirmado = true
        break
      }
      await clearPending(phone)
      return t(lang, 'cancelled')
    }

    default:
      await clearPending(phone)
      return null // no sabemos qué esperábamos: se procesa como mensaje nuevo
  }

  return avanzarBorrador(phone, user, lang, draft, users, today)
}

// ─── Lógica principal ─────────────────────────────────────────
/** Exportada para las pruebas: devuelve la respuesta sin enviarla. */
export async function processMessage(phone, text, { foto = null } = {}) {
  const user = await findUserByPhone(phone)
  if (!user) {
    return t(detectLanguage(text) ?? 'es', 'unknown_user')
  }

  let lang = safeLang(user.language)
  const today = todayKey()

  // 1) ¿Pide cambiar de idioma? ("habla en alemán")
  const pedido = parseLanguageCommand(text)
  if (pedido) {
    await saveLanguage(user.id, pedido, false)
    return t(pedido, 'lang_changed')
  }

  // 2) Autodetección, solo mientras nadie lo haya elegido a mano.
  if (user.language_auto !== false) {
    const detectado = detectLanguage(text)
    if (detectado && detectado !== lang) {
      await saveLanguage(user.id, detectado, true)
      lang = detectado
    }
  }

  const users = await listUsers()
  const aliases = await loadAliases()

  // 3) ¿Está enseñando vocabulario? ("jasmi es Jasmina")
  const ensenanza = parseTeach(text)
  if (ensenanza) {
    const r = resolverPersona(ensenanza.nombre, users, user, lang, aliases)
    if (r.user) {
      await learn({ kind: 'person', phrase: ensenanza.frase, userId: r.user.id, createdBy: user.id })
      return t(lang, 'teach_ok', { frase: normalizePhrase(ensenanza.frase), nombre: firstName(r.user) })
    }
    // Si la parte derecha no es una persona, NO era una enseñanza: seguimos
    // procesando la frase con normalidad (p. ej. "la caldera es urgente").
  }

  // 3.5) ¿Viene una foto? Se atiende aparte: una foto es una foto, no la
  // respuesta a una pregunta que estuviera pendiente.
  if (foto) {
    const aliasesFoto = await loadAliases()
    return manejarFoto(phone, user, lang, foto, text, aliasesFoto)
  }

  // 4) ¿Estábamos a mitad de una conversación?
  const pending = await getPending(phone)
  if (pending?.caducada) {
    // Se le avisa y se procesa el mensaje nuevo con normalidad.
    const aviso = t(lang, 'cancelled_timeout')
    const resto = await procesarNuevo(phone, user, lang, text, users, today, aliases)
    return `${aviso}\n\n${resto}`
  }
  if (pending) {
    const r = await continuarPendiente(phone, user, lang, pending, text, users, today, aliases)
    if (r !== null) return r
  }

  return procesarNuevo(phone, user, lang, text, users, today, aliases)
}

/**
 * Una foto que llega por WhatsApp. Si el pie de foto dice a qué tarea va, se
 * pega ahí; si no, se GUARDA IGUALMENTE y se pregunta. Nunca se descarta:
 * una foto de obra perdida no se recupera.
 */
async function manejarFoto(phone, user, lang, foto, texto, aliases = []) {
  // Una nota de voz viaja igual que una foto y se guarda igual; lo único que
  // cambia es cómo se llama en la respuesta.
  const esAudio = String(foto.mime ?? '').startsWith('audio/')
  const kAñadido = esAudio ? 'audio_added' : 'photo_added'
  const kPregunta = esAudio ? 'audio_which_task' : 'photo_which_task'
  // Un extracto bancario (camt.053/054 en XML) no es una foto ni un recibo:
  // se concilia y punto. Solo de los autorizados — es el banco de la empresa.
  if (esCamt(foto.buffer, foto.mime)) {
    if (!(await tienePermiso(user.id, 'dinero'))) return t(lang, 'camt_unauthorized')
    try {
      const { entradas } = parseCamt(foto.buffer.toString('utf8'))
      if (entradas.length === 0) return t(lang, 'camt_empty')
      const r = await conciliarPagos(entradas)
      const linea = (x, extra) => `• ${x.fecha ?? '—'} CHF ${x.importe} — ${extra}`
      const partes = []
      if (r.facturas.length) partes.push(t(lang, 'camt_invoices', {
        lista: r.facturas.map((x) => linea(x, `✅ factura de ${x.factura.debtor ?? '—'}`)).join('\n'),
      }))
      if (r.contratos.length) partes.push(t(lang, 'camt_contracts', {
        lista: r.contratos.map((x) => linea(x, `${x.contrato.objcode} (${x.contrato.m1vname ?? ''} ${x.contrato.m1name})`)).join('\n'),
      }))
      if (r.desconocidos.length) partes.push(t(lang, 'camt_unknown', {
        lista: r.desconocidos.slice(0, 8).map((x) => linea(x, x.quien ?? x.info ?? '¿?')).join('\n'),
      }))
      return t(lang, 'camt_summary', {
        creditos: r.creditos, total: r.totalChf.toFixed(2), repetidos: r.repetidos,
      }) + (partes.length ? '\n\n' + partes.join('\n\n') : '')
    } catch (err) {
      return t(lang, 'camt_error', { motivo: err.message.slice(0, 140) })
    }
  }

  const estado = storageStatus()
  if (!estado.ok) return t(lang, 'photo_no_storage', { motivo: estado.reason })

  const rechazo = motivoRechazo(foto)
  if (rechazo === 'tipo') return t(lang, 'photo_bad_type')
  if (rechazo === 'tamaño') return t(lang, 'photo_too_big')

  const pista = String(texto ?? '').trim()

  // Un recibo no es una foto de obra: va al Spesen, no a una tarea. Se
  // reconoce porque es un PDF (nadie manda planos por WhatsApp) o porque
  // quien lo manda lo dice.
  const esPdf = foto.mime === 'application/pdf'
  const loDice = /\b(gasto|spesen|spese|recibo|beleg|quittung|ticket|factura|rechnung|despesa)\b/i.test(pista)
  if (esPdf || loDice) {
    const idRecibo = guardarPendiente(foto.buffer, foto.mime)
    if (!idRecibo) return t(lang, 'photo_no_storage', { motivo: 'no hay dónde guardarlo' })
    await setPending(phone, user.id, { esperando: 'gasto_datos', foto_id: idRecibo, mime: foto.mime })
    // Si el mensaje ya traía los datos, se aprovechan y no se pregunta.
    const yaEstan = await intentarGasto(phone, user, lang, pista, today, { foto_id: idRecibo, mime: foto.mime }, true)
    if (yaEstan) return yaEstan

    // Leer el recibo solos: primero el extractor propio (PDFs electrónicos
    // de Coop/Migros...); si no hay texto —los recibos de la empresa suelen
    // ser escaneos— lo mira Gemini vision. Lo leído se guarda en el
    // pendiente: a la persona solo se le pregunta lo que falte (normalmente
    // la propiedad). Si no se lee nada fiable, se pregunta todo, como antes.
    let leido = null
    if (esPdf) {
      const textoPdf = textoDePdf(foto.buffer)
      if (textoPdf) {
        const r = leerRecibo(textoPdf)
        if (r?.importe) leido = r
      }
    }
    if (!leido) leido = await leerReciboConGemini(foto.buffer, foto.mime)
    if (leido?.importe) {
      // El importe y el comercio viajan como texto (intentarGasto ya sabe
      // leerlos); la FECHA va aparte: escrita en el texto, el parser de
      // plazos la echaría hacia el futuro, y un recibo siempre es pasado.
      const trozo = `${leido.importe.toFixed(2)} ${leido.comercio ?? ''}`.trim()
      await setPending(phone, user.id, {
        esperando: 'gasto_datos', foto_id: idRecibo, mime: foto.mime,
        leido: trozo, fecha_leida: leido.fecha ?? null,
      })
      return t(lang, 'exp_receipt_read', {
        comercio: leido.comercio ?? '—',
        importe: leido.importe.toFixed(2),
        fecha: leido.fecha ? leido.fecha.split('-').reverse().join('.') : '—',
        codigos: Object.keys(CODIGOS).slice(0, 5).join(', '),
      })
    }
    return t(lang, 'exp_receipt_saved', { codigos: Object.keys(CODIGOS).slice(0, 5).join(', ') })
  }

  const openTasks = await openTasksFor(user.id)
  let task = pickTaskByHint(pista, openTasks, aliases)
  if (!task) task = pickTaskByHint(pista, await openTasksAll(), aliases)

  const nombre = `whatsapp.${MIMES[foto.mime] ?? 'bin'}`

  if (task) {
    let commentId = null
    // El pie de foto, si lo hay, se queda como comentario junto a la imagen.
    if (pista) {
      const c = await createComment(task.id, { body: pista, userId: user.id, source: 'whatsapp' })
      commentId = c.id
    }
    await createAttachment(task.id, {
      buffer: foto.buffer, mime: foto.mime, filename: nombre, userId: user.id, commentId,
    })
    if (pista) void touch('task', pista)
    return t(lang, kAñadido, { titulo: task.title })
  }

  // No sabemos a qué tarea va: se guarda PRIMERO y se pregunta después.
  // El orden importa. Guardar antes de preguntar es lo que garantiza que la
  // foto sobreviva aunque nadie conteste, aunque no haya ninguna tarea, o
  // aunque el servidor se reinicie entre medias.
  const fotoId = guardarPendiente(foto.buffer, foto.mime)
  if (!fotoId) return t(lang, 'photo_no_storage', { motivo: 'no hay dónde guardarla' })

  const candidatas = (openTasks.length ? openTasks : await openTasksAll()).slice(0, 8)
  // Sin ninguna tarea abierta no hay lista que ofrecer, pero la foto YA está
  // guardada: se avisa de dónde queda en vez de descartarla en silencio.
  if (candidatas.length === 0) {
    console.warn(`[wa] foto guardada sin tarea a la que asociar: uploads/pendientes/${fotoId}`)
    return t(lang, 'photo_no_tasks')
  }

  await setPending(phone, user.id, {
    esperando: 'which_task',
    hint: pista,
    ids: candidatas.map((x) => x.id),
    foto_id: fotoId,
  })
  return t(lang, kPregunta, {
    lista: candidatas.map((x, i) => `${i + 1}. ${x.title}`).join('\n'),
  })
}

/**
 * Cambia el plazo de una tarea a partir de lo que se escribió ("el viernes",
 * "mañana", "15/10"). Si no se entiende la fecha, se dice — nunca se pone una
 * fecha inventada en un plazo de obra.
 */
async function cambiarPlazo(lang, task, cuando, today, pista) {
  const fecha = parseDateAnyLang(cuando, today, lang)
  if (!fecha) {
    // "sin fecha" / "quítale el plazo" es una petición válida, no un error.
    if (saysNoDate(cuando, lang)) {
      await setDue(task.id, null)
      void touch('task', pista)
      return t(lang, 'due_removed', { titulo: task.title })
    }
    return t(lang, 'due_not_understood', { fecha: cuando })
  }
  await setDue(task.id, fecha.key)
  void touch('task', pista)
  return t(lang, 'due_changed', {
    titulo: task.title,
    fecha: describeRange(null, fecha.key, today, lang, t),
  })
}

/** Ficha completa de una tarea: estado, responsable, plazo, pasos y comentarios. */
async function detalleTarea(lang, task, today) {
  const completa = (await getTask(task.id)) ?? task
  const pasos = await listSubtasks(task.id)
  const { comments } = await listComments(task.id)

  let out = `📌 ${completa.title}`
  if (completa.state_name) out += t(lang, 'detail_state', { estado: completa.state_name })
  if (completa.assignee_name) out += t(lang, 'detail_assignee', { nombre: completa.assignee_name })
  out += completa.due_date
    ? t(lang, 'detail_due', {
        fecha: describeRange(completa.start_date ?? null, completa.due_date, today, lang, t),
      })
    : t(lang, 'detail_no_due')
  if (completa.priority === 'high') out += t(lang, 'detail_priority')

  if (pasos.length) {
    const hechos = pasos.filter((x) => x.done).length
    out += t(lang, 'detail_steps', {
      hechos, total: pasos.length,
      lista: pasos.map((x) => `${x.done ? '✅' : '⬜'} ${x.title}`).join('\n'),
    })
  }
  // Solo los tres últimos: una ficha por WhatsApp que hay que desplazar deja
  // de ser un resumen.
  if (comments.length) {
    out += t(lang, 'detail_comments', {
      lista: comments.slice(-3).map((c) => `• ${c.body}`).join('\n'),
    })
  }
  return out
}

/** "hoy", "mañana" o la fecha larga de siempre. */
function cuandoBasura(fecha, today, lang) {
  if (fecha === today) return t(lang, 'waste_today')
  if (fecha === masDias(today, 1)) return t(lang, 'waste_tomorrow_word')
  return describeRange(null, fecha, today, lang, t)
}

/**
 * Lee "37.90 hoy A14 Landi Kabelbinder" y apunta el gasto, archivando el
 * recibo con el nombre de la casa. Devuelve null si falta algo — así el
 * mismo código sirve para aprovechar los datos que ya venían con el PDF y
 * para la respuesta posterior.
 */
async function intentarGasto(phone, user, lang, texto, today, pend, silencioso = false) {
  const t0 = String(texto ?? '').trim()
  const imp = t0.match(/(\d{1,5})[.,](\d{2})\b/)
  if (!imp) return silencioso ? null : t(lang, 'exp_receipt_need_more', { que: 'el importe' })

  const codigo = Object.keys(CODIGOS).find((c) => new RegExp(`\\b${c}\\b`, 'i').test(t0))
  if (!codigo) return silencioso ? null : t(lang, 'exp_receipt_need_more', { que: 'la propiedad' })

  const fecha = parseDateAnyLang(t0, today, lang)
  // La fecha leída del propio recibo (OCR) manda sobre "hoy", pero no sobre
  // lo que escriba la persona: si dice «ayer», ayer es.
  const dia = fecha?.key ?? pend.fecha_leida ?? today

  const concepto = t0
    .replace(/\d{1,5}[.,]\d{2}/, ' ')
    .replace(new RegExp(`\\b${codigo}\\b`, 'ig'), ' ')
    .replace(fecha?.match ?? '', ' ')
    .replace(/\bchf\b/ig, ' ')
    .replace(/\s{2,}/g, ' ').trim()
  if (!concepto) return silencioso ? null : t(lang, 'exp_receipt_need_more', { que: 'qué se compró' })

  const catKey = proponerCategoria(concepto, codigo) ?? categoriasDe(codigo)[0]?.key
  const cat = porKey(catKey)
  const ext = (MIMES[pend.mime] ?? 'pdf')
  const nombre = nombreDeArchivo({ codigo, fecha: dia, concepto, ext })
  const ruta = pend.foto_id ? archivarRecibo(pend.foto_id, nombre) : null

  const g = await addGasto({
    code: codigo, spentOn: dia, concept: concepto, amountCents: Math.round(Number(`${imp[1]}.${imp[2]}`) * 100),
    vat: cat?.iva?.length ? cat.iva[cat.iva.length - 1] : null,
    category: catKey, personId: user.id, receiptPath: ruta, receiptName: nombre,
  })
  await clearPending(phone)
  const mios = await gastosAbiertos(user.id)
  return t(lang, 'exp_receipt_done', {
    code: g.code, fecha: String(g.spent_on).slice(0, 10).split('-').reverse().join('/'),
    concepto: g.concept, importe: chf(g.amount_cents),
    columna: cat?.col ?? '—', cuenta: g.account ?? '—', archivo: nombre,
    saldo: chf(mios.reduce((n, x) => n + x.amount_cents, 0)),
  })
}

async function procesarNuevo(phone, user, lang, text, users, today, aliases = []) {
  const openTasks = await openTasksFor(user.id)
  const estados = await listStates()
  const todasAbiertas = await openTasksAll()
  const intent = await interpret(text, {
    sender: user, users, openTasks, lang, today, aliases, states: estados,
    // Para reconocer "pon la caldera en X" hace falta poder mirar las tareas
    // de todo el equipo, no solo las de quien escribe.
    allOpenTasks: todasAbiertas,
  })

  switch (intent.action) {
    case 'help':
      return t(lang, 'help', { nombre: firstName(user) })

    // La secretaria (Gemini) contestó una pregunta libre con lo que sabe de
    // la empresa. Se pasa tal cual, con un tope de tamaño por si acaso.
    case 'answer': {
      const texto = String(intent.text ?? '').trim()
      if (!texto) return t(lang, 'fallback')
      return texto.slice(0, 1500)
    }

    case 'list_tasks': {
      const who = (intent.who ?? '').toString().trim()
      if (/^(equipo|team|equipa|equipe|todos|todas|alle|all)$/i.test(who)) {
        return listText(lang, t(lang, 'title_team_tasks'), await openTasksAll(), today)
      }
      if (who && !/^(yo|mi|mias|ich|mir|meine|eu|mim|minhas)$/i.test(who)) {
        const m = matchUser(who, users, user, aliases)
        if (!m.user) return t(lang, 'person_not_found', { nombre: who, lista: nombres(users) })
        return listText(
          lang,
          t(lang, 'title_person_tasks', { nombre: firstName(m.user) }),
          await openTasksFor(m.user.id),
          today,
        )
      }
      return listText(lang, t(lang, 'title_my_tasks'), openTasks, today)
    }

    case 'create_task': {
      const draft = {
        title: String(intent.title ?? '').trim() || null,
        description: intent.description || null,
        due: intent.due ?? undefined, // undefined = no se dijo → se preguntará
        start: intent.start ?? null,
        work_days: intent.work_days ?? null,
        priority: intent.priority || 'medium',
        preguntado: false,
      }
      const nombre = (intent.assignee ?? '').toString().trim()
      if (nombre) {
        const r = resolverPersona(nombre, users, user, lang, aliases)
        if (r.error) return r.error
        if (r.noEncontrada) {
          // Antes se abandonaba la tarea aquí. Ahora se pregunta y la
          // respuesta se guarda en el vocabulario: así el asistente aprende
          // los apodos del equipo en lugar de tropezar siempre con ellos.
          draft.nombre_no_reconocido = nombre
        } else {
          draft.assignee_id = r.user.id
          if (r.user && normalizePhrase(nombre) !== normalizePhrase(firstName(r.user))) {
            void touch('person', nombre)
          }
        }
      }
      return avanzarBorrador(phone, user, lang, draft, users, today)
    }

    // ---- Retoques sobre una tarea existente ----------------------------

    case 'set_due': {
      const pista = String(intent.task_hint ?? '').trim()
      let task = pickTaskByHint(pista, openTasks, aliases)
      if (!task) task = pickTaskByHint(pista, todasAbiertas, aliases)
      if (!task) return t(lang, 'complete_not_found', { pista })
      return cambiarPlazo(lang, task, String(intent.due ?? '').trim(), today, pista)
    }

    case 'reassign': {
      const pista = String(intent.task_hint ?? '').trim()
      let task = pickTaskByHint(pista, openTasks, aliases)
      if (!task) task = pickTaskByHint(pista, todasAbiertas, aliases)
      if (!task) return t(lang, 'complete_not_found', { pista })
      const m = matchUser(String(intent.assignee ?? '').trim(), users, user, aliases)
      if (!m.user) {
        // Mismo criterio que al crear: si hay varios, se pregunta en vez de
        // elegir por nosotros.
        const lista = users.map((u) => u.full_name).join(', ')
        return m.candidates?.length
          ? t(lang, 'person_ambiguous', {
              nombre: intent.assignee,
              lista: m.candidates.map((c) => c.full_name).join(', '),
            })
          : t(lang, 'person_not_found', { nombre: intent.assignee, lista })
      }
      await reassignTask(task.id, m.user.id)
      void touch('task', pista)
      return t(lang, 'reassigned', { titulo: task.title, nombre: firstName(m.user) })
    }

    case 'task_detail': {
      const pista = String(intent.task_hint ?? '').trim()
      let task = pickTaskByHint(pista, openTasks, aliases)
      if (!task) task = pickTaskByHint(pista, todasAbiertas, aliases)
      if (!task) return t(lang, 'complete_not_found', { pista })
      void touch('task', pista)
      return detalleTarea(lang, task, today)
    }

    case 'list_by_state': {
      const pedido = String(intent.state ?? '').trim()
      const m = matchStateByName(estados, pedido)
      if (!m.state) {
        return t(lang, 'state_not_found', { estado: pedido, lista: estados.map((e) => e.name).join(', ') })
      }
      const lista = await openTasksByState(m.state.id)
      if (lista.length === 0) return t(lang, 'list_by_state_empty', { estado: m.state.name })
      return t(lang, 'list_by_state', {
        estado: m.state.name,
        total: lista.length,
        lista: lista.map((x) => `• ${x.title}${x.assignee_name ? ` — ${x.assignee_name}` : ''}`).join('\n'),
      })
    }

    case 'list_due': {
      const cuando = String(intent.due ?? '').trim()
      const fecha = parseDateAnyLang(cuando, today, lang)
      if (!fecha) return t(lang, 'due_not_understood', { fecha: cuando })
      const lista = await openTasksDueBy(fecha.key)
      const cuandoTexto = describeRange(null, fecha.key, today, lang, t)
      if (lista.length === 0) return t(lang, 'list_due_empty', { fecha: cuandoTexto })
      return t(lang, 'list_due', {
        total: lista.length,
        fecha: cuandoTexto,
        lista: lista.map((x) => `• ${x.title}${x.assignee_name ? ` — ${x.assignee_name}` : ''}`).join('\n'),
      })
    }

    case 'entsorgung': {
      const nombres = BASURA_NOMBRES[lang] ?? BASURA_NOMBRES.es
      const texto = String(intent.texto ?? '')
      // ¿Pregunta por un tipo concreto o por todo?
      const PALABRAS = {
        papier_muri: /papel|papier|cartao|carton|karton/,
        glas: /vidrio|glas|vidro/,
        metall: /metal/,
        kunststoff: /plastico|kunststoff|plastik/,
        deponie: /escombros|deponie|entulho/,
        gruengut: /verde|gruengut|grungut/,
      }
      const tipo = Object.keys(PALABRAS).find((k) => PALABRAS[k].test(texto))
      if (tipo) {
        const f = proximaDe(tipo, today)
        if (!f) return t(lang, 'waste_none', { tipo: nombres[tipo] })
        return t(lang, 'waste_one', { tipo: nombres[tipo], cuando: cuandoBasura(f, today, lang) })
      }
      const lista = proximas(today, 5)
      return t(lang, 'waste_next', {
        lista: lista.map((x) => `• ${nombres[x.tipo]} — ${cuandoBasura(x.fecha, today, lang)}`).join('\n'),
      })
    }

    case 'hotel': {
      if (!apaleoConfigurado()) return t(lang, 'hotel_off')
      const q = String(intent.texto ?? '')
      const soloSucias = /sucia|schmutzig|sujo|limpiar|reinig|limpar/.test(q)
      const soloLlegadas = /llegan|llegada|anreise|chegam|chegada|check/.test(q) && !soloSucias
      try {
        if (soloSucias) {
          const { unidades } = await habitaciones()
          const { sucias } = porEstadoDeLimpieza(unidades)
          if (sucias.length === 0) return t(lang, 'hotel_dirty_none')
          return t(lang, 'hotel_dirty', {
            total: sucias.length,
            lista: sucias.map((u) => u.name ?? u.id).join(', '),
          })
        }
        const { reservas } = await llegadas(today)
        const personas = contarPersonas(reservas)
        const detalle = reservas.length
          ? '\n' + reservas.slice(0, 8).map((r) => {
              const h = r.unit?.name ? ` — ${r.unit.name}` : ''
              const quien = r.primaryGuest?.lastName ?? r.booker?.lastName ?? ''
              return `• ${quien}${h}`
            }).join('\n')
          : ''
        if (soloLlegadas) {
          if (reservas.length === 0) return t(lang, 'hotel_arrivals_none')
          return t(lang, 'hotel_arrivals', { personas, reservas: reservas.length, detalle })
        }
        // Parte completo del día.
        const [{ reservas: salen }, { unidades }] = await Promise.all([salidas(today), habitaciones()])
        const { sucias, limpias } = porEstadoDeLimpieza(unidades)
        return t(lang, 'hotel_today', {
          personas, llegadas: reservas.length, detalle,
          salidas: salen.length,
          sucias: sucias.length,
          listaSucias: sucias.map((u) => u.name ?? u.id).join(', ') || '—',
          limpias: limpias.length,
        })
      } catch (err) {
        return t(lang, 'hotel_error', { motivo: err.message.slice(0, 140) })
      }
    }

    case 'gasto_add': {
      if (!intent.importe) return t(lang, 'exp_need_amount')
      const texto = String(intent.texto ?? '')
      // El código del edificio puede venir escrito ("gasto a14 45.20 Migros").
      const codigo = Object.keys(CODIGOS).find((c) => new RegExp(`\\b${c}\\b`, 'i').test(texto)) ?? 'HAAG'
      // El concepto es lo que queda al quitar importe y código.
      const concepto = texto
        .replace(/\d{1,5}[.,]\d{2}/, ' ')
        .replace(new RegExp(`\\b${codigo}\\b`, 'ig'), ' ')
        .replace(/\bchf\b/ig, ' ')
        .replace(/\s{2,}/g, ' ').trim()
      if (!concepto) return t(lang, 'exp_need_amount')

      const catKey = proponerCategoria(concepto, codigo) ?? categoriasDe(codigo)[0]?.key
      const cat = porKey(catKey)
      const cents = Math.round(intent.importe * 100)
      const g = await addGasto({
        code: codigo, spentOn: today, concept: concepto, amountCents: cents,
        vat: cat?.iva?.length ? cat.iva[cat.iva.length - 1] : null,
        category: catKey, personId: user.id,
        receiptName: nombreDeArchivo({ codigo, fecha: today, concepto }),
      })
      const mios = await gastosAbiertos(user.id)
      const total = mios.reduce((n, x) => n + x.amount_cents, 0)
      let out = t(lang, 'exp_added', {
        code: g.code,
        fecha: String(g.spent_on).slice(0, 10).split('-').reverse().join('/'),
        concepto: g.concept, importe: chf(g.amount_cents),
        columna: cat?.col ?? '—', cuenta: g.account ?? '—',
        iva: g.vat ? t(lang, 'exp_vat', { iva: g.vat }) : '',
        saldo: chf(total),
      })
      // La columna es lo que más se falla, así que se enseñan las demás.
      const otras = categoriasDe(codigo).filter((c) => c.key !== catKey).slice(0, 6)
      if (otras.length) out += t(lang, 'exp_guessed', { lista: otras.map((c) => `• ${c.col}`).join('\n') })
      return out
    }

    case 'km_add': {
      if (!intent.km || intent.km <= 0) return t(lang, 'exp_need_amount')
      const texto = String(intent.texto ?? '')
      const codigo = Object.keys(CODIGOS).find((c) => new RegExp(`\\b${c}\\b`, 'i').test(texto)) ?? 'HAAG'
      // El código del edificio, si venía escrito, no es parte del destino.
      const destino = intent.destino
        ? String(intent.destino).replace(new RegExp(`\\b${codigo}\\b`, 'ig'), ' ').replace(/\s{2,}/g, ' ').trim()
        : null
      const g = await addKilometraje({
        km: intent.km, destino: destino || null, code: codigo,
        spentOn: today, personId: user.id,
      })
      const mios = await gastosAbiertos(user.id)
      const total = mios.reduce((n, x) => n + x.amount_cents, 0)
      return t(lang, 'km_added', {
        km: g.km, destino: destino ? t(lang, 'km_dest', { destino }) : '',
        code: g.code, fecha: String(g.spent_on).slice(0, 10).split('-').reverse().join('/'),
        importe: chf(g.amount_cents), rappen: g.rappen, saldo: chf(total),
      })
    }

    case 'km_list': {
      const anno = intent.anno ?? Number(today.slice(0, 4))
      const r = await kmResumen({ desde: `${anno}-01-01`, hasta: `${anno}-12-31` })
      if (!r.viajes) return t(lang, 'km_vacio', { periodo: anno })
      return t(lang, 'km_resumen', {
        periodo: anno, km: r.km, viajes: r.viajes,
        importe: chf(r.total_cents), rappen: kmRappen(),
      })
    }

    case 'gasto_comercio': {
      const anno = Number(today.slice(0, 4))
      // "este mes" limita al mes en curso; por defecto se mira el año.
      const esMes = /mes|monat/i.test(String(intent.periodo ?? ''))
      const pasado = /pasado|letztes/i.test(String(intent.periodo ?? ''))
      const y = pasado ? anno - 1 : anno
      const desde = esMes ? `${today.slice(0, 7)}-01` : `${y}-01-01`
      const hasta = esMes ? today : `${y}-12-31`
      const periodo = esMes ? today.slice(0, 7) : String(y)
      const r = await gastoPorComercio(String(intent.comercio ?? '').trim(), { desde, hasta })
      if (!r.n) return t(lang, 'comercio_vacio', { comercio: intent.comercio, periodo })
      const lista = r.ultimos.map((g) => {
        const f = String(g.spent_on).slice(0, 10).split('-').reverse().slice(0, 2).join('/')
        return `\n• ${f} ${g.concept} — CHF ${chf(g.amount_cents)}`
      }).join('')
      return t(lang, 'comercio_resumen', {
        comercio: intent.comercio, periodo, importe: chf(r.total_cents), n: r.n, lista,
      })
    }

    case 'gasto_list': {
      const abiertos = await gastosAbiertos()
      if (abiertos.length === 0) return t(lang, 'exp_empty')
      const total = abiertos.reduce((n, x) => n + x.amount_cents, 0)
      let out = t(lang, 'exp_list', {
        total: chf(total),
        lista: abiertos.slice(0, 12).map((g) => {
          const f = String(g.spent_on).slice(0, 10).split('-').reverse().slice(0, 2).join('/')
          return `• ${f} ${g.code} ${g.concept} — CHF ${chf(g.amount_cents)}`
        }).join('\n'),
      })
      const porPersona = await saldos()
      if (porPersona.length > 1) {
        out += t(lang, 'exp_saldos', {
          lista: porPersona.map((p) => `• ${p.full_name}: CHF ${chf(Number(p.total_cents))}`).join('\n'),
        })
      }
      return out
    }

    case 'resumen_semanal':
      return componerResumenSemanal(lang)

    case 'ausencia_add': {
      const r = resolverPersona(String(intent.quien ?? ''), users, user, lang, aliases)
      if (r.error) return r.error
      if (r.noEncontrada || !r.user) return t(lang, 'abs_who', { nombre: intent.quien })
      const texto = String(intent.texto ?? '')
      // "del 10.10 al 15.10" · "del lunes al viernes" · un solo día · nada = hoy.
      const rango = parseRange(texto, today, lang)
      const dia = rango ? null : parseDateAnyLang(texto, today, lang)
      const start = rango?.start ?? dia?.key ?? today
      const end = rango?.end ?? dia?.key ?? today
      if (texto && !rango && !dia) return t(lang, 'abs_need_dates')
      await addAbsence({
        userId: r.user.id, startsOn: start, endsOn: end,
        reason: intent.motivo ?? null, createdBy: user.id,
      })
      const f = (k) => k.split('-').reverse().slice(0, 2).join('/')
      return t(lang, 'abs_added', {
        nombre: firstName(r.user), motivo: intent.motivo ?? '—',
        desde: f(start), hasta: f(end),
      })
    }

    case 'meteo': {
      try {
        const daily = await fetchMeteo(4)
        return formatearParte(daily, lang)
      } catch (err) {
        return t(lang, 'wx_error', { motivo: err.message.slice(0, 140) })
      }
    }

    case 'zins': {
      try {
        const guardado = await zinsGuardado()
        const valor = guardado?.valor ?? await fetchZins()
        if (valor === null || valor === undefined) return t(lang, 'zins_error')
        return t(lang, 'zins_info', {
          valor: String(valor).replace('.', ','),
          visto: guardado?.visto ?? today,
        })
      } catch (err) {
        return t(lang, 'zins_error')
      }
    }

    case 'huesped_list': {
      if (!huespedesConfigurado()) return t(lang, 'guest_not_configured')
      if (!(await tienePermiso(user.id, 'huespedes'))) return t(lang, 'guest_unauthorized')
      try {
        const mensajes = await listarMensajes()
        if (mensajes.length === 0) return t(lang, 'guest_none')
        const detalle = mensajes.slice(-6).map((m) =>
          `• [${m.bookingId ?? '¿?'} · ${m.source ?? m.channel ?? '¿?'}] ${String(m.message ?? '').slice(0, 200)}`,
        ).join('\n')
        return t(lang, 'guest_mirror', { total: mensajes.length, detalle })
      } catch (err) {
        return t(lang, 'guest_error', { motivo: err.message.slice(0, 140) })
      }
    }

    case 'huesped_reply': {
      // Puerta dura: SOLO los autorizados (Cris, Beatriz, Reto, Roberta)
      // pueden mandar algo a un huésped. El asistente jamás lo hace solo.
      if (!huespedesConfigurado()) return t(lang, 'guest_not_configured')
      if (!(await tienePermiso(user.id, 'huespedes'))) return t(lang, 'guest_unauthorized')
      try {
        await responderHuesped(intent.bookingId, intent.texto)
        return t(lang, 'guest_reply_sent', { reserva: intent.bookingId, texto: intent.texto })
      } catch (err) {
        return t(lang, 'guest_error', { motivo: err.message.slice(0, 140) })
      }
    }

    case 'precios': {
      // El hotel vive en Apaleo; hasta conectarlo, se dice y punto.
      if (intent.objetivo === 'hotel') return t(lang, 'price_hotel_pending')
      try {
        const datos = await fetchDashboard()
        const a = analizarPrecios(datos, today)
        const dia = (k) => String(k).slice(0, 10).split('-').reverse().slice(0, 2).join('/')
        let out = t(lang, 'price_head', {
          propiedad: a.propiedad,
          base: a.base ?? '—', min: a.min ?? '—', max: a.max ?? '—',
          media7: a.media7, media30: a.media30,
          eventos: a.eventosProx30,
          envio: a.ultimoEnvio ? `${a.ultimoEnvio}${a.aplicado ? ' ✓' : ' ✗'}` : '—',
        })
        out += t(lang, 'price_week', {
          lista: a.prox7.map((n) =>
            `• ${n.w ?? ''} ${dia(n.d)}: CHF ${n.p}${n.ev ? ` — ${n.ev}` : ''}`).join('\n'),
        })
        const lineas = a.consejos.map((c) => {
          if (c.tipo === 'stale') return t(lang, 'price_advice_stale', { dias: c.dias })
          if (c.tipo === 'bajar') return t(lang, 'price_advice_bajar', { noches: c.noches, min: c.hasta ?? '—' })
          if (c.tipo === 'subir') return t(lang, 'price_advice_subir', { noches: c.noches, fecha: dia(c.ejemplo.d), evento: c.ejemplo.ev, techo: c.techo ?? '—' })
          if (c.tipo === 'apply_failed') return t(lang, 'price_advice_apply')
          return null
        }).filter(Boolean)
        out += lineas.length
          ? t(lang, 'price_advices', { lista: lineas.map((x) => `• ${x}`).join('\n') })
          : t(lang, 'price_advice_none')
        return out
      } catch (err) {
        return t(lang, 'price_error', { motivo: err.message.slice(0, 140) })
      }
    }

    case 'vertrag_info': {
      const encontrados = await buscarVertraege(intent.que)
      if (encontrados.length === 0) return t(lang, 'vertrag_none', { que: intent.que })
      const foto = encontrados[0].foto
        ? new Date(encontrados[0].foto).toISOString().slice(0, 10).split('-').reverse().join('.')
        : '—'
      return t(lang, 'vertrag_found', {
        lista: encontrados.map(formatVertrag).join('\n\n'),
        foto,
      })
    }

    case 'mieten_sum': {
      const s = await sumaAlquileres(intent.grupo)
      if (!s || Number(s.contratos) === 0) return t(lang, 'vertrag_none', { que: intent.grupo ?? 'TOTAL' })
      const foto = s.foto ? new Date(s.foto).toISOString().slice(0, 10).split('-').reverse().join('.') : '—'
      return t(lang, 'mieten_sum', {
        grupo: s.grupo, contratos: s.contratos,
        suma: Number(s.suma ?? 0).toLocaleString('de-CH'),
        foto,
      })
    }

    case 'permiso_dar':
    case 'permiso_quitar': {
      // Solo el admin (Cris) reparte accesos. Nadie se los da a sí mismo.
      if (!(await tienePermiso(user.id, 'admin'))) return t(lang, 'perm_only_admin')
      if (!intent.perm || !PERMISOS.includes(intent.perm)) {
        return t(lang, 'perm_unknown', { lista: PERMISOS.join(', ') })
      }
      const r = resolverPersona(String(intent.quien ?? ''), users, user, lang, aliases)
      if (r.error) return r.error
      if (r.noEncontrada || !r.user) return t(lang, 'abs_who', { nombre: intent.quien })
      if (intent.action === 'permiso_dar') {
        await darPermiso(r.user.id, intent.perm, user.id)
        return t(lang, 'perm_granted', { nombre: firstName(r.user), perm: intent.perm })
      }
      const quitado = await quitarPermiso(r.user.id, intent.perm)
      return t(lang, quitado ? 'perm_revoked' : 'perm_not_had', { nombre: firstName(r.user), perm: intent.perm })
    }

    case 'permiso_list': {
      if (!(await tienePermiso(user.id, 'admin'))) return t(lang, 'perm_only_admin')
      const filas = await listarPermisos()
      if (filas.length === 0) return t(lang, 'perm_none')
      return t(lang, 'perm_list', {
        lista: filas.map((p) => `• ${p.full_name}: ${p.perms.join(', ')}`).join('\n'),
      })
    }

    case 'mahnung': {
      if (!cobrosConfigurados()) return t(lang, 'invoice_not_configured')
      if (!(await tienePermiso(user.id, 'dinero'))) return t(lang, 'invoice_unauthorized')
      const { nivel, que } = parseMahnung(intent.texto)
      if (!que) return t(lang, 'mahnung_need')
      const mesActual = new Intl.DateTimeFormat('de-CH', {
        timeZone: config.timezone, month: 'long', year: 'numeric',
      }).format(new Date())
      const r = await crearMahnung({ que, nivel, mes: mesActual })
      if (r.error === 'no_encontrado') return t(lang, 'vertrag_none', { que })
      if (r.error === 'ambiguo') {
        return t(lang, 'mahnung_ambiguous', {
          lista: r.candidatos.map((v) => `• ${v.objcode} ${v.m1name ?? ''}`).join('\n'),
        })
      }
      if (r.error) return t(lang, 'invoice_error', { motivo: r.error })
      let out = t(lang, 'mahnung_done', {
        nivel: r.nivel, objcode: r.contrato.objcode,
        nombre: [r.contrato.m1vname, r.contrato.m1name].filter(Boolean).join(' '),
        importe: r.importe,
      })
      if (config.appUrl) out += t(lang, 'invoice_link', { url: `${config.appUrl}/factura/${r.token}.pdf` })
      return out
    }

    case 'mietertrag': {
      if (!(await tienePermiso(user.id, 'dinero'))) return t(lang, 'camt_unauthorized')
      const mes = intent.mes ?? today.slice(0, 7)
      const r = await mietertragCsv(mes)
      if (!r) return t(lang, 'vertrag_none', { que: 'Liste' })
      let out = t(lang, 'mietertrag_done', {
        mes, contratos: r.contratos, suma: r.suma.toLocaleString('de-CH'),
      })
      if (config.appUrl) out += t(lang, 'exp_close_link', { url: `${config.appUrl}/spesen/${r.token}.csv` })
      return out
    }

    case 'mwst': {
      if (!(await tienePermiso(user.id, 'dinero'))) return t(lang, 'camt_unauthorized')
      const anno = intent.anno ?? Number(today.slice(0, 4))
      const q = intent.q ?? Math.ceil(Number(today.slice(5, 7)) / 3)
      const filas = await vorsteuerTrimestre(anno, q)
      if (filas.length === 0) return t(lang, 'mwst_empty', { anno, q })
      const totalVs = filas.reduce((n, f) => n + f.vorsteuerCents, 0)
      return t(lang, 'mwst_summary', {
        anno, q,
        lista: filas.map((f) =>
          `• ${f.vat === 'ohne' ? t(lang, 'mwst_none_rate') : f.vat + ' %'}: ${f.gastos} · ${t(lang, 'mwst_gross')} CHF ${chf(f.brutoCents)} · Vorsteuer CHF ${chf(f.vorsteuerCents)}`,
        ).join('\n'),
        total: chf(totalVs),
      })
    }

    case 'impagos': {
      // Datos de cobros = datos del banco: solo autorizados.
      if (!(await tienePermiso(user.id, 'dinero'))) return t(lang, 'camt_unauthorized')
      const e = await estadoDeCobros(today)
      return formatImpagos(e, lang)
    }

    case 'factura_add': {
      // Facturar es dinero oficial: misma puerta que responder a huéspedes.
      if (!cobrosConfigurados()) return t(lang, 'invoice_not_configured')
      if (!(await tienePermiso(user.id, 'dinero'))) return t(lang, 'invoice_unauthorized')
      const datos = parseFactura(intent.texto)
      if (datos.faltan.length) return t(lang, 'invoice_need', { faltan: datos.faltan.join(', ') })
      try {
        const f = await crearFactura({
          importe: datos.importe, deudor: datos.deudor, mensaje: intent.texto,
        })
        let out = t(lang, 'invoice_done', {
          importe: datos.importe.toFixed(2), deudor: datos.deudor,
          referencia: f.referencia ?? '—',
        })
        if (config.appUrl) out += t(lang, 'invoice_link', { url: `${config.appUrl}/factura/${f.token}.pdf` })
        return out
      } catch (err) {
        return t(lang, 'invoice_error', { motivo: err.message.slice(0, 140) })
      }
    }

    case 'contrato_add': {
      if (!contratosConfigurados()) return t(lang, 'contract_not_configured')
      const datos = parseContrato(intent.texto, today, lang)
      if (datos.faltan.length) return t(lang, 'contract_need', { faltan: datos.faltan.join(', ') })
      try {
        const c = await generarContrato(datos, today)
        return t(lang, 'contract_done', {
          nombre: datos.nombre, habitacion: datos.habitacion,
          alquiler: datos.alquiler,
          desde: String(datos.desde).split('-').reverse().join('.'),
          doc: c.docUrl, pdf: c.pdfUrl,
        })
      } catch (err) {
        return t(lang, 'contract_error', { motivo: err.message.slice(0, 160) })
      }
    }

    case 'contador_add': {
      const kind = TIPOS[intent.tipo] ?? 'zahler'
      const { lectura, anterior } = await addReading({
        kind, unit: intent.unidad, value: intent.valor, createdBy: user.id,
      })
      const nombre = (NOMBRES_CONTADOR[lang] ?? NOMBRES_CONTADOR.de)[kind]
      let diff = ''
      if (anterior) {
        const delta = Number(lectura.value) - Number(anterior.value)
        diff = t(lang, 'meter_diff', {
          delta: (delta >= 0 ? '+' : '') + String(Math.round(delta * 100) / 100),
          fecha: String(anterior.created_at).length > 9
            ? new Date(anterior.created_at).toISOString().slice(0, 10).split('-').reverse().slice(0, 2).join('/')
            : '—',
        })
      }
      let out = t(lang, 'meter_added', { tipo: nombre, unidad: intent.unidad, valor: intent.valor, diff })
      // ¿Fuga? Se mira el ritmo contra la historia de ESTE contador.
      const anomalia = detectarAnomalia(await serieDe(kind, intent.unidad))
      if (anomalia) {
        out += t(lang, 'meter_anomaly', {
          tasa: anomalia.tasa, media: anomalia.media, tipo: nombre, unidad: intent.unidad,
        })
      }
      return out
    }

    case 'contador_list': {
      const filas = await listReadings(intent.unidad)
      if (filas.length === 0) return t(lang, 'meter_none')
      const nombres = NOMBRES_CONTADOR[lang] ?? NOMBRES_CONTADOR.de
      return t(lang, 'meter_list', {
        lista: filas.map((r) => {
          const f = new Date(r.created_at).toISOString().slice(0, 10).split('-').reverse().slice(0, 2).join('/')
          return `• ${nombres[r.kind] ?? r.kind} ${r.unit}: ${r.value} (${f})`
        }).join('\n'),
      })
    }

    case 'ausencia_list': {
      const proximas = await listAbsences(today)
      if (proximas.length === 0) return t(lang, 'abs_none')
      const f = (k) => String(k).slice(0, 10).split('-').reverse().slice(0, 2).join('/')
      return t(lang, 'abs_list', {
        lista: proximas.map((a) =>
          `• ${a.full_name}: ${f(a.starts_on)} → ${f(a.ends_on)}${a.reason ? ` (${a.reason})` : ''}`,
        ).join('\n'),
      })
    }

    case 'gasto_cierre': {
      // "cierra los gastos de agosto" → CSV para pegar en el Excel y los
      // gastos quedan marcados como exportados (dejan de contar como deuda).
      const mes = monthKeyFromText(intent.texto ?? '', today)
      const cierre = await cerrarMes(mes)
      const mesBonito = mes.split('-').reverse().join('/')
      if (!cierre) return t(lang, 'exp_close_empty', { mes: mesBonito })
      const porPersona = new Map()
      for (const g of cierre.lineas) {
        const quien = g.person_name ?? '—'
        porPersona.set(quien, (porPersona.get(quien) ?? 0) + g.amount_cents)
      }
      let out = t(lang, 'exp_close_done', {
        mes: mesBonito,
        gastos: cierre.gastos,
        total: chf(cierre.total_cents),
        lista: [...porPersona].map(([quien, cents]) => `• ${quien}: CHF ${chf(cents)}`).join('\n'),
      })
      if (config.appUrl) out += t(lang, 'exp_close_link', { url: `${config.appUrl}/spesen/${cierre.token}.csv` })
      return out
    }

    case 'contacto_buscar': {
      const encontrados = await buscarContactos(intent.que, 5)
      if (encontrados.length === 0) return t(lang, 'contact_none', { que: intent.que })
      if (encontrados.length === 1) return t(lang, 'contact_found', { ficha: formatContacto(encontrados[0]) })
      return t(lang, 'contact_many', {
        total: encontrados.length,
        lista: encontrados.map(formatContacto).join('\n\n'),
      })
    }

    case 'contacto_add': {
      // Formato libre separado por comas: nombre, empresa, teléfono, correo.
      // Se reconoce cada trozo por su forma, no por su posición: así da igual
      // el orden en que se escriban.
      const trozos = String(intent.texto ?? '').split(',').map((x) => x.trim()).filter(Boolean)
      if (trozos.length === 0) return t(lang, 'contact_need_name')
      const datos = { name: null, company: null, phone: null, email: null }
      for (const tr of trozos) {
        if (/@/.test(tr) && !datos.email) { datos.email = tr; continue }
        if (/^\+?[\d\s().-]{7,}$/.test(tr) && !datos.phone) { datos.phone = tr.replace(/\s+/g, ' '); continue }
        if (!datos.name) { datos.name = tr; continue }
        if (!datos.company) { datos.company = tr; continue }
      }
      if (!datos.name) return t(lang, 'contact_need_name')
      const c = await addContact({ ...datos, mobile: datos.phone })
      return t(lang, 'contact_added', { ficha: formatContacto(c) })
    }

    case 'cita_add': {
      const texto = String(intent.texto ?? '')
      if (!intent.hora) return t(lang, 'appt_no_time')
      const fecha = parseDateAnyLang(texto, today, lang)
      if (!fecha) return t(lang, 'appt_no_date')
      // El título es lo que queda al quitar la fecha y la hora.
      let titulo = texto
        .replace(/\b(?:a las|um|as|@)?\s*\d{1,2}[:.h]\d{0,2}\b/, ' ')
        .replace(fecha.match ?? '', ' ')
        .replace(/\s{2,}/g, ' ')
        .trim()
      // "en la obra G60" / "en Kerzers" es el sitio.
      let donde = null
      const m = titulo.match(/\b(?:en|in|em)\s+(?:la\s+|el\s+|die\s+|der\s+)?(.+)$/i)
      if (m) {
        donde = m[1].trim()
        titulo = titulo.slice(0, m.index).trim()
      }
      titulo = titulo.replace(/^(?:con|mit|com)\s+/i, '').replace(/[,;-]+$/, '').trim()
      if (!titulo) titulo = t(lang, 'appt_list').split(':')[0]

      const startsAt = new Date(`${fecha.key}T${intent.hora}:00`)
      const cita = await createAppointment({
        title: titulo, withWhom: titulo, place: donde,
        startsAt: startsAt.toISOString(), createdBy: user.id, attendeeId: user.id,
        source: 'whatsapp',
      })
      return t(lang, 'appt_added', {
        titulo: cita.title,
        cuando: `${describeRange(null, fecha.key, today, lang, t)} · ${intent.hora}`,
        donde: donde ? t(lang, 'appt_where', { donde }) : '',
      })
    }

    case 'cita_list': {
      const lista = await listAppointments(new Date().toISOString(), 8)
      if (lista.length === 0) return t(lang, 'appt_none')
      return t(lang, 'appt_list', {
        lista: lista.map((c) => {
          const d = new Date(c.starts_at)
          const dia = describeRange(null, d.toISOString().slice(0, 10), today, lang, t)
          const hora = d.toISOString().slice(11, 16)
          return `• ${dia} ${hora} — ${c.title}${c.place ? ` (${c.place})` : ''}`
        }).join('\n'),
      })
    }

    case 'compra_add': {
      const { item, repetido } = await addCompra(intent.que, user.id)
      if (repetido) {
        const quien = item.requested_by === user.id ? firstName(user) : (users.find((u) => u.id === item.requested_by)?.full_name ?? '—')
        return t(lang, 'shop_repeated', { que: item.title, quien })
      }
      const total = (await listCompras()).length
      return t(lang, 'shop_added', { que: item.title, total })
    }

    case 'compra_list': {
      const lista = await listCompras()
      if (lista.length === 0) return t(lang, 'shop_empty')
      return t(lang, 'shop_list', {
        lista: lista.map((x) => `• ${x.title}${x.requested_by_name ? ` (${x.requested_by_name.split(' ')[0]})` : ''}`).join('\n'),
      })
    }

    case 'compra_done': {
      const hechas = await markComprado(intent.que, user.id)
      if (hechas.length === 0) {
        return intent.que ? t(lang, 'shop_not_found', { que: intent.que }) : t(lang, 'shop_empty')
      }
      return intent.que
        ? t(lang, 'shop_bought_some', { lista: hechas.map((x) => x.title).join(', ') })
        : t(lang, 'shop_bought_all', { total: hechas.length })
    }

    case 'add_comment': {
      const pista = String(intent.task_hint ?? '').trim()
      const texto = String(intent.comment ?? '').trim()
      let task = pickTaskByHint(pista, openTasks, aliases)
      if (!task) task = pickTaskByHint(pista, todasAbiertas, aliases)
      if (!task) return t(lang, 'complete_not_found', { pista })
      await createComment(task.id, { body: texto, userId: user.id, source: 'whatsapp' })
      void touch('task', pista)
      return t(lang, 'comment_added', { titulo: task.title, texto })
    }

    case 'add_step': {
      const pista = String(intent.task_hint ?? '').trim()
      const texto = String(intent.step ?? '').trim()
      let task = pickTaskByHint(pista, openTasks, aliases)
      if (!task) task = pickTaskByHint(pista, todasAbiertas, aliases)
      if (!task) {
        return t(lang, 'complete_not_found', { pista })
      }
      await createSubtask(task.id, { title: texto, createdBy: user.id })
      const pasos = await listSubtasks(task.id)
      void touch('task', pista)
      return t(lang, 'step_added', {
        titulo: task.title,
        paso: texto,
        hechos: pasos.filter((p) => p.done).length,
        total: pasos.length,
      })
    }

    case 'set_state': {
      const pista = String(intent.task_hint ?? '').trim()
      const pedido = String(intent.state ?? '').trim()
      const m = matchStateByName(estados, pedido)
      if (m.candidates.length > 1) {
        return t(lang, 'state_ambiguous', { estado: pedido, lista: m.candidates.map((e) => e.name).join(', ') })
      }
      if (!m.state) {
        // "mueve la caldera al viernes" se dice igual que un cambio de estado.
        // Si lo pedido no es un estado pero sí una fecha, era un plazo.
        const comoFecha = parseDateAnyLang(pedido, today, lang)
        if (comoFecha) {
          let tarea = pickTaskByHint(pista, openTasks, aliases)
          if (!tarea) tarea = pickTaskByHint(pista, await openTasksAll(), aliases)
          if (tarea) return cambiarPlazo(lang, tarea, pedido, today, pista)
        }
        return t(lang, 'state_not_found', { estado: pedido, lista: estados.map((e) => e.name).join(', ') })
      }
      let task = pickTaskByHint(pista, openTasks, aliases)
      if (!task) task = pickTaskByHint(pista, await openTasksAll(), aliases)
      if (!task) {
        const candidatas = (openTasks.length ? openTasks : await openTasksAll()).slice(0, 8)
        if (candidatas.length === 0) return t(lang, 'no_open_tasks', { nombre: firstName(user) })
        await setPending(phone, user.id, {
          esperando: 'which_task',
          hint: pista,
          ids: candidatas.map((x) => x.id),
          estado_id: m.state.id,
        })
        return t(lang, 'ask_which_task', { pista, lista: candidatas.map((x, i) => `${i + 1}. ${x.title}`).join('\n') })
      }
      await setTaskState(task.id, m.state)
      void touch('task', pista)
      return t(lang, 'state_changed', { titulo: task.title, estado: m.state.name })
    }

    case 'complete_task': {
      const hint = String(intent.task_hint ?? '').trim()
      let task = pickTaskByHint(hint, openTasks, aliases)
      if (!task) task = pickTaskByHint(hint, await openTasksAll(), aliases)
      if (task) {
        await completeTask(task.id)
        void touch('task', hint)
        return t(lang, 'completed', { titulo: task.title })
      }
      // No sabemos cuál es. Antes se volcaba la lista entera y ahí acababa
      // todo; ahora se pregunta con números y la respuesta se aprende, así
      // que "la caldera" funcionará la próxima vez.
      const candidatas = (openTasks.length ? openTasks : await openTasksAll()).slice(0, 8)
      if (candidatas.length === 0) return t(lang, 'no_open_tasks', { nombre: firstName(user) })
      await setPending(phone, user.id, {
        esperando: 'which_task',
        hint,
        ids: candidatas.map((x) => x.id),
      })
      const lista = candidatas.map((x, i) => `${i + 1}. ${x.title}`).join('\n')
      return t(lang, 'ask_which_task', { pista: hint, lista })
    }

    case 'reply_done':
    case 'reply_not_done': {
      const { rows } = await query(
        `select * from tasks
          where assignee_id = $1 and status in ('open','in_progress')
          order by last_reminder_at desc nulls last, due_date asc nulls last
          limit 1`,
        [user.id],
      )
      const task = rows[0]
      if (!task) return t(lang, 'no_open_tasks', { nombre: firstName(user) })
      if (intent.action === 'reply_done') {
        await completeTask(task.id)
        return t(lang, 'reply_done', { titulo: task.title })
      }
      return t(lang, 'reply_not_done', { titulo: task.title })
    }

    default:
      return t(lang, 'fallback')
  }
}
