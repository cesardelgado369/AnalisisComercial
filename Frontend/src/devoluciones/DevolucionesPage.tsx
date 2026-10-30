import type { Devoluciones } from '../api/types'
import { useConsulta } from '../api/useConsulta'
import { mesesDisponibles } from '../cobertura/estados'
import { BarraFiltros, useFiltrosComerciales } from '../comercial/filtros'
import { FilaCliente, NombreArticulo, TarjetaCliente, useAbrirFicha } from '../comercial/lista'
import { Ayuda } from '../components/Ayuda'
import { ErrorCarga } from '../components/ErrorCarga'
import { LoadingDefault } from '../components/loading/LoadingDefault'
import { formatoBultos, formatoFechaCorta, formatoPorcentajeDecimal as pct, nombreMes, nombreMesTitulo } from '../utils/formato'
import { useMedia } from '../utils/useMedia'
import { useRecordarAltura } from '../utils/useRecordarAltura'
import '../cobertura/cobertura.css'
import { ExplicacionDevoluciones } from './ExplicacionDevoluciones'
import './devoluciones.css'

/**
 * Devoluciones (`/devoluciones`): por mes, qué parte de lo facturado volvió (`devueltos ÷ (vendidos + devueltos)`, la
 * fórmula de la nota del dueño), y en el mes elegido, los clientes y los artículos con devoluciones. Los números los
 * arma la API (CONTRATO_API.md). Qué cuenta como devolución lo decide el backend (hoy: las notas de crédito y las líneas
 * con cantidad negativa de las facturas, los «cambios»; falta que Cesar lo confirme con Madomi).
 * El vendedor ve lo que suma su cartera (por mes y por artículo) solo en porcentajes, sin bultos (Cesar, 30/10); lo de
 * cada cliente, con bultos. El dueño tiene la ayuda del mes elegido.
 */
