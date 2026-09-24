// ============================================================
// Las fichas de los SISTEMAS que usa la empresa.
//
// Para qué: que cualquiera —y en particular el jefe— pueda preguntarle al
// asistente «¿qué es Apaleo?», «¿para qué sirve LIKE MAGIC?», «¿qué sistemas
// usamos?» y reciba una respuesta corta, cierta y en su idioma, sin tener que
// preguntarle a nadie ni abrir un manual.
//
// ⚠️ REGLA DE HONESTIDAD DE ESTE FICHERO: aquí se dice también lo que NO
// funciona. Un jefe que pregunta «¿puedo ver las habitaciones sucias?» merece
// un «hoy no, y por qué» antes que un silencio o un «sí» a medias. Cada ficha
// lleva `estado` (lo que hay de verdad hoy) y `ojo` (la trampa conocida).
//
// Estas fichas NO son la base de conocimiento viva (conocimiento.js), que el
// equipo edita por WhatsApp. Estas son fijas y viajan con el código, porque
// describen la ARQUITECTURA: cambian cuando cambia el software, no cuando
// alguien aprende un dato nuevo.
//
// Idiomas: español y alemán, los dos que se hablan de verdad en la empresa. El
// portugués cae a español a propósito (mejor una respuesta cierta en otro
// idioma que ninguna); si algún día hace falta, se añade `pt` y ya está.
// ============================================================

/** Quita acentos y baja a minúsculas, para poder comparar como habla la gente. */
const plano = (s) => String(s ?? '').toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '').trim()

