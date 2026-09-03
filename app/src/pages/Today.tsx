import { useMemo, useState, type FormEvent } from 'react'
import { useData } from '../context/DataContext'
import { useToast } from '../context/ToastContext'
import { Avatar } from '../components/Avatar'
import { TaskModal } from '../components/TaskModal'
import { IconPlus } from '../components/Icons'
import { analizar } from '../lib/quickAdd'
import { cuboDe, describeRange, diasDeTrabajo, type Cubo } from '../lib/dates'
import type { Task } from '../lib/types'
import './Today.css'

// La pantalla se estructura por URGENCIA, no por estado. Es el cambio de
// fondo del rediseño: al abrir la app la primera pregunta que se responde es
// "¿qué toca?", no "¿en qué fase está cada cosa?".
const GRUPOS: { cubo: Cubo; titulo: string; clase: string }[] = [
  { cubo: 'vencida', titulo: 'Vencidas', clase: 'g-vencida' },
  { cubo: 'hoy', titulo: 'Hoy', clase: 'g-hoy' },
  { cubo: 'semana', titulo: 'Esta semana', clase: 'g-semana' },
  { cubo: 'despues', titulo: 'Más adelante', clase: 'g-despues' },
  { cubo: 'sin_fecha', titulo: 'Sin fecha', clase: 'g-despues' },
]

const HOY_LARGO = new Intl.DateTimeFormat('es-ES', {
  weekday: 'long', day: 'numeric', month: 'long',
})

