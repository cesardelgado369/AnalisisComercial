import { guardarSesion, leerSesion } from './sesion'
import type { LoginResponse, ProblemaApi } from './types'

/** Código de esta aplicación en la plataforma (`modulos`, `aplicaciones` y `?aplicacion=`). TODO: confirmarlo con el backend. */
export const ESTA_APP = 'analisis-comercial'

const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? '/api'

/** Cuánto se espera una respuesta antes de avisar que la conexión está lenta (los vendedores andan con datos móviles). */
const ESPERA_PEDIDO = 25_000
const ESPERA_ARCHIVO = 60_000

/**
 * Cuentas de la plataforma (Vignoli.Plataforma): login, refresh, logout, perfil y contraseña, por `/plataforma`
 * (en desarrollo, el proxy de Vite; en producción, el nginx de la app).
 */
const BASE_AUTH = (import.meta.env.VITE_PLATAFORMA_URL as string | undefined) ?? '/plataforma/api'

/**
 * Análisis Comercial tiene **pantalla y sesión propias** con las mismas cuentas de la plataforma, como Mantenimiento y
 * CashFlow (logins independientes, decisión del usuario del 07/10/2026): las llamadas de sesión van con
 * `?aplicacion=analisis-comercial`.
 * TODO: a confirmar con la sesión del backend (se le propuso el 26/10). La plataforma tiene que sumar la app a
 * `AplicacionesConSesionPropia`, con su cookie y el módulo en `plataforma.Modulo` (hasta entonces respondería 400).
 */
const RUTAS_DE_SESION = /^\/auth\/(login|refresh|logout|empresa|cambiar-password)$/
const conAplicacion = (ruta: string) => (RUTAS_DE_SESION.test(ruta) ? `${ruta}?aplicacion=${ESTA_APP}` : ruta)

/**
 * Si el navegador tiene una sesión de esta app abierta (su cookie HttpOnly), la retoma sin pedir login: un
 * refresh sin cuerpo usa la cookie. Sin sesión, null.
 */
export async function sesionCompartida(): Promise<LoginResponse | null> {
  try {
    const r = await fetch(`${BASE_AUTH}${conAplicacion('/auth/refresh')}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
      credentials: 'include',
    })
    return r.ok ? ((await r.json()) as LoginResponse) : null
  } catch {
    return null
  }
}

export class ApiError extends Error {
  status: number
  errores: Record<string, string[]>

  constructor(status: number, problema: Partial<ProblemaApi>) {
    super(problema.title || `Error ${status}`)
    this.status = status
    this.errores = problema.errors ?? {}
  }

  /** Mensajes para mostrarle al usuario: los `errors` del backend o, si no hay, el título. */
  get mensajes(): string[] {
    const lista = Object.values(this.errores).flat()
    return lista.length ? lista : [this.message]
  }
}

/** Se dispara cuando la sesión venció y no se pudo renovar: el AuthContext vuelve al login. */
let alExpirar: () => void = () => {}
export function onSesionExpirada(fn: () => void) {
  alExpirar = fn
}

/**
 * Se dispara cuando la API de la app responde 403 (salvo `/sesion`): puede que le hayan sacado el acceso o cambiado el
 * rol con la sesión abierta. `SesionApp` vuelve a pedir `/api/sesion` para actualizar el menú o mostrar «sin acceso».
 */
let alNegar: () => void = () => {}
export function onSinPermiso(fn: () => void) {
  alNegar = fn
}

type Renovacion = 'ok' | 'vencida' | 'sin-conexion'
let renovando: Promise<Renovacion> | null = null

/**
 * Renueva el access token con el refresh. Distingue una sesión que ya no sirve (se vuelve al login) de un problema de
 * red o de la plataforma (5xx): ahí el refresh token sigue valiendo y no se lo borra (el vendedor en la calle con mala
 * señal no tiene que volver a escribir la contraseña).
 */
async function renovar(): Promise<Renovacion> {
  const sesion = leerSesion()
  if (!sesion) return 'vencida'
  renovando ??= (async (): Promise<Renovacion> => {
    try {
      const r = await fetch(`${BASE_AUTH}${conAplicacion('/auth/refresh')}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: sesion.refreshToken }),
      })
      if (r.status >= 500) return 'sin-conexion'
      if (!r.ok) return 'vencida'
      guardarSesion((await r.json()) as LoginResponse)
      return 'ok'
    } catch {
      return 'sin-conexion'
    } finally {
      renovando = null
    }
  })()
  return renovando
}

