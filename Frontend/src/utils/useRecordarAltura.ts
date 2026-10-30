import { useEffect, useLayoutEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'

/**
 * Volver de la ficha con Atrás: la lista vuelve a la misma altura (los datos salen del caché de useConsulta). Se guarda
 * la última altura conocida de esta entrada del historial (al salir, la página nueva ya es más corta y el navegador la
 * recorta) y se restaura una sola vez, cuando la lista ya tiene sus datos (`listo`).
 */
export function useRecordarAltura(listo: boolean) {
  const { key } = useLocation()
  useEffect(() => {
    let y = window.scrollY
    const alDesplazar = () => {
      y = window.scrollY
    }
    window.addEventListener('scroll', alDesplazar, { passive: true })
    return () => {
      window.removeEventListener('scroll', alDesplazar)
      try {
        sessionStorage.setItem(`analisis.scroll:${key}`, String(y))
      } catch {
        /* sin almacenamiento: se vuelve arriba */
      }
    }
  }, [key])

  const restaurado = useRef(false)
  useLayoutEffect(() => {
    if (restaurado.current || !listo) return
    restaurado.current = true
    try {
      const y = Number(sessionStorage.getItem(`analisis.scroll:${key}`))
      if (y > 0) window.scrollTo(0, y)
    } catch {
      /* sin almacenamiento: se queda arriba */
    }
  }, [listo, key])
}