export const SISTEMAS = {
  apaleo: {
    nombre: 'Apaleo',
    alias: ['apaleo', 'pms del hotel', 'pms'],
    es: {
      queEs: 'El PMS del hotel: el programa donde viven las reservas, las habitaciones y la facturación del N\'s Hotel (A14, Kerzers).',
      usamos: 'Es la fuente de verdad de quién llega, quién se va y quién está alojado. El informe del Cockpit sale de ahí.',
      estado: 'CONTRATADO y pagado por la empresa. El asistente YA está conectado y responde con datos reales.',
      puedesPreguntar: ['¿cuántos llegan hoy?', '¿quién se va hoy?', '¿quién está en el hotel?'],
      ojo: 'El asistente NO puede ver el estado de limpieza de las habitaciones: a nuestra aplicación de Apaleo le falta el permiso "units.read". Se activa en app.apaleo.com → Apps → Connected apps → editar la app que ya existe (no crear otra). Tampoco puede cambiar precios todavía: eso pide otros tres permisos.',
    },
    de: {
      queEs: 'Das PMS des Hotels: dort liegen Reservationen, Zimmer und Fakturierung des N\'s Hotel (A14, Kerzers).',
      usamos: 'Die Quelle der Wahrheit für Anreisen, Abreisen und wer im Haus ist. Der Cockpit-Report kommt von dort.',
      estado: 'BEZAHLT und in Betrieb. Der Assistent ist bereits angebunden und antwortet mit echten Daten.',
      puedesPreguntar: ['wie viele reisen heute an?', 'wer reist heute ab?', 'wer ist im Haus?'],
      ojo: 'Den Reinigungsstatus der Zimmer sieht der Assistent NICHT: unserer Apaleo-App fehlt die Berechtigung "units.read" (app.apaleo.com → Apps → Connected apps → die bestehende App bearbeiten, keine neue anlegen). Preise ändern geht ebenfalls noch nicht.',
    },
  },

  likemagic: {
    nombre: 'LIKE MAGIC',
    alias: ['like magic', 'likemagic', 'like-magic'],
    es: {
      queEs: 'La aplicación web del huésped del hotel: con ella reserva, escribe mensajes y abre su habitación desde el móvil.',
      usamos: 'Es la cara del hotel hacia el huésped. Apaleo lleva los datos por dentro; LIKE MAGIC es lo que el huésped toca.',
      estado: 'CONTRATADO y pagado, pero TODAVÍA NO conectado al asistente.',
      puedesPreguntar: [],
      ojo: 'Falta pedir a LIKE MAGIC las credenciales OAuth de su Open API (mencionar la "Integration API" para chatbots y los webhooks de Unified Messaging). Con eso el asistente VERÍA los mensajes de los huéspedes. Responder seguiría exigiendo la orden de una persona autorizada: el asistente no contestará solo a un huésped.',
    },
    de: {
      queEs: 'Die Gäste-Web-App des Hotels: Buchung, Nachrichten und Zimmertür per Handy.',
      usamos: 'Das Gesicht des Hotels gegenüber dem Gast. Apaleo führt die Daten, LIKE MAGIC ist das, was der Gast bedient.',
      estado: 'BEZAHLT, aber noch NICHT mit dem Assistenten verbunden.',
      puedesPreguntar: [],
      ojo: 'Es fehlen die OAuth-Zugangsdaten der Open API von LIKE MAGIC (Stichworte: "Integration API" für Chatbots, Webhooks für Unified Messaging). Damit könnte der Assistent Gästenachrichten SEHEN. Antworten bliebe an eine berechtigte Person gebunden.',
    },
  },

  salto: {
    nombre: 'SALTO KS',
    alias: ['salto', 'salto ks', 'cerraduras', 'llave digital', 'schliessanlage', 'digital key'],
    es: {
      queEs: 'Un sistema de cerraduras profesionales con llave digital: se abren puertas desde el móvil, sin llave física, y queda registrado quién abrió qué.',
      usamos: 'En el hotel, el acceso del huésped a su habitación va por LIKE MAGIC. SALTO KS es el sistema de cerraduras que suele haber debajo.',
      estado: 'SIN CONFIRMAR en Hans Amonn AG. Se está evaluando para otro proyecto (la lavandería de N), y está por comprobar si el hotel usa SALTO o algo distinto.',
      puedesPreguntar: [],
      ojo: 'No se ha integrado nada y NO conviene darlo por hecho. Lo primero es averiguar qué cerraduras hay de verdad en el hotel. Si son SALTO, se pediría el Client ID y el Secret de la Business Unit. Si no lo son, para una o dos puertas sale mucho más barato otra solución.',
    },
    de: {
      queEs: 'Ein professionelles Schliesssystem mit digitalem Schlüssel: Türen per Handy öffnen, ohne Schlüssel, mit Protokoll darüber, wer wann geöffnet hat.',
      usamos: 'Im Hotel läuft der Zimmerzugang über LIKE MAGIC. SALTO KS ist die Art von Schliesssystem, die typischerweise darunterliegt.',
      estado: 'Bei Hans Amonn AG NICHT BESTÄTIGT. Wird für ein anderes Projekt geprüft; ob das Hotel SALTO einsetzt, ist offen.',
      puedesPreguntar: [],
      ojo: 'Nichts ist angebunden, und man sollte es nicht voraussetzen. Zuerst klären, welche Schliessanlage im Hotel tatsächlich verbaut ist.',
    },
  },

  beds24: {
    nombre: 'Beds24',
    alias: ['beds24', 'beds 24', 'channel manager'],
    es: {
      queEs: 'El "channel manager" de Casa Reto: el programa que reparte precios y disponibilidad a los portales (Booking, Airbnb…).',
      usamos: 'Recibe los precios que calcula PreisPilot para la casa de Gordola (Tessin).',
      estado: 'A MEDIO CONFIGURAR. Es lo único de esta lista que sería un gasto NUEVO al rematarlo.',
      puedesPreguntar: [],
      ojo: 'Dos cosas que hay que saber: los canales (Booking/Airbnb) NO están conectados, y la casa figura SIN disponibilidad. Mientras siga así, por bien calculados que estén los precios, no entrará ni una reserva.',
    },
    de: {
      queEs: 'Der Channel Manager von Casa Reto: verteilt Preise und Verfügbarkeit an die Portale (Booking, Airbnb…).',
      usamos: 'Empfängt die Preise, die PreisPilot für das Haus in Gordola (Tessin) rechnet.',
      estado: 'HALB EINGERICHTET. Als Einziges hier wäre die Fertigstellung eine NEUE Ausgabe.',
      puedesPreguntar: [],
      ojo: 'Die Kanäle sind NICHT verbunden und das Haus steht ohne Verfügbarkeit. Solange das so bleibt, kommt keine Buchung — egal wie gut die Preise sind.',
    },
  },

  preispilot: {
    nombre: 'PreisPilot',
    alias: ['preispilot', 'preis pilot', 'precios de casa reto', 'hoja de precios'],
    es: {
      queEs: 'Nuestro propio motor de precios para Casa Reto: calcula, noche a noche, a cuánto conviene alquilar.',
      usamos: 'Propone el precio de cada noche; un administrador lo aprueba y entonces se manda a Beds24.',
      estado: 'FUNCIONANDO. Desde el 09.09.2026 ya NO aplica precios solo: hace falta que un admin pulse "Aprobar y enviar".',
      puedesPreguntar: ['¿a cuánto pongo Casa Reto en octubre?', 'precios de Casa Reto'],
      ojo: 'Dos avisos honestos. Uno: como ya no se aplica solo, si nadie aprueba, Beds24 se queda con los últimos precios enviados. Dos: el consejo NO mira a la competencia de verdad (no hay una fuente de datos de mercado, solo seis fechas apuntadas a mano) ni ve la ocupación real. Por eso cada semana lleva un nivel de fiabilidad en vez de un número seco.',
    },
    de: {
      queEs: 'Unsere eigene Preis-Engine für Casa Reto: rechnet Nacht für Nacht den sinnvollen Mietpreis.',
      usamos: 'Schlägt Preise vor; ein Administrator genehmigt sie, erst dann gehen sie an Beds24.',
      estado: 'IN BETRIEB. Seit 09.09.2026 werden Preise NICHT mehr automatisch gesetzt — ein Admin muss bestätigen.',
      puedesPreguntar: ['Preise Casa Reto'],
      ojo: 'Ohne Bestätigung bleibt Beds24 auf den zuletzt gesendeten Preisen. Und: echte Wettbewerbsdaten fehlen, die Auslastung ist nicht angebunden — daher pro Woche eine Verlässlichkeitsangabe statt einer nackten Zahl.',
    },
  },

  workpulse: {
    nombre: 'WorkPulse',
    alias: ['workpulse', 'work pulse', 'workpulse.ch'],
    es: {
      queEs: 'El sistema de gestión de la empresa (workpulse.ch): tareas, horas, gastos, contratos de alquiler, facturas, inmuebles y hotel.',
      usamos: 'Es donde deben vivir los datos de negocio. El asistente de WhatsApp es el canal; WorkPulse es el sistema.',
      estado: 'EN PRODUCCIÓN, en un servidor propio. El asistente ya sabe entrar con un usuario de servicio.',
      puedesPreguntar: [],
      ojo: 'WorkPulse duplica casi todo lo que el asistente guarda por su cuenta, y más completo. Por eso la regla acordada es: antes de construir algo nuevo en el asistente, mirar si WorkPulse ya lo tiene. El traslado va por fases —gastos primero— y no se mueve un dato hasta que exista su sitio al otro lado.',
    },
    de: {
      queEs: 'Das Betriebssystem der Firma (workpulse.ch): Aufgaben, Stunden, Spesen, Mietverträge, Rechnungen, Immobilien und Hotel.',
      usamos: 'Dort gehören die Geschäftsdaten hin. Der WhatsApp-Assistent ist der Kanal, WorkPulse das System.',
      estado: 'IM PRODUKTIVBETRIEB auf eigenem Server. Der Assistent kann sich bereits anmelden.',
      puedesPreguntar: [],
      ojo: 'WorkPulse bildet fast alles doppelt ab, was der Assistent selbst speichert — und vollständiger. Vor jedem Neubau im Assistenten prüfen, ob WorkPulse es schon kann. Die Migration läuft in Etappen, Spesen zuerst.',
    },
  },

  infoniqa: {
    nombre: 'Infoniqa ONE 50',
    alias: ['infoniqa', 'one 50', 'sage 50', 'treuhander', 'treuhänder', 'contabilidad'],
    es: {
      queEs: 'El programa de contabilidad que usa nuestro fiduciario (Treuhänder). Antes se llamaba Sage 50.',
      usamos: 'Es donde acaban los asientos contables. Hoy los gastos se le entregan en CSV.',
      estado: 'NO conectado. Se ha investigado cómo importar, pero falta información de su parte.',
      puedesPreguntar: [],
      ojo: 'El formato exacto del fichero no es público, y el que aparece en la ayuda es de OTRA versión del programa: copiarlo sería tirar el trabajo. El camino correcto es pedirle al fiduciario un fichero de ejemplo exportado desde SU programa con tres o cuatro asientos, su lista de códigos de IVA y su plan de cuentas. Ese ejemplo ES la especificación.',
    },
    de: {
      queEs: 'Die Buchhaltungssoftware unseres Treuhänders, früher Sage 50.',
      usamos: 'Dort landen die Buchungen. Heute werden Spesen als CSV übergeben.',
      estado: 'NICHT angebunden. Der Import wurde recherchiert, es fehlen Angaben vom Treuhänder.',
      puedesPreguntar: [],
      ojo: 'Das genaue Dateiformat ist nicht öffentlich, und das im Hilfe-Center gezeigte stammt aus einer ANDEREN Programmversion. Richtig ist: beim Treuhänder eine Beispieldatei aus SEINEM System anfordern (3–4 Buchungen), dazu Steuerschlüssel und Kontenplan. Das Beispiel ist die Spezifikation.',
    },
  },

  asistente: {
    nombre: 'El asistente de WhatsApp',
    alias: ['asistente', 'el asistente', 'tu mismo', 'quien eres', 'assistent', 'bot'],
    es: {
      queEs: 'Yo. Un asistente de la empresa que trabaja por WhatsApp (+41 76 226 04 47) y guarda todo en un servidor propio, en la oficina.',
      usamos: 'Tareas del equipo, citas, contactos, compra de oficina, gastos y kilometraje, residuos, contratos de alquiler, impagos, recibos, meteo de obra, precios de Casa Reto y datos del hotel.',
      estado: 'EN MARCHA. Desde el 24.09.2026 hay además un vigilante que avisa por WhatsApp si dejo de responder.',
      puedesPreguntar: ['¿qué tengo hoy?', '¿qué sabes hacer?', '¿qué sistemas usamos?'],
      ojo: 'Entiendo español, alemán y portugués, y también notas de voz. Las reglas van primero; solo cuando no entiendo pido ayuda a una IA externa, y a esa nunca le mando contraseñas ni números de cuenta.',
    },
    de: {
      queEs: 'Ich. Ein Firmen-Assistent über WhatsApp (+41 76 226 04 47); alle Daten liegen auf einem eigenen Server im Büro.',
      usamos: 'Aufgaben, Termine, Kontakte, Büroeinkauf, Spesen und Kilometer, Abfuhr, Mietverträge, Mahnwesen, Belege, Bau-Wetter, Preise Casa Reto und Hoteldaten.',
      estado: 'IN BETRIEB. Seit 24.09.2026 meldet zusätzlich ein Wächter per WhatsApp, wenn ich ausfalle.',
      puedesPreguntar: ['was habe ich heute?', 'was kannst du?', 'welche Systeme nutzen wir?'],
      ojo: 'Ich verstehe Spanisch, Deutsch und Portugiesisch, auch Sprachnachrichten. Regeln zuerst; nur wenn ich nicht weiterkomme, frage ich eine externe KI — Passwörter oder Kontonummern gehen dorthin nie.',
    },
  },
}

