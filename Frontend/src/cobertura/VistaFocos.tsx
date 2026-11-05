import { memo, useMemo, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import type { ClienteCobertura, Cobertura, EstadoMes, Foco } from '../api/types'
import { useConsulta } from '../api/useConsulta'
import type { Filtros } from '../comercial/filtros'
import { CabeceraOrden, FilaCliente, SinClientes, TarjetaCliente, useAbrirFicha } from '../comercial/lista'
import { rutaFocos } from '../comercial/mesReferencia'
import { ErrorCarga } from '../components/ErrorCarga'
import { LoadingDefault } from '../components/loading/LoadingDefault'
import { formatoEntero, formatoFechaCorta, formatoPorcentaje, nombreMes, nombreMesCorto, nombreMesTitulo } from '../utils/formato'
import { useMedia } from '../utils/useMedia'
import { BuscadorCobertura } from './BuscadorCobertura'
import { CeldaEstado } from './CeldaEstado'
import { nombrePropio } from './estados'
import { ordenar, type Orden } from './TablaCobertura'

/**
 * Varias consultas a la vez, como si fueran una (para `useConsulta`: caché, errores y recarga): las rutas van
 * separadas por un salto de línea y vuelven en el mismo orden. Si falla una, falla todo.
 */
const enParalelo = {
  get: <R,>(rutas: string) => Promise.all(rutas.split('\n').map((r) => api.get<Cobertura>(r))) as Promise<R>,
}

type FilaFocos = ClienteCobertura & { estados: EstadoMes[] }

/**
 * La vista por focos de Cobertura (Cesar, 05/11; solo el dueño): los clientes con una columna por foco del mes en lugar
 * de los meses, ✓ si ese mes compró algún artículo del foco, y arriba el porcentaje de cada foco. Son las consultas de
 * siempre (`GET /api/cobertura?foco=` de un solo mes, una por foco): los números y el «compró» los arma la API, acá
 * solo se ponen lado a lado. Los filtros de vendedor, día, unidad y la búsqueda valen igual; los chips no (cada foco
 * tendría los suyos).
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
    base.set('mesDesde', mes)
    base.set('mesHasta', mes)
    return lista
      .map((f) => {
        const p = new URLSearchParams(base)
        p.set('foco', String(f.idFoco))
        return `/cobertura?${p}`
      })
      .join('\n')
  }, [lista, filtros.consulta, busqueda, mes])
  const consulta = useConsulta<Cobertura[]>(rutas, 'No pudimos cargar los focos. Probá de nuevo.', enParalelo)
  // Las respuestas tienen que ser de estos focos (al cambiar de mes llegan otros)
  const respuestas = consulta.errores.length || consulta.datos?.length !== lista?.length ? null : consulta.datos

  const filas = useMemo<FilaFocos[] | null>(() => {
    if (!respuestas) return null
    // La cartera es la misma en todas (el foco no la cambia): las filas salen de la primera
    const porFoco = respuestas.map((r) => new Map(r.clientes.map((c) => [c.idCliente, c.meses[c.meses.length - 1]])))
    return respuestas[0].clientes.map((c) => ({ ...c, estados: porFoco.map((m) => m.get(c.idCliente) ?? 'fueraDeCartera') }))
  }, [respuestas])

  const kpis = respuestas?.map((r) => r.kpis[r.kpis.length - 1])
  const corteAl = kpis?.[0]?.corteAl ?? null

  return (
    <div className={consulta.cargando && consulta.datos ? 'cob-tarjeta-principal recargando' : 'cob-tarjeta-principal'} aria-busy={consulta.cargando}>
      {lista && respuestas && kpis ? (
        <header className="cob-resumen">
          <div className="cob-resumen-textos">
            <h1>{nombrePropio(titulo)}</h1>
            <p>
              {filtros.subtitulo(respuestas[0].chips.todos, false)} · {nombreMesTitulo(mes)}
              {corteAl ? ` al ${formatoFechaCorta(corteAl)}` : ''}
            </p>
          </div>
          <ul className="cob-kpis" aria-label={`Focos de ${nombreMes(mes)}`}>
            {lista.map((f, i) => {
              const k = kpis[i]
              const pct = formatoPorcentaje(k.porcentaje)
              return (
                <li key={f.idFoco} className="cob-kpi cob-kpi-foco">
                  <span className="cob-kpi-valor">{pct}</span>
                  <span className="cob-kpi-mes">{f.nombre}</span>
                  <span className="cob-kpi-detalle">
                    {formatoEntero(k.clientesConCompra)} de {formatoEntero(k.clientesCartera)}
                  </span>
                  <span
                    className="cob-kpi-barra"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(k.porcentaje)}
                    aria-label={`${f.nombre}: ${pct} de los clientes compraron`}
                  >
                    <span style={{ width: `${Math.min(100, Math.max(0, k.porcentaje))}%` }} />
                  </span>
                </li>
              )
            })}
          </ul>
        </header>
      ) : lista?.length !== 0 && !consulta.errores.length && !focos.errores.length ? (
        <header className="cob-resumen">
          <div className="cob-resumen-textos">
            <span className="esqueleto esqueleto-titulo" />
            <span className="esqueleto esqueleto-linea" />
          </div>
        </header>
      ) : null}

      <div className="cob-barra">
        <BuscadorCobertura busqueda={busqueda} onBuscar={buscar} />
        <Referencias mes={mes} enCurso={kpis?.[0]?.mesEnCurso ?? false} />
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
        ) : !lista || !filas ? (
          <div className="cob-estado"><LoadingDefault texto="Cargando los focos…" /></div>
        ) : filas.length === 0 ? (
          <SinClientes icono="person_search" filtrado={!!busqueda} onVerTodos={verTodos} />
        ) : (
          <>
            {busqueda && (
              <p className="cob-conteo">
                {formatoEntero(filas.length)} de {formatoEntero(respuestas![0].chips.todos)} clientes
              </p>
            )}
            <TablaFocos filas={filas} focos={lista} mes={mes} orden={orden} onOrden={onOrden} conVendedor={conVendedor} />
          </>
        )}
      </div>
    </div>
  )
}

/**
 * Qué quiere decir cada círculo (Cesar, 05/11: en dibujo, no en texto), con los mismos de la tabla. Cada columna cuenta
 * solo los artículos de su foco. En el mes en curso, el que todavía no compró va con «–», como en la tabla por meses.
 */
function Referencias({ mes, enCurso }: { mes: string; enCurso: boolean }) {
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
    </p>
  )
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
  const etiqueta = (f: Foco) => `${f.nombre} en ${nombreMes(mes)}`

  if (angosto) {
    return (
      <ul className="cob-tarjetas">
        {lista.map((c) => (
          <TarjetaCliente key={c.idCliente} cliente={c} ficha={ficha} conVendedor={conVendedor}>
            <span className="cob-tarjeta-meses cob-tarjeta-focos">
              {focos.map((f, i) => (
                <span key={f.idFoco} className="cob-tarjeta-mes">
                  <span className="cob-tarjeta-inicial cob-tarjeta-foco" aria-hidden>{f.nombre}</span>
                  <CeldaEstado estado={c.estados[i]} mes={mes} etiqueta={etiqueta(f)} />
                </span>
              ))}
            </span>
          </TarjetaCliente>
        ))}
      </ul>
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
              <th key={f.idFoco} className="cob-col-mes cob-col-foco">{f.nombre}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lista.map((c) => (
            <FilaCliente key={c.idCliente} cliente={c} ficha={ficha} conVendedor={conVendedor}>
              {focos.map((f, i) => (
                <td key={f.idFoco} className="cob-col-mes">
                  <CeldaEstado estado={c.estados[i]} mes={mes} etiqueta={etiqueta(f)} />
                </td>
              ))}
            </FilaCliente>
          ))}
        </tbody>
      </table>
    </div>
  )
})
