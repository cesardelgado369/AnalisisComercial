import type { MovimientosCliente } from '../api/types'
import { nombrePropio } from '../cobertura/estados'
import { formatoBultos, formatoFechaCorta } from '../utils/formato'
import { unidadVisible } from './filtros'
import { Capsula } from './lista'
import '../components/ventana.css'

const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
const diaDe = (fecha: string) => DIAS[new Date(`${fecha}T12:00:00Z`).getUTCDay()]

/**
 * La línea de tiempo del mes de un cliente (`GET /api/clientes/{id}/movimientos`): cada factura y nota de crédito en
 * orden, con su fecha, quién se la vendió (si le vendieron varios), lo entregado y lo devuelto, y artículo por artículo
 * con su tipo de producto. La usan la ventanita de Volumen y Devoluciones y la pestaña Línea de tiempo de la ficha
 * (Cesar, 12/11).
 */
export function LineaComprobantes({ movimientos }: { movimientos: MovimientosCliente['movimientos'] }) {
  const varios = new Set(movimientos.map((m) => m.vendedor).filter(Boolean)).size > 1
  return (
    <>
      <div className="ventana-columnas" aria-hidden>
        <span>Se entregó</span>
        <span>Se devolvió</span>
      </div>
      <ol className="ventana-linea">
        {movimientos.map((m) => (
          <li key={`${m.tipo}-${m.comprobante}`} className={`mov mov-${m.tipo}`}>
            <span className="mov-punto" aria-hidden>{m.tipo === 'factura' ? '+' : '−'}</span>
            <div className="mov-cuerpo">
              <div className="mov-cabecera">
                <span className="mov-fecha">
                  {diaDe(m.fecha)} {formatoFechaCorta(m.fecha)}
                </span>
                <span className="mov-tipo">{m.tipo === 'factura' ? 'Compró' : 'Devolvió'}</span>
                {varios && m.vendedor && <Capsula icono="person" que="Vendedor" texto={nombrePropio(m.vendedor)} />}
                <Numeros entregados={m.entregados} devueltos={m.devueltos} className="mov-totales" />
              </div>
              <ul className="mov-lineas">
                {m.lineas.map((l) => (
                  <li key={l.idArticulo}>
                    <span className="mov-articulo">
                      {nombrePropio(l.descripcion)}
                      <span className="mov-rubro">{unidadVisible(l.unidadNegocio)}</span>
                    </span>
                    <Numeros entregados={l.entregados} devueltos={l.devueltos} className="mov-numeros" />
                  </li>
                ))}
              </ul>
              <span className="mov-comprobante">
                {m.tipo === 'factura' ? 'Factura' : 'Nota de crédito'} {m.comprobante}
              </span>
            </div>
          </li>
        ))}
      </ol>
    </>
  )
}

/**
 * Lo entregado y lo devuelto en sus dos columnas (Se entregó · Se devolvió), alineadas en toda la lista. Un cero va
 * vacío para que se lea solo lo que pasó; en el total del mes (`siempre`), con su número.
 */
export function Numeros(props: { entregados: number; devueltos: number; className: string; siempre?: boolean }) {
  const { entregados, devueltos, className, siempre = false } = props
  return (
    <span className={`${className} ventana-numeros`}>
      <span className="mov-entregado">{entregados > 0 || siempre ? `+${formatoBultos(entregados)}` : ''}</span>
      <span className="mov-devuelto">{devueltos > 0 || siempre ? `−${formatoBultos(devueltos)}` : ''}</span>
    </span>
  )
}

/** Lo entregado y lo devuelto en todo el mes (el pie de la ventanita y de la pestaña). */
export function totalesDelMes(movimientos: MovimientosCliente['movimientos']) {
  return {
    entregados: movimientos.reduce((s, m) => s + m.entregados, 0),
    devueltos: movimientos.reduce((s, m) => s + m.devueltos, 0),
  }
}
