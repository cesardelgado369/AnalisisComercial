import { Suspense, lazy, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import type { ChipCobertura, Cobertura } from '../api/types'
import { useConsulta } from '../api/useConsulta'
import { BarraFiltros, deLista, useFiltrosComerciales } from '../comercial/filtros'
import { Chips, SinClientes } from '../comercial/lista'
import { useVistaFocos } from '../comercial/mesReferencia'
import { TituloTarjeta } from '../comercial/TituloTarjeta'
import { ErrorCarga } from '../components/ErrorCarga'
import { Segmentado } from '../components/Segmentado'
import { LoadingDefault } from '../components/loading/LoadingDefault'
import { formatoEntero, nombreMes } from '../utils/formato'
import { useRecordarAltura } from '../utils/useRecordarAltura'
import { BuscadorCobertura } from './BuscadorCobertura'
import { CHIPS, textoChip } from './estados'
import { ResumenCobertura } from './ResumenCobertura'
import { TablaCobertura, type Orden } from './TablaCobertura'
import { VistaFocos } from './VistaFocos'
import './cobertura.css'

/** El mapa (Leaflet) se baja recién cuando alguien lo abre: no pesa en la tabla. */
const VistaMapa = lazy(() => import('./VistaMapa'))

const ORDENES: Orden[] = ['codigo', 'codigo-desc', 'nombre', 'nombre-desc']

/**
 * Cobertura de clientes (`/`): la pantalla que la gente ya conoce de la web actual. Filtros (vendedor, día de visita,
 * unidad de negocio), la tarjeta con un indicador por mes, los chips y el buscador, y los clientes en una tabla o en
 * el mapa.
 *
 * - Filtros, chip, búsqueda, orden, vista y mes viven en la **URL** (`?vendedor=2&dia=2&chip=dejaronDeComprar`): se
 *   puede compartir el link o volver atrás. Cambiar cualquiera hace **una sola** llamada a `GET /api/cobertura`.
 * - **Todos los números los arma la API** (cartera de cada mes, porcentajes, chips, «dejó de comprar»): acá solo se
 *   muestran. El orden de la tabla es lo único que se resuelve en el navegador.
 * - El operario de un solo vendedor no ve el filtro de vendedor (la API lo deja fijo en él); la lista sale de
 *   `/api/sesion`. Los filtros son los de `useFiltrosComerciales`, los mismos de Volumen y Devoluciones.
 * - El dueño tiene una tercera vista, **Focos** (`?vista=focos`, Cesar 05/11; también con «Focos» junto al mes de la
 *   cabecera): una columna por foco del mes en lugar de los meses (VistaFocos).
 */
export function CoberturaPage() {
  const filtros = useFiltrosComerciales()
  const { sesion, params, cambiar, buscar, elegirChip, verTodos, busqueda, conVendedor, titulo, mesRef, ventana } = filtros
  const chip = deLista<ChipCobertura>(params.get('chip'), CHIPS, 'todos')
  const orden = deLista<Orden>(params.get('orden'), ORDENES, 'codigo')
  const esAdmin = sesion.rol === 'admin'
  const vistaUrl = params.get('vista')
  const vista: 'tabla' | 'mapa' | 'focos' = vistaUrl === 'mapa' ? 'mapa' : vistaUrl === 'focos' && esAdmin ? 'focos' : 'tabla'
  const vistaFocos = useVistaFocos()
  const navegar = useNavigate()
  // Los cuatro meses en los que está parada la app (el en curso y los tres anteriores, o los del mes que eligió el
  // dueño). Mes de corte (`mesHasta`): el último, o otro de esos que se elija en el mapa; la cartera, los colores del
  // mapa y el compró o no compró son todos de ese mes (lo resuelve la API).
  const mes = filtros.mesElegido(ventana)

  const consulta = new URLSearchParams(filtros.consulta)
  if (busqueda) consulta.set('busqueda', busqueda)
  if (chip !== 'todos') consulta.set('chip', chip)
  consulta.set('mesDesde', ventana[0])
  consulta.set('mesHasta', mes ?? mesRef)
  const qs = consulta.toString()

  // En la vista por focos esta consulta no hace falta: VistaFocos hace las suyas
  const { datos, errores, cargando, recargar } = useConsulta<Cobertura>(
    vista === 'focos' ? null : `/cobertura${qs ? `?${qs}` : ''}`,
    'No pudimos cargar los datos. Probá de nuevo.',
  )
  // Con un error no se muestran los números de la consulta anterior (serían de otros filtros)
  const vigentes = errores.length ? null : datos
  const cambiarOrden = useCallback((o: Orden) => cambiar('orden', o === 'codigo' ? null : o, false), [cambiar])
  useRecordarAltura(!!datos)

  const mesFinal = vigentes?.meses.length ? nombreMes(vigentes.meses[vigentes.meses.length - 1]) : null
  const filtrado = !!busqueda || chip !== 'todos'

  const selectorVista = (
    <Segmentado
      etiqueta="Cómo ver los clientes"
      valor={vista}
      opciones={[
        { valor: 'tabla', texto: 'Tabla' },
        { valor: 'mapa', texto: 'Mapa' },
        ...(esAdmin ? [{ valor: 'focos' as const, texto: 'Focos' }] : []),
      ]}
      onCambio={(v) => (v === 'focos' ? navegar(vistaFocos.destino) : cambiar('vista', v === 'mapa' ? 'mapa' : null))}
    />
  )

  if (vista === 'focos')
    return (
      <section className="pagina cob">
        <BarraFiltros filtros={filtros} sinFoco />
        {/* Los focos son los del mes en el que está parada la app: el mes de corte del mapa no cuenta acá */}
        <VistaFocos filtros={filtros} mes={mesRef} orden={orden} onOrden={cambiarOrden} selectorVista={selectorVista} />
      </section>
    )

  return (
    <section className="pagina cob">
      <BarraFiltros filtros={filtros} />

      <div className={cargando && datos ? 'cob-tarjeta-principal recargando' : 'cob-tarjeta-principal'} aria-busy={cargando}>
        <TituloTarjeta titulo={titulo} />
        {vigentes ? (
          // Sin el «715 clientes, todos los días…» (Cesar, 10/11): los filtros ya dicen qué se está mirando
          <ResumenCobertura kpis={vigentes.kpis} ayuda={filtros.ayuda} />
        ) : errores.length === 0 ? (
          <header className="cob-resumen">
            <div className="cob-resumen-textos">
              <span className="esqueleto esqueleto-linea" />
            </div>
          </header>
        ) : null}

        <div className="cob-barra">
          <Chips
            chips={CHIPS}
            elegido={chip}
            alerta="dejaronDeComprar"
            texto={(c) => textoChip(c, mesFinal)}
            cantidades={vigentes?.chips ?? null}
            onElegir={elegirChip}
          />
          <BuscadorCobertura busqueda={busqueda} onBuscar={buscar} />
          {selectorVista}
        </div>

        <div className="cob-cuerpo">
          {errores.length > 0 ? (
            <ErrorCarga errores={errores} onReintentar={recargar} acento />
          ) : !datos ? (
            <EsqueletoTabla />
          ) : datos.clientes.length === 0 ? (
            <SinClientes icono="person_search" filtrado={filtrado} onVerTodos={verTodos} />
          ) : vista === 'mapa' ? (
            <Suspense fallback={<div className="cob-estado"><LoadingDefault texto="Cargando el mapa…" /></div>}>
              <VistaMapa
                datos={datos}
                mesesDisponibles={ventana}
                onMes={(m) => cambiar('mes', m === mesRef ? null : m)}
                vendedores={sesion.vendedores}
                conVendedores={conVendedor}
              />
            </Suspense>
          ) : (
            <>
              {filtrado && (
                <p className="cob-conteo">
                  {formatoEntero(datos.clientes.length)} de {formatoEntero(datos.chips.todos)} clientes
                </p>
              )}
              <TablaCobertura clientes={datos.clientes} meses={datos.meses} orden={orden} onOrden={cambiarOrden} conVendedor={conVendedor} />
            </>
          )}
        </div>
      </div>
    </section>
  )
}

/** Mientras llega la primera respuesta: el esqueleto de la tabla (sin animación si se pide menos movimiento). */
function EsqueletoTabla() {
  return (
    <div className="cob-esqueleto" role="status" aria-label="Cargando clientes">
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="cob-esqueleto-fila">
          <span className="esqueleto esqueleto-codigo" />
          <span className="esqueleto esqueleto-nombre" />
          <span className="cob-esqueleto-meses">
            {Array.from({ length: 4 }, (_, j) => (
              <span key={j} className="esqueleto esqueleto-circulo" />
            ))}
          </span>
        </div>
      ))}
    </div>
  )
}