export function DevolucionesPage() {
  const filtros = useFiltrosComerciales()
  const { sesion, cambiar, conVendedor, esOperario, titulo } = filtros
  const angosto = useMedia('(max-width: 767px)')
  const mes = filtros.mesElegido(mesesDisponibles(sesion.mesEnCurso))

  // Los indicadores, siempre los cuatro meses hasta el actual; el detalle, del mes elegido (otra consulta solo si hace falta)
  const base = filtros.consulta.toString()
  const resumen = useConsulta<Devoluciones>(`/devoluciones${base ? `?${base}` : ''}`, 'No pudimos cargar las devoluciones. Probá de nuevo.')
  const consultaMes = new URLSearchParams(filtros.consulta)
  if (mes) {
    consultaMes.set('mesDesde', mes)
    consultaMes.set('mesHasta', mes)
  }
  const detalle = useConsulta<Devoluciones>(mes ? `/devoluciones?${consultaMes}` : null, 'No pudimos cargar el detalle del mes.')
  const delMes = mes ? detalle : resumen
  const d = delMes.errores.length ? null : delMes.datos
  const errores = [...resumen.errores, ...(mes ? detalle.errores : [])]
  const ficha = useAbrirFicha('Devoluciones', `pestana=devoluciones${mes ? `&mesDev=${mes}` : ''}`)
  useRecordarAltura(!!d)
  const nombreDelMes = d ? nombreMes(d.mes) : ''
  const kpiElegido = resumen.errores.length ? null : resumen.datos?.kpis.find((k) => k.mes === (mes ?? sesion.mesEnCurso))

  return (
    <section className="pagina cob dev">
      <BarraFiltros filtros={filtros} />

      <div className={resumen.cargando || detalle.cargando ? 'cob-tarjeta-principal recargando' : 'cob-tarjeta-principal'}>
        <header className="cob-resumen">
          <div className="cob-resumen-textos ayuda-ancla">
            <h1>{titulo}</h1>
            <p>
              Bultos devueltos sobre lo facturado (vendidos + devueltos), por mes.
              {filtros.ayuda && kpiElegido && (
                <Ayuda etiqueta={`Cómo se calculó ${nombreMes(kpiElegido.mes)}`}>
                  <ExplicacionDevoluciones k={kpiElegido} ayuda={filtros.ayuda} />
                </Ayuda>
              )}
            </p>
          </div>
          {resumen.datos && !resumen.errores.length && (
            <ol className="dev-kpis" aria-label="Devoluciones por mes">
              {resumen.datos.kpis.map((k) => {
                const elegido = (mes ?? sesion.mesEnCurso) === k.mes
                return (
                  <li key={k.mes}>
                    <button
                      type="button"
                      className={`dev-kpi${k.mesEnCurso ? ' en-curso' : ''}`}
                      aria-pressed={elegido}
                      onClick={() => cambiar('mes', k.mes === sesion.mesEnCurso ? null : k.mes)}
                    >
                      <span className="dev-kpi-valor">{pct(k.porcentaje)}</span>
                      <span className="dev-kpi-mes">
                        {nombreMesTitulo(k.mes)}
                        {k.mesEnCurso && k.corteAl && <span className="dev-kpi-corte"> al {formatoFechaCorta(k.corteAl)}</span>}
                      </span>
                      <span className="dev-kpi-detalle">
                        {esOperario
                          ? 'de lo facturado'
                          : `${formatoBultos(k.bultosDevueltos ?? 0)} de ${formatoBultos((k.bultosVendidos ?? 0) + (k.bultosDevueltos ?? 0))} bultos`}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ol>
          )}
        </header>

        {errores.length > 0 ? (
          <ErrorCarga
            errores={errores}
            onReintentar={() => {
              resumen.recargar()
              if (mes) detalle.recargar()
            }}
            acento
          />
        ) : !d ? (
          <div className="cob-estado"><LoadingDefault texto="Cargando las devoluciones…" /></div>
        ) : (
          <div className="dev-cuerpo">
            <section className="dev-bloque" aria-labelledby="dev-clientes">
              <h2 id="dev-clientes">
                Clientes con devoluciones en {nombreDelMes} <span className="dev-cantidad">{d.clientes.length}</span>
              </h2>
              {d.clientes.length === 0 ? (
                <p className="vacio">Ningún cliente devolvió en {nombreDelMes}.</p>
              ) : angosto ? (
                <ul className="cob-tarjetas">
                  {d.clientes.map((c) => (
                    <TarjetaCliente key={c.idCliente} cliente={c} ficha={ficha} conVendedor={conVendedor}>
                      <span className="dev-tarjeta-numeros">
                        <strong>{pct(c.porcentaje)}</strong> · devolvió {formatoBultos(c.bultosDevueltos)} de {formatoBultos(c.bultosVendidos + c.bultosDevueltos)} bultos
                      </span>
                    </TarjetaCliente>
                  ))}
                </ul>
              ) : (
                <div className="cob-tabla-scroll">
                  <table className="cob-tabla dev-tabla">
                    <thead>
                      <tr>
                        <th className="cob-col-codigo">Cód. cliente</th>
                        <th>Razón social</th>
                        <th className="dev-col-num">Facturado</th>
                        <th className="dev-col-num">Devuelto</th>
                        <th className="dev-col-num">%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.clientes.map((c) => (
                        <FilaCliente key={c.idCliente} cliente={c} ficha={ficha} conVendedor={conVendedor}>
                          <td className="dev-col-num apagado">{formatoBultos(c.bultosVendidos + c.bultosDevueltos)}</td>
                          <td className="dev-col-num">{formatoBultos(c.bultosDevueltos)}</td>
                          <td className="dev-col-num"><strong>{pct(c.porcentaje)}</strong></td>
                        </FilaCliente>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="dev-bloque" aria-labelledby="dev-articulos">
              <h2 id="dev-articulos">
                Artículos más devueltos <span className="dev-cantidad">{d.articulos.length}</span>
              </h2>
              {d.articulos.length === 0 ? (
                <p className="vacio">Sin artículos devueltos en {nombreDelMes}.</p>
              ) : (
                <ol className="dev-articulos">
                  {d.articulos.map((a) => (
                    <li key={a.idArticulo}>
                      <NombreArticulo articulo={a} className="dev-articulo-nombre" />
                      {esOperario ? (
                        <span className="dev-articulo-numeros">
                          <strong>{pct(a.porcentaje)}</strong>
                          <span className="apagado">de lo facturado</span>
                        </span>
                      ) : (
                        <span className="dev-articulo-numeros">
                          <span><strong>{formatoBultos(a.bultosDevueltos ?? 0)}</strong> {a.bultosDevueltos === 1 ? 'bulto' : 'bultos'}</span>
                          <span className="apagado">{pct(a.porcentaje)} de lo facturado</span>
                        </span>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </div>
        )}
      </div>
    </section>
  )
}
