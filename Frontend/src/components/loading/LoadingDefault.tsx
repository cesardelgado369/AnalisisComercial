import './loading.css'

/** Carga dentro del cuerpo de una página: círculo girando + texto. */
export function LoadingDefault({ texto = 'Cargando…' }: { texto?: string }) {
  return (
    <div className="loading-default" role="status" aria-live="polite">
      <span className="loading-circulo" aria-hidden />
      <span>{texto}</span>
    </div>
  )
}
