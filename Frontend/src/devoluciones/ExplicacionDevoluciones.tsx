import type { KpiDevolucion } from '../api/types'
import { conUnidad, FACTURAS_QUE_CUENTAN, Parrafo, type ContextoAyuda } from '../comercial/ayuda'
import { formatoBultos, formatoFechaCorta, formatoPorcentajeDecimal as pct, nombreMes } from '../utils/formato'

/**
 * Cómo se calculó el porcentaje de devoluciones del mes elegido, para el dueño (pedido de Cesar, 30/10; corto desde el
 * 10/11: la fórmula con sus números y una línea por término). Las reglas son las del backend (CONTRATO_API.md:
 * `GET /api/devoluciones`, «Fórmula» y «Qué es devolución»; la 1.4.1 del 12/11: devolución = los cambios, sobre lo
 * vendido): si cambian allá, se cambia este texto.
 */
export function ExplicacionDevoluciones({ k, ayuda }: { k: KpiDevolucion; ayuda: ContextoAyuda }) {
  const mes = nombreMes(k.mes)
  const devueltos = formatoBultos(k.bultosDevueltos ?? 0)
  const vendidos = formatoBultos(k.bultosVendidos ?? 0)
  return (
    <>
      <Parrafo titulo="Fórmula =">
        {k.porcentaje === null
          ? `devuelto ÷ vendido (en ${mes} no hubo bultos vendidos).`
          : `devuelto ÷ vendido = ${devueltos} ÷ ${vendidos} = ${pct(k.porcentaje)}.`}
      </Parrafo>
      <Parrafo titulo="Devuelto:">
        los cambios: lo que el vendedor le cambió al cliente en la misma factura (sus líneas en negativo) en {mes}.
      </Parrafo>
      <Parrafo titulo="Vendido:">
        los bultos que le quedaron al cliente, como en Volumen: lo entregado en las facturas no anuladas (
        {FACTURAS_QUE_CUENTAN}){conUnidad(ayuda)}, menos los cambios y las notas de crédito.
        {k.mesEnCurso && k.corteAl ? ` Hasta el ${formatoFechaCorta(k.corteAl)}.` : ''}
      </Parrafo>
      <Parrafo titulo="Notas de crédito:">
        la mercadería que volvió a la fábrica sin entregarse (rechazo). Resta de lo vendido, pero no es devolución.
      </Parrafo>
    </>
  )
}
