import { Link } from 'react-router-dom'
import type { AnalisisFocos as Analisis, CoberturaFoco } from '../api/types'
import { useConsulta } from '../api/useConsulta'
import { useMesReferencia } from '../comercial/mesReferencia'
import { ErrorCarga } from '../components/ErrorCarga'
import { LoadingDefault } from '../components/loading/LoadingDefault'
import { nombrePropio } from '../cobertura/estados'
import { formatoEntero, formatoFechaCorta, formatoPorcentaje, nombreMes } from '../utils/formato'

/** La diferencia contra el mes anterior, en puntos (redondeada como los porcentajes). */
const puntos = (c: CoberturaFoco) => (c.porcentajeAnterior === null ? null : Math.round(c.porcentaje) - Math.round(c.porcentajeAnterior))

/** «▲ 3 pts»: con flecha y texto (el color solo acompaña). */
function Diferencia({ c, contra }: { c: CoberturaFoco; contra: string }) {
  const d = puntos(c)
  if (d === null)
    return (
      <span className="foco-dif sin" title={`Sin datos de ${contra}`}>
        —<span className="sr-solo"> sin datos de {contra}</span>
      </span>
    )
  const clase = d > 0 ? 'foco-dif sube' : d < 0 ? 'foco-dif baja' : 'foco-dif igual'
  return (
    <span className={clase} title={`${formatoPorcentaje(c.porcentajeAnterior!)} en ${contra}`}>
      <span className="icono icono-chico" aria-hidden>{d > 0 ? 'arrow_upward' : d < 0 ? 'arrow_downward' : 'remove'}</span>
      {d > 0 ? '+' : ''}
      {d} pts
      <span className="sr-solo"> contra {contra}</span>
    </span>
  )
}

/** La barra del mes (violeta) con la rayita del mes anterior. */
function Barra({ c }: { c: CoberturaFoco }) {
  return (
    <span className="foco-barra" aria-hidden>
      <span className="foco-barra-relleno" style={{ width: `${Math.min(100, c.porcentaje)}%` }} />
      {c.porcentajeAnterior !== null && <span className="foco-barra-antes" style={{ left: `${Math.min(100, c.porcentajeAnterior)}%` }} />}
    </span>
  )
}

/**
 * Cómo vienen vendiendo los focos de un mes (Cesar, 05/11), con el número de Checho: por vendedor, los clientes de su
 * cartera que compraron algún artículo del foco («CCC Manteca», como Cobertura con el foco puesto), contra el mes
 * anterior al mismo día (en un mes cerrado, el anterior completo). Cada vendedor lleva a sus clientes en Cobertura con
 * ese foco. Solo el dueño: `GET /api/admin/focos/analisis`.
 */
export function AnalisisFocos({ mes }: { mes: string }) {
  const analisis = useConsulta<Analisis>(`/admin/focos/analisis?mes=${mes}`, 'No pudimos armar el análisis de los focos.')
  const referencia = useMesReferencia()
  const a = analisis.datos?.mes === mes ? analisis.datos : null
  const enCurso = a?.mesEnCurso ?? false
  const contra = a ? (a.anteriorAl ? `${nombreMes(a.mesAnterior)} al ${formatoFechaCorta(a.anteriorAl)}` : nombreMes(a.mesAnterior)) : ''

  return (
    <section className="tarjeta foco-analisis" aria-labelledby="foco-analisis-titulo">
      <div className="foco-analisis-cabecera">
        <h2 id="foco-analisis-titulo">
          <span className="icono" aria-hidden>query_stats</span>
          {enCurso ? `Cómo vienen los focos de ${nombreMes(mes)}` : `Cómo les fue a los focos de ${nombreMes(mes)}`}
        </h2>
        {a && (
          <p>
            Por vendedor, los clientes de su cartera que compraron algún artículo del foco (lo mismo que Cobertura con el
            foco puesto){a.corteAl ? `, con ventas al ${formatoFechaCorta(a.corteAl)}` : ''}. Tocá un vendedor para ver
            sus clientes.
          </p>
        )}
        {a && (
          <p className="foco-leyenda">
            <span><span className="foco-leyenda-barra" aria-hidden /> {enCurso ? `${nombreMes(mes)} hasta hoy` : nombreMes(mes)}</span>
            <span><span className="foco-leyenda-antes" aria-hidden /> {contra}</span>
          </p>
        )}
      </div>

      {analisis.errores.length > 0 ? (
        <ErrorCarga errores={analisis.errores} onReintentar={analisis.recargar} className="adm-error-carga" />
      ) : !a ? (
        <LoadingDefault texto="Armando el análisis…" />
      ) : a.focos.length === 0 ? (
        <p className="vacio">Sin focos en {nombreMes(mes)}, no hay nada que medir.</p>
      ) : (
        <div className="foco-analisis-grilla">
          {a.focos.map((f) => {
            const vendedores = [...f.vendedores].sort((x, y) => y.porcentaje - x.porcentaje || x.nombre.localeCompare(y.nombre, 'es'))
            return (
              <article key={f.idFoco} className="foco-analisis-foco">
                <header className="foco-analisis-total">
                  <h3>{f.nombre}</h3>
                  <span className="foco-analisis-numero">{formatoPorcentaje(f.total.porcentaje)}</span>
                  <span className="foco-analisis-detalle">
                    {formatoEntero(f.total.clientesConCompra)} de {formatoEntero(f.total.clientesCartera)} clientes
                  </span>
                  <Diferencia c={f.total} contra={contra} />
                </header>
                <Barra c={f.total} />
                <ul className="foco-analisis-vendedores">
                  {vendedores.map((v) => (
                    <li key={v.idPersonal}>
                      <Link
                        to={`/?vendedor=${v.idPersonal}&foco=${f.idFoco}`}
                        className="foco-vendedor"
                        // Cobertura muestra el mes en el que está parada la app: se para en el del análisis
                        onClick={() => referencia.elegir(enCurso ? null : mes)}
                        title={`Los clientes de ${nombrePropio(v.nombre)} en Cobertura, con el foco ${f.nombre}`}
                      >
                        <span className="foco-vendedor-nombre">{nombrePropio(v.nombre)}</span>
                        <Barra c={v} />
                        <span className="foco-vendedor-numeros">
                          <strong>{formatoPorcentaje(v.porcentaje)}</strong>
                          <span className="foco-analisis-detalle">
                            {formatoEntero(v.clientesConCompra)} de {formatoEntero(v.clientesCartera)}
                          </span>
                        </span>
                        <Diferencia c={v} contra={contra} />
                      </Link>
                    </li>
                  ))}
                </ul>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