// Solo la primera letra en mayúscula. `text-transform: capitalize` de CSS
// pondría "Jueves, 3 De Septiembre", que en español está mal.
function conMayusculaInicial(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function Today() {
  const { tasks, profiles, addTask, editTask, loading } = useData()
  const { show } = useToast()
  const [linea, setLinea] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [abierta, setAbierta] = useState<Task | null>(null)
  const [nueva, setNueva] = useState(false)

  const abiertas = useMemo(() => tasks.filter((t) => t.status !== 'done'), [tasks])

  const porGrupo = useMemo(() => {
    const mapa = new Map<Cubo, Task[]>()
    for (const t of abiertas) {
      const c = cuboDe(t)
      const lista = mapa.get(c) ?? []
      lista.push(t)
      mapa.set(c, lista)
    }
    return mapa
  }, [abiertas])

  // La carga se mide en DÍAS DE TRABAJO, no en número de tareas: siete tareas
  // de media hora no son lo mismo que siete de dos días.
  const carga = useMemo(() => {
    const filas = profiles.map((p) => {
      const suyas = abiertas.filter((t) => t.assignee_id === p.id)
      const dias = (c: Cubo) =>
        suyas.filter((t) => cuboDe(t) === c).reduce((n, t) => n + (diasDeTrabajo(t) || 1), 0)
      const vencidas = dias('vencida')
      const hoy = dias('hoy')
      const total = suyas.reduce((n, t) => n + (diasDeTrabajo(t) || 1), 0)
      return { persona: p, vencidas, hoy, resto: total - vencidas - hoy, total, tareas: suyas.length }
    })
    const tope = Math.max(5, ...filas.map((f) => f.total))
    return { filas: filas.sort((a, b) => b.total - a.total), tope }
  }, [abiertas, profiles])

  const sugerencia = useMemo(() => {
    const cargados = carga.filas.filter((f) => f.total > 0)
    if (cargados.length < 2) return null
    const [mas, ...resto] = cargados
    const menos = resto[resto.length - 1]
    if (mas.total < menos.total * 2 || mas.total < 4) return null
    return { mas, menos }
  }, [carga])

  const analisis = useMemo(() => analizar(linea, profiles), [linea, profiles])

  async function crear(e: FormEvent) {
    e.preventDefault()
    if (!analisis.input.title.trim() || guardando) return
    setGuardando(true)
    try {
      await addTask(analisis.input)
      setLinea('')
      show('Tarea creada', 'success')
    } catch (err) {
      show(err instanceof Error ? err.message : 'No se pudo crear', 'error')
    } finally {
      setGuardando(false)
    }
  }

  const cuenta = (c: Cubo) => porGrupo.get(c)?.length ?? 0

  return (
    <div className="hoy">
      <div className="hoy-principal">
        <h1 className="hoy-fecha">{conMayusculaInicial(HOY_LARGO.format(new Date()))}</h1>

        <div className="cifras">
          <div className={`cifra${cuenta('vencida') > 0 ? ' c-vencida' : ''}`}>
            <span className="cifra-num">{cuenta('vencida')}</span>
            <span className="cifra-txt">vencidas</span>
          </div>
          <div className={`cifra${cuenta('hoy') > 0 ? ' c-hoy' : ''}`}>
            <span className="cifra-num">{cuenta('hoy')}</span>
            <span className="cifra-txt">para hoy</span>
          </div>
          <div className="cifra">
            <span className="cifra-num">{cuenta('semana')}</span>
            <span className="cifra-txt">esta semana</span>
          </div>
        </div>

        <form className="anadir" onSubmit={crear}>
          <IconPlus size={19} />
          <input
            value={linea}
            onChange={(e) => setLinea(e.target.value)}
            placeholder="Revisar la caldera @Isma /lun-jue !"
            aria-label="Escribe una tarea y pulsa Enter"
          />
          {analisis.reconocido.persona && (
            <span className="pista pista-persona">{analisis.reconocido.persona}</span>
          )}
          {analisis.reconocido.plazo && (
            <span className="pista pista-plazo">{analisis.reconocido.plazo}</span>
          )}
          {analisis.reconocido.urgente && <span className="pista pista-urgente">urgente</span>}
          <button type="submit" className="tecla" disabled={!analisis.input.title.trim() || guardando}>
            Enter
          </button>
        </form>
        <p className="anadir-ayuda">
          <b>@</b> para la persona, <b>/</b> para el plazo (<code>/mañana</code>, <code>/lun-jue</code>),
          <b> !</b> si es urgente.
        </p>

        {loading && abiertas.length === 0 && <div className="spinner" />}

        {!loading && abiertas.length === 0 && (
          <div className="vacio">Nada pendiente. 🎉</div>
        )}

        {GRUPOS.map(({ cubo, titulo, clase }) => {
          const lista = porGrupo.get(cubo) ?? []
          if (lista.length === 0) return null
          return (
            <section key={cubo} className={`grupo ${clase}`}>
              <header className="grupo-cab">
                <span className="punto" />
                <h2>{titulo}</h2>
                <span className="grupo-n">{lista.length}</span>
              </header>
              {lista.map((t) => (
                <FilaTarea key={t.id} task={t} onAbrir={setAbierta} onHecha={editTask} />
              ))}
            </section>
          )
        })}
      </div>

      <aside className="carga">
        <h2 className="carga-titulo">Carga del equipo</h2>
        {carga.filas.map((f) => (
          <div key={f.persona.id} className="carga-fila">
            <div className="carga-cab">
              <Avatar profile={f.persona} size={26} />
              <span className="carga-nombre">{f.persona.full_name?.split(' ')[0]}</span>
              <span className="carga-dias">{f.total} d</span>
            </div>
            <div className="barra" role="img"
              aria-label={`${f.total} días de trabajo, ${f.vencidas} vencidos`}>
              <span className="b-venc" style={{ width: `${(f.vencidas / carga.tope) * 100}%` }} />
              <span className="b-hoy" style={{ width: `${(f.hoy / carga.tope) * 100}%` }} />
              <span className="b-resto" style={{ width: `${(f.resto / carga.tope) * 100}%` }} />
            </div>
            <div className="carga-pie">
              {f.tareas === 0 ? 'Sin tareas abiertas' : `${f.tareas} tarea${f.tareas === 1 ? '' : 's'}`}
              {f.vencidas > 0 && ` · ${f.vencidas} d vencidos`}
            </div>
          </div>
        ))}
        {sugerencia && (
          <div className="aviso-carga">
            <b>{sugerencia.mas.persona.full_name?.split(' ')[0]} va cargado</b>
            <span>
              {sugerencia.mas.total} días de trabajo frente a {sugerencia.menos.total} de{' '}
              {sugerencia.menos.persona.full_name?.split(' ')[0]}.
            </span>
          </div>
        )}
      </aside>

      <button className="fab" onClick={() => setNueva(true)} aria-label="Nueva tarea con todos los campos">
        <IconPlus size={22} />
      </button>

      {(abierta || nueva) && (
        <TaskModal task={abierta} onClose={() => { setAbierta(null); setNueva(false) }} />
      )}
    </div>
  )
}

function FilaTarea({
  task, onAbrir, onHecha,
}: {
  task: Task
  onAbrir: (t: Task) => void
  onHecha: (id: string, patch: Partial<Task>) => Promise<void>
}) {
  const { profileById } = useData()
  const asignada = profileById(task.assignee_id)
  const plazo = describeRange(task.start_date, task.due_date)
  return (
    <article className="fila" onClick={() => onAbrir(task)}>
      <button
        className="marcar"
        aria-label={`Marcar "${task.title}" como hecha`}
        onClick={(e) => { e.stopPropagation(); void onHecha(task.id, { status: 'done' }) }}
      />
      <div className="fila-txt">
        <div className="fila-titulo">
          {task.title}
          {task.priority === 'high' && <span className="chip-urgente">urgente</span>}
          {/* Solo los estados propios: enseñar "Abierta" en cada línea no
              aportaría nada. */}
          {task.state_name && !task.state_is_default && (
            <span className={`chip-estado-min color-${task.state_color ?? 'slate'}`}>
              {task.state_name}
            </span>
          )}
        </div>
        <div className="fila-pie">
          <span className={plazo.overdue ? 'plazo-vencido' : plazo.today ? 'plazo-hoy' : ''}>
            {plazo.label}
          </span>
          {diasDeTrabajo(task) > 0 && <span className="fila-dias">{diasDeTrabajo(task)} d</span>}
        </div>
      </div>
      {asignada && <Avatar profile={asignada} size={26} />}
    </article>
  )
}
