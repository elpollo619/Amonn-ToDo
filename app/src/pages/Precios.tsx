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
  // Lo que se está escribiendo en cada fila, sin guardar todavía.
  const [borrador, setBorrador] = useState<Record<string, string>>({})
  const [guardando, setGuardando] = useState<string | null>(null)

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

      {!hoja.puedeEditar && (
        <div className="card precios-aviso">
          Puedes mirar los precios, pero para cambiarlos hace falta el permiso
          <b> «dinero»</b>. Pídeselo a Cris por WhatsApp: «dale acceso al dinero a …».
        </div>
      )}
      {hoja.puedeEditar && !hoja.editable && (
        <div className="card precios-aviso">
          Falta configurar <b>PREISPILOT_PIN</b> en el servidor, así que de momento
          esta hoja es de solo lectura.
        </div>
      )}

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
    </>
  )
}
