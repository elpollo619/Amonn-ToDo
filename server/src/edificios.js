// ============================================================
// De qué edificio es una habitación, y cuál es su dirección.
//
// Para qué: que el contrato salga con la dirección de la finca ya escrita
// («Liegenschaft: Bernstr. 22, 3053 Münchenbuchsee») en vez de dejar un hueco
// que alguien rellena a mano —y a veces olvida.
//
// ⚠️ DE DÓNDE SALEN LOS DATOS, Y POR QUÉ IMPORTA: no hay una lista de
// direcciones escrita a mano en el código, que envejecería en silencio. Se
// leen de los 222 contratos REALES importados del Excel maestro
// (tabla `mietvertraege`, columnas objgrp/objadr/objort). Si la empresa
// compra un edificio, aparece solo en cuanto haya un contrato suyo.
//
// ⚠️ REGLA INNEGOCIABLE: en un contrato NO SE INVENTA una dirección. Si no
// se puede deducir con seguridad, se deja el hueco y se avisa en la
// respuesta. Un contrato con la finca equivocada es peor que uno incompleto:
// el incompleto se ve, el equivocado se firma.
//
// Los datos del Excel vienen sucios y hay que contar con ello: `A12` tiene
// dos direcciones (Allmendstrasse 12 y 12a) y `H8b` aparece con tres, una de
// ellas de otra ciudad. Por eso «la dirección de un edificio» es la MÁS
// FRECUENTE, y solo se da por buena cuando gana con claridad.
// ============================================================
import { query } from './db.js'

/** Normaliza para comparar: sin acentos, minúsculas, sin espacios de sobra. */
const plano = (s) => String(s ?? '').toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/\s+/g, ' ').trim()

/**
 * La dirección de un edificio por su código (A14, B22, S17…).
 *
 * Devuelve la más repetida entre sus contratos y, si hay más de una, también
 * las otras: quien llama decide si se fía. `seguro` es true solo cuando la
 * ganadora tiene al menos el doble de contratos que la siguiente — con datos
 * sucios, un empate no es una respuesta.
 */
export async function direccionDeEdificio(codigo) {
  const cod = String(codigo ?? '').trim()
  if (!cod) return null
  const { rows } = await query(
    `select objadr, objort, count(*)::int as n
       from mietvertraege
      where lower(objgrp) = lower($1)
        and coalesce(objadr, '') <> ''
      group by objadr, objort
      order by n desc`,
    [cod],
  )
  if (rows.length === 0) return null
  const [mejor, segunda] = rows
  return {
    codigo: cod.toUpperCase(),
    adr: mejor.objadr.trim(),
    ort: (mejor.objort ?? '').trim(),
    contratos: mejor.n,
    seguro: !segunda || mejor.n >= segunda.n * 2,
    alternativas: rows.slice(1).map((r) => ({ adr: r.objadr.trim(), ort: (r.objort ?? '').trim(), n: r.n })),
  }
}

/** Todos los edificios conocidos, para poder enseñarlos cuando haya dudas. */
export async function listarEdificios() {
  const { rows } = await query(
    `select objgrp as codigo, count(*)::int as n,
            (array_agg(objadr order by objadr))[1] as adr,
            (array_agg(objort order by objort))[1] as ort
       from mietvertraege
      where coalesce(objgrp, '') <> '' and coalesce(objadr, '') <> ''
      group by objgrp
      order by objgrp`,
  )
  return rows
}

/**
 * ¿Qué edificio se menciona en el texto? Busca el código (A14, B22…) o el
 * nombre de la calle. Pide límite de palabra en el código para que «A4» no
 * salte dentro de «A400».
 */
export async function edificioEnTexto(texto) {
  const t = plano(texto)
  if (!t) return null
  const edificios = await listarEdificios()
  // Primero por código, que es inequívoco. El más largo gana: «A12a» antes
  // que «A12», si algún día existiera como grupo propio.
  const porCodigo = edificios
    .filter((e) => new RegExp(`(?:^|[^a-z0-9])${plano(e.codigo).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:[^a-z0-9]|$)`).test(t))
    .sort((a, b) => b.codigo.length - a.codigo.length)
  if (porCodigo.length > 0) return direccionDeEdificio(porCodigo[0].codigo)

  // Luego por calle: «en Bernstrasse 22», «Sahlistrasse». Se compara sin
  // acentos y admitiendo «str.» por «strasse», que en el Excel se mezclan.
  const suelta = (s) => plano(s).replace(/strasse|str\./g, 'str')
  const tSuelto = suelta(t)
  for (const e of edificios) {
    const calle = suelta(e.adr).split(',')[0]
    if (calle.length >= 5 && tSuelto.includes(calle)) return direccionDeEdificio(e.codigo)
    // También sin el número: «sahlistr» encuentra «Sahlistrasse 17».
    const soloCalle = calle.replace(/\s*\d+.*$/, '')
    if (soloCalle.length >= 6 && tSuelto.includes(soloCalle)) return direccionDeEdificio(e.codigo)
  }
  return null
}

