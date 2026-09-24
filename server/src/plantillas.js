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
  // Confirmación de baja. NO es un contrato: es la carta que se manda al
  // inquilino cuando avisa de que se va, y que fija el día y la hora de la
  // entrega del objeto. Por eso se pide con otras palabras («confirma la baja
  // de …») y tiene su propia intención.
  //
  // ⚠️ Las fechas de aquí NO se inventan ninguna: la de la carta de baja, la
  // de salida y la de la entrega las pone quien escribe. Si falta alguna, se
  // marca a mano. Poner una fecha equivocada en una confirmación de baja
  // tiene consecuencias legales (plazos de preaviso).
  bajaConfirmacion: {
    clave: 'bajaConfirmacion',
    etiqueta: 'Confirmación de baja (Bestätigung Kündigung)',
    docEnDrive: '04 Maske Bestaetigung Kuendigung (Vorlage Assistent)',
    nombreDoc: (d) => `Bestätigung Kündigung ${d.nombre}`,
    huecos: (d, hoy) => {
      const { pila, apellido } = partirNombre(d.nombre)
      return {
        '{{M1VName}}': pila,
        '{{M1Name}}': apellido,
        '{{Anrede}}': d.anrede ?? 'geehrte/r',
        '{{MieterAdresse}}': d.mieterAdresse || aMano('dirección del inquilino'),
        '{{MieterOrt}}': d.mieterOrt || aMano('CP y localidad'),
        '{{Liegenschaft}}': d.direccion || aMano('dirección de la finca'),
        // Si solo se dio un número, se escribe como en los contratos
        // («Zimmer Nr. 31»); un «31» suelto en una carta no dice nada.
        '{{Objekt}}': d.objeto ?? (d.habitacion ? `Zimmer Nr. ${d.habitacion}` : aMano('objeto alquilado')),
        '{{ObjektZusatz}}': d.objetoZusatz ?? '',
        '{{Mitbenutzung}}': d.mitbenutzung ?? '',
        '{{VertragDatum}}': d.vertragDatum ? fecha(d.vertragDatum) : aMano('fecha del contrato'),
        '{{KuendigungDatum}}': d.kuendigungDatum ? fecha(d.kuendigungDatum) : aMano('fecha de la carta de baja'),
        '{{Auszug}}': d.desde ? fecha(d.desde) : aMano('fecha de salida'),
        '{{AbnahmeDatum}}': d.abnahmeDatum ? fecha(d.abnahmeDatum) : aMano('día de la entrega'),
        '{{AbnahmeZeit}}': d.abnahmeZeit ?? aMano('hora'),
        '{{Datum}}': fecha(hoy),
      }
    },
  },

  // Recibo de llaves. Se firma al entregar las llaves y es la prueba de qué
  // se dio exactamente; por eso los datos de las llaves (cuántas, de qué
  // tipo, número de la instalación) NO se inventan nunca: si no se dicen,
  // salen marcados y los rellena quien está delante con el manojo en la mano.
  llaves: {
    clave: 'llaves',
    etiqueta: 'Recibo de llaves (Schlüsselquittung)',
    docEnDrive: 'Maske Schluessquittung (Vorlage Assistent)',
    nombreDoc: (d) => `Schlüsselquittung ${d.nombre}`,
    huecos: (d, hoy) => {
      const { pila, apellido } = partirNombre(d.nombre)
      return {
        '{{M1VName}}': pila,
        '{{M1Name}}': apellido,
        '{{MieterAdresse}}': d.mieterAdresse || d.direccion || aMano('dirección'),
        '{{MieterOrt}}': d.mieterOrt || aMano('CP y localidad'),
        '{{Objekt}}': d.objeto ?? (d.habitacion ? String(d.habitacion) : aMano('objeto')),
        '{{Anzahl}}': d.anzahl ?? aMano('cuántas'),
        '{{Typ}}': d.typ ?? aMano('tipo'),
        '{{Anlagenummer}}': d.anlagenummer ?? aMano('nº instalación'),
        '{{Bezeichnung}}': d.bezeichnung ?? aMano('designación'),
        '{{Bemerkungen}}': d.bemerkungen ?? '',
        '{{Datum}}': fecha(hoy),
      }
    },
  },

  // Trastero, cuarto de hobby o almacén. Casi igual que el garaje, con dos
  // diferencias que vienen del contrato real: el preaviso es de SEIS meses
  // (no uno) y la fianza es de un mes de alquiler (no 100 fijos).
  trastero: {
    clave: 'trastero',
    etiqueta: 'Contrato de trastero / cuarto de hobby / almacén',
    docEnDrive: '01 Maske MV Keller (Vorlage Assistent)',
    nombreDoc: (d) => `MV Lagerraum ${d.nombre}`,
    huecos: (d, hoy) => {
      const { pila, apellido } = partirNombre(d.nombre)
      const netto = Number(String(d.alquiler ?? '0').replace(/[’']/g, '').replace(',', '.'))
      return {
        '{{M1VName}}': pila,
        '{{M1Name}}': apellido,
        '{{MieterAdresse}}': d.mieterAdresse || aMano('dirección del inquilino'),
        '{{MieterOrt}}': d.mieterOrt || aMano('CP y localidad'),
        '{{Liegenschaft}}': d.direccion || aMano('dirección de la finca'),
        '{{Objekt}}': d.objeto ?? `Lagerraum ${d.habitacion ?? ''}`.trim(),
        '{{Mbeginn}}': fecha(d.desde),
        '{{Kuendbar}}': d.kuendbar ? fecha(d.kuendbar) : (d.desde ? fecha(unAnoMenosUnDia(d.desde)) : aMano('primera fecha de rescisión')),
        '{{Netto}}': suizo(netto),
        '{{Total}}': suizo(netto),
        '{{Depot}}': d.deposito ? suizo(Number(String(d.deposito).replace(/[’']/g, ''))) : suizo(netto),
        '{{Bemerkungen}}': d.bemerkungen ?? '',
        '{{Datum}}': fecha(hoy),
      }
    },
  },

  // Vivienda (modelo HEV). El contrato largo de la casa.
  //
  // ⚠️ Aquí el ARRENDADOR también cambia: no siempre es Hans Amonn AG, sino
  // el propietario del edificio (I16 es de Ulrich Brechtbühl, por ejemplo),
  // con H. Amonn AG como representante. Por eso sus datos son huecos y no
  // texto fijo — y por eso se marcan «a rellenar» en vez de suponer.
  vivienda: {
    clave: 'vivienda',
    etiqueta: 'Contrato de vivienda (Wohnung)',
    docEnDrive: '01 Maske MV Whg (Vorlage Assistent)',
    // «MV Whg», no «MV» a secas: con el nombre del Longstay coincidían y en el
    // Drive quedaban dos documentos idénticos de nombre sin saber cuál era
    // cuál. Lo cazó una prueba antes de llegar a producción.
    nombreDoc: (d) => `MV Whg ${d.nombre}`,
    huecos: (d, hoy) => {
      const { pila, apellido } = partirNombre(d.nombre)
      const netto = Number(String(d.alquiler ?? '0').replace(/[’']/g, '').replace(',', '.'))
      const nk = Number(String(d.pauschal ?? '0').replace(/[’']/g, '').replace(',', '.'))
      return {
        '{{VAnrede}}': d.vAnrede ?? '',
        '{{MAnrede}}': d.anrede ?? '',
        '{{VermieterName}}': d.vermieter || aMano('propietario'),
        '{{VermieterAdresse}}': d.vermieterAdresse || aMano('dirección del propietario'),
        '{{VermieterOrt}}': d.vermieterOrt || aMano('CP y localidad'),
        '{{M1VName}}': pila,
        '{{M1Name}}': apellido,
        '{{MieterAdresse}}': d.mieterAdresse || aMano('dirección del inquilino'),
        '{{MieterOrt}}': d.mieterOrt || aMano('CP y localidad'),
        '{{Liegenschaft}}': d.direccion || aMano('dirección de la finca'),
        '{{Objekt}}': d.objeto ?? String(d.habitacion ?? ''),
        '{{Nebenraeume}}': d.nebenraeume || aMano('trastero, lavadero, plaza…'),
        '{{Mbeginn}}': fecha(d.desde),
        // En vivienda el preaviso es de 3 meses y la primera rescisión suele
        // ser al año: se calcula igual que en el garaje, pero se puede dar.
        '{{Kuendbar}}': d.kuendbar ? fecha(d.kuendbar) : (d.desde ? fecha(unAnoMenosUnDia(d.desde)) : aMano('primera fecha de rescisión')),
        '{{Netto}}': suizo(netto),
        '{{Nebenkosten}}': suizo(nk),
        '{{Total}}': suizo(netto + nk),
        // La fianza de vivienda son ~3 meses; se calcula si no se dice, pero
        // se puede fijar a mano («kaution 4500»).
        '{{Depot}}': d.deposito ? suizo(Number(String(d.deposito).replace(/[’']/g, ''))) : suizo((netto + nk) * 3),
        '{{Besondere}}': d.besondere ?? '',
      }
    },
  },
}

/** Importe como lo escribe la empresa: 1’500.00, con el apóstrofo suizo. */
export function suizo(n) {
  const x = Number(n)
  if (!Number.isFinite(x)) return ''
  const [ent, dec] = x.toFixed(2).split('.')
  return `${ent.replace(/\B(?=(\d{3})+(?!\d))/g, '’')}.${dec}`
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
  // La vivienda va PRIMERO: «contrato de vivienda … con plaza de garaje» es
  // un contrato de vivienda que menciona una plaza, no al revés.
  if (/\b(trastero|keller|kellerraum|bastelraum|lagerraum|lager|almacen|almacén|bodega)\b/.test(t)) return 'trastero'
  if (/\b(vivienda|wohnung|whg|piso|apartamento|zimmerwohnung|\d\s*½?\s*-?\s*zimmer)\b/.test(t)) return 'vivienda'
  if (/\b(parking|park(?:platz)?|garaje|garage|plaza|platz|stellplatz|einstellhall\w*|abstellplatz|aparcamiento|aep|aap|ehp)\b/.test(t)) return 'garaje'
  return 'longstay'
}
