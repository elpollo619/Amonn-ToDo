// ============================================================
// Calendario de recogida de residuos de Muri bei Bern / Gümligen 2026.
//
// Sacado del Entsorgungskalender oficial (20251113_Entsorgungskalender_2026).
// Cada fecha se comprobó contra el día de la semana que anuncia el folleto
// —papel los miércoles, vidrio y metal los viernes...— y cuadran todas,
// incluidas las dos excepciones que el propio folleto marca en diciembre:
// escombros el miércoles 23 y plástico el martes 22.
//
// ⚠️ La oficina está en Muri (Blümlisalpstrasse 4), así que el papel es la
// columna MURI. La de Gümligen se guarda por si algún día hace falta.
//
// ⚠️ PENDIENTE DE CONFIRMAR: la basura doméstica (lunes y jueves) y el
// Grüngut (martes) son semanales y el folleto solo lista sus EXCEPCIONES por
// festivos; por eso aquí solo hay fechas de Grüngut en enero, febrero y
// diciembre. Habría que confirmar con la comuna si el resto del año se
// recoge todos los martes.
//
// Los residuos hay que sacarlos antes de las 7:00, y como pronto la tarde
// anterior — de ahí que el aviso vaya por la tarde.
// ============================================================

/** Fechas de recogida de 2026, por tipo. */
export const RECOGIDAS = {
  papier_muri: [
    '2026-01-14', '2026-01-28', '2026-02-11', '2026-02-25', '2026-03-11', '2026-03-25', '2026-04-08', '2026-04-22', '2026-05-06', '2026-05-20', '2026-06-03', '2026-06-17', '2026-07-01', '2026-07-15', '2026-07-29', '2026-08-12', '2026-08-26', '2026-09-09', '2026-09-23', '2026-10-07', '2026-10-21', '2026-11-04', '2026-11-18', '2026-12-02', '2026-12-16', '2026-12-30',
  ],
  papier_guemligen: [
    '2026-01-07', '2026-01-21', '2026-02-04', '2026-02-18', '2026-03-04', '2026-03-18', '2026-04-01', '2026-04-15', '2026-04-29', '2026-05-13', '2026-05-27', '2026-06-10', '2026-06-24', '2026-07-08', '2026-07-22', '2026-08-05', '2026-08-19', '2026-09-02', '2026-09-16', '2026-09-30', '2026-10-14', '2026-10-28', '2026-11-11', '2026-11-25', '2026-12-09',
  ],
  glas: [
    '2026-01-09', '2026-02-06', '2026-03-06', '2026-04-10', '2026-05-01', '2026-06-05', '2026-07-03', '2026-08-07', '2026-09-04', '2026-10-02', '2026-11-06', '2026-12-04',
  ],
  metall: [
    '2026-01-23', '2026-02-20', '2026-03-20', '2026-04-17', '2026-05-15', '2026-06-19', '2026-07-17', '2026-08-21', '2026-09-18', '2026-10-16', '2026-11-20', '2026-12-18',
  ],
  kunststoff: [
    '2026-01-16', '2026-01-30', '2026-02-13', '2026-02-27', '2026-03-13', '2026-03-27', '2026-04-10', '2026-04-24', '2026-05-08', '2026-05-22', '2026-06-12', '2026-06-26', '2026-07-10', '2026-07-24', '2026-08-14', '2026-08-28', '2026-09-11', '2026-09-25', '2026-10-09', '2026-10-23', '2026-11-13', '2026-11-27', '2026-12-11', '2026-12-22',
  ],
  deponie: [
    '2026-03-27', '2026-06-26', '2026-09-25', '2026-12-23',
  ],
  gruengut: [
    '2026-01-13', '2026-01-27', '2026-02-10', '2026-02-24', '2026-12-01', '2026-12-15', '2026-12-29',
  ],
}

/** Cómo se llama cada tipo en cada idioma. */
export const NOMBRES = {
  es: {
    papier_muri: 'papel y cartón', papier_guemligen: 'papel y cartón (Gümligen)',
    glas: 'vidrio', metall: 'metal', kunststoff: 'plástico',
    deponie: 'escombros', gruengut: 'restos verdes',
  },
  de: {
    papier_muri: 'Papier und Karton', papier_guemligen: 'Papier und Karton (Gümligen)',
    glas: 'Glas', metall: 'Metall', kunststoff: 'Kunststoff',
    deponie: 'Deponie', gruengut: 'Grüngut',
  },
  pt: {
    papier_muri: 'papel e cartão', papier_guemligen: 'papel e cartão (Gümligen)',
    glas: 'vidro', metall: 'metal', kunststoff: 'plástico',
    deponie: 'entulho', gruengut: 'verdes',
  },
}

/** Qué se recoge en una fecha concreta ('YYYY-MM-DD'). */
export function recogidasDe(fecha) {
  return Object.entries(RECOGIDAS)
    .filter(([, fechas]) => fechas.includes(fecha))
    .map(([tipo]) => tipo)
}

/**
 * La próxima recogida de un tipo a partir de una fecha (incluida).
 * Devuelve null si ya no quedan este año.
 */
export function proximaDe(tipo, desde) {
  const fechas = RECOGIDAS[tipo]
  if (!fechas) return null
  return fechas.find((f) => f >= desde) ?? null
}

/** Las próximas recogidas de todos los tipos, ordenadas por fecha. */
export function proximas(desde, limite = 5) {
  const todas = []
  for (const [tipo, fechas] of Object.entries(RECOGIDAS)) {
    const f = fechas.find((x) => x >= desde)
    if (f) todas.push({ tipo, fecha: f })
  }
  return todas.sort((a, b) => a.fecha.localeCompare(b.fecha)).slice(0, limite)
}

/** Suma días a una fecha 'YYYY-MM-DD' sin líos de zona horaria. */
export function masDias(fecha, dias) {
  const d = new Date(`${fecha}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}
