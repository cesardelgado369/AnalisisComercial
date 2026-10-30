interface Props<T extends string> {
  /** Nombre del grupo, para lectores de pantalla. */
  etiqueta: string
  valor: T
  opciones: { valor: T; texto: string }[]
  onCambio: (valor: T) => void
}

/** Botones juntos con una sola opción elegida (Pesos | Dólares, Semanas | Meses): la elegida en negro. */
export function Segmentado<T extends string>({ etiqueta, valor, opciones, onCambio }: Props<T>) {
  return (
    <div className="segmentado" role="group" aria-label={etiqueta}>
      {opciones.map((o) => (
        <button key={o.valor} type="button" aria-pressed={o.valor === valor} onClick={() => onCambio(o.valor)}>
          {o.texto}
        </button>
      ))}
    </div>
  )
}
