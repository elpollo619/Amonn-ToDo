// ============================================================
// El catálogo de documentos que el asistente sabe generar.
//
// Idea central: añadir un tipo de documento nuevo NO debería ser programar.
// Por eso una plantilla se identifica por su NOMBRE dentro de la carpeta de
// contratos del Drive, no por una variable de entorno más en el compose. Para
// añadir «contrato de trastero» basta con dejar el Google Doc en esa carpeta
// llamándose como diga `docEnDrive`, y registrar aquí sus huecos.
//
// ⚠️ LAS PLANTILLAS DE WORD DE LA EMPRESA NO ESTÁN VACÍAS. Son el último
// contrato combinado: traen dentro el nombre, la dirección y los importes de
// una persona real. Antes de usar una hay que VACIARLA (ver el apartado de
// plantillas en docs/SIGUIENTE-SESION.md). Si se usara tal cual, el contrato
// nuevo saldría con datos de otro inquilino — un fallo grave y silencioso.
//
// ⚠️ Cada plantilla decide qué hueco rellena y cuál deja a mano. Lo que el
// asistente no sabe NO se inventa: se escribe «(A RELLENAR: …)», que se ve,
// en vez de dejarlo en blanco, que se firma sin que nadie lo note.
// ============================================================

/** dd.mm.aaaa desde 'YYYY-MM-DD'. */
const fecha = (k) => (k ? String(k).slice(0, 10).split('-').reverse().join('.') : '')
/** Lo que no sabemos se marca, no se deja en blanco. */
const aMano = (que) => `(A RELLENAR: ${que})`

/** Nombre y apellido a partir del texto que escribió la persona. */
export function partirNombre(nombre) {
  const partes = String(nombre ?? '').trim().split(/\s+/).filter(Boolean)
  if (partes.length === 0) return { pila: '', apellido: '' }
  if (partes.length === 1) return { pila: partes[0], apellido: '' }
  return { pila: partes.slice(0, -1).join(' '), apellido: partes[partes.length - 1] }
}

export const PLANTILLAS = {
  // El de siempre: habitación amueblada por meses.
  longstay: {
    clave: 'longstay',
    etiqueta: 'Contrato Longstay (habitación amueblada)',
    docEnDrive: '01 Maske MV Longstay (Vorlage Assistent)',
    // Esta plantilla nació antes que el catálogo y su id vive en una variable
    // de entorno. Se respeta: cambiarlo ahora rompería lo que ya funciona.
    idPorEnv: 'contractTemplateId',
    nombreDoc: (d) => `MV ${d.nombre}`,
    huecos: (d, hoy) => {
      const { pila, apellido } = partirNombre(d.nombre)
      return {
        '{{M1VName}}': pila,
        '{{M1Name}}': apellido,
        '{{Objekt}}': `Zimmer Nr. ${d.habitacion}`,
        '{{Total}}': d.alquiler,
        '{{Depot}}': d.deposito ?? '500',
        '{{Mbeginn}}': fecha(d.desde),
        '{{Datum}}': fecha(hoy),
        '{{Liegenschaft}}': d.direccion || aMano('dirección de la finca'),
      }
    },
  },

  // Plazas de garaje, aparcamiento cubierto y exterior. Son los contratos más
  // repetitivos de la casa (unos 45 en vigor), y por eso los primeros que
  // compensa automatizar.
  garaje: {
    clave: 'garaje',
    etiqueta: 'Contrato de plaza de garaje / aparcamiento',
    docEnDrive: '01 Maske MV Garage (Vorlage Assistent)',
    nombreDoc: (d) => `MV Parkplatz ${d.nombre}`,
    huecos: (d, hoy) => {
      const { pila, apellido } = partirNombre(d.nombre)
      // El importe total: si hay gastos fijos («pauschal»), se suman. Se
      // calcula aquí y no se pide, porque sumar dos números a mano en un
      // contrato es justo donde aparecen los errores.
      const netto = Number(String(d.alquiler ?? '0').replace(',', '.'))
      const pauschal = Number(String(d.pauschal ?? '0').replace(',', '.'))
      const total = (netto + pauschal).toFixed(2)
      return {
        '{{Anrede}}': d.anrede ?? '',
        '{{M1VName}}': pila,
        '{{M1Name}}': apellido,
        '{{MieterAdresse}}': d.mieterAdresse || aMano('dirección del inquilino'),
        '{{MieterOrt}}': d.mieterOrt || aMano('CP y localidad'),
        '{{Liegenschaft}}': d.direccion || aMano('dirección de la finca'),
        '{{Objekt}}': d.objeto ?? `Parkplatz Nr. ${d.habitacion}`,
        '{{Mbeginn}}': fecha(d.desde),
        // La primera fecha de rescisión no se inventa: en estos contratos es
        // un año menos un día desde el inicio, y así lo calculamos; si no hay
        // inicio, se deja a mano.
        '{{Kuendbar}}': d.kuendbar ? fecha(d.kuendbar) : (d.desde ? fecha(unAnoMenosUnDia(d.desde)) : aMano('primera fecha de rescisión')),
        '{{Netto}}': netto.toFixed(2),
        '{{Pauschal}}': pauschal.toFixed(2),
        '{{Total}}': total,
        '{{Depot}}': d.deposito ?? '100',
        '{{Bemerkungen}}': d.bemerkungen ?? '',
        '{{Datum}}': fecha(hoy),
      }
    },
  },
}

/**
 * Un año menos un día: el 01.03.2026 se puede rescindir por primera vez el
 * 28.02.2027. Se calcula con UTC para que no lo mueva el cambio de hora.
 */
export function unAnoMenosUnDia(clave) {
  const d = new Date(`${String(clave).slice(0, 10)}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return null
  d.setUTCFullYear(d.getUTCFullYear() + 1)
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

/**
 * Qué tipo de documento pide la frase.
 *
 * Por defecto, «longstay»: es el que se usaba antes de que existiera el
 * catálogo, y cambiar el comportamiento por defecto rompería lo que la gente
 * ya escribe todos los días.
 */
export function tipoDeDocumento(texto) {
  const t = String(texto ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  // «platz» suelto entra a propósito: en una frase de contrato solo puede ser
  // una plaza de aparcamiento, y sin él «Anna, A4, Platz 12, 90» se trataba
  // como una habitación y salía el contrato equivocado.
  if (/\b(parking|park(?:platz)?|garaje|garage|plaza|platz|stellplatz|einstellhall\w*|abstellplatz|aparcamiento|aep|aap|ehp)\b/.test(t)) return 'garaje'
  return 'longstay'
}
