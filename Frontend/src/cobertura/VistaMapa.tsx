import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { Fragment, useEffect, useMemo, useState } from 'react'
import { CircleMarker, MapContainer, Popup, TileLayer, Tooltip, useMap } from 'react-leaflet'
import { Link } from 'react-router-dom'
import type { ClienteCobertura, Cobertura, OpcionVendedor } from '../api/types'
import { ExpandirMapa } from '../components/mapa/ExpandirMapa'
import { formatoEntero, nombreMesCorto, nombreMesTitulo } from '../utils/formato'
import { COLOR_DEJO, COLOR_OTROS, colorVendedor } from './colores'
import { detalleCliente, nombrePropio } from './estados'
import './mapa-cobertura.css'

/** Cómo se dibuja un cliente en el mes elegido (lleno = compró; hueco = no; punteado = todavía no; aro rojo = dejó). */
type Marca = 'compro' | 'noCompro' | 'sinCompraAun' | 'dejo'

const MARCAS: { marca: Marca; texto: string }[] = [
  { marca: 'compro', texto: 'Compró' },
  { marca: 'noCompro', texto: 'No compró' },
  { marca: 'sinCompraAun', texto: 'Todavía no compró' },
  { marca: 'dejo', texto: 'Dejó de comprar' },
]

/**
 * El estado del cliente en el mes elegido, que es el último de `meses` (la consulta va con `mesHasta` = ese mes, así
 * cartera, color y estado son todos de ese mes). En el mes en curso, la marca de la fila (`dejoDeComprar`) también
 * cuenta: dejó en el último mes cerrado y todavía no volvió.
 */
function marcaDe(c: ClienteCobertura): Marca | null {
  const estado = c.meses[c.meses.length - 1]
  if (estado === 'fueraDeCartera') return null
  if (estado === 'compro') return 'compro'
  if (estado === 'dejoDeComprar' || c.dejoDeComprar) return 'dejo'
  return estado === 'sinCompraAun' ? 'sinCompraAun' : 'noCompro'
}

const TEXTO_MARCA: Record<Marca, string> = { compro: 'compró', noCompro: 'no compró', sinCompraAun: 'todavía no compró', dejo: 'dejó de comprar' }
/** Lo que no compró va arriba: es lo que se sale a buscar. */
const ORDEN_DIBUJO: Record<Marca, number> = { compro: 0, noCompro: 1, sinCompraAun: 1, dejo: 2 }

interface Props {
  datos: Cobertura
  /** Meses que se pueden elegir (desde el primero con datos hasta el en curso). */
  mesesDisponibles: string[]
  onMes: (mes: string) => void
  /** Para nombrar a los vendedores en la leyenda. */
  vendedores: OpcionVendedor[]
  /** Con más de un vendedor a la vista, la leyenda permite apagarlos. */
  conVendedores: boolean
}

// Centro del Gran San Miguel de Tucumán, solo hasta el primer encuadre
const CENTRO_INICIAL: L.LatLngTuple = [-26.82, -65.22]

/**
 * Cobertura en el mapa (prueba pedida por el usuario el 26/10): la misma vista que la tabla —mismos filtros, chips y
 * búsqueda— en un mes elegido, con cada cliente en su ubicación de Chess, del color de su vendedor, lleno si compró y
 * hueco si no. El mapa es el de De Ruta (Leaflet en canvas, fondo OSM en grises, «Expandir mapa»). La tabla sigue siendo
 * la vista accesible: el mapa no se recorre con el teclado.
 */
