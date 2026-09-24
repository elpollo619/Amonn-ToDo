// Pruebas del vigilante de vida (scripts/latido.mjs).
//
// Estas pruebas existen porque un vigilante que se equivoca es PEOR que no
// tener vigilante: si avisa de más, se ignora; si avisa de menos, no sirve de
// nada. Aquí se comprueba exactamente cuándo habla y cuándo se calla.
import test from 'node:test'
import assert from 'node:assert/strict'
import { decidir, estaVivo, duracion, mensaje, elegirSesion } from '../../scripts/latido.mjs'

const INICIO = { fallos: 0, avisado: false, caidoDesde: null, ultimoAviso: null }
const MIN = 60_000

test('estaVivo: solo un /api/version de verdad cuenta como vivo', () => {
  assert.equal(estaVivo(200, '{"version":"55aa677"}'), true)
  assert.equal(estaVivo(500, '{"version":"55aa677"}'), false)
  assert.equal(estaVivo(200, 'no soy json'), false)
  // El caso del 08.09.2026: responde 200 pero sin versión utilizable.
  assert.equal(estaVivo(200, '{}'), false)
  assert.equal(estaVivo(200, '{"version":""}'), false)
})

test('no avisa al primer fallo: un parpadeo de red no es una caída', () => {
  let e = INICIO
  let r = decidir(e, false, 1000)
  assert.equal(r.accion, 'nada')
  e = r.estado
  r = decidir(e, false, 2000)
  assert.equal(r.accion, 'nada', 'dos fallos tampoco, el umbral es 3')
})

test('avisa UNA vez al cruzar el umbral, y no repite en cada vuelta', () => {
  let e = INICIO
  let avisos = 0
  for (const t of [1, 2, 3, 4, 5, 6]) {
    const r = decidir(e, false, t * MIN)
    if (r.accion === 'caido') avisos++
    e = r.estado
  }
  assert.equal(avisos, 1, 'exactamente un aviso, no seis')
})

test('la duración se cuenta desde el PRIMER fallo, no desde el aviso', () => {
  let e = INICIO
  let r
  for (const t of [1, 2, 3]) {
    r = decidir(e, false, t * MIN)
    e = r.estado
  }
  assert.equal(r.accion, 'caido')
  // Primer fallo en el minuto 1, aviso en el 3: la caída dura 2 minutos.
  assert.equal(r.duracionMs, 2 * MIN)
  assert.equal(r.desde, 1 * MIN)
})

test('al recuperarse avisa una vez y dice cuánto estuvo mudo', () => {
  let e = INICIO
  for (const t of [1, 2, 3]) e = decidir(e, false, t * MIN).estado
  const r = decidir(e, true, 10 * MIN)
  assert.equal(r.accion, 'recuperado')
  assert.equal(r.duracionMs, 9 * MIN, 'desde el primer fallo hasta ahora')
  // Y no vuelve a anunciarlo en la siguiente vuelta.
  assert.equal(decidir(r.estado, true, 11 * MIN).accion, 'nada')
})

test('un parpadeo que NO cruzó el umbral se recupera en silencio', () => {
  let e = INICIO
  e = decidir(e, false, 1 * MIN).estado
  e = decidir(e, false, 2 * MIN).estado
  const r = decidir(e, true, 3 * MIN)
  assert.equal(r.accion, 'nada', 'nadie necesita saber de un tropiezo de 2 minutos')
  assert.equal(r.estado.fallos, 0, 'y el contador se pone a cero')
})

test('si sigue caído, insiste cada 6 h — pero ni antes ni el doble', () => {
  let e = INICIO
  for (const t of [1, 2, 3]) e = decidir(e, false, t * MIN).estado
  // 5 h después: todavía calla.
  let r = decidir(e, false, 3 * MIN + 5 * 3600_000)
  assert.equal(r.accion, 'nada')
  e = r.estado
  // 6 h después del último aviso: insiste.
  r = decidir(e, false, 3 * MIN + 6 * 3600_000)
  assert.equal(r.accion, 'sigue-caido')
  e = r.estado
  // Inmediatamente después, vuelve a callar.
  assert.equal(decidir(e, false, 3 * MIN + 6 * 3600_000 + MIN).accion, 'nada')
})

test('el caso real: nueve días caído generan avisos, no silencio', () => {
  let e = INICIO
  let hablo = 0
  // Una comprobación cada 2 minutos durante 9 días habrían sido 6480 vueltas;
  // se simulan 9 días en saltos de 1 h, que es lo que decide los recordatorios.
  for (let h = 0; h <= 24 * 9; h++) {
    const r = decidir(e, false, h * 3600_000, { umbral: 1 })
    if (r.accion !== 'nada') hablo++
    e = r.estado
  }
  // 1 aviso inicial + un recordatorio cada 6 h durante 9 días.
  assert.ok(hablo >= 30, `esperaba avisos repetidos, hubo ${hablo}`)
  assert.ok(hablo <= 40, `pero tampoco spam: hubo ${hablo}`)
})

test('duracion: se lee en español, no en milisegundos', () => {
  assert.equal(duracion(30_000), '30 segundos')
  assert.equal(duracion(60_000), '1 minuto')
  assert.equal(duracion(5 * MIN), '5 minutos')
  assert.equal(duracion(3600_000), '1 h')
  assert.equal(duracion(2 * 3600_000 + 5 * MIN), '2 h 5 min')
  assert.equal(duracion(24 * 3600_000), '1 día')
  assert.equal(duracion(9 * 24 * 3600_000), '9 días')
})

test('el mensaje de caída nombra las DOS averías conocidas', () => {
  const m = mensaje('caido', { duracionMs: 6 * MIN, detalle: 'HTTP 502' })
  assert.match(m, /exec format error/, 'la avería de arquitectura')
  assert.match(m, /pg_filenode|42501/, 'la avería de pgdata')
  assert.match(m, /6 minutos/)
  assert.match(m, /HTTP 502/)
})

test('el mensaje de recuperación es corto y no alarma', () => {
  const m = mensaje('recuperado', { duracionMs: 2 * 3600_000 })
  assert.match(m, /vuelve a responder/)
  assert.match(m, /2 h/)
  assert.doesNotMatch(m, /docker/, 'ya no hay nada que mirar')
})

test('elegirSesion: manda la que está ready, no la primera de la lista', () => {
  assert.equal(elegirSesion([{ id: 'a', status: 'disconnected' }, { id: 'b', status: 'ready' }]), 'b')
  assert.equal(elegirSesion([{ id: 'a', status: 'starting' }]), 'a', 'si ninguna está ready, se intenta con la que haya')
  assert.equal(elegirSesion([]), null)
  assert.equal(elegirSesion(null), null, 'el Gateway puede devolver cualquier cosa')
  assert.equal(elegirSesion([{ sessionId: 'c', status: 'ready' }]), 'c', 'admite las dos formas del campo')
})
