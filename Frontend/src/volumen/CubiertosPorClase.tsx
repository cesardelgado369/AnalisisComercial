import type { CoberturaAbc } from '../api/types'
import { Parrafo } from '../comercial/ayuda'
import { EtiquetaAbc } from '../comercial/lista'
import { Ayuda } from '../components/Ayuda'
import { formatoEntero, formatoPorcentaje, nombreMes } from '../utils/formato'

/**
 * Qué parte de los clientes A, B y C de la cartera ya compró en el mes (Cesar, 10/11; solo los dueños: la API no lo
 * manda a los demás). Al lado del total de bultos de Volumen, con los mismos filtros.
 */
export function CubiertosPorClase({ abc, mes }: { abc: CoberturaAbc[]; mes: string }) {
  return (
    <div className="vol-abc ayuda-ancla">
      <p className="vol-abc-titulo">
        Cumplimiento A, B y C · {nombreMes(mes)}
        <Ayuda etiqueta="Qué son los clientes A, B y C">
          <Parrafo titulo="A, B y C:">
            los clientes de Madomi ordenados por los bultos que compraron en los 3 meses anteriores. A son los que más
            compran (juntos suman el 80 % de los bultos), B los que siguen hasta el 95 % y C el resto.
          </Parrafo>
          <Parrafo titulo="Cumplimiento:">qué parte de los clientes de cada categoría ya compró en el mes, con los filtros de arriba.</Parrafo>
        </Ayuda>
      </p>
      <ul className="vol-abc-lista">
        {/* Con el filtro de categoría, las otras vienen vacías: no se muestran */}
        {abc.filter((g) => g.clientes > 0).map((g) => (
          <li key={g.grupo} className="vol-abc-grupo">
            <EtiquetaAbc abc={g.grupo} grande />
            <span className="vol-abc-numeros">
              <strong>{formatoPorcentaje(g.porcentaje)}</strong>
              <span>
                {formatoEntero(g.conCompra)} de {formatoEntero(g.clientes)}
              </span>
            </span>
            <span
              className="cob-kpi-barra"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(g.porcentaje)}
              aria-label={`Clientes ${g.grupo}: ${formatoPorcentaje(g.porcentaje)} compraron`}
            >
              <span style={{ width: `${Math.min(100, Math.max(0, g.porcentaje))}%` }} />
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
