import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import './ventana.css'

/** Lo que tarda en abrirse (para no pedir la de cada fila que se cruza con el mouse) y en cerrarse (para llegar a ella). */
const ESPERA_ABRIR = 300
const ESPERA_CERRAR = 150

/**
 * La ventanita que se abre al pasar el mouse por una fila (o llegar con el teclado), pedida por Cesar el 10/11: el
 * cliente en Devoluciones, el vendedor de un foco en Focos del mes. `alPasar` va en cada fila con lo que identifica qué
 * mostrar (`clave`) y su elemento. Se cierra al salir, al hacer scroll o con Esc; con el mouse adentro, queda abierta.
 */
export function useVentana<T>() {
  const [abierta, setAbierta] = useState<{ clave: T; fila: DOMRect } | null>(null)
  const espera = useRef<number | undefined>(undefined)

  const alPasar = useCallback((clave: T | null, fila?: HTMLElement) => {
    window.clearTimeout(espera.current)
    if (clave === null || !fila) {
      espera.current = window.setTimeout(() => setAbierta(null), ESPERA_CERRAR)
      return
    }
    espera.current = window.setTimeout(() => setAbierta({ clave, fila: fila.getBoundingClientRect() }), ESPERA_ABRIR)
  }, [])
  const quedarse = useCallback(() => window.clearTimeout(espera.current), [])
  const salir = useCallback(() => alPasar(null), [alPasar])

  useEffect(() => {
    if (!abierta) return
    const cerrar = () => setAbierta(null)
    // El scroll de la página la cierra; el de adentro de la ventanita, no (Cesar, 10/11: se cerraba al bajar en la lista)
    const alScroll = (e: Event) => {
      if (e.target instanceof Element && e.target.closest('.ventana-cliente')) return
      cerrar()
    }
    const conEsc = (e: KeyboardEvent) => e.key === 'Escape' && cerrar()
    window.addEventListener('scroll', alScroll, { passive: true, capture: true })
    window.addEventListener('keydown', conEsc)
    return () => {
      window.removeEventListener('scroll', alScroll, { capture: true })
      window.removeEventListener('keydown', conEsc)
    }
  }, [abierta])
  useEffect(() => () => window.clearTimeout(espera.current), [])

  return { abierta, alPasar, quedarse, salir }
}

/**
 * El marco de la ventanita: cabecera y pie azules con letra blanca, y el cuerpo que se abre entre los dos como un
 * pergamino. Se abre hacia el sureste sin tapar la fila: a su derecha si hay lugar; si no, debajo. Si abajo queda poco
 * lugar, sube lo justo y achica su alto.
 */
export function Ventana(props: {
  fila: DOMRect
  etiqueta: string
  cabecera: ReactNode
  pie: ReactNode
  onEntrar: () => void
  onSalir: () => void
  children: ReactNode
}) {
  const { fila, etiqueta, cabecera, pie, onEntrar, onSalir, children } = props
  const ancho = Math.min(420, window.innerWidth - 32)
  const alCostado = window.innerWidth - fila.right >= ancho + 28
  const izquierda = alCostado ? fila.right + 12 : Math.max(16, Math.min(fila.left + 120, window.innerWidth - ancho - 16))
  const desde = alCostado ? fila.top : fila.bottom + 4
  const minimo = 260
  const arriba = Math.max(16, Math.min(desde, window.innerHeight - minimo - 16))
  return (
    <div
      className="ventana-cliente"
      role="dialog"
      aria-label={etiqueta}
      style={{ left: izquierda, width: ancho, top: arriba, maxHeight: Math.max(minimo, window.innerHeight - arriba - 16) }}
      onMouseEnter={onEntrar}
      onMouseLeave={onSalir}
    >
      <header className="ventana-cliente-cabecera">{cabecera}</header>
      <div className="ventana-cuerpo">
        <div className="ventana-cuerpo-adentro">{children}</div>
      </div>
      <footer className="ventana-cliente-pie">{pie}</footer>
    </div>
  )
}