export default function VistaMapa({ datos, mesesDisponibles, onMes, vendedores, conVendedores }: Props) {
  const [vendedoresApagados, setVendedoresApagados] = useState<Set<string>>(() => new Set())
  const [marcasApagadas, setMarcasApagadas] = useState<Set<Marca>>(() => new Set())
  const mes = datos.meses[datos.meses.length - 1]
  const mesEnCurso = datos.kpis[datos.kpis.length - 1]?.mesEnCurso ?? false

  const clientes = useMemo(
    () =>
      datos.clientes
        .map((c) => ({ c, marca: marcaDe(c), vendedor: String(c.idPersonal ?? 'sin') }))
        .filter((x): x is { c: ClienteCobertura; marca: Marca; vendedor: string } => x.marca !== null),
    [datos.clientes],
  )
  const conUbicacion = useMemo(() => clientes.filter((x) => x.c.lat !== null && x.c.lng !== null), [clientes])
  const puntos = useMemo(() => conUbicacion.map((x) => [x.c.lat!, x.c.lng!] as L.LatLngTuple), [conUbicacion])
  const sinUbicacion = clientes.length - conUbicacion.length
  const visibles = conUbicacion
    .filter((x) => !vendedoresApagados.has(x.vendedor) && !marcasApagadas.has(x.marca))
    .sort((a, b) => ORDEN_DIBUJO[a.marca] - ORDEN_DIBUJO[b.marca])

  // Leyenda de vendedores: los que tienen clientes en el mapa, en el orden de la sesión (por nombre, la casa al final)
  const leyendaVendedores = useMemo(() => {
    const cantidades = new Map<string, number>()
    for (const x of conUbicacion) cantidades.set(x.vendedor, (cantidades.get(x.vendedor) ?? 0) + 1)
    const conocidos = vendedores
      .filter((v) => cantidades.has(String(v.id)))
      .map((v) => ({ clave: String(v.id), nombre: v.esCasa ? v.nombre : nombrePropio(v.nombre), color: colorVendedor(v.id), cantidad: cantidades.get(String(v.id))! }))
    const sinVendedor = cantidades.get('sin')
    return sinVendedor ? [...conocidos, { clave: 'sin', nombre: 'Sin vendedor', color: COLOR_OTROS, cantidad: sinVendedor }] : conocidos
  }, [conUbicacion, vendedores])

  const cantidadPorMarca = (m: Marca) => conUbicacion.filter((x) => x.marca === m && !vendedoresApagados.has(x.vendedor)).length
  const alternar = <T,>(conjunto: Set<T>, valor: T) => {
    const nuevo = new Set(conjunto)
    if (nuevo.has(valor)) nuevo.delete(valor)
    else nuevo.add(valor)
    return nuevo
  }

  return (
    <div className="mapa-cob">
      <div className="mapa-cob-mapa">
        <MapContainer className="mapa-cob-leaflet" center={CENTRO_INICIAL} zoom={11} preferCanvas scrollWheelZoom>
          <ExpandirMapa />
          {/* TODO: para producción, un proveedor de mosaicos con clave (los de OSM son para uso liviano), como en De Ruta */}
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
            maxZoom={19}
          />
          {visibles.map(({ c, marca }) => (
            <Fragment key={c.idCliente}>
              {marca === 'dejo' && (
                <CircleMarker center={[c.lat!, c.lng!]} radius={9} interactive={false} pathOptions={{ color: COLOR_DEJO, weight: 2, fill: false }} />
              )}
              <CircleMarker center={[c.lat!, c.lng!]} radius={marca === 'compro' ? 6.5 : 6} pathOptions={estiloMarca(marca, colorVendedor(c.idPersonal))}>
                <Tooltip direction="top" offset={[0, -6]}>
                  <strong>{c.razonSocial}</strong> · {TEXTO_MARCA[marca]}
                </Tooltip>
                <Popup>
                  <div className="mapa-cob-popup">
                    <strong>{c.razonSocial}</strong>
                    <span className="apagado">
                      {c.idCliente} · {detalleCliente(c, true)}
                    </span>
                    <span className={`mapa-cob-popup-estado ${marca}`}>
                      {nombreMesTitulo(mes)}: {TEXTO_MARCA[marca]}
                    </span>
                    <Link to={`/cliente/${c.idCliente}`} className="enlace">
                      Ver ficha
                      <span className="icono icono-chico" aria-hidden>arrow_forward</span>
                    </Link>
                  </div>
                </Popup>
              </CircleMarker>
            </Fragment>
          ))}
          <Encuadre puntos={puntos} />
        </MapContainer>
      </div>

      <aside className="mapa-cob-panel" aria-label="Leyenda y filtros del mapa">
        <section className="mapa-cob-bloque">
          <h2>Mes</h2>
          <div className="segmentado mapa-cob-meses" role="group" aria-label="Mes del mapa">
            {mesesDisponibles.map((m) => (
              <button key={m} type="button" aria-pressed={m === mes} title={nombreMesTitulo(m)} onClick={() => onMes(m)}>
                {nombreMesCorto(m).replace(/^./, (l) => l.toUpperCase())}
              </button>
            ))}
          </div>
          {mesEnCurso && <p className="mapa-cob-nota">Es el mes en curso: los que todavía no compraron no son una alarma.</p>}
        </section>

        <section className="mapa-cob-bloque">
          <h2>{nombreMesTitulo(mes)}</h2>
          <ul className="mapa-cob-lista">
            {/* En el mes en curso no hay «no compró» (es «todavía no»); en uno cerrado, no hay «todavía no» */}
            {MARCAS.filter((m) => (mesEnCurso ? m.marca !== 'noCompro' : m.marca !== 'sinCompraAun')).map(({ marca, texto }) => (
              <li key={marca}>
                <label className="check-linea">
                  <input type="checkbox" checked={!marcasApagadas.has(marca)} onChange={() => setMarcasApagadas((s) => alternar(s, marca))} />
                  <span className={`mapa-cob-simbolo ${marca}`} aria-hidden />
                  {texto}
                  <span className="mapa-cob-cantidad">{formatoEntero(cantidadPorMarca(marca))}</span>
                </label>
              </li>
            ))}
          </ul>
        </section>

        {conVendedores && leyendaVendedores.length > 0 && (
          <section className="mapa-cob-bloque">
            <h2>Vendedores</h2>
            <ul className="mapa-cob-lista">
              {leyendaVendedores.map((v) => (
                <li key={v.clave}>
                  <label className="check-linea">
                    <input
                      type="checkbox"
                      checked={!vendedoresApagados.has(v.clave)}
                      onChange={() => setVendedoresApagados((s) => alternar(s, v.clave))}
                    />
                    <span className="mapa-cob-muestra" style={{ background: v.color }} aria-hidden />
                    <span className="mapa-cob-nombre">{v.nombre}</span>
                    <span className="mapa-cob-cantidad">{formatoEntero(v.cantidad)}</span>
                  </label>
                </li>
              ))}
            </ul>
          </section>
        )}

        {sinUbicacion > 0 && (
          <p className="mapa-cob-bloque aviso-bloque mapa-cob-sin">
            <span className="icono icono-chico" aria-hidden>location_off</span>
            <span>
              {formatoEntero(sinUbicacion)} {sinUbicacion === 1 ? 'cliente no tiene' : 'clientes no tienen'} ubicación en Chess y no están en el mapa.
              Se ven en la tabla.
            </span>
          </p>
        )}
      </aside>
    </div>
  )
}

