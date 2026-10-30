import { formatoEntero } from '../utils/formato'

interface Props {
  pagina: number
  tamano: number
  total: number
  deshabilitado?: boolean
  onPagina: (pagina: number) => void
}

/** "1–50 de 643" + Anterior / Página x de y / Siguiente, para las respuestas paginadas del backend. */
export function Paginado({ pagina, tamano, total, deshabilitado, onPagina }: Props) {
  const paginas = Math.max(1, Math.ceil(total / tamano))
  const primero = total ? (pagina - 1) * tamano + 1 : 0
  const ultimo = Math.min(pagina * tamano, total)

  return (
    <nav className="paginado" aria-label="Páginas">
      <span className="apagado">
        {formatoEntero(primero)}–{formatoEntero(ultimo)} de {formatoEntero(total)}
      </span>
      <div className="paginado-botones">
        <button className="btn" disabled={pagina <= 1 || deshabilitado} onClick={() => onPagina(pagina - 1)}>
          <span className="icono icono-chico" aria-hidden>chevron_left</span>
          Anterior
        </button>
        <span className="paginado-actual">
          Página {pagina} de {paginas}
        </span>
        <button className="btn" disabled={pagina >= paginas || deshabilitado} onClick={() => onPagina(pagina + 1)}>
          Siguiente
          <span className="icono icono-chico" aria-hidden>chevron_right</span>
        </button>
      </div>
    </nav>
  )
}
