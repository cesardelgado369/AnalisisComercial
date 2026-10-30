import type { KpiDevolucion } from '../api/types'
import { conUnidad, FACTURAS_QUE_CUENTAN, Parrafo, ParrafoCartera, ParrafoEnCurso, type ContextoAyuda } from '../comercial/ayuda'
import { formatoBultos, formatoPorcentajeDecimal as pct, nombreMes, nombreMesTitulo } from '../utils/formato'

/**
 * Cómo se calculó el porcentaje de devoluciones del mes elegido, con sus números, para el dueño (pedido de Cesar,
 * 30/10). Las reglas son las del backend (CONTRATO_API.md: `GET /api/devoluciones`, «Fórmula» y «Qué es devolución»):
 * si cambian allá, se cambia este texto.
 */
export function ExplicacionDevoluciones({ k, ayuda }: { k: KpiDevolucion; ayuda: ContextoAyuda }) {
  const mes = nombreMes(k.mes)
  const devueltos = formatoBultos(k.bultosDevueltos ?? 0)
  const facturados = formatoBultos((k.bultosVendidos ?? 0) + (k.bultosDevueltos ?? 0))
  return (
    <>
      <Parrafo titulo={`${nombreMesTitulo(k.mes)}${k.porcentaje === null ? '' : `: ${pct(k.porcentaje)}`}.`}>
        {k.porcentaje === null
          ? `En ${mes} no hubo bultos facturados ni devueltos.`
          : `Se devolvieron ${devueltos} de los ${facturados} bultos facturados: ${devueltos} ÷ ${facturados} = ${pct(k.porcentaje)}.`}
      </Parrafo>
      <Parrafo titulo="Devuelto:">
        lo que se le retiró al cliente en la misma factura (las líneas en negativo, los «cambios») más las notas de crédito
        de {mes}. El rechazo de Chess es la misma nota de crédito: no se cuenta dos veces.
      </Parrafo>
      <Parrafo titulo="Facturado:">
        lo que se entregó en las facturas no anuladas ({FACTURAS_QUE_CUENTAN}){conUnidad(ayuda)}: lo vendido (los bultos de
        Volumen, ya descontado lo devuelto) más lo devuelto. La Factura presupuesto todavía no cuenta.
      </Parrafo>
      <ParrafoCartera mes={k.mes} ayuda={ayuda}>
        Cada mes se cuenta con su propia cartera.
      </ParrafoCartera>
      {k.mesEnCurso && <ParrafoEnCurso mes={k.mes} corteAl={k.corteAl} />}
    </>
  )
}
