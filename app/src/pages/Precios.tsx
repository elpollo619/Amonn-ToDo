import { useEffect, useMemo, useState } from 'react'
import { useToast } from '../context/ToastContext'
import * as api from '../lib/api'
import './Precios.css'

const CHF = (n: number) => `CHF ${Math.round(n)}`

/** «2026-09-11» → «Vi 11/09». Los días vienen de PreisPilot en alemán. */
const DIAS: Record<string, string> = {
  Mo: 'Lu', Di: 'Ma', Mi: 'Mi', Do: 'Ju', Fr: 'Vi', Sa: 'Sá', So: 'Do',
}
function etiquetaFecha(d: string, w?: string) {
  const [, m, dia] = d.split('-')
  return `${w ? `${DIAS[w] ?? w} ` : ''}${dia}/${m}`
}

/**
 * El «por qué» de un precio, en una línea. PreisPilot manda el desglose paso
 * a paso (br); aquí solo interesan los pasos que MUEVEN el precio, no el
 * precio base repetido.
 */
function porQue(n: api.NochePrecio): string {
  const pasos = (n.br ?? []).filter((b) => b.f != null && b.f !== 1)
  if (pasos.length === 0) return n.br?.length ? 'precio base' : '—'
  return pasos
    .map((b) => {
      const pct = Math.round((b.f! - 1) * 100)
      return `${b.t} ${pct > 0 ? '+' : ''}${pct}%`
    })
    .join(' · ')
}

