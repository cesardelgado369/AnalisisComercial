import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { ApiError, ESTA_APP, api, onSinPermiso } from '../api/client'
import type { Rol, SesionApp } from '../api/types'
import { LoadingDefault } from '../components/loading/LoadingDefault'
import { LogoApp } from '../images/LogoApp'
import { useAuth } from './AuthContext'

const Contexto = createContext<SesionApp | null>(null)

/** Nombre del rol para mostrar (cabecera, perfil). */
export const NOMBRE_ROL: Record<Rol, string> = { admin: 'Administrador', supervisor: 'Supervisor', operario: 'Vendedor' }

/**
 * Después del login de la plataforma: `GET /api/sesion` dice con qué rol entra la persona **en esta app** (admin,
 * supervisor u operario) y su vendedor. Hasta tenerlo no se muestra nada: el menú y los controles dependen de eso.
 * Sin el módulo en su empresa, o sin acceso cargado en Administración (403), lo dice en una pantalla sola, con
 * el texto que manda el backend.
 */
export function ConSesionApp() {
  const { usuario, salir } = useAuth()
  const tieneModulo = !!usuario?.esSuperAdmin || !!usuario?.modulos?.some((m) => m.codigo === ESTA_APP)
  const [datos, setDatos] = useState<SesionApp | null>(null)
  const [error, setError] = useState<{ mensajes: string[]; sinAcceso: boolean } | null>(null)
  const [intento, setIntento] = useState(0)
  const cargada = useRef(false)

  // Un 403 de la API con la sesión abierta (le sacaron el acceso o le cambiaron el rol): se vuelve a pedir la sesión
  useEffect(() => onSinPermiso(() => setIntento((i) => i + 1)), [])

  useEffect(() => {
    if (!tieneModulo) return
    let vigente = true
    api
      .get<SesionApp>('/sesion')
      .then((s) => {
        if (!vigente) return
        cargada.current = true
        setDatos(s)
      })
      .catch((e: unknown) => {
        if (!vigente) return
        const sinAcceso = e instanceof ApiError && e.status === 403
        // Volviendo a pedirla con la app abierta, un corte de red no saca a nadie: se sigue con lo que había
        if (cargada.current && !sinAcceso) return
        const legible = e instanceof ApiError && e.status >= 400 && e.status < 500
        setError({ mensajes: legible ? e.mensajes : ['No pudimos saber con qué usuario entrás. Probá de nuevo.'], sinAcceso })
      })
    return () => {
      vigente = false
    }
  }, [tieneModulo, intento])

  if (!tieneModulo) {
    return <SinAcceso mensaje={`${usuario?.empresa ?? 'Tu empresa'} no tiene habilitado Análisis Comercial. Pedíselo a Vignoli Consultora.`} onSalir={salir} />
  }
  if (error) {
    // Sin acceso (403) no se ofrece reintentar: hasta que el admin lo cargue, la respuesta va a ser la misma.
    const reintentar = () => {
      setError(null)
      setIntento((i) => i + 1)
    }
    return <SinAcceso mensaje={error.mensajes.join(' ')} onReintentar={error.sinAcceso ? undefined : reintentar} onSalir={salir} />
  }
  if (!datos) return <LoadingDefault texto="Entrando…" />
  return (
    <Contexto.Provider value={datos}>
      <Outlet />
    </Contexto.Provider>
  )
}

function SinAcceso({ mensaje, onReintentar, onSalir }: { mensaje: string; onReintentar?: () => void; onSalir: () => Promise<void> }) {
  return (
    <main className="sin-acceso">
      <div className="sin-acceso-caja">
        <LogoApp oscuro className="logo-app" />
        <p className="aviso-bloque" role="alert">
          <span className="icono" aria-hidden>error</span>
          <span>{mensaje}</span>
        </p>
        <div className="sin-acceso-botones">
          {onReintentar && (
            <button type="button" className="btn btn-acento" onClick={onReintentar}>
              <span className="icono icono-chico" aria-hidden>refresh</span>
              Probar de nuevo
            </button>
          )}
          <button type="button" className="btn" onClick={() => void onSalir()}>
            <span className="icono icono-chico" aria-hidden>logout</span>
            Salir
          </button>
        </div>
      </div>
    </main>
  )
}

export function useSesionApp() {
  const ctx = useContext(Contexto)
  if (!ctx) throw new Error('useSesionApp fuera de ConSesionApp')
  return ctx
}

/**
 * Rutas que solo ven algunos roles (Resumen: admin y supervisor; Administración: admin). Si alguien llega por URL,
 * vuelve a Cobertura. Es solo para no mostrar la pantalla: **el que filtra los datos es el backend** (403).
 */
export function SoloRoles({ roles }: { roles: Rol[] }) {
  const { rol } = useSesionApp()
  return roles.includes(rol) ? <Outlet /> : <Navigate to="/" replace />
}
