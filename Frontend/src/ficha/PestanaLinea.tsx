import type { EstadoMes, MovimientosCliente } from '../api/types'
import { useConsulta } from '../api/useConsulta'
import { LineaComprobantes, Numeros, totalesDelMes } from '../comercial/LineaComprobantes'
import { ErrorCarga } from '../components/ErrorCarga'
import { LoadingDefault } from '../components/loading/LoadingDefault'
import { formatoBultos, nombreMes, nombreMesCorto, nombreMesTitulo } from '../utils/formato'

/**
 * La pestaña **Línea de tiempo** de la ficha (Cesar, 12/11: «que la vea el dueño al darle click a un cliente: cuándo
 * compró, qué devolvió, en cronología»). Los meses que se ven, con sus bultos, para elegir uno; abajo, cada factura y
 * nota de crédito de ese mes en orden (`GET /api/clientes/{id}/movimientos`, la misma línea que la ventanita de Volumen y
 * Devoluciones) y el total. Los meses fuera de la cartera (gobernanza) no se pueden elegir.
 */
export function PestanaLinea(props: {
  idCliente: number
  meses: string[]
  estados: EstadoMes[]
  bultos: (number | null)[]
  /** El mes elegido (`?mesMov=`); null: el último con compras en que era de la cartera. */
  mes: string | null
  onMes: (mes: string | null) => void
  esOperario: boolean
}) {
  const { idCliente, meses, estados, bultos, mes, onMes, esOperario } = props
  const fuera = (i: number) => estados[i] === 'fueraDeCartera'
  const visibles = meses.filter((_, i) => !fuera(i))
  // De entrada, el último mes con algo (el en curso puede no tener nada todavía); si ninguno, el último de la cartera
  const conCompras = meses.filter((_, i) => !fuera(i) && (bultos[i] ?? 0) !== 0)
  const porDefecto = conCompras[conCompras.length - 1] ?? visibles[visibles.length - 1] ?? null
  const elegido = mes && visibles.includes(mes) ? mes : porDefecto
  const consulta = useConsulta<MovimientosCliente>(
    elegido ? `/clientes/${idCliente}/movimientos?mes=${elegido}` : null,
    'No pudimos leer sus comprobantes. Probá de nuevo.',
  )
  const d = consulta.datos?.idCliente === idCliente && consulta.datos.mes === elegido ? consulta.datos : null

  if (!elegido) return <p className="vacio">En estos meses no fue cliente de {esOperario ? 'tu' : 'la'} cartera.</p>
  const { entregados, devueltos, rechazados, conRechazos } = totalesDelMes(d?.movimientos ?? [])

  return (
    <div className={`ficha-pestana${consulta.cargando && d ? ' recargando' : ''}`}>
      <p className="apagado ficha-dev-ayuda">Cada factura y nota de crédito del mes, en orden: qué compró, qué le cambiaron y qué se rechazó. Tocá un mes para ver otro.</p>
      <ol className="ficha-dev-meses">
        {meses.map((m, i) => (
          <li key={m}>
            <button
              type="button"
              className={`ficha-dev-mes${fuera(i) ? ' fuera' : ''}`}
              aria-pressed={m === elegido}
              disabled={fuera(i)}
              onClick={() => onMes(m === porDefecto ? null : m)}
            >
              <span className="ficha-mes-nombre">
                <span className="ficha-mes-largo">{nombreMesTitulo(m)}</span>
                <span className="ficha-mes-corto" aria-hidden>{nombreMesCorto(m)}</span>
              </span>
              {fuera(i) ? (
                <span className="ficha-mes-nota">{esOperario ? 'Fuera de tu cartera' : 'Fuera de cartera'}</span>
              ) : (
                <>
                  <strong className="ficha-dev-pct">{formatoBultos(bultos[i] ?? 0)}</strong>
                  <span className="ficha-dev-detalle">bultos</span>
                </>
              )}
            </button>
          </li>
        ))}
      </ol>
      <h3 className="ficha-dev-titulo">Comprobantes de {nombreMes(elegido)}</h3>
      {consulta.errores.length > 0 ? (
        <ErrorCarga errores={consulta.errores} onReintentar={consulta.recargar} className="ficha-error ficha-pestana-error" />
      ) : !d ? (
        <LoadingDefault texto="Buscando sus comprobantes…" />
      ) : d.movimientos.length === 0 ? (
        <p className="vacio">No tuvo facturas ni notas de crédito en {nombreMes(elegido)}.</p>
      ) : (
        <div className="ficha-linea">
          <LineaComprobantes movimientos={d.movimientos} />
          <div className="ficha-linea-total">
            <span>Total de {nombreMes(elegido)}</span>
            <Numeros entregados={entregados} devueltos={devueltos} rechazados={rechazados} conRechazos={conRechazos} className="mov-totales" siempre />
          </div>
        </div>
      )}
    </div>
  )
}
