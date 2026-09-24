// Pruebas del apartado de sistemas ("¿qué es Apaleo?").
//
// La mitad de estas pruebas NO comprueban que funcione, sino que NO ROMPA:
// "¿qué es X?" es una forma tan común que, mal colocada, se habría comido
// órdenes que ya funcionaban. El proyecto ya tuvo ese problema con los verbos
// compartidos («pon», «pasa», «cambia»), y por eso hay guardas escritas.
import test from 'node:test'
import assert from 'node:assert/strict'
import { parseWithRules } from '../src/assistant.js'
import { buscarSistema, formatSistema, formatListaSistemas, SISTEMAS } from '../src/sistemas.js'

const HOY = '2026-09-24'
const intent = (texto, lang = 'es') =>
  parseWithRules(texto, { users: [], sender: '+41765683445', today: HOY, lang, openTasks: [] })
/** parseWithRules añade el idioma al resultado; aquí solo interesa la intención. */
const soloIntencion = (r) => ({ action: r.action, clave: r.clave })

test('reconoce los sistemas aunque se escriban como los escribe la gente', () => {
  assert.equal(buscarSistema('Apaleo').clave, 'apaleo')
  assert.equal(buscarSistema('apaleo').clave, 'apaleo')
  assert.equal(buscarSistema('LIKE MAGIC').clave, 'likemagic')
  assert.equal(buscarSistema('likemagic').clave, 'likemagic')
  assert.equal(buscarSistema('like-magic').clave, 'likemagic')
  assert.equal(buscarSistema('Salto KS').clave, 'salto')
  assert.equal(buscarSistema('beds24').clave, 'beds24')
  assert.equal(buscarSistema('el treuhänder').clave, 'infoniqa', 'con acento')
  assert.equal(buscarSistema('el treuhander').clave, 'infoniqa', 'y sin acento')
})

test('no confunde un sistema con una palabra que lo contenga', () => {
  assert.equal(buscarSistema('dimos varios saltos'), null, '«saltos» no es SALTO KS')
  assert.equal(buscarSistema('una cosa cualquiera'), null)
  assert.equal(buscarSistema(''), null)
})

test('cuando hay dos nombres, gana el más específico', () => {
  // «pms» es alias de Apaleo, pero si además se nombra LIKE MAGIC, manda el
  // nombre largo: es de lo que se está hablando.
  assert.equal(buscarSistema('el pms de like magic').clave, 'likemagic')
})

test('«¿qué es Apaleo?» devuelve la ficha, en los tres idiomas de entrada', () => {
  assert.deepEqual(soloIntencion(intent('¿qué es Apaleo?')), { action: 'sistema_info', clave: 'apaleo' })
  assert.deepEqual(soloIntencion(intent('para qué sirve LIKE MAGIC')), { action: 'sistema_info', clave: 'likemagic' })
  assert.deepEqual(soloIntencion(intent('explícame Beds24')), { action: 'sistema_info', clave: 'beds24' })
  assert.deepEqual(soloIntencion(intent('cómo funciona PreisPilot')), { action: 'sistema_info', clave: 'preispilot' })
  assert.deepEqual(soloIntencion(intent('was ist Apaleo?', 'de')), { action: 'sistema_info', clave: 'apaleo' })
  assert.deepEqual(soloIntencion(intent('wofür ist LIKE MAGIC', 'de')), { action: 'sistema_info', clave: 'likemagic' })
  assert.deepEqual(soloIntencion(intent('o que é Apaleo', 'pt')), { action: 'sistema_info', clave: 'apaleo' })
})

test('el nombre a secas NO da la ficha si ya significaba otra cosa', () => {
  // «apaleo» a secas lleva dando el parte del hotel desde antes de que
  // existieran estas fichas, y el equipo lo usa a diario: no se le quita.
  // La ficha se pide explícitamente. Esto NO es una limitación, es la
  // decisión: el apartado nuevo añade una puerta, no cierra ninguna.
  assert.equal(intent('apaleo').action, 'hotel')
  assert.equal(intent('¿qué es apaleo?').action, 'sistema_info')

  // En cambio un sistema que no choca con ninguna regla previa sí responde
  // con solo nombrarlo, porque no le quita el sitio a nadie.
  assert.deepEqual(soloIntencion(intent('like magic')), { action: 'sistema_info', clave: 'likemagic' })
})

