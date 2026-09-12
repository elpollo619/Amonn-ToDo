import { useMemo, useState } from 'react'
import { useData } from '../context/DataContext'
import { Avatar } from '../components/Avatar'
import { TaskModal } from '../components/TaskModal'
import { IconChevronLeft, IconChevronRight } from '../components/Icons'
import { todayKey, parseDay, diasDeTrabajo } from '../lib/dates'
import {
  diasLaborables, lunesDe, colocarBarras, carriles, claseBarra, type Dia,
} from '../lib/timeline'
import type { Profile, Task } from '../lib/types'
import './Timeline.css'

const ALTO_CARRIL = 34
const HUECO_CARRIL = 6

function sumaSemanas(key: string, n: number): string {
  const d = parseDay(key)
  d.setDate(d.getDate() + n * 7)
  const p = (x: number) => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

const MES = new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' })

// `text-transform: capitalize` pondría "Agosto De 2026", que en español está mal.
const conMayuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export function Timeline() {
  const { tasks, profiles, loading } = useData()
  const hoy = todayKey()
  const [lunes, setLunes] = useState(() => lunesDe(hoy))
  const [semanas, setSemanas] = useState(2)
  const [abierta, setAbierta] = useState<Task | null>(null)

  const dias = useMemo(() => diasLaborables(lunes, semanas, hoy), [lunes, semanas, hoy])
  const indiceHoy = useMemo(() => dias.findIndex((d) => d.esHoy), [dias])

  const abiertas = useMemo(() => tasks.filter((t) => t.status !== 'done'), [tasks])

  // Una fila por persona, más una para lo que no tiene responsable (que es
  // justo lo que suele quedarse olvidado).
  const filas = useMemo(() => {
    const conPersona = profiles.map((p) => ({
      persona: p as Profile | null,
      barras: colocarBarras(abiertas.filter((t) => t.assignee_id === p.id), dias),
    }))
    const huerfanas = colocarBarras(abiertas.filter((t) => !t.assignee_id), dias)
    const todas = huerfanas.length > 0
      ? [...conPersona, { persona: null, barras: huerfanas }]
      : conPersona
    return todas
  }, [abiertas, profiles, dias])

  // Tareas abiertas que no salen en la línea porque no tienen fecha de fin.
  const sinFecha = useMemo(() => abiertas.filter((t) => !t.due_date), [abiertas])

  const titulo = useMemo(() => {
    const inicio = MES.format(parseDay(dias[0].key))
    const fin = MES.format(parseDay(dias[dias.length - 1].key))
    return conMayuscula(inicio === fin ? inicio : `${inicio} – ${fin}`)
  }, [dias])

  return (
    <div className="linea">
      <div className="linea-cab">
        <div>
          <h1>Línea de tiempo</h1>
          <p className="hint">Quién está ocupado y hasta cuándo. Toca una barra para abrir la tarea.</p>
        </div>
        <div className="linea-nav">
          <button className="btn btn-ghost btn-icon btn-sm" aria-label="Semanas anteriores"
            onClick={() => setLunes((l) => sumaSemanas(l, -semanas))}>
            <IconChevronLeft size={18} />
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => setLunes(lunesDe(hoy))}>Hoy</button>
          <button className="btn btn-ghost btn-icon btn-sm" aria-label="Semanas siguientes"
            onClick={() => setLunes((l) => sumaSemanas(l, semanas))}>
            <IconChevronRight size={18} />
          </button>
          <div className="segmented linea-rango">
            {[2, 4].map((n) => (
              <button key={n} className={semanas === n ? 'active' : ''} onClick={() => setSemanas(n)}>
                {n} sem.
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="linea-mes">{titulo}</div>

      <div className="linea-scroll">
        <div className="linea-tabla" style={{ minWidth: 168 + dias.length * 82 }}>
          <div className="linea-fila linea-dias">
            <div className="linea-persona" />
            <div className="linea-cuerpo" style={{ gridTemplateColumns: `repeat(${dias.length}, minmax(0, 1fr))` }}>
              {dias.map((d) => (
                <DiaCabecera key={d.key} dia={d} />
              ))}
            </div>
          </div>

          {loading && abiertas.length === 0 && <div className="skeleton" style={{ height: 120 }} />}

          {filas.map(({ persona, barras }) => {
            const n = carriles(barras)
            const dias_ = barras.reduce((s, b) => s + (diasDeTrabajo(b.task) || 1), 0)
            return (
              <div className="linea-fila" key={persona?.id ?? 'sin-responsable'}>
                <div className="linea-persona">
                  {persona ? (
                    <>
                      <Avatar profile={persona} size={30} />
                      <div>
                        <div className="linea-nombre">{persona.full_name?.split(' ')[0]}</div>
                        <div className="linea-dias-txt">{dias_} d</div>
                      </div>
                    </>
                  ) : (
                    <div className="linea-nombre linea-huerfana">Sin responsable</div>
                  )}
                </div>
                <div
                  className="linea-cuerpo"
                  style={{
                    gridTemplateColumns: `repeat(${dias.length}, minmax(0, 1fr))`,
                    gridAutoRows: `${ALTO_CARRIL}px`,
                    rowGap: `${HUECO_CARRIL}px`,
                    minHeight: n * ALTO_CARRIL + (n - 1) * HUECO_CARRIL + 20,
                    backgroundSize: `${100 / dias.length}% 100%`,
                  }}
                >
                  {indiceHoy >= 0 && (
                    <span className="linea-hoy" aria-hidden="true"
                      style={{ left: `${(indiceHoy * 100) / dias.length}%` }} />
                  )}
                  {barras.map((b) => (
                    <button
                      key={b.task.id}
                      className={`barra b-${claseBarra(b.task, hoy)}${b.cortadaIzquierda ? ' corte-izq' : ''}${b.cortadaDerecha ? ' corte-der' : ''}`}
                      style={{ gridColumn: `${b.col} / span ${b.span}`, gridRow: b.carril + 1 }}
                      onClick={() => setAbierta(b.task)}
                      title={b.task.title}
                    >
                      <span className="barra-txt">{b.task.title}</span>
                      {Number(b.task.subtasks_total) > 0 && (
                        <span className="barra-pasos">{b.task.subtasks_done}/{b.task.subtasks_total}</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="linea-pie">
        <span className="leyenda"><i className="b-vencida" /> Vencida</span>
        <span className="leyenda"><i className="b-marcha" /> En marcha</span>
        <span className="leyenda"><i className="b-plan" /> Planificada</span>
        <span className="hint linea-hoy-nota">La columna marcada es hoy.</span>
      </div>

      {sinFecha.length > 0 && (
        <div className="linea-sinfecha">
          <b>{sinFecha.length} tarea{sinFecha.length === 1 ? '' : 's'} sin fecha de fin</b> no
          aparece{sinFecha.length === 1 ? '' : 'n'} aquí:{' '}
          {sinFecha.slice(0, 4).map((t) => (
            <button key={t.id} className="enlace" onClick={() => setAbierta(t)}>{t.title}</button>
          ))}
          {sinFecha.length > 4 && ` y ${sinFecha.length - 4} más`}
        </div>
      )}

      {abierta && <TaskModal task={abierta} onClose={() => setAbierta(null)} />}
    </div>
  )
}

function DiaCabecera({ dia }: { dia: Dia }) {
  return (
    <div className={'linea-dia' + (dia.esHoy ? ' es-hoy' : '') + (dia.inicioSemana ? ' semana' : '')}>
      <div className="linea-dow">{dia.dow}</div>
      <div className="linea-num">{dia.num}</div>
    </div>
  )
}
