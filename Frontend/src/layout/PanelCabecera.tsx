import { useEffect, useId, useRef, useState, type ReactNode } from 'react'

interface Props {
  icono: string
  titulo: string
  children: ReactNode
}

/** Botón con ícono de la cabecera que despliega un panel. Cierra con Esc o con un click afuera. */
export function PanelCabecera({ icono, titulo, children }: Props) {
  const [abierto, setAbierto] = useState(false)
  const caja = useRef<HTMLDivElement>(null)
  const id = useId()

  useEffect(() => {
    if (!abierto) return
    function afuera(e: MouseEvent) {
      if (!caja.current?.contains(e.target as Node)) setAbierto(false)
    }
    function tecla(e: KeyboardEvent) {
      if (e.key === 'Escape') setAbierto(false)
    }
    document.addEventListener('mousedown', afuera)
    document.addEventListener('keydown', tecla)
    return () => {
      document.removeEventListener('mousedown', afuera)
      document.removeEventListener('keydown', tecla)
    }
  }, [abierto])

  return (
    <div className="panel-cabecera" ref={caja}>
      <button
        type="button"
        className={abierto ? 'header-boton activo' : 'header-boton'}
        aria-label={titulo}
        title={titulo}
        aria-expanded={abierto}
        aria-controls={id}
        onClick={() => setAbierto((v) => !v)}
      >
        <span className="icono">{icono}</span>
      </button>
      {abierto && (
        <div className="panel-cabecera-caja" id={id} role="dialog" aria-label={titulo}>
          <div className="panel-cabecera-titulo">{titulo}</div>
          <div className="panel-cabecera-cuerpo">{children}</div>
        </div>
      )}
    </div>
  )
}
