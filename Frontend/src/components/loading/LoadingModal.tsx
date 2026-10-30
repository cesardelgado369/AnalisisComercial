import './loading.css'

/** Carga dentro de un modal: círculo más grande, centrado en el cuerpo del modal. */
export function LoadingModal({ texto = 'Cargando…' }: { texto?: string }) {
  return (
    <div className="loading-modal" role="status" aria-live="polite">
      <span className="loading-circulo loading-circulo-grande" aria-hidden />
      <span>{texto}</span>
    </div>
  )
}
