import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useData } from '../context/DataContext'
import { Avatar } from '../components/Avatar'
import { IconAlert, IconChevronRight, IconUsers, IconWhatsApp } from '../components/Icons'
import { todayKey } from '../lib/dates'
import './Team.css'

export function Team() {
  const { profiles, tasks } = useData()

  const stats = useMemo(() => {
    const today = todayKey()
    const map = new Map<string, { open: number; overdue: number; done: number }>()
    for (const t of tasks) {
      if (!t.assignee_id) continue
      const s = map.get(t.assignee_id) ?? { open: 0, overdue: 0, done: 0 }
      if (t.status === 'done') s.done++
      else { s.open++; if (t.due_date && t.due_date < today) s.overdue++ }
      map.set(t.assignee_id, s)
    }
    return map
  }, [tasks])

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Equipo</h1>
          <div className="subtitle">{profiles.length} persona{profiles.length === 1 ? '' : 's'}. Toca a alguien para ver sus tareas.</div>
        </div>
      </div>

      {profiles.length === 0 ? (
        <div className="empty">
          <div className="empty-icon"><IconUsers size={30} /></div>
          <h3>Todavía no hay nadie</h3>
          <p>Cada persona se registra con su email y aparece aquí automáticamente.</p>
        </div>
      ) : (
        <div className="team-grid">
          {profiles.map((p) => {
            const s = stats.get(p.id) ?? { open: 0, overdue: 0, done: 0 }
            const total = s.open + s.done
            const pct = total === 0 ? 0 : Math.round((s.done / total) * 100)
            return (
              <Link key={p.id} to={`/?persona=${p.id}`} className="person-card">
                <Avatar profile={p} size={48} />
                <div className="person-main">
                  <div className="person-name truncate">{p.full_name ?? 'Sin nombre'}</div>
                  {p.phone ? (
                    <div className="person-phone"><IconWhatsApp size={14} /> {p.phone}</div>
                  ) : (
                    <div className="person-phone warn"><IconAlert size={14} /> Sin teléfono: no recibirá avisos</div>
                  )}
                  <div className="person-stats">
                    <span className="chip chip-primary">{s.open} abierta{s.open === 1 ? '' : 's'}</span>
                    {s.overdue > 0 && <span className="chip chip-danger">{s.overdue} vencida{s.overdue === 1 ? '' : 's'}</span>}
                    {s.done > 0 && <span className="chip chip-done">{s.done} hecha{s.done === 1 ? '' : 's'}</span>}
                  </div>
                  <div className="progress" aria-label={`${pct}% completado`}>
                    <span style={{ width: `${pct}%` }} />
                  </div>
                </div>
                <IconChevronRight size={18} className="person-arrow" />
              </Link>
            )
          })}
        </div>
      )}
    </>
  )
}
