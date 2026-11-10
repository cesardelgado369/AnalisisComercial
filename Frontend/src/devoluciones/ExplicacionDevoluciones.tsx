import type { KpiDevolucion } from '../api/types'
import { conUnidad, FACTURAS_QUE_CUENTAN, Parrafo, type ContextoAyuda } from '../comercial/ayuda'
import { formatoBultos, formatoFechaCorta, formatoPorcentajeDecimal as pct, nombreMes } from '../utils/formato'

/**
 * Cómo se calculó el porcentaje de devoluciones del mes elegido, para el dueño (pedido de Cesar, 30/10; corto desde el
 * 10/11: la fórmula con sus números y una línea por término). Las reglas son las del backend (CONTRATO_API.md:
 * `GET /api/devoluciones`, «Fórmula» y «Qué es devolución»): si cambian allá, se cambia este texto.
 */
export function ExplicacionDevoluciones({ k, ayuda }: { k: KpiDevolucion; ayuda: ContextoAyuda }) {
  const mes = nombreMes(k.mes)
  const devueltos = formatoBultos(k.bultosDevueltos ?? 0)
  const facturados = formatoBultos((k.bultosVendidos ?? 0) + (k.bultosDevueltos ?? 0))
  return (
    <>
      <Parrafo titulo="Fórmula =">
        {k.porcentaje === null
          ? `devuelto ÷ facturado (en ${mes} no hubo bultos facturados ni devueltos).`
          : `devuelto ÷ facturado = ${devueltos} ÷ ${facturados} = ${pct(k.porcentaje)}.`}
      </Parrafo>
      <Parrafo titulo="Devuelto:">las líneas en negativo de las facturas más las notas de crédito de {mes}.</Parrafo>
      <Parrafo titulo="Facturado:">
        lo entregado en las facturas no anuladas ({FACTURAS_QUE_CUENTAN}){conUnidad(ayuda)}.
        {k.mesEnCurso && k.corteAl ? ` Hasta el ${formatoFechaCorta(k.corteAl)}.` : ''}
      </Parrafo>
    </>
  )
}