/**
 * Deduce el edificio de una habitación mirando los contratos existentes.
 *
 * Solo responde cuando NO hay duda: si el número aparece en dos edificios
 * distintos, devuelve `ambiguo` con la lista, para poder preguntar en vez de
 * acertar por casualidad. Es el caso real de esta empresa: hay una «204» en
 * más de un sitio.
 */
export async function edificioDeHabitacion(habitacion) {
  const h = String(habitacion ?? '').trim()
  if (!h) return { encontrado: false }
  const { rows } = await query(
    `select objgrp, objadr, objort, objcode, objekt
       from mietvertraege
      where coalesce(objgrp, '') <> ''
        and coalesce(objadr, '') <> ''
        and (objcode ~* $1 or objekt ~* $1)`,
    // Límite de palabra a los dos lados del número: la «4» no debe encontrar
    // la «14» ni la «40».
    [`(^|[^0-9])${h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^0-9]|$)`],
  )
  if (rows.length === 0) return { encontrado: false }
  const grupos = [...new Set(rows.map((r) => r.objgrp.toUpperCase()))]
  if (grupos.length > 1) {
    return {
      encontrado: true,
      ambiguo: true,
      candidatos: grupos,
      detalle: rows.slice(0, 6).map((r) => ({ codigo: r.objgrp, adr: r.objadr, objeto: r.objekt })),
    }
  }
  const dir = await direccionDeEdificio(grupos[0])
  return { encontrado: true, ambiguo: false, ...dir }
}

/** «Bernstr. 22, 3053 Münchenbuchsee» — como se escribe en el contrato. */
export function formatDireccion(d) {
  if (!d || !d.adr) return ''
  return [d.adr, d.ort].filter(Boolean).join(', ')
}

/**
 * ¿Esa habitación de ese edificio ya tiene contrato?
 *
 * Es un AVISO, nunca un bloqueo: los datos son una foto del Excel y pueden
 * estar viejos —el inquilino puede haberse ido ayer—, así que decidir no nos
 * toca. Pero alquilar dos veces la misma habitación es un error caro y
 * silencioso, y quien está escribiendo el contrato merece enterarse antes de
 * imprimirlo.
 */
export async function habitacionOcupada(codigoEdificio, habitacion) {
  const cod = String(codigoEdificio ?? '').trim()
  const h = String(habitacion ?? '').trim()
  if (!cod || !h) return null
  const { rows } = await query(
    `select m1vname, m1name, objcode, objekt, mbeginn,
            (select max(imported_at) from mietvertraege) as foto
       from mietvertraege
      where lower(objgrp) = lower($1)
        and (objcode ~* $2 or objekt ~* $2)
      limit 3`,
    [cod, `(^|[^0-9])${h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^0-9]|$)`],
  )
  if (rows.length === 0) return null
  const r = rows[0]
  return {
    inquilino: [r.m1vname, r.m1name].filter(Boolean).join(' ').trim(),
    objeto: r.objekt || r.objcode,
    desde: r.mbeginn,
    foto: r.foto,
    total: rows.length,
  }
}

/**
 * Todo lo que hay que saber del edificio para un contrato, en una llamada.
 *
 * Devuelve `{ direccion, codigo, preguntar, motivo, opciones }`. Cuando
 * `preguntar` es true, quien llama NO debe generar el contrato: debe pedir el
 * edificio. Se prefiere preguntar antes que acertar por casualidad — en esta
 * empresa el número de habitación NO identifica el edificio (la «1» existe en
 * diez), así que deducirlo del número sería jugar a la lotería con un
 * documento que se firma.
 */
export async function resolverEdificio(textoCrudo) {
  const enTexto = await edificioEnTexto(textoCrudo)
  if (enTexto && enTexto.seguro) {
    return { direccion: formatDireccion(enTexto), codigo: enTexto.codigo, preguntar: false }
  }
  if (enTexto && !enTexto.seguro) {
    // Caso real: «A12» son dos direcciones distintas (12 y 12a) en el Excel.
    return {
      preguntar: true,
      motivo: 'ambiguo',
      codigo: enTexto.codigo,
      opciones: [formatDireccion(enTexto), ...enTexto.alternativas.map((a) => [a.adr, a.ort].filter(Boolean).join(', '))],
    }
  }
  return { preguntar: true, motivo: 'sin_edificio', opciones: (await listarEdificios()).map((e) => `${e.codigo} — ${e.adr}`) }
}
