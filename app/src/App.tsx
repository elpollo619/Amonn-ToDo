import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { DataProvider } from './context/DataContext'
import { ToastProvider } from './context/ToastContext'
import { Layout } from './components/Layout'
import { Login } from './pages/Login'
import { Today } from './pages/Today'
import { Board } from './pages/Board'
import { Timeline } from './pages/Timeline'
import { Calendar } from './pages/Calendar'
import { Team } from './pages/Team'
import { Profile } from './pages/Profile'
import { Precios } from './pages/Precios'

function AppRoutes() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="center-screen">
        <div className="spinner" />
      </div>
    )
  }

  if (!user) return <Login />

  return (
    <DataProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Today />} />
          <Route path="tablero" element={<Board />} />
          <Route path="tiempo" element={<Timeline />} />
          <Route path="calendario" element={<Calendar />} />
          <Route path="equipo" element={<Team />} />
          <Route path="precios" element={<Precios />} />
          <Route path="perfil" element={<Profile />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </DataProvider>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  )
}
