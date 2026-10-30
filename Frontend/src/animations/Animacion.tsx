import { createElement, useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import './animacion.css'

export type EfectoAnimacion = 'deslizar-izquierda' | 'deslizar-arriba' | 'aparecer'

interface Props {
  /** Si el elemento se muestra. Al pasar a false, se anima la salida y después se desmonta. */
  visible: boolean
  efecto: EfectoAnimacion
  /** Milisegundos. Tiene que coincidir con cualquier transición que acompañe (p. ej. el margen del contenido). */
  duracion?: number
  /** Etiqueta a renderizar: así la animación se aplica al elemento real (p. ej. el `aside` del lateral). */
  as?: 'div' | 'aside' | 'section' | 'nav'
  className?: string
  style?: CSSProperties
  children: ReactNode
}

/**
 * Anima la entrada y salida de un elemento con transiciones CSS.
 * Si arranca visible, aparece sin animación (no se anima la carga de la página).
 * Respeta `prefers-reduced-motion`.
 */
export function Animacion({ visible, efecto, duracion = 220, as = 'div', className, style, children }: Props) {
  const [montado, setMontado] = useState(visible)
  const [activo, setActivo] = useState(visible)

  useEffect(() => {
    if (visible) {
      setMontado(true)
      // Dos frames: el primero pinta el estado inicial (oculto), el segundo dispara la transición.
      let segundo = 0
      const primero = requestAnimationFrame(() => {
        segundo = requestAnimationFrame(() => setActivo(true))
      })
      return () => {
        cancelAnimationFrame(primero)
        cancelAnimationFrame(segundo)
      }
    }
    setActivo(false)
    const t = setTimeout(() => setMontado(false), duracion)
    return () => clearTimeout(t)
  }, [visible, duracion])

  if (!montado) return null

  return createElement(
    as,
    {
      className: ['anim', `anim-${efecto}`, activo && 'anim-activo', className].filter(Boolean).join(' '),
      style: { ...style, '--anim-duracion': `${duracion}ms` } as CSSProperties,
      'aria-hidden': activo ? undefined : true,
    },
    children,
  )
}
