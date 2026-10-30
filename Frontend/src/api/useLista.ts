import { useCallback, useEffect, useState } from 'react'
import { ApiError, api } from './client'

/** GET de una lista, recargando cuando cambia la ruta o al llamar a `recargar`. */
export function useLista<T>(ruta: string, mensajeError: string) {
  const [datos, setDatos] = useState<T[] | null>(null)
  const [errores, setErrores] = useState<string[]>([])
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let vigente = true
    setErrores([])
    api
      .get<T[]>(ruta)
      .then((r) => vigente && setDatos(r))
      .catch((e: unknown) => vigente && setErrores(e instanceof ApiError ? e.mensajes : [mensajeError]))
    return () => {
      vigente = false
    }
  }, [ruta, mensajeError, version])

  const recargar = useCallback(() => setVersion((v) => v + 1), [])
  return { datos, errores, recargar }
}