/** El texto de la ficha en el idioma pedido (pt cae a es, a propósito). */
export function fichaEn(sistema, lang = 'es') {
  return sistema[lang === 'de' ? 'de' : 'es']
}

/**
 * Encuentra el sistema del que se habla. Compara contra el nombre y contra los
 * alias, sin acentos: la gente escribe «likemagic», «like magic» y «Like-Magic»
 * el mismo día.
 *
 * Se elige el alias MÁS LARGO que encaje, para que «like magic» no se lo lleve
 * un alias corto de otro sistema que también aparezca en la frase.
 */
export function buscarSistema(texto) {
  const t = plano(texto)
  if (!t) return null
  let mejor = null
  for (const [clave, sis] of Object.entries(SISTEMAS)) {
    for (const alias of [sis.nombre, ...sis.alias]) {
      const a = plano(alias)
      if (!a) continue
      // Límite de palabra por los dos lados: «salto» no debe saltar dentro de
      // «saltos» ni «pms» dentro de otra palabra.
      const re = new RegExp(`(?:^|[^a-z0-9])${a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:[^a-z0-9]|$)`)
      if (re.test(t) && (!mejor || a.length > mejor.largo)) {
        mejor = { clave, sistema: sis, largo: a.length }
      }
    }
  }
  return mejor ? { clave: mejor.clave, sistema: mejor.sistema } : null
}