/** Lleno del color del vendedor si compró; si no, hueco con el borde del color (punteado en el mes en curso). */
function estiloMarca(marca: Marca, color: string): L.PathOptions {
  if (marca === 'compro') return { color: '#ffffff', weight: 1.5, fillColor: color, fillOpacity: 1 }
  return { color, weight: 2.5, fillColor: '#ffffff', fillOpacity: 1, dashArray: marca === 'sinCompraAun' ? '3 3' : undefined }
}

/**
 * Encuadra los clientes cada vez que llega una respuesta nueva (filtros, chip, búsqueda o mes). Apagar o prender algo en
 * la leyenda no mueve el mapa: `puntos` solo cambia con los datos. Con muchos puntos se encuadra el núcleo (sin el 3 %
 * más alejado de cada lado): unos pocos clientes de Concepción o Famaillá no achican el Gran Tucumán a un manchón; se
 * ven alejando el zoom.
 */
function Encuadre({ puntos }: { puntos: L.LatLngTuple[] }) {
  const mapa = useMap()
  useEffect(() => {
    if (!puntos.length) return
    mapa.fitBounds(limitesDelNucleo(puntos), { padding: [28, 28], maxZoom: 15 })
  }, [puntos, mapa])
  return null
}

function limitesDelNucleo(puntos: L.LatLngTuple[]) {
  if (puntos.length < 30) return L.latLngBounds(puntos)
  const corte = Math.floor(puntos.length * 0.03)
  const lats = puntos.map((p) => p[0]).sort((a, b) => a - b)
  const lngs = puntos.map((p) => p[1]).sort((a, b) => a - b)
  const ultimo = puntos.length - 1 - corte
  return L.latLngBounds([lats[corte], lngs[corte]], [lats[ultimo], lngs[ultimo]])
}
