import { NavLink, Outlet, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Avatar } from './Avatar'
import { IconCalendar, IconLogout, IconTasks, IconUser, IconUsers } from './Icons'
import './Layout.css'

const links = [
  { to: '/', label: 'Tareas', Icon: IconTasks, end: true },
  { to: '/calendario', label: 'Calendario', Icon: IconCalendar, end: false },
  { to: '/equipo', label: 'Equipo', Icon: IconUsers, end: false },
  { to: '/perfil', label: 'Perfil', Icon: IconUser, end: false },
]

export function Layout() {
  const { user, signOut, demoMode } = useAuth()

  return (
    <div className="layout">
      <aside className="sidebar">
        <Link to="/" className="brand">
          <span className="brand-logo">A</span>
          <span>Amonn</span>
        </Link>
        <nav className="side-nav">
          {links.map(({ to, label, Icon, end }) => (
            <NavLink key={to} to={to} end={end}
              className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>
              <Icon size={19} />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <Link to="/perfil" className="user-chip">
            <Avatar profile={user} size={36} />
            <div className="truncate">
              <div className="name truncate">{user?.full_name ?? 'Usuario'}</div>
              <div className="muted" style={{ fontSize: 12 }}>Ver mi perfil</div>
            </div>
          </Link>
          <button className="btn btn-ghost btn-sm btn-block" onClick={() => signOut()}>
            <IconLogout size={16} /> Cerrar sesión
          </button>
        </div>
      </aside>

      <header className="topbar">
        <Link to="/" className="brand">
          <span className="brand-logo">A</span>
          <span>Amonn</span>
        </Link>
        <Link to="/perfil" aria-label="Mi perfil">
          <Avatar profile={user} size={34} />
        </Link>
      </header>

      <main className="content">
        {demoMode && (
          <div className="demo-banner">
            Modo demostración: los datos solo se guardan en este navegador.
          </div>
        )}
        <Outlet />
      </main>

      <nav className="mobile-nav">
        {links.map(({ to, label, Icon, end }) => (
          <NavLink key={to} to={to} end={end}
            className={({ isActive }) => (isActive ? 'active' : '')}>
            <span className="tab-icon"><Icon size={22} /></span>
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
