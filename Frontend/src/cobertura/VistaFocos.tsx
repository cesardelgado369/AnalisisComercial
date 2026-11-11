import { memo, useMemo, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ETIQUETA_MEDIDA } from '../admin/medidas'
import { enParalelo } from '../api/enParalelo'
import type { ClienteCobertura, Cobertura, EstadoMes, Foco, Volumen } from '../api/types'
import { useConsulta } from '../api/useConsulta'
import type { Filtros } from '../comercial/filtros'
import { TituloTarjeta } from '../comercial/TituloTarjeta'
import { CabeceraOrden, FilaCliente, SinClientes, TarjetaCliente, useAbrirFicha } from '../comercial/lista'
import { rutaFocos } from '../comercial/mesReferencia'
import { ErrorCarga } from '../components/ErrorCarga'
import { LoadingDefault } from '../components/loading/LoadingDefault'
import { formatoBultos, formatoEntero, formatoFechaCorta, formatoPorcentaje, nombreMes, nombreMesCorto, nombreMesTitulo } from '../utils/formato'
import { useMedia } from '../utils/useMedia'
import { TarjetasPorTandas } from '../comercial/Tandas'
import { BuscadorCobertura } from './BuscadorCobertura'
import { CeldaEstado } from './CeldaEstado'
import { sumarMes } from './estados'
import { ordenar, type Orden } from './TablaCobertura'

/** Lo de un cliente en un foco: CCC, si compró (el estado de Cobertura); VOL, sus bultos contra el mes anterior. */
type Celda = { medida: 'ccc'; estado: EstadoMes } | { medida: 'vol'; bultosActual: number; bultosBase: number | null } | null
type FilaFocos = Pick<ClienteCobertura, 'idCliente' | 'razonSocial' | 'ruta' | 'vendedor' | 'abc'> & { celdas: Celda[] }
/** Lo de arriba de cada foco: el porcentaje, su detalle y el ancho de la barra. */
type Indicador = { valor: number | null; detalle: string }

/**
 * La vista por focos de Cobertura (Cesar, 05/11; solo el dueño): los clientes con una columna por foco del mes en lugar
 * de los meses, y arriba el número de cada foco. Los CCC dicen si el cliente compró algún artículo del foco
 * (`GET /api/cobertura?foco=` de un solo mes); los VOL, cuántos bultos lleva contra el mes anterior al mismo día hábil
 * (`GET /api/volumen?foco=`). Los números los arma la API, acá solo se ponen lado a lado. Los filtros de vendedor, día,
 * unidad y la búsqueda valen igual; los chips no (cada foco tendría los suyos).
 */
