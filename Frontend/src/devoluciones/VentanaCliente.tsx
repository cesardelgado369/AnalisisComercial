import type { ClaseAbc, MovimientosCliente } from '../api/types'
import { useConsulta } from '../api/useConsulta'
import { nombrePropio } from '../cobertura/estados'
import { unidadVisible } from '../comercial/filtros'
import { Capsula, EtiquetaAbc } from '../comercial/lista'
import { LoadingDefault } from '../components/loading/LoadingDefault'
import { Ventana } from '../components/Ventana'
import { formatoBultos, formatoFechaCorta, nombreMes, nombreMesTitulo } from '../utils/formato'

const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
const diaDe = (fecha: string) => DIAS[new Date(`${fecha}T12:00:00Z`).getUTCDay()]

/**
 * El mes del cliente en orden (`GET /api/clientes/{id}/movimientos`): cada factura y nota de crédito con su fecha, quién
 * se la vendió, lo entregado y lo devuelto, y artículo por artículo con su tipo de producto. Con los filtros de tipo de
 * producto y foco de la pantalla, como la lista.
 */
export function VentanaCliente(props: {
  idCliente: number
  fila: DOMRect
  mes: string
  /** La categoría del cliente (solo el dueño), que viene en la fila. */
  abc?: ClaseAbc
  filtros: URLSearchParams
  onEntrar: () => void
  onSalir: () => void
}) {
  const { idCliente, fila, mes, abc, filtros, onEntrar, onSalir } = props
  const qs = new URLSearchParams({ mes })
  for (const clave of ['unidad', 'foco']) if (filtros.get(clave)) qs.set(clave, filtros.get(clave)!)
  const consulta = useConsulta<MovimientosCliente>(`/clientes/${idCliente}/movimientos?${qs}`, 'No pudimos leer sus comprobantes.')
  const d = consulta.datos?.idCliente === idCliente && consulta.datos.mes === mes ? consulta.datos : null
  // El vendedor va en la cabecera, donde estaba el mes (Cesar, 10/11: ya se sabe qué mes es). Si le vendieron varios,
  // también en cada comprobante
  const vendedores = [...new Set((d?.movimientos ?? []).map((m) => m.vendedor).filter((v): v is string => !!v))]
  const varios = vendedores.length > 1
  const entregados = d?.movimientos.reduce((s, m) => s + m.entregados, 0) ?? 0
  const devueltos = d?.movimientos.reduce((s, m) => s + m.devueltos, 0) ?? 0

  const cabecera = (
    <>
      <strong className="ventana-cliente-nombre">
        {d ? d.razonSocial : 'Buscando…'}
        <EtiquetaAbc abc={abc} />
      </strong>
      {vendedores.length > 0 && (
        <span className="ventana-vendedores">
          {vendedores.map((v) => (
            <Capsula key={v} icono="person" que="Vendedor" texto={nombrePropio(v)} />
          ))}
        </span>
      )}
    </>
  )
  const pie = d ? (
    <>
      <span>Total del mes</span>
      <Numeros entregados={entregados} devueltos={devueltos} className="mov-totales" siempre />
    </>
  ) : (
    <span>{nombreMesTitulo(mes)}…</span>
  )

  return (
    <Ventana
      fila={fila}
      etiqueta={`Comprobantes de ${d ? d.razonSocial : 'el cliente'} en ${nombreMes(mes)}`}
      cabecera={cabecera}
      pie={pie}
      onEntrar={onEntrar}
      onSalir={onSalir}
    >
      {consulta.errores.length > 0 ? (
        <p className="ventana-cliente-aviso">{consulta.errores.join(' ')}</p>
      ) : !d ? (
        <LoadingDefault texto="Buscando sus comprobantes…" />
      ) : d.movimientos.length === 0 ? (
        <p className="ventana-cliente-aviso">Sin comprobantes en {nombreMes(mes)} con estos filtros.</p>
      ) : (
        <>
          <div className="ventana-columnas" aria-hidden>
            <span>Se entregó</span>
            <span>Se devolvió</span>
          </div>
          <ol className="ventana-linea">
            {d.movimientos.map((m) => (
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
      )}
    </Ventana>
  )
}

/**
 * Lo entregado y lo devuelto en sus dos columnas (Se entregó · Se devolvió), alineadas en toda la ventanita. Un cero va
 * vacío para que se lea solo lo que pasó; en el total del mes (`siempre`), con su número.
 */
function Numeros(props: { entregados: number; devueltos: number; className: string; siempre?: boolean }) {
  const { entregados, devueltos, className, siempre = false } = props
  return (
    <span className={`${className} ventana-numeros`}>
      <span className="mov-entregado">{entregados > 0 || siempre ? `+${formatoBultos(entregados)}` : ''}</span>
      <span className="mov-devuelto">{devueltos > 0 || siempre ? `−${formatoBultos(devueltos)}` : ''}</span>
    </span>
  )
}
