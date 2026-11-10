import { formatoBultos, nombreMes, nombreMesCorto } from '../utils/formato'

/**
 * Un graficito de barras chico, un mes por barra (Cesar, 10/11: en la ventanita, arriba del detalle): cuánto pidió o
 * cuánto devolvió el cliente mes a mes, en azul. El número va arriba de cada barra (son pocas) y el mes abajo; el mes en
 * curso, más claro, porque todavía no terminó. Pasar el mouse (o llegar con el teclado) por un mes lo elige: el detalle
 * de ese mes lo pone quien lo usa, debajo.
 */
export function BarritasMes(props: {
  titulo: string
  datos: { mes: string; valor: number | null; enCurso: boolean }[]
  elegido: string
  onElegir: (mes: string) => void
}) {
  const { titulo, datos, elegido, onElegir } = props
  const maximo = Math.max(0, ...datos.map((d) => d.valor ?? 0))
  const leido = (d: (typeof datos)[number]) =>
    `${nombreMes(d.mes)}${d.enCurso ? ' hasta hoy' : ''}: ${d.valor === null ? 'sin datos' : `${formatoBultos(d.valor)} bultos`}`
  return (
    <figure className="barritas">
      <figcaption className="barritas-titulo">{titulo}</figcaption>
      <div className="barritas-columnas" role="group" aria-label={titulo}>
        {datos.map((d) => (
          <button
            key={d.mes}
            type="button"
            className={['barrita', d.enCurso && 'en-curso', d.mes === elegido && 'elegida'].filter(Boolean).join(' ')}
            aria-pressed={d.mes === elegido}
            aria-label={leido(d)}
            onMouseEnter={() => onElegir(d.mes)}
            onFocus={() => onElegir(d.mes)}
            onClick={() => onElegir(d.mes)}
          >
            <span className="barrita-valor" aria-hidden>{d.valor === null ? '—' : formatoBultos(d.valor)}</span>
            <span className="barrita-area" aria-hidden>
              <span className="barrita-barra" style={{ height: `${maximo > 0 && d.valor ? Math.max(4, (d.valor / maximo) * 100) : 0}%` }} />
            </span>
            <span className="barrita-mes" aria-hidden>{nombreMesCorto(d.mes)}</span>
          </button>
        ))}
      </div>
    </figure>
  )
}