export function VistaFocos(props: { filtros: Filtros; mes: string; orden: Orden; onOrden: (o: Orden) => void; selectorVista: ReactNode }) {
  const { filtros, mes, orden, onOrden, selectorVista } = props
  const { focos, busqueda, buscar, verTodos, titulo, conVendedor } = filtros
  const lista = focos.datos

  const rutas = useMemo(() => {
    if (!lista?.length) return null
    const base = new URLSearchParams(filtros.consulta)
    base.delete('foco')
    if (busqueda) base.set('busqueda', busqueda)
    return lista
      .map((f) => {
        const p = new URLSearchParams(base)
        p.set('foco', String(f.idFoco))
        if (f.medida === 'vol') {
          p.set('mes', mes)
          return `/volumen?${p}`
        }
        p.set('mesDesde', mes)
        p.set('mesHasta', mes)
        return `/cobertura?${p}`
      })
      .join('\n')
  }, [lista, filtros.consulta, busqueda, mes])
  const consulta = useConsulta<(Cobertura | Volumen)[]>(rutas, 'No pudimos cargar los focos. Probá de nuevo.', enParalelo)
  // Las respuestas tienen que ser de estos focos (al cambiar de mes llegan otros)
  const respuestas = consulta.errores.length || !lista || consulta.datos?.length !== lista.length ? null : consulta.datos

  const armado = useMemo(() => {
    if (!respuestas || !lista) return null
    const deCcc = (i: number) => (lista[i].medida === 'ccc' ? (respuestas[i] as Cobertura) : null)
    const deVol = (i: number) => (lista[i].medida === 'vol' ? (respuestas[i] as Volumen) : null)
    const porFoco = respuestas.map((_, i) => {
      const c = deCcc(i)
      if (c) return new Map<number, Celda>(c.clientes.map((x) => [x.idCliente, { medida: 'ccc', estado: x.meses[x.meses.length - 1] }]))
      return new Map<number, Celda>(deVol(i)!.clientes.map((x) => [x.idCliente, { medida: 'vol', bultosActual: x.bultosActual, bultosBase: x.bultosBase }]))
    })
    // La cartera es la del mes en todas (el foco no la cambia): las filas salen de la primera
    const primera = respuestas[0]
    const clientes: Pick<ClienteCobertura, 'idCliente' | 'razonSocial' | 'ruta' | 'vendedor' | 'abc'>[] = primera.clientes
    const filas: FilaFocos[] = clientes.map((c) => ({
      idCliente: c.idCliente,
      razonSocial: c.razonSocial,
      ruta: c.ruta,
      vendedor: c.vendedor,
      abc: c.abc,
      celdas: porFoco.map((m) => m.get(c.idCliente) ?? null),
    }))
    const indicadores: Indicador[] = respuestas.map((_, i) => {
      const c = deCcc(i)
      if (c) {
        const k = c.kpis[c.kpis.length - 1]
        return { valor: k.porcentaje, detalle: `${formatoEntero(k.clientesConCompra)} de ${formatoEntero(k.clientesCartera)}` }
      }
      const t = deVol(i)!.total
      return {
        valor: t.porcentaje,
        detalle: t.bultosBase === null ? `${formatoBultos(t.bultosActual ?? 0)} bultos` : `${formatoBultos(t.bultosActual ?? 0)} de ${formatoBultos(t.bultosBase)} bultos`,
      }
    })
    const cartera = 'chips' in primera ? primera.chips.todos : 0
    const corteAl = respuestas.map((_, i) => deCcc(i)?.kpis.at(-1)?.corteAl ?? deVol(i)?.comparacion.corteAl ?? null).find(Boolean) ?? null
    return { filas, indicadores, cartera, corteAl }
  }, [respuestas, lista])

  const hayVol = !!lista?.some((f) => f.medida === 'vol')
  const enCurso = !!respuestas?.some((r) => ('kpis' in r ? r.kpis.at(-1)?.mesEnCurso : (r as Volumen).comparacion.tipo === 'mismoDiaHabil'))

  return (
    <div className={consulta.cargando && consulta.datos ? 'cob-tarjeta-principal recargando' : 'cob-tarjeta-principal'} aria-busy={consulta.cargando}>
      <TituloTarjeta titulo={titulo} />
      {lista && armado ? (
        <header className="cob-resumen">
          <div className="cob-resumen-textos">
            {/* Solo el mes y hasta cuándo hay ventas (Cesar, 10/11: sin «702 clientes, todos los días…») */}
            <p>
              {nombreMesTitulo(mes)}
              {armado.corteAl ? ` al ${formatoFechaCorta(armado.corteAl)}` : ''}
            </p>
          </div>
          <ul className="cob-kpis" aria-label={`Focos de ${nombreMes(mes)}`}>
            {lista.map((f, i) => {
              const k = armado.indicadores[i]
              const pct = k.valor === null ? '—' : formatoPorcentaje(k.valor)
              return (
                <li key={f.idFoco} className="cob-kpi cob-kpi-foco">
                  <span className="cob-kpi-valor">{pct}</span>
                  <span className="cob-kpi-mes">
                    <span className={`foco-medida ${f.medida}`}>{ETIQUETA_MEDIDA[f.medida]}</span> {f.nombre}
                  </span>
                  <span className="cob-kpi-detalle">{k.detalle}</span>
                  <span
                    className="cob-kpi-barra"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.min(100, Math.round(k.valor ?? 0))}
                    aria-label={
                      f.medida === 'vol'
                        ? `${f.nombre}: ${pct} de los bultos de ${nombreMes(sumarMes(mes, -1))} a esta altura`
                        : `${f.nombre}: ${pct} de los clientes compraron`
                    }
                  >
                    <span style={{ width: `${Math.min(100, Math.max(0, k.valor ?? 0))}%` }} />
                  </span>
                </li>
              )
            })}
          </ul>
        </header>
      ) : lista?.length !== 0 && !consulta.errores.length && !focos.errores.length ? (
        <header className="cob-resumen">
          <div className="cob-resumen-textos">
            <span className="esqueleto esqueleto-linea" />
          </div>
        </header>
      ) : null}

      <div className="cob-barra">
        <BuscadorCobertura busqueda={busqueda} onBuscar={buscar} />
        <Referencias mes={mes} enCurso={enCurso} conVol={hayVol} />
        {selectorVista}
      </div>

      <div className="cob-cuerpo">
        {focos.errores.length > 0 ? (
          <ErrorCarga errores={focos.errores} onReintentar={focos.recargar} acento />
        ) : lista?.length === 0 ? (
          <div className="cob-estado">
            <span className="icono cob-estado-icono" aria-hidden>filter_alt</span>
            <p>{nombreMesTitulo(mes)} todavía no tiene focos.</p>
            <Link className="btn" to={rutaFocos(mes)}>Armar los focos de {nombreMes(mes)}</Link>
          </div>
        ) : consulta.errores.length > 0 ? (
          <ErrorCarga errores={consulta.errores} onReintentar={consulta.recargar} acento />
        ) : !lista || !armado ? (
          <div className="cob-estado"><LoadingDefault texto="Cargando los focos…" /></div>
        ) : armado.filas.length === 0 ? (
          <SinClientes icono="person_search" filtrado={!!busqueda} onVerTodos={verTodos} />
        ) : (
          <>
            {busqueda && (
              <p className="cob-conteo">
                {formatoEntero(armado.filas.length)} de {formatoEntero(armado.cartera)} clientes
              </p>
            )}
            <TablaFocos filas={armado.filas} focos={lista} mes={mes} orden={orden} onOrden={onOrden} conVendedor={conVendedor} />
          </>
        )}
      </div>
    </div>
  )
}

