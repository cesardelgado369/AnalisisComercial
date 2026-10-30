interface Props {
  errores: string[]
  onReintentar: () => void
  /** Dónde va: `cob-estado` (centrado, en las secciones comerciales) o `adm-error-carga` (en una línea, administración). */
  className?: string
  /** El botón en violeta, cuando el error ocupa el lugar de toda la lista. */
  acento?: boolean
  /** Lo que se agrega después del error («Sin la lista no se pueden dar accesos»). */
  detalle?: string
}

/** Lo que no se pudo cargar y el «Probar de nuevo» (el mensaje ya viene en castellano de `useConsulta`). */
export function ErrorCarga({ errores, onReintentar, className = 'cob-estado', acento = false, detalle }: Props) {
  return (
    <div className={className}>
      <p className="aviso-bloque" role="alert">
        <span className="icono" aria-hidden>error</span>
        {errores.join(' ')}
        {detalle && ` ${detalle}`}
      </p>
      <button type="button" className={acento ? 'btn btn-acento' : 'btn'} onClick={onReintentar}>
        <span className="icono icono-chico" aria-hidden>refresh</span>
        Probar de nuevo
      </button>
    </div>
  )
}
