import { useCallback, useEffect, useState } from 'react'
import { alCambiar } from './cambios'
import { ApiError, api } from './client'

/**
 * Última respuesta de cada consulta, en memoria (solo esta pestaña): al volver a una pantalla (p. ej. de la ficha a
 * Cobertura con Atrás) se pinta enseguida con lo último y se vuelve a pedir igual. Se vacía al entrar y al salir, así
 * nunca se ve lo de otra persona.
 */
const cache = new Map<string, unknown>()
const MAXIMO_CACHE = 40
/**
 * Cambia cada vez que se vacía el caché (entrar, salir): una respuesta que salió antes y llega después (con mala señal,
 * una consulta lenta) no se guarda, así el que entra después no ve lo de la sesión anterior.
 */
let generacion = 0

export function limpiarCacheConsultas() {
  generacion++
  cache.clear()
}

function guardarEnCache(clave: string, valor: unknown) {
  cache.delete(clave)
  cache.set(clave, valor)
  if (cache.size > MAXIMO_CACHE) cache.delete(cache.keys().next().value!)
}

type Cliente = { get: <R>(ruta: string) => Promise<R> }

/**
 * GET que devuelve un objeto; se repite al cambiar la ruta o al llamar a `recargar`. `null` = no consultar.
 * `cliente`: por defecto la API de Análisis Comercial; `auth` para lo de la sesión (login central).
 * Errores: los 4xx los redacta el backend y se muestran tal cual; sin conexión o con un error del servidor (5xx) va
 * `mensajeError`, el texto fijo de la pantalla (sin tecnicismos para el vendedor en la calle). `estadoError` es el
 * código HTTP del último error (p. ej. 404 = ese endpoint todavía no existe), y `recibidoEn` cuándo llegó lo último
 * de la API (sirve para saber si un cambio hecho en la pantalla ya está incluido en los datos).
 */
export function useConsulta<T>(ruta: string | null, mensajeError: string, cliente: Cliente = api) {
  const clave = ruta && `${cliente === api ? 'api' : 'auth'}:${ruta}`
  const [datos, setDatos] = useState<T | null>(() => (clave ? ((cache.get(clave) as T | undefined) ?? null) : null))
  const [errores, setErrores] = useState<string[]>([])
  const [estadoError, setEstadoError] = useState<number | null>(null)
  const [recibidoEn, setRecibidoEn] = useState(0)
  const [cargando, setCargando] = useState(false)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    if (!ruta || !clave) {
      setCargando(false)
      setDatos(null)
      setErrores([])
      setEstadoError(null)
      return
    }
    let vigente = true
    const gen = generacion
    const guardado = cache.get(clave) as T | undefined
    if (guardado !== undefined) setDatos(guardado)
    setCargando(true)
    setErrores([])
    setEstadoError(null)
    cliente
      .get<T>(ruta)
      .then((r) => {
        if (gen === generacion) guardarEnCache(clave, r)
        if (!vigente) return
        setDatos(r)
        setRecibidoEn(Date.now())
      })
      .catch((e: unknown) => {
        if (!vigente) return
        const legible = e instanceof ApiError && e.status >= 400 && e.status < 500
        setErrores(legible ? e.mensajes : [mensajeError])
        setEstadoError(e instanceof ApiError ? e.status : null)
      })
      .finally(() => vigente && setCargando(false))
    return () => {
      vigente = false
    }
  }, [ruta, clave, mensajeError, version, cliente])

  const recargar = useCallback(() => setVersion((v) => v + 1), [])
  // Si se guardó algo en cualquier lado, se vuelve a leer
  useEffect(() => alCambiar(recargar), [recargar])
  return { datos, errores, estadoError, recibidoEn, cargando, recargar }
}