/**
 * Qué quiere decir cada marca (Cesar, 05/11: en dibujo, no en texto), con los círculos de la tabla. En el mes en curso,
 * el que todavía no compró va con «–», como en la tabla por meses. Con algún VOL, también sus bultos y la flecha.
 */
function Referencias({ mes, enCurso, conVol }: { mes: string; enCurso: boolean; conVol: boolean }) {
  const corto = `${nombreMesCorto(mes)}.`
  return (
    <p className="cob-referencias" aria-label={`Cada columna cuenta solo los artículos de ese foco en ${nombreMes(mes)}`}>
      <span className="cob-referencia">
        <span className={`estado-mes chico ${enCurso ? 'estado-sinCompraAun' : 'estado-noCompro'}`} aria-hidden>
          <span className="icono">{enCurso ? 'remove' : 'close'}</span>
        </span>
        {enCurso ? 'Todavía no compró' : 'No compró'}
      </span>
      <span className="cob-referencia">
        <span className="estado-mes chico estado-compro" aria-hidden>
          <span className="icono">check</span>
        </span>
        Compró en {corto}
      </span>
      {conVol && (
        <span className="cob-referencia">
          <span className="cob-vol sube" aria-hidden>
            12<span className="icono">arrow_upward</span>
          </span>
          Bultos (VOL)
        </span>
      )}
    </p>
  )
}