/** La ficha, ya escrita para leerla en el móvil. */
export function formatSistema(sistema, lang = 'es') {
  const f = fichaEn(sistema, lang)
  const de = lang === 'de'
  const partes = [
    `*${sistema.nombre}*`,
    '',
    f.queEs,
    '',
    `📌 ${de ? 'Wofür wir es nutzen' : 'Para qué lo usamos'}: ${f.usamos}`,
    `🚦 ${de ? 'Stand' : 'Estado'}: ${f.estado}`,
  ]
  if (f.puedesPreguntar?.length > 0) {
    partes.push('', `💬 ${de ? 'Das kannst du mich fragen' : 'Me puedes preguntar'}:`)
    partes.push(...f.puedesPreguntar.map((p) => `   • «${p}»`))
  }
  if (f.ojo) partes.push('', `⚠️ ${de ? 'Zu beachten' : 'Ojo'}: ${f.ojo}`)
  return partes.join('\n')
}

/** El índice: qué sistemas hay, en una línea cada uno. */
export function formatListaSistemas(lang = 'es') {
  const de = lang === 'de'
  const cabecera = de
    ? '*Systeme, die wir einsetzen*\n\nFrag mich nach einem davon, z. B. «was ist Apaleo?»:'
    : '*Sistemas que usamos*\n\nPregúntame por cualquiera, por ejemplo «¿qué es Apaleo?»:'
  const lineas = Object.values(SISTEMAS).map((s) => {
    const f = fichaEn(s, lang)
    // Del estado basta la primera frase: el índice tiene que caber de un vistazo.
    const resumen = f.estado.split('.')[0]
    return `• *${s.nombre}* — ${resumen}`
  })
  return [cabecera, '', ...lineas].join('\n')
}
