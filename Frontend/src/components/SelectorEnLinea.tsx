import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

export interface OpcionEnLinea<T> {
  valor: T
  nombre: string
  /** Texto chico a la derecha (p. ej. "10 a 20 min"). */
  detalle?: string
}

interface Props<T> {
  /** Lo que se ve en la celda (subrayado, con la flecha al lado). */
  texto: ReactNode
  /** Tooltip del botón, p. ej. "Cambiar la clasificación". */
  titulo: string
  opciones: OpcionEnLinea<T>[]
  /** El valor actual (se marca con un tilde). */
  actual: T | null
  /** Aviso arriba de la lista. */
  nota?: ReactNode
  /** Guarda al instante; si falla, devuelve el mensaje de error. */
  onElegir: (valor: T) => Promise<string | null>
}

/**
 * Valor editable desde una tabla sin entrar a la edición: subrayado con una flecha abajo; con un click se abre
 * la lista y al elegir se guarda al instante. La lista va en un portal (no la cortan las tablas con scroll).
 */
export function SelectorEnLinea<T extends string | number | null>({ texto, titulo, opciones, actual, nota, onElegir }: Props<T>) {
  const [abierto, setAbierto] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const boton = useRef<HTMLButtonElement>(null)
  const lista = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  useEffect(() => {
    if (!abierto) return
    const r = boton.current!.getBoundingClientRect()
    setPos({ top: r.bottom + 4, left: r.left })
    function afuera(e: MouseEvent) {
      if (!lista.current?.contains(e.target as Node) && !boton.current?.contains(e.target as Node)) setAbierto(false)
    }
    function tecla(e: KeyboardEvent) {
      if (e.key === 'Escape') setAbierto(false)
    }
    const cerrar = () => setAbierto(false)
    document.addEventListener('mousedown', afuera)
    document.addEventListener('keydown', tecla)
    window.addEventListener('scroll', cerrar, true)
    return () => {
      document.removeEventListener('mousedown', afuera)
      document.removeEventListener('keydown', tecla)
      window.removeEventListener('scroll', cerrar, true)
    }
  }, [abierto])

  async function elegir(valor: T) {
    setAbierto(false)
    setGuardando(true)
    setError(null)
    try {
      setError(await onElegir(valor))
    } finally {
      setGuardando(false)
    }
  }

  return (
    <>
      <button
        ref={boton}
        type="button"
        className="en-linea"
        aria-haspopup="listbox"
        aria-expanded={abierto}
        disabled={guardando}
        onClick={() => setAbierto((v) => !v)}
        title={titulo}
      >
        <span className="en-linea-texto">{guardando ? 'Guardando…' : texto}</span>
        <span className="icono icono-chico" aria-hidden>expand_more</span>
      </button>
      {error && <span className="campo-error">{error}</span>}

      {abierto &&
        pos &&
        createPortal(
          <div ref={lista} className="en-linea-lista" role="listbox" aria-label={titulo} style={{ top: pos.top, left: pos.left }}>
            {nota && <div className="en-linea-nota">{nota}</div>}
            {opciones.map((o) => {
              const esActual = o.valor === actual
              return (
                <button
                  key={String(o.valor)}
                  type="button"
                  role="option"
                  aria-selected={esActual}
                  className={esActual ? 'actual' : undefined}
                  onClick={() => (esActual ? setAbierto(false) : void elegir(o.valor))}
                >
                  <span>{o.nombre}</span>
                  <small>{o.detalle ?? ''}</small>
                  {esActual && <span className="icono icono-chico" aria-hidden>check</span>}
                </button>
              )
            })}
          </div>,
          document.body,
        )}
    </>
  )
}
