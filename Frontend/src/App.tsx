import { lazy } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './auth/AuthContext'
import { RequireAuth } from './auth/RequireAuth'
import { ConSesionApp, SoloConBultos, SoloRoles } from './auth/SesionApp'
import { CoberturaPage } from './cobertura/CoberturaPage'
import { Layout } from './layout/Layout'
import { EnConstruccion } from './pages/EnConstruccion'
import { LoginPage } from './pages/LoginPage'
import {
  ClasificacionClientesPage,
  ClientesExcluidosPage,
  CuentasPage,
  DevolucionesPage,
  FichaPage,
  FocosPage,
  PerfilPage,
  SincronizacionPage,
  VolumenPage,
} from './rutas'

/** TODO testing: la vitrina solo existe en desarrollo (ni se baja en producción). */
const VitrinaPage = lazy(() => import('./pages/VitrinaPage').then((m) => ({ default: m.VitrinaPage })))

/**
 * Login de la plataforma → `GET /api/sesion` (rol en esta app) → layout. Las secciones y quién las ve salen de
 * CONTEXTO_FRONTEND.md y CONTRATO_API.md; hasta que cada una tenga pantalla, queda «en construcción». Cobertura (la
 * primera pantalla) viene en el paquete principal; el resto se baja aparte (`rutas.ts`).
 */
export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<RequireAuth />}>
            <Route element={<ConSesionApp />}>
              <Route element={<Layout />}>
                <Route index element={<CoberturaPage />} />
                <Route path="cliente/:id" element={<FichaPage />} />
                {/* El operario, por ahora, solo Cobertura y la ficha (`sesion.veBultos`, 30/10) */}
                <Route element={<SoloConBultos />}>
                  <Route path="volumen" element={<VolumenPage />} />
                  <Route path="devoluciones" element={<DevolucionesPage />} />
                </Route>
                {/* Mi ruta de hoy, oculta (29/10, pedido de Cesar) hasta que tenga pantalla: el link viejo va a Cobertura */}
                <Route path="mi-ruta" element={<Navigate to="/" replace />} />
                {/* El Tablero, oculto por ahora (30/10, pedido de Cesar): la pantalla queda en resumen/TableroPage */}
                <Route path="resumen" element={<Navigate to="/" replace />} />
                <Route path="admin" element={<SoloRoles roles={['admin']} />}>
                  <Route index element={<Navigate to="usuarios" replace />} />
                  <Route path="usuarios" element={<CuentasPage />} />
                  <Route path="exclusiones" element={<ClientesExcluidosPage />} />
                  <Route path="clasificacion" element={<ClasificacionClientesPage />} />
                  <Route path="focos" element={<FocosPage />} />
                  <Route path="sincronizacion" element={<SincronizacionPage />} />
                </Route>
                <Route path="perfil" element={<PerfilPage />} />
                {import.meta.env.DEV && <Route path="vitrina" element={<VitrinaPage />} />}
                <Route path="*" element={<EnConstruccion titulo="Página no encontrada" />} />
              </Route>
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
