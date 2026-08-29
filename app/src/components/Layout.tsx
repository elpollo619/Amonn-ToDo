import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Avatar } from './Avatar'
import './Layout.css'

const links = [
  { to: '/', label: 'Tareas', icon: '📋', end: true },
  { to: '/calendario', label: 'Calendario', icon: '📅', end: false },
  { to: '/equipo', label: 'Equipo', icon: '👥', end: false },
  { to: '/perfil', label: 'Mi perfil', icon: '⚙️', end: false },
]

export function Layout() {
  const { user, signOut, demoMode } = useAuth()

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-logo">A</span>
          Amonn
        </div>
        <nav style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.end}
              className={({ isActive }) =>
                'nav-link' + (isActive ? ' active' : '')
              }
            >
              <span className="nav-icon">{l.icon}</span>
              {l.label}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="user-chip">
            <Avatar profile={user} size={34} />
            <div style={{ overflow: 'hidden', flex: 1 }}>
              <div className="name">{user?.full_name ?? 'Usuario'}</div>
            </div>
          </div>
          <button
            className="btn btn-ghost btn-sm"
            style={{ width: '100%', marginTop: 6, justifyContent: 'center' }}
            onClick={() => signOut()}
          >
            Cerrar sesión
          </button>
        </div>
      </aside>

      <main className="content">
        {demoMode && (
          <div className="demo-banner" style={{ borderRadius: 8, marginBottom: 18 }}>
            🧪 Modo demostración — los datos se guardan solo en este navegador.
            Configura Supabase para compartir con el equipo.
          </div>
        )}
        <Outlet />
      </main>

      <nav className="mobile-nav">
        {links.map((l) => (
          <NavLink
            key={l.to}
            to={l.to}
            end={l.end}
            className={({ isActive }) => (isActive ? 'active' : '')}
          >
            <span className="nav-icon">{l.icon}</span>
            {l.label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
