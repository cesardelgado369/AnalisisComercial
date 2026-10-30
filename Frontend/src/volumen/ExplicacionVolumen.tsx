import type { ComparacionVolumen, TotalVolumen } from '../api/types'
import { conUnidad, FACTURAS_QUE_CUENTAN, Parrafo, ParrafoCartera, type ContextoAyuda } from '../comercial/ayuda'
import { formatoBultos, formatoFechaCorta, formatoPorcentaje as pct, nombreMes, nombreMesTitulo } from '../utils/formato'
import type { TextosComparacion } from './comparacion'

/**
 * Cómo se calculó el total de Volumen, con sus números, para el dueño (pedido de Cesar, 30/10). Las reglas son las del
 * backend (CONTRATO_API.md: «Bultos» y `GET /api/volumen`; para el admin, la base de un cliente es lo que compró en el
 * mes base, estuviera en la ruta que estuviera): si cambian allá, se cambia este texto.
 */
export function ExplicacionVolumen(props: { total: TotalVolumen; c: ComparacionVolumen; t: TextosComparacion; ayuda: ContextoAyuda }) {
  const { total, c, t, ayuda } = props
  const mes = nombreMes(c.mes)
  const base = nombreMes(c.mesBase)
  const actual = formatoBultos(total.bultosActual ?? 0)
  const deBase = total.bultosBase === null ? '0' : formatoBultos(total.bultosBase)
  const alDia = c.tipo === 'mismoDiaHabil' && t.enCurso
  const cuenta =
    total.porcentaje === null
      ? `En ${base} estos clientes no compraron: no hay base para comparar.`
      : `${actual} ÷ ${deBase} = ${pct(total.porcentaje)}.`
  return (
    <>
      <Parrafo titulo={`${nombreMesTitulo(c.mes)}: ${actual} bultos${total.porcentaje === null ? '' : `, el ${pct(total.porcentaje)}`}.`}>
        {!alDia ? (
          <>
            {nombreMesTitulo(c.mes)} completo contra {base} completo ({deBase} bultos). {cuenta}
          </>
        ) : c.corteAl === null ? (
          `Todavía no hay un día completo con ventas de ${mes}.`
        ) : (
          <>
            Es lo que llevan los clientes del {formatoFechaCorta(c.mes)} al {formatoFechaCorta(c.corteAl)}, el día hábil{' '}
            {c.diaHabil} de {c.diasHabilesMes}. Se compara con {base} hasta su mismo día hábil
            {c.baseHasta ? ` (del ${formatoFechaCorta(c.mesBase)} al ${formatoFechaCorta(c.baseHasta)})` : ''}: {deBase} bultos.{' '}
            {cuenta}
          </>
        )}
      </Parrafo>
      <Parrafo titulo="Bultos:">
        la cantidad de Chess de cada artículo en las facturas no anuladas ({FACTURAS_QUE_CUENTAN}){conUnidad(ayuda)}, menos
        lo que se le retiró al cliente en la misma factura y las notas de crédito. Es lo que le quedó al cliente; la
        Factura presupuesto no cuenta.
      </Parrafo>
      <ParrafoCartera mes={c.mes} ayuda={ayuda}>
        La base es lo que compraron en {base} esos mismos clientes, aunque entonces estuvieran en otra ruta. Los que
        salieron de la cartera no cuentan.
      </ParrafoCartera>
      {alDia && (
        <Parrafo titulo="Día hábil:">
          de lunes a sábado, sin los feriados nacionales ni el 24/9. Hoy no cuenta: los datos de Chess llegan a las 5 de la
          mañana, y comparar medio día contra un día entero daría una baja que no es.
        </Parrafo>
      )}
      <Parrafo titulo="Cada cliente,">
        con la misma cuenta: «{t.textoChip.bajaron}» si lleva menos que su base, «{t.textoChip.subieron}» si lleva lo mismo
        o más y «{t.textoChip.sinCompraAun}» si {t.enCurso ? 'todavía ' : ''}no le quedó nada comprado.
      </Parrafo>
    </>
  )
}