test('«qué sistemas usamos» da el índice', () => {
  assert.equal(intent('¿qué sistemas usamos?').action, 'sistema_list')
  assert.equal(intent('qué programas tenemos').action, 'sistema_list')
  assert.equal(intent('welche Systeme nutzen wir?', 'de').action, 'sistema_list')
})

// ── Las guardas: lo que NO debe pasar ──────────────────────────────────────

test('una pregunta genérica NO se convierte en ficha', () => {
  // No nombran ningún sistema: el mensaje debe seguir su camino normal.
  for (const frase of ['¿qué es esto?', 'qué es lo siguiente', 'explícame la factura de Baumgartner']) {
    assert.notEqual(intent(frase).action, 'sistema_info', `secuestró: "${frase}"`)
  }
})

test('mencionar un sistema de pasada en una orden larga NO devuelve la ficha', () => {
  const r = intent('crea una tarea a Rayna: revisar las reservas de apaleo el lunes')
  assert.notEqual(r.action, 'sistema_info', 'crear una tarea sigue creando una tarea')
  assert.notEqual(r.action, 'sistema_list')
})

test('las órdenes que ya funcionaban siguen funcionando', () => {
  // Pequeña red de seguridad sobre las intenciones más usadas.
  assert.notEqual(intent('¿qué tareas tengo?').action, 'sistema_info')
  assert.notEqual(intent('¿qué falta?').action, 'sistema_info')
  assert.notEqual(intent('qué hay en esperando material').action, 'sistema_info')
  assert.notEqual(intent('¿cuántos llegan hoy?').action, 'sistema_info')
})

// ── El contenido: que la ficha diga la verdad ──────────────────────────────

test('cada sistema tiene ficha completa en español y alemán', () => {
  for (const [clave, s] of Object.entries(SISTEMAS)) {
    assert.ok(s.nombre, `${clave}: sin nombre`)
    for (const lang of ['es', 'de']) {
      const f = s[lang]
      assert.ok(f, `${clave}: falta el idioma ${lang}`)
      for (const campo of ['queEs', 'usamos', 'estado']) {
        assert.ok(f[campo] && f[campo].length > 10, `${clave}.${lang}.${campo} vacío o demasiado corto`)
      }
    }
  }
})

test('la ficha dice lo que NO funciona, no solo lo que sí', () => {
  // Es la razón de ser del apartado: que el jefe no confíe en algo inexistente.
  const apaleo = formatSistema(SISTEMAS.apaleo, 'es')
  assert.match(apaleo, /limpieza/i, 'debe avisar de que no ve la limpieza')
  assert.match(apaleo, /units\.read/, 'y decir qué permiso falta')

  const lm = formatSistema(SISTEMAS.likemagic, 'es')
  assert.match(lm, /NO conectado|NO\s+conectado|TODAVÍA NO/i)

  const beds = formatSistema(SISTEMAS.beds24, 'es')
  assert.match(beds, /no entrará ni una reserva|disponibilidad/i, 'debe avisar del bloqueo real')
})

test('la ficha alemana está en alemán, no en español disfrazado', () => {
  const de = formatSistema(SISTEMAS.apaleo, 'de')
  assert.match(de, /Stand:/, 'las etiquetas también se traducen')
  assert.doesNotMatch(de, /Para qué lo usamos/)
})

test('el índice cabe de un vistazo: una línea por sistema', () => {
  const lista = formatListaSistemas('es')
  for (const s of Object.values(SISTEMAS)) assert.ok(lista.includes(s.nombre), `falta ${s.nombre}`)
  const lineasLargas = lista.split('\n').filter((l) => l.length > 160)
  assert.equal(lineasLargas.length, 0, `hay líneas kilométricas: ${lineasLargas[0]}`)
})