/** Una celda VOL: los bultos del mes y la flecha contra el mes anterior al mismo día hábil. */
function CeldaVolumen({ c, etiqueta }: { c: Extract<Celda, { medida: 'vol' }>; etiqueta: string }) {
  const base = c.bultosBase
  const sentido = base === null || c.bultosActual === base ? null : c.bultosActual > base ? 'sube' : 'baja'
  const texto = `${etiqueta}: ${formatoBultos(c.bultosActual)} bultos${base === null ? '' : `; ${formatoBultos(base)} el mes anterior a esta altura`}`
  return (
    <span className={`cob-vol${sentido ? ` ${sentido}` : ''}${c.bultosActual <= 0 ? ' cero' : ''}`} role="img" aria-label={texto} title={texto}>
      {formatoBultos(c.bultosActual)}
      {sentido && <span className="icono" aria-hidden>{sentido === 'sube' ? 'arrow_upward' : 'arrow_downward'}</span>}
    </span>
  )
}

function Marca({ c, foco, mes }: { c: Celda; foco: Foco; mes: string }) {
  const etiqueta = `${foco.nombre} en ${nombreMes(mes)}`
  if (c === null) return <CeldaEstado estado="fueraDeCartera" mes={mes} etiqueta={etiqueta} />
  if (c.medida === 'ccc') return <CeldaEstado estado={c.estado} mes={mes} etiqueta={etiqueta} />
  return <CeldaVolumen c={c} etiqueta={etiqueta} />
}

/** Como la tabla de Cobertura, con los focos en lugar de los meses. En el celular, una tarjeta por cliente. */
const TablaFocos = memo(function TablaFocos(props: {
  filas: FilaFocos[]
  focos: Foco[]
  mes: string
  orden: Orden
  onOrden: (o: Orden) => void
  conVendedor: boolean
}) {
  const { filas, focos, mes, orden, onOrden, conVendedor } = props
  const angosto = useMedia('(max-width: 767px)')
  const ficha = useAbrirFicha('Cobertura')
  const lista = useMemo(() => ordenar(filas, orden), [filas, orden])

  if (angosto) {
    return (
      <TarjetasPorTandas items={lista}>
        {(c) => (
          <TarjetaCliente key={c.idCliente} cliente={c} ficha={ficha} conVendedor={conVendedor}>
            <span className="cob-tarjeta-meses cob-tarjeta-focos">
              {focos.map((f, i) => (
                <span key={f.idFoco} className="cob-tarjeta-mes">
                  <span className="cob-tarjeta-inicial cob-tarjeta-foco" aria-hidden>{f.nombre}</span>
                  <Marca c={c.celdas[i]} foco={f} mes={mes} />
                </span>
              ))}
            </span>
          </TarjetaCliente>
        )}
      </TarjetasPorTandas>
    )
  }

  return (
    <div className="cob-tabla-scroll">
      <table className="cob-tabla">
        <thead>
          <tr>
            <CabeceraOrden campo="codigo" texto="Cód. cliente" orden={orden} onOrden={onOrden} className="cob-col-codigo" />
            <CabeceraOrden campo="nombre" texto="Razón social" orden={orden} onOrden={onOrden} />
            {focos.map((f) => (
              <th key={f.idFoco} className="cob-col-mes cob-col-foco">
                <span className={`foco-medida ${f.medida}`}>{ETIQUETA_MEDIDA[f.medida]}</span> {f.nombre}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lista.map((c) => (
            <FilaCliente key={c.idCliente} cliente={c} ficha={ficha} conVendedor={conVendedor}>
              {focos.map((f, i) => (
                <td key={f.idFoco} className="cob-col-mes">
                  <Marca c={c.celdas[i]} foco={f} mes={mes} />
                </td>
              ))}
            </FilaCliente>
          ))}
        </tbody>
      </table>
    </div>
  )
})
