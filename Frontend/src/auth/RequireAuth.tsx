import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { LoadingDefault } from '../components/loading/LoadingDefault'
import { useAuth } from './AuthContext'

export function RequireAuth() {
  const { usuario, comprobando } = useAuth()
  const location = useLocation()
  // Se espera a saber si la cookie de esta app tiene una sesión abierta antes de mandar al login.
  if (comprobando) return <LoadingDefault texto="Entrando…" />
  // Con los filtros de la URL: un link compartido (o una sesión vencida) vuelve a la misma vista después del login
  if (!usuario) return <Navigate to="/login" replace state={{ desde: location.pathname + location.search + location.hash }} />
  return <Outlet />
}
