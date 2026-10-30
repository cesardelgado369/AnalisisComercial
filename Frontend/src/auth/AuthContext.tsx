import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { ESTA_APP, auth, onSesionExpirada, sesionCompartida } from '../api/client'
import { guardarSesion, leerSesion, marcarIngreso } from '../api/sesion'
import type { LoginResponse, Usuario } from '../api/types'
import { limpiarCacheConsultas } from '../api/useConsulta'

/**
 * La sesión de la plataforma (quién es la persona). El rol **en esta app** (admin, supervisor u operario) y su vendedor
 * no vienen acá: los da `GET /api/sesion` (ver `SesionApp.tsx`).
 */
interface AuthValor {
  usuario: Usuario | null
  /** Mientras se pregunta a la plataforma si este navegador tiene una sesión de esta app abierta (su cookie). */
  comprobando: boolean
  /** `recordar`: la sesión sobrevive a cerrar el navegador. */
  ingresar: (email: string, password: string, recordar: boolean) => Promise<void>
  salir: () => Promise<void>
  /** Tras editar el perfil: actualiza el usuario de la sesión guardada (nombre en la cabecera, etc.). */
  actualizarUsuario: (usuario: Usuario) => void
}

const AuthContext = createContext<AuthValor | null>(null)

export { ESTA_APP }

/**
 * La sesión puede venir de una empresa sin Análisis Comercial (p. ej. la cuenta `admin` entra por Vignoli, o se llega
 * desde otra aplicación). Si es así, se pasa a la primera empresa del usuario que lo tiene
 * (`POST /auth/empresa { slug }`, sin contraseña). Si no lo tiene en ninguna, queda como está y `SesionApp` lo avisa.
 */
async function conEmpresaDeLaApp(sesion: LoginResponse, recordar?: boolean): Promise<LoginResponse> {
  guardarSesion(sesion, recordar)
  if (sesion.usuario.modulos?.some((m) => m.codigo === ESTA_APP)) return sesion
  const slug = sesion.usuario.aplicaciones?.find((a) => a.codigo === ESTA_APP)?.empresas[0]?.slug
  if (!slug) return sesion
  const otra = await auth.post<LoginResponse>('/auth/empresa', { slug })
  guardarSesion(otra, recordar)
  return otra
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(() => leerSesion()?.usuario ?? null)
  // Sin sesión guardada, antes de mandar al login se pregunta si la cookie de esta app tiene una abierta.
  const [comprobando, setComprobando] = useState(() => !leerSesion())

  useEffect(
    () =>
      onSesionExpirada(() => {
        limpiarCacheConsultas()
        setUsuario(null)
      }),
    [],
  )

  useEffect(() => {
    if (!comprobando) return
    let vigente = true
    sesionCompartida()
      .then(async (sesion) => {
        if (!vigente || !sesion) return
        const propia = await conEmpresaDeLaApp(sesion)
        if (vigente) setUsuario(propia.usuario)
      })
      .catch(() => guardarSesion(null)) // no se pudo pasar a la empresa: se pide login
      .finally(() => vigente && setComprobando(false))
    return () => {
      vigente = false
    }
    // Solo al abrir la aplicación.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const ingresar = useCallback(async (email: string, password: string, recordar: boolean) => {
    const login = await auth.post<LoginResponse>('/auth/login', { email, password })
    let sesion: LoginResponse
    try {
      sesion = await conEmpresaDeLaApp(login, recordar)
    } catch (e) {
      guardarSesion(null) // no se pudo pasar a la empresa: no queda nada guardado (p. ej. en una PC compartida)
      throw e
    }
    limpiarCacheConsultas() // nunca se muestra lo que quedó de otra persona
    marcarIngreso() // para que el layout haga la animación de entrada una sola vez
    setUsuario(sesion.usuario)
  }, [])

  const salir = useCallback(async () => {
    const sesion = leerSesion()
    try {
      if (sesion) await auth.post('/auth/logout', { refreshToken: sesion.refreshToken })
    } catch {
      /* si falla el logout en el servidor, igual se cierra acá */
    }
    guardarSesion(null)
    limpiarCacheConsultas()
    setUsuario(null)
  }, [])

  const actualizarUsuario = useCallback((u: Usuario) => {
    const sesion = leerSesion()
    if (sesion) guardarSesion({ ...sesion, usuario: u })
    setUsuario(u)
  }, [])

  const valor = useMemo(
    () => ({ usuario, comprobando, ingresar, salir, actualizarUsuario }),
    [usuario, comprobando, ingresar, salir, actualizarUsuario],
  )
  return <AuthContext.Provider value={valor}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth fuera de AuthProvider')
  return ctx
}
