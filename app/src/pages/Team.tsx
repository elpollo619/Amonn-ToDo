import { useMemo } from 'react'
import { useData } from '../context/DataContext'
import { Avatar } from '../components/Avatar'

export function Team() {
  const { profiles, tasks } = useData()

  const openCounts = useMemo(() => {
    const map = new Map<string, number>()
    for (const t of tasks) {
      if (t.status === 'done' || !t.assignee_id) continue
      map.set(t.assignee_id, (map.get(t.assignee_id) ?? 0) + 1)
    }
    return map
  }, [tasks])

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Equipo</h1>
          <div className="subtitle">
            Personas de la empresa y sus tareas abiertas. El teléfono se usa
            para los avisos de WhatsApp.
          </div>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gap: 12,
          gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
        }}
      >
        {profiles.map((p) => (
          <div
            key={p.id}
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              padding: 16,
              display: 'flex',
              gap: 13,
              alignItems: 'center',
              boxShadow: 'var(--shadow)',
            }}
          >
            <Avatar profile={p} size={46} />
            <div style={{ overflow: 'hidden' }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{p.full_name}</div>
              <div style={{ color: 'var(--text-soft)', fontSize: 13 }}>
                {p.phone ? `📱 ${p.phone}` : 'Sin teléfono'}
              </div>
              <div
                style={{
                  marginTop: 6,
                  fontSize: 12,
                  fontWeight: 600,
                  color: 'var(--primary)',
                }}
              >
                {openCounts.get(p.id) ?? 0} tareas abiertas
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