export function Precios() {
  const { show } = useToast()
  const [hoja, setHoja] = useState<api.PreciosHoja | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [meses, setMeses] = useState(2)
  const [vista, setVista] = useState<'semanas' | 'noches' | 'hotel'>('semanas')
  const [hotel, setHotel] = useState<api.HotelPrecios | null>(null)
  // Lo que se está escribiendo en cada fila, sin guardar todavía.
  const [borrador, setBorrador] = useState<Record<string, string>>({})
  const [guardando, setGuardando] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [ensayo, setEnsayo] = useState<api.EnvioResultado | null>(null)

  // El hotel se pide aparte y solo al abrir su pestaña: si Apaleo no
  // responde, no debe retrasar la hoja de Casa Reto.
  useEffect(() => {
    if (vista !== 'hotel' || hotel) return
    let vivo = true
    api.getPreciosHotel()
      .then((h) => { if (vivo) setHotel(h) })
      .catch((e) => { if (vivo) setHotel({ disponible: false, motivo: e instanceof Error ? e.message : 'No se pudo cargar' }) })
    return () => { vivo = false }
  }, [vista, hotel])

  useEffect(() => {
    let vivo = true
    api.getPrecios()
      .then((h) => { if (vivo) setHoja(h) })
      .catch((e) => { if (vivo) setError(e instanceof Error ? e.message : 'No se pudo cargar') })
    return () => { vivo = false }
  }, [])

  const noches = useMemo(() => {
    if (!hoja) return []
    const hasta = new Date()
    hasta.setMonth(hasta.getMonth() + meses)
    const limite = hasta.toISOString().slice(0, 10)
    return hoja.calendario.filter((n) => n.d <= limite)
  }, [hoja, meses])

  async function guardar(fecha: string, quitar = false) {
    if (!hoja) return
    const texto = (borrador[fecha] ?? '').trim()
    if (!quitar && texto === '') return
    const precio = quitar ? null : Number(texto.replace(',', '.'))
    if (!quitar && (!Number.isFinite(precio!) || precio! <= 0)) {
      show('Ese precio no vale. Escribe solo el número, por ejemplo 340.')
      return
    }
    setGuardando(fecha)
    try {
      const overrides = await api.fijarPrecio(fecha, precio)
      setHoja({ ...hoja, overrides })
      setBorrador((b) => { const c = { ...b }; delete c[fecha]; return c })
      show(quitar
        ? `${etiquetaFecha(fecha)}: vuelve al precio automático. Se envía a Beds24 esta noche.`
        : `${etiquetaFecha(fecha)} fijado en ${CHF(precio!)}. Se envía a Beds24 esta noche.`)
    } catch (e) {
      show(e instanceof Error ? e.message : 'No se pudo guardar')
    } finally {
      setGuardando(null)
    }
  }

  async function enviar(soloEnsayo: boolean) {
    setEnviando(true)
    try {
      const r = await api.enviarPrecios(soloEnsayo)
      if (soloEnsayo) {
        setEnsayo(r)
      } else {
        setEnsayo(null)
        show(`Enviado a Beds24: ${r.ranges ?? 0} tramos, ${r.days ?? 0} días.`)
        api.getPrecios().then(setHoja).catch(() => {})
      }
    } catch (e) {
      show(e instanceof Error ? e.message : 'No se pudo enviar')
    } finally {
      setEnviando(false)
    }
  }

  if (error) {
    return (
      <>
        <div className="page-header"><div><h1>Precios</h1></div></div>
        <div className="card"><div className="error-box">{error}</div></div>
      </>
    )
  }
  if (!hoja) {
    return (
      <>
        <div className="page-header"><div><h1>Precios</h1></div></div>
        <div className="card"><p className="card-sub" style={{ marginBottom: 0 }}>Cargando…</p></div>
      </>
    )
  }

  const a = hoja.analisis
  const fijados = Object.keys(hoja.overrides).length
  const bloqueado = !hoja.puedeEditar || !hoja.editable

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Precios</h1>
          <div className="subtitle">
            {hoja.propiedad} · el precio de cada noche y por qué sale ese
          </div>
        </div>
      </div>

      <div className="precios-resumen card">
        <div className="precios-cifras">
          <div><b>{a.base ? CHF(a.base) : '—'}</b><span>base</span></div>
          <div><b>{a.min ? CHF(a.min) : '—'}</b><span>mínimo</span></div>
          <div><b>{a.max ? CHF(a.max) : '—'}</b><span>máximo</span></div>
          <div><b>{CHF(a.media7)}</b><span>media 7 días</span></div>
          <div><b>{CHF(a.media30)}</b><span>media 30 días</span></div>
          <div><b>{fijados}</b><span>fijados a mano</span></div>
        </div>
        <p className="hint" style={{ marginTop: 10, marginBottom: 0 }}>
          Último envío a Beds24: <b>{a.ultimoEnvio ?? '—'}</b>{a.aplicado ? ' ✓' : a.ultimoEnvio ? ' ✗' : ''}.
          {' '}Los precios se envían solos dos veces al día.
        </p>
      </div>

      {hoja.puedeEditar && hoja.editable && (
        <div className="card precios-enviar">
          <h2 className="card-title">Enviar los precios a Beds24</h2>
          <p className="card-sub">
            Desde el 09.09.2026 <b>no se envía nada solo</b>: los precios llegan a Beds24
            cuando tú lo apruebas aquí. Mira primero el ensayo, que no escribe nada.
          </p>
          <div className="precios-botones">
            <button type="button" className="btn btn-ghost" disabled={enviando} onClick={() => enviar(true)}>
              {enviando ? 'Comprobando…' : 'Ver qué se enviaría'}
            </button>
            <button type="button" className="btn btn-primary" disabled={enviando} onClick={() => enviar(false)}>
              {enviando ? 'Enviando…' : 'Aprobar y enviar a Beds24'}
            </button>
          </div>
          {ensayo && (
            <p className="hint" style={{ marginTop: 10, marginBottom: 0 }}>
              Se enviarían <b>{ensayo.ranges ?? 0} tramos</b> y <b>{ensayo.days ?? 0} días</b>
              {ensayo.from && <> ({ensayo.from} → {ensayo.to})</>}
              {ensayo.overridesApplied ? <>, de ellos <b>{ensayo.overridesApplied}</b> fijados a mano</> : null}.
              No se ha escrito nada todavía.
            </p>
          )}
        </div>
      )}

      {!hoja.puedeEditar && (
        <div className="card precios-aviso">
          Puedes mirar los precios, pero <b>solo un administrador</b> puede cambiarlos
          y enviarlos a Beds24.
        </div>
      )}
      {hoja.puedeEditar && !hoja.editable && (
        <div className="card precios-aviso">
          Falta configurar <b>PREISPILOT_PIN</b> en el servidor, así que de momento
          esta hoja es de solo lectura.
        </div>
      )}

      {hoja.eventos.length > 0 && (
        <div className="card">
          <h2 className="card-title">Lo que viene</h2>
          <p className="card-sub">
            Los días con evento o fiesta, y cuánto se cobra de más que en una noche normal.
          </p>
          <div className="precios-tabla-scroll">
            <table className="precios-tabla">
              <thead>
                <tr><th>Fechas</th><th>Qué pasa</th><th>Noches</th><th>Precio medio</th><th>vs. normal</th></tr>
              </thead>
              <tbody>
                {hoja.eventos.map((e) => (
                  <tr key={`${e.nombre}-${e.desde}`}>
                    <td className="col-fecha">{etiquetaFecha(e.desde)} → {etiquetaFecha(e.hasta)}</td>
                    <td>{e.nombre}</td>
                    <td>{e.noches}</td>
                    <td className="col-precio"><b>{CHF(e.media)}</b></td>
                    <td className={e.sobreNormal >= 0 ? 'precios-sube' : 'precios-baja'}>
                      {e.sobreNormal >= 0 ? '+' : ''}{e.sobreNormal}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="hint" style={{ marginBottom: 0 }}>
            Un evento en temporada baja puede salir por debajo de la media del año aunque
            lleve recargo: el recargo se aplica sobre el precio de esos días, no sobre el del verano.
          </p>
        </div>
      )}

      <div className="precios-tabs">
        <button type="button" className={vista === 'semanas' ? 'es-activa' : ''} onClick={() => setVista('semanas')}>Por semanas</button>
        <button type="button" className={vista === 'noches' ? 'es-activa' : ''} onClick={() => setVista('noches')}>Noche a noche</button>
        <button type="button" className={vista === 'hotel' ? 'es-activa' : ''} onClick={() => setVista('hotel')}>N's Hotel</button>
      </div>

      {vista === 'hotel' && (
        <div className="card">
          <h2 className="card-title">N's Hotel · Kerzers</h2>
          {!hotel ? (
            <p className="card-sub" style={{ marginBottom: 0 }}>Preguntando a Apaleo…</p>
          ) : !hotel.disponible ? (
            <>
              <p className="card-sub">
                Los precios del hotel viven en Apaleo, no en PreisPilot. Todavía no se pueden ver desde aquí:
              </p>
              <div className="precios-aviso-comp" style={{ marginBottom: 0 }}>
                {hotel.motivo}
                <div style={{ marginTop: 8 }}>
                  Se arregla en <b>apaleo.dev</b> → Apps → la app del hotel → añadir los permisos
                  <code> rates.read</code>, <code>rates.manage</code> y <code>availability.read</code>.
                  En cuanto estén, esta pestaña funciona sola.
                </div>
              </div>
            </>
          ) : (
            <>
              <p className="card-sub">
                Del {hotel.desde} al {hotel.hasta}, por plan de tarifa.
                {!hotel.puedeEditar && ' Solo un administrador puede cambiarlos.'}
              </p>
              {hotel.planes?.map((plan) => (
                <div key={plan.id} style={{ marginBottom: 22 }}>
                  <h3 style={{ fontSize: 15, margin: '0 0 8px' }}>{plan.nombre}</h3>
                  <div className="precios-tabla-scroll">
                    <table className="precios-tabla">
                      <thead><tr><th>Noche</th><th>Precio</th></tr></thead>
                      <tbody>
                        {plan.tarifas.map((t) => {
                          const imp = t.price?.grossAmount ?? t.price?.netAmount ?? t.price?.amount
                          return (
                            <tr key={t.from}>
                              <td className="col-fecha">{etiquetaFecha(String(t.from).slice(0, 10))}</td>
                              <td className="col-precio"><b>{imp != null ? CHF(imp) : '—'}</b></td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {vista === 'semanas' && (
        <div className="card">
          <h2 className="card-title">Semana a semana</h2>
          <p className="card-sub">
            Cada semana, de lunes a domingo: lo que sale de media y la horquilla recomendada.
            Por debajo del suelo regalas la casa; por encima del techo es difícil que se venda.
          </p>
          <div className="precios-aviso-comp">
            ⚠️ <b>Cuánto fiarse de esto.</b> Solo <b>{hoja.competencia.conDato}</b> de{' '}
            <b>{hoja.competencia.total}</b> noches tienen precios de la competencia
            (se rellenan a mano). Donde pone <b>baja</b>, la horquilla sale solo de nuestro
            propio cálculo, sin mirar lo que cobran los vecinos.
          </div>
          <div className="precios-tabla-scroll">
            <table className="precios-tabla">
              <thead>
                <tr><th>Semana</th><th>Media</th><th>No bajes de</th><th>No pases de</th><th>Fiabilidad</th><th>Qué pasa</th></tr>
              </thead>
              <tbody>
                {hoja.semanas.map((w) => (
                  <tr key={w.desde} className={w.eventos.length ? 'es-fijado' : undefined}>
                    <td className="col-fecha">{etiquetaFecha(w.desde)} → {etiquetaFecha(w.hasta)}</td>
                    <td className="col-precio">
                      <b>{CHF(w.media)}</b>
                      <span className="precios-detalle">
                        entre semana {w.entreSemana ? CHF(w.entreSemana) : '—'} · finde {w.finde ? CHF(w.finde) : '—'}
                      </span>
                    </td>
                    <td className="col-precio"><b>{CHF(w.suelo)}</b></td>
                    <td className="col-precio"><b>{CHF(w.techo)}</b></td>
                    <td>
                      <span className={`precios-conf es-${w.confianza}`}>{w.confianza}</span>
                      <span className="precios-detalle">{w.motivo}</span>
                    </td>
                    <td className="col-porque">{w.eventos.join(' · ') || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {vista === 'noches' && (
      <div className="card">
        <h2 className="card-title">Las próximas noches</h2>
        <p className="card-sub">
          El precio sale solo del cálculo. Si escribes uno a mano, <b>manda el tuyo</b>:
          el automático deja de tocarlo hasta que lo quites.
        </p>

        <div className="precios-tabla-scroll">
          <table className="precios-tabla">
            <thead>
              <tr>
                <th>Noche</th><th>Precio</th><th>Por qué</th><th>Fijar a mano</th>
              </tr>
            </thead>
            <tbody>
              {noches.map((n) => {
                const ov = hoja.overrides[n.d]
                const fijado = ov?.price != null
                return (
                  <tr key={n.d} className={fijado ? 'es-fijado' : n.we ? 'es-finde' : undefined}>
                    <td className="col-fecha">
                      {etiquetaFecha(n.d, n.w)}
                      {n.ev && <span className="precios-evento">{n.ev}</span>}
                    </td>
                    <td className="col-precio">
                      <b>{CHF(fijado ? ov!.price! : n.p)}</b>
                      {fijado && <span className="precios-tag">a mano</span>}
                    </td>
                    <td className="col-porque">{fijado ? (ov!.note ?? 'precio fijado a mano') : porQue(n)}</td>
                    <td className="col-fijar">
                      <input
                        type="number" inputMode="decimal" placeholder={String(Math.round(n.p))}
                        value={borrador[n.d] ?? ''} disabled={bloqueado || guardando === n.d}
                        onChange={(e) => setBorrador((b) => ({ ...b, [n.d]: e.target.value }))}
                        onKeyDown={(e) => { if (e.key === 'Enter') guardar(n.d) }}
                      />
                      <button
                        type="button" className="btn btn-primary btn-sm"
                        disabled={bloqueado || guardando === n.d || !(borrador[n.d] ?? '').trim()}
                        onClick={() => guardar(n.d)}
                      >
                        {guardando === n.d ? '…' : 'Fijar'}
                      </button>
                      {fijado && (
                        <button
                          type="button" className="btn btn-ghost btn-sm"
                          disabled={bloqueado || guardando === n.d}
                          onClick={() => guardar(n.d, true)}
                        >
                          Quitar
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {meses < 12 && (
          <button type="button" className="btn btn-ghost" onClick={() => setMeses((m) => m + 2)}>
            Ver dos meses más
          </button>
        )}
      </div>
      )}
    </>
  )
}
