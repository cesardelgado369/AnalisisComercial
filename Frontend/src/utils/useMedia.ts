import { useCallback, useSyncExternalStore } from 'react'

/** Si se cumple una media query (p. ej. `(max-width: 767px)`), y se actualiza al cambiar el tamaño de la ventana. */
export function useMedia(consulta: string) {
  const suscribir = useCallback(
    (avisar: () => void) => {
      const m = window.matchMedia(consulta)
      m.addEventListener('change', avisar)
      return () => m.removeEventListener('change', avisar)
    },
    [consulta],
  )
  return useSyncExternalStore(suscribir, () => window.matchMedia(consulta).matches)
}
