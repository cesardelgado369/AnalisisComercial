import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom'
import type { EstadoMes, FichaCliente } from '../api/types'
import { useConsulta } from '../api/useConsulta'
import { useSesionApp } from '../auth/SesionApp'
import { CeldaEstado } from '../cobertura/CeldaEstado'
import { PRIMER_MES, nombrePropio } from '../cobertura/estados'
import { unidadVisible } from '../comercial/filtros'
import { useMesReferencia } from '../comercial/mesReferencia'
import { ErrorCarga } from '../components/ErrorCarga'
import { LoadingDefault } from '../components/loading/LoadingDefault'
import { cantidad, formatoBultos, formatoFecha, nombreMesCorto, nombreMesTitulo } from '../utils/formato'
import { PestanaDevoluciones, PestanaVolumen } from './Pestanas'
import { PestanaLinea } from './PestanaLinea'
import '../cobertura/cobertura.css'
import './ficha.css'

type Pestana = 'linea' | 'compras' | 'volumen' | 'devoluciones'
const PESTANAS: { valor: Pestana; texto: string; icono: string }[] = [
  // Cesar, 12/11: al tocar un cliente, el dueño ve primero cuándo compró y qué devolvió, en orden
  { valor: 'linea', texto: 'Línea de tiempo', icono: 'route' },
  { valor: 'compras', texto: 'Qué compró', icono: 'checklist' },
  { valor: 'volumen', texto: 'Volumen', icono: 'inventory_2' },
  { valor: 'devoluciones', texto: 'Devoluciones', icono: 'assignment_return' },
]

/**
 * Ficha del cliente (`/cliente/:id`, «CCC x bulto»): la cabecera (código, ruta, días de visita, dirección con el mapa,
 * última compra), su estado y sus bultos en cada mes, y cuatro pestañas: la línea de tiempo del mes (cada comprobante en
 * orden, la de la ventanita de Volumen y Devoluciones; Cesar, 12/11), qué compró cada mes (artículos × meses), Volumen
 * (qué bajó y qué subió contra la base) y Devoluciones. La pestaña va en la URL (`?pestana=`). Los meses son los cuatro
 * en los que está parada la app (el en curso y los tres anteriores, o los del mes que eligió el dueño).
 *
 * Gobernanza (CONTRATO_API.md): operario y supervisor solo ven los meses en que el cliente estuvo en **su** cartera. Los
 * otros los manda la API como `fueraDeCartera`, sin bultos ni artículos; acá van rayados y sin ningún dato.
 */