async function aError(r: Response, tituloPorDefecto?: string): Promise<ApiError> {
  let problema: Partial<ProblemaApi> = {}
  try {
    problema = (await r.json()) as ProblemaApi
  } catch {
    /* respuesta sin cuerpo JSON */
  }
  return new ApiError(r.status, { ...problema, title: problema.title || tituloPorDefecto })
}

async function pedir<T>(
  base: string,
  metodo: string,
  ruta: string,
  cuerpo?: unknown,
  reintento = true,
  comoArchivo = false,
): Promise<T> {
  const headers: Record<string, string> = {}
  const token = leerSesion()?.accessToken
  if (token) headers.Authorization = `Bearer ${token}`
  const esForm = cuerpo instanceof FormData
  if (cuerpo !== undefined && !esForm) headers['Content-Type'] = 'application/json'

  // En la calle la señal va y viene: un pedido que no contesta no puede quedar «cargando» para siempre
  const control = new AbortController()
  const limite = window.setTimeout(() => control.abort(), comoArchivo ? ESPERA_ARCHIVO : ESPERA_PEDIDO)
  let r: Response
  try {
    r = await fetch(`${base}${ruta}`, {
      method: metodo,
      headers,
      body: cuerpo === undefined ? undefined : esForm ? cuerpo : JSON.stringify(cuerpo),
      signal: control.signal,
    })
  } catch {
    throw new ApiError(0, {
      title: control.signal.aborted
        ? 'La conexión está muy lenta y el servidor no contestó. Probá de nuevo cuando tengas mejor señal.'
        : 'No hay conexión con el servidor. Revisá la señal y probá de nuevo.',
    })
  } finally {
    window.clearTimeout(limite)
  }

  if (r.status === 401 && token && reintento) {
    const renovacion = await renovar()
    if (renovacion === 'ok') return pedir<T>(base, metodo, ruta, cuerpo, false, comoArchivo)
    if (renovacion === 'sin-conexion') throw new ApiError(0, { title: 'No se pudo conectar con el servidor. Probá de nuevo en un momento.' })
    guardarSesion(null)
    alExpirar()
    throw new ApiError(401, { title: 'La sesión venció. Volvé a ingresar.' })
  }
  // El backend redacta el 403 («Todavía no tenés acceso a Análisis Comercial…», CONTRATO_API.md): se muestra tal cual.
  if (r.status === 403) {
    if (base === BASE && ruta !== '/sesion') alNegar()
    throw await aError(r, 'No tenés permiso para esta acción.')
  }
  if (!r.ok) throw await aError(r)
  if (r.status === 204) return undefined as T
  if (comoArchivo) return (await r.blob()) as T
  return (await r.json()) as T
}

/** La API de Análisis Comercial (todo lo que no es la sesión). TODO testing: todavía no existe. */
export const api = {
  get: <T>(ruta: string) => pedir<T>(BASE, 'GET', ruta),
  post: <T>(ruta: string, cuerpo?: unknown) => pedir<T>(BASE, 'POST', ruta, cuerpo),
  put: <T>(ruta: string, cuerpo?: unknown) => pedir<T>(BASE, 'PUT', ruta, cuerpo),
  borrar: <T>(ruta: string) => pedir<T>(BASE, 'DELETE', ruta),
  /** Un archivo (p. ej. una foto): la API pide el token en el encabezado, así que un `<img src>` directo no sirve. */
  archivo: (ruta: string) => pedir<Blob>(BASE, 'GET', ruta, undefined, true, true),
}

/** La sesión: `/auth/*` de la plataforma (ver `BASE_AUTH`); las de sesión llevan `?aplicacion=` solas. */
export const auth = {
  get: <T>(ruta: string) => pedir<T>(BASE_AUTH, 'GET', conAplicacion(ruta)),
  post: <T>(ruta: string, cuerpo?: unknown) => pedir<T>(BASE_AUTH, 'POST', conAplicacion(ruta), cuerpo),
  put: <T>(ruta: string, cuerpo?: unknown) => pedir<T>(BASE_AUTH, 'PUT', conAplicacion(ruta), cuerpo),
}
