import { useId, useState, type ReactNode } from 'react'

/**
 * Un ícono de información con su explicación en un globo: aparece al pasar el mouse o al llegar con el teclado, y en el
 * celular (sin mouse) se abre y se cierra tocándolo. Esc o salir del ícono lo cierra. El globo se ubica contra el
 * contenedor posicionado más cercano (por defecto, el mismo ícono; ver `.ayuda` en index.css).
 */
export function Ayuda({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  const [abierta, setAbierta] = useState(false)
  const id = useId()
  return (
    <span className={abierta ? 'ayuda abierta' : 'ayuda'}>
      <button
        type="button"
        className="ayuda-boton"
        aria-label={etiqueta}
        aria-describedby={id}
        aria-expanded={abierta}
        onClick={() => setAbierta((a) => !a)}
        onBlur={() => setAbierta(false)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setAbierta(false)
        }}
      >
        <span className="icono icono-chico" aria-hidden>info</span>
      </button>
      <span role="tooltip" id={id} className="ayuda-globo">
        {children}
      </span>
    </span>
  )
}