export function FichaPage() {
  const { id } = useParams()
  const [params, setParams] = useSearchParams()
  const { state } = useLocation() as { state: { volver?: string; seccion?: string } | null }
  const sesion = useSesionApp()
  const esOperario = sesion.rol === 'operario'
  const deCartera = sesion.rol !== 'admin'
  const pestanaUrl = params.get('pestana') as Pestana | null
  // Sin `veBultos` (hoy, el operario) la ficha es solo «Qué compró»: la línea de tiempo, Volumen y Devoluciones le darían
  // 403. Con bultos, de entrada la línea de tiempo
  const pestanas = sesion.veBultos ? PESTANAS : PESTANAS.filter((p) => p.valor === 'compras')
  const defecto = pestanas[0].valor
  const pestana: Pestana = pestanas.some((p) => p.valor === pestanaUrl) ? pestanaUrl! : defecto
  const idCliente = Number(id)
  const { mes: mesRef, ventana } = useMesReferencia()
  const rango = `mesDesde=${ventana[0]}&mesHasta=${mesRef}`
  const ruta = Number.isInteger(idCliente) && idCliente > 0 ? `/clientes/${idCliente}?${rango}` : null
  // El mes de las pestañas, si es uno de los que se ven (Volumen no compara julio: no tiene mes anterior)
  const mesDe = (clave: string, validos: string[]) => {
    const m = params.get(clave)
    return m && m !== mesRef && validos.includes(m) ? m : null
  }
  const mesVol = mesDe('mesVol', ventana.filter((m) => m !== PRIMER_MES)) ?? mesRef
  const { datos: f, errores, cargando, recargar } = useConsulta<FichaCliente>(ruta, 'No pudimos cargar la ficha. Probá de nuevo.')

  /** Cambia un parámetro de la ficha sin sumar entradas al historial (Atrás vuelve a la lista). */
  const cambiar = (clave: string, valor: string | null) => {
    const p = new URLSearchParams(window.location.search)
    if (valor) p.set(clave, valor)
    else p.delete(clave)
    setParams(p, { replace: true, state })
  }

  const enlaceVolver = (
    <Link to={state?.volver ?? '/'} className="ficha-volver">
      <span className="icono icono-chico" aria-hidden>arrow_back</span>
      Volver a {state?.seccion ?? 'Cobertura'}
    </Link>
  )

  if (ruta === null) {
    return (
      <section className="pagina ficha">
        {enlaceVolver}
        <p className="aviso aviso-error">Ese código de cliente no es válido.</p>
      </section>
    )
  }

  if (errores.length) {
    return (
      <section className="pagina ficha">
        {enlaceVolver}
        <ErrorCarga errores={errores} onReintentar={recargar} className="ficha-error" />
      </section>
    )
  }

  if (!f) {
    return (
      <section className="pagina ficha">
        {enlaceVolver}
        <LoadingDefault texto="Cargando la ficha…" />
      </section>
    )
  }

  const fuera = f.estados.map((e) => e === 'fueraDeCartera')
  const ultimo = f.meses.length - 1
  const enCurso = f.meses[ultimo] === sesion.mesEnCurso
  // El vendedor de un solo vendedor de Chess ya sabe que es él: no se repite
  const mostrarVendedor = !sesion.vendedor
  const textoFuera = esOperario ? 'Fuera de tu cartera' : 'Fuera de cartera'

  /** El estado de un artículo en un mes, con los mismos círculos de Cobertura. */
  const estadoArticulo = (compro: boolean, i: number): EstadoMes =>
    compro ? 'compro' : fuera[i] ? 'fueraDeCartera' : enCurso && i === ultimo ? 'sinCompraAun' : 'noCompro'

  return (
    <section className={`pagina ficha${cargando ? ' recargando' : ''}`}>
      {enlaceVolver}

      <header className="tarjeta ficha-cabecera">
        <div className="ficha-titulo">
          <h1>{f.razonSocial}</h1>
          <p className="ficha-subtitulo">
            <span className="ficha-codigo">Cód. {f.idCliente}</span>
            <span>{f.ruta ? nombrePropio(f.ruta) : 'Sin ruta'}</span>
            {mostrarVendedor && <span>{f.vendedor ? nombrePropio(f.vendedor) : 'Sin vendedor'}</span>}
          </p>
        </div>

        {deCartera && !f.enCartera && (
          <p className="aviso aviso-alerta ficha-aviso">
            {esOperario ? 'Este cliente ya no está en tu cartera.' : 'Este cliente ya no está en la cartera de tus vendedores.'} Ves solo
            los meses en que {esOperario ? 'fue tuyo' : 'fue de ellos'}.
          </p>
        )}

        <dl className="ficha-datos">
          <div>
            <dt>Días de visita</dt>
            <dd>{f.diasVisita}</dd>
          </div>
          <div>
            <dt>Dirección</dt>
            <dd>
              {f.direccion ? nombrePropio(f.direccion) : 'Sin dirección en Chess'}
              {f.lat !== null && f.lng !== null && (
                <a
                  className="ficha-mapa enlace"
                  href={`https://www.google.com/maps/search/?api=1&query=${f.lat},${f.lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <span className="icono icono-chico" aria-hidden>map</span>
                  Ver en el mapa
                </a>
              )}
            </dd>
          </div>
          <div>
            <dt>Última compra</dt>
            <dd>
              {f.ultimaCompra ? formatoFecha(f.ultimaCompra) : deCartera ? `Sin compras en ${esOperario ? 'tu' : 'la'} cartera` : 'Sin compras'}
              {f.diasSinComprar !== null && (
                <span className={`ficha-dias${f.diasSinComprar >= 60 ? ' alerta' : ''}`}>
                  {f.diasSinComprar === 0 ? 'hoy' : `hace ${cantidad(f.diasSinComprar, 'día')}`}
                </span>
              )}
            </dd>
          </div>
        </dl>

        <ol className="ficha-meses" aria-label="Estado y bultos de cada mes">
          {f.meses.map((m, i) => (
            <li key={m} className={fuera[i] ? 'fuera' : undefined}>
              <span className="ficha-mes-nombre">
                <span className="ficha-mes-largo">{nombreMesTitulo(m)}</span>
                <span className="ficha-mes-corto" aria-hidden>{nombreMesCorto(m)}</span>
              </span>
              <CeldaEstado estado={f.estados[i]} mes={m} />
              {fuera[i] ? (
                <span className="ficha-mes-nota">{textoFuera}</span>
              ) : (
                f.bultos[i] !== null && <span className="ficha-mes-bultos">{formatoBultos(f.bultos[i]!)} b.</span>
              )}
            </li>
          ))}
        </ol>
      </header>

      <div className="tarjeta ficha-cuerpo">
        {pestanas.length > 1 ? (
          <div className="pestanas ficha-pestanas" role="group" aria-label="Qué ver del cliente">
            {pestanas.map((p) => (
              <button key={p.valor} type="button" aria-pressed={pestana === p.valor} onClick={() => cambiar('pestana', p.valor === defecto ? null : p.valor)}>
                <span className="icono icono-chico" aria-hidden>{p.icono}</span>
                {p.texto}
              </button>
            ))}
          </div>
        ) : (
          <h2 className="ficha-cuerpo-titulo">
            <span className="icono icono-chico" aria-hidden>{pestanas[0].icono}</span>
            {pestanas[0].texto}
          </h2>
        )}

        {pestana === 'linea' ? (
          <PestanaLinea
            idCliente={f.idCliente}
            meses={f.meses}
            estados={f.estados}
            bultos={f.bultos}
            mes={mesDe('mesMov', ventana)}
            onMes={(m) => cambiar('mesMov', m)}
            esOperario={esOperario}
          />
        ) : pestana === 'volumen' ? (
          mesVol === PRIMER_MES ? (
            <p className="vacio">{nombreMesTitulo(PRIMER_MES)} es el primer mes con datos: no hay un mes anterior para comparar el volumen.</p>
          ) : (
            <PestanaVolumen
              idCliente={f.idCliente}
              mes={mesVol === sesion.mesEnCurso ? null : mesVol}
              mesEnCurso={sesion.mesEnCurso}
              esOperario={esOperario}
            />
          )
        ) : pestana === 'devoluciones' ? (
          <PestanaDevoluciones
            idCliente={f.idCliente}
            rango={rango}
            mes={mesDe('mesDev', ventana)}
            onMes={(m) => cambiar('mesDev', m)}
            esOperario={esOperario}
          />
        ) : f.articulos.length === 0 ? (
          <p className="vacio">{deCartera ? `No compró nada mientras estuvo en ${esOperario ? 'tu' : 'la'} cartera.` : 'No compró nada en estos meses.'}</p>
        ) : (
          <div className="ficha-tabla-scroll">
            <table className="ficha-tabla">
              <caption className="sr-solo">Qué artículos compró cada mes</caption>
              <thead>
                <tr>
                  <th scope="col">Artículo</th>
                  {f.meses.map((m, i) => (
                    <th key={m} scope="col" className={`ficha-col-mes${fuera[i] ? ' fuera' : ''}`}>
                      <span className="ficha-mes-largo">{nombreMesTitulo(m)}</span>
                      <span className="ficha-mes-corto" aria-hidden>{nombreMesCorto(m)}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              {agrupar(f.articulos).map(([unidad, articulos]) => (
                <tbody key={unidad}>
                  <tr className="ficha-grupo">
                    <th scope="colgroup" colSpan={f.meses.length + 1}>
                      {unidadVisible(unidad)} <span className="ficha-grupo-cantidad">{articulos.length}</span>
                    </th>
                  </tr>
                  {articulos.map((a) => (
                    <tr key={a.idArticulo}>
                      <th scope="row" className="ficha-articulo">{nombrePropio(a.descripcion)}</th>
                      {a.meses.map((compro, i) => (
                        <td key={f.meses[i]} className={`ficha-col-mes${fuera[i] ? ' fuera' : ''}`}>
                          <CeldaEstado estado={estadoArticulo(compro, i)} mes={f.meses[i]} chico />
                          {compro && a.bultos[i] !== null && <span className="ficha-celda-bultos">{formatoBultos(a.bultos[i]!)}</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              ))}
            </table>
          </div>
        )}
      </div>
    </section>
  )
}

/** Los artículos por unidad de negocio, en el orden en que vienen (la API los manda por unidad y descripción). */
function agrupar(articulos: FichaCliente['articulos']) {
  const grupos = new Map<string, FichaCliente['articulos']>()
  for (const a of articulos) {
    if (!grupos.has(a.unidadNegocio)) grupos.set(a.unidadNegocio, [])
    grupos.get(a.unidadNegocio)!.push(a)
  }
  return [...grupos.entries()]
}
