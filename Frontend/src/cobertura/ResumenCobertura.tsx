import type { KpiMes } from '../api/types'
import { conUnidad, FACTURAS_QUE_CUENTAN, Parrafo, ParrafoCartera, ParrafoEnCurso, type ContextoAyuda } from '../comercial/ayuda'
import { Ayuda } from '../components/Ayuda'
import { formatoEntero, formatoFechaCorta, formatoPorcentaje, nombreMes, nombreMesTitulo } from '../utils/formato'

/**
 * Cabecera de la tarjeta de Cobertura: un indicador por mes, repartidos a lo ancho (el vendedor elegido va en la banda
 * de arriba, comercial/TituloTarjeta) (porcentaje, mes, «162 de 246» y la barra). El mes en curso va atenuado y
 * con «al 22/10»: no se compara de igual a igual con los meses cerrados. Con `ayuda` (el dueño), al lado del «162 de
 * 246» va un ícono que explica cómo se contó ese mes.
 */
export function ResumenCobertura(props: { kpis: KpiMes[]; ayuda?: ContextoAyuda | null }) {
  const { kpis, ayuda } = props
  return (
    <header className="cob-resumen solo-kpis">
      <ul className="cob-kpis" aria-label="Cobertura por mes">
        {kpis.map((k) => {
          const pct = formatoPorcentaje(k.porcentaje)
          return (
            <li key={k.mes} className={k.mesEnCurso ? 'cob-kpi en-curso' : 'cob-kpi'}>
              <span className="cob-kpi-valor">{pct}</span>
              <span className="cob-kpi-mes">
                {nombreMesTitulo(k.mes)}
                {k.mesEnCurso && k.corteAl && <span className="cob-kpi-corte"> al {formatoFechaCorta(k.corteAl)}</span>}
              </span>
              <span className="cob-kpi-detalle">
                {formatoEntero(k.clientesConCompra)} de {formatoEntero(k.clientesCartera)}
                {ayuda && (
                  <Ayuda etiqueta={`Cómo se calculó ${nombreMes(k.mes)}`}>
                    <ExplicacionMes k={k} ayuda={ayuda} />
                  </Ayuda>
                )}
              </span>
              <span
                className="cob-kpi-barra"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(k.porcentaje)}
                aria-label={`${nombreMesTitulo(k.mes)}${k.mesEnCurso ? ' (mes en curso)' : ''}: ${pct} de los clientes compraron`}
              >
                <span style={{ width: `${Math.min(100, Math.max(0, k.porcentaje))}%` }} />
              </span>
            </li>
          )
        })}
      </ul>
    </header>
  )
}

/**
 * Cómo se contó un mes, en palabras, con sus números. Las reglas son las del backend (CONTRATO_API.md: «Cartera de
 * cada mes», «KPI del mes» y «Compró»): si cambian allá, se cambia este texto.
 */
function ExplicacionMes({ k, ayuda }: { k: KpiMes; ayuda: ContextoAyuda }) {
  const mes = nombreMes(k.mes)
  return (
    <>
      <Parrafo titulo={`${nombreMesTitulo(k.mes)}: ${formatoEntero(k.clientesConCompra)} de ${formatoEntero(k.clientesCartera)}.`}>
        De los {formatoEntero(k.clientesCartera)} clientes que tenía la cartera en {mes}, {formatoEntero(k.clientesConCompra)}{' '}
        compraron ({formatoPorcentaje(k.porcentaje)}).
      </Parrafo>
      <ParrafoCartera mes={k.mes} ayuda={ayuda} />
      <Parrafo>
        Un cliente puede existir desde antes y no contar en los meses anteriores: si ese mes no estaba asignado a{' '}
        {ayuda.vendedor ? `la ruta de ${ayuda.vendedor} (estaba en la de otro vendedor o en ninguna)` : 'la ruta de ningún vendedor'}
        , no es parte de la cartera de ese mes. Por eso el total de clientes cambia de un mes a otro.
      </Parrafo>
      <Parrafo titulo="Compró:">
        tuvo al menos una factura de {mes} no anulada ({FACTURAS_QUE_CUENTAN}){conUnidad(ayuda)} y, descontado lo que se
        le retiró en la misma factura y las notas de crédito del mes, le quedó algo comprado de al menos un artículo. La
        Factura presupuesto no cuenta.
      </Parrafo>
      {k.mesEnCurso && <ParrafoEnCurso mes={k.mes} corteAl={k.corteAl} />}
    </>
  )
}
