import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { ClienteAdmin, PaginaClientesAdmin, ResumenClientesVendedor } from '../api/types'
import { useConsulta } from '../api/useConsulta'
import { Paginado } from '../components/Paginado'
import { ErrorCarga } from '../components/ErrorCarga'
import { LoadingDefault } from '../components/loading/LoadingDefault'
import { CeldaEstado } from '../cobertura/CeldaEstado'
import { nombrePropio } from '../cobertura/estados'
import { cantidad, formatoEntero, formatoFecha, nombreMesCorto } from '../utils/formato'
import '../cobertura/cobertura.css'
import './admin.css'

/**
 * Las piezas de las pantallas sobre la base de clientes de Chess (`/api/admin/clientes`, solo admin): Clientes
 * excluidos y Clasificación de clientes. Las dos muestran los clientes por vendedor (grupos plegables) o, con un filtro
 * o una búsqueda, en una lista sola con el vendedor en cada fila; cada pantalla pone su estado y su acción.
 */

const TAMANO = 50
const ESPERA = 300

/** El texto del buscador y lo que se busca (300 ms después de tipear). */
export function useTextoBuscado() {
  const [texto, setTexto] = useState('')
  const [busqueda, setBusqueda] = useState('')
  useEffect(() => {
    const t = setTimeout(() => setBusqueda(texto.trim()), ESPERA)
    return () => clearTimeout(t)
  }, [texto])
  return { texto, setTexto, busqueda }
}

/** Los grupos desplegados de una pantalla (preferencia de cada usuario en este navegador). */
export function useGruposAbiertos(claveGuardado: string) {
  const [abiertos, setAbiertos] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(claveGuardado) ?? '[]') as string[]
    } catch {
      return []
    }
  })
  function alternar(clave: string) {
    const nuevos = abiertos.includes(clave) ? abiertos.filter((x) => x !== clave) : [...abiertos, clave]
    setAbiertos(nuevos)
    try {
      localStorage.setItem(claveGuardado, JSON.stringify(nuevos))
    } catch {
      /* sin almacenamiento: no se recuerda */
    }
  }
  return { abiertos, alternar }
}

/** Un cambio hecho desde la pantalla, con su momento: vale hasta que la API manda datos más nuevos. */
export interface CambioLocal {
  fila: ClienteAdmin
  en: number
}

/** Lo cambiado acá, si es más nuevo que lo que mandó la API; si no, null (manda la API). */
export const cambioVigente = (cambios: Record<number, CambioLocal>, f: ClienteAdmin, recibidoEn: number) => {
  const cambio = cambios[f.idCliente]
  return cambio && cambio.en > recibidoEn ? cambio.fila : null
}

export interface PestanaClientes<F extends string> {
  clave: F
  texto: string
  icono?: ReactNode
  cantidad?: number
}

/** Los filtros (pestañas) y el buscador de clientes. */
export function BarraClientes<F extends string>(props: {
  pestanas: PestanaClientes<F>[]
  filtro: F
  onFiltro: (f: F) => void
  texto: string
  onTexto: (t: string) => void
}) {
  const { pestanas, filtro, onFiltro, texto, onTexto } = props
  return (
    <div className="adm-barra">
      <div className="pestanas" role="group" aria-label="Qué clientes mostrar">
        {pestanas.map((f) => (
          <button key={f.clave} type="button" aria-pressed={filtro === f.clave} onClick={() => onFiltro(f.clave)}>
            {f.icono}
            {f.texto}
            {f.cantidad !== undefined && <span className="adm-cantidad">{formatoEntero(f.cantidad)}</span>}
          </button>
        ))}
      </div>
      <label className="buscador-pagina">
        <span className="sr-solo">Buscar un cliente</span>
        <span className="icono" aria-hidden>search</span>
        <input type="search" placeholder="Buscar cliente o código" value={texto} onChange={(e) => onTexto(e.target.value)} />
      </label>
    </div>
  )
}

/** La clave de un grupo para `?vendedor=`: el `idPersonal`, o `sin` para los clientes sin vendedor. */
const claveGrupo = (r: ResumenClientesVendedor) => (r.idPersonal === null ? 'sin' : String(r.idPersonal))

/** La administración trae el nombre de Chess tal cual, también para la casa («DEPOSITO»). */
const nombreGrupo = (r: ResumenClientesVendedor) =>
  r.vendedor === null ? 'Sin vendedor' : r.esCasa ? `Cuentas de la casa (${nombrePropio(r.vendedor)})` : nombrePropio(r.vendedor)

/**
 * Un grupo plegable por vendedor (en De Ruta se agrupa por A, B y C): la cantidad de clientes y lo que agregue la
 * pantalla (`cuenta`) en la cabecera; la lista, solo si está abierto.
 */
export function GruposPorVendedor(props: {
  resumen: ResumenClientesVendedor[]
  abiertos: string[]
  onAlternar: (clave: string) => void
  cuenta: (r: ResumenClientesVendedor) => ReactNode
  lista: (vendedor: string) => ReactNode
}) {
  const { resumen, abiertos, onAlternar, cuenta, lista } = props
  return (
    <div className="adm-grupos">
      {resumen.map((r) => {
        const clave = claveGrupo(r)
        const abierto = abiertos.includes(clave)
        return (
          <section key={clave} className={abierto ? 'adm-grupo' : 'adm-grupo plegado'}>
            <button type="button" className="adm-grupo-cabecera" aria-expanded={abierto} onClick={() => onAlternar(clave)}>
              <span className="icono" aria-hidden>{abierto ? 'expand_less' : 'expand_more'}</span>
              <span className="adm-grupo-titulo">{nombreGrupo(r)}</span>
              <span className="adm-grupo-cuenta">
                {cantidad(r.clientes, 'cliente')}
                {cuenta(r)}
              </span>
            </button>
            {abierto && <div className="tarjeta adm-tarjeta">{lista(clave)}</div>}
          </section>
        )
      })}
    </div>
  )
}

/** Lo que cada pantalla pone en una fila: el cliente (con lo cambiado acá), la clase, el estado y la acción. */
export interface VistaFila {
  cliente: ClienteAdmin
  clase?: string
  estado: ReactNode
  accion: ReactNode
}

/**
 * `GET /admin/clientes` paginado con su tabla: código, cliente, los últimos meses, la última compra y lo de cada
 * pantalla (`fila`). La página vuelve a la primera cuando cambian los filtros.
 */
export function ListaClientes(props: {
  filtros: URLSearchParams
  conVendedor?: boolean
  /** Sube con cada cambio: la lista recupera el foco si la fila (y su botón) desapareció. */
  cambios: number
  vacio: string
  fila: (f: ClienteAdmin, recibidoEn: number) => VistaFila
}) {
  const { filtros, conVendedor = false, cambios, vacio, fila } = props
  const clave = filtros.toString()
  const [paginaDe, setPaginaDe] = useState({ clave, pagina: 1 })
  if (paginaDe.clave !== clave) setPaginaDe({ clave, pagina: 1 })
  const pagina = paginaDe.clave === clave ? paginaDe.pagina : 1
  const params = new URLSearchParams(filtros)
  params.set('pagina', String(pagina))
  params.set('tamano', String(TAMANO))
  const { datos, errores, cargando, recibidoEn, recargar } = useConsulta<PaginaClientesAdmin>(
    `/admin/clientes?${params}`,
    'No pudimos leer los clientes. Probá de nuevo.',
  )
  const contenedor = useRef<HTMLDivElement>(null)
  const cambiosVistos = useRef(cambios)

  // Si la página quedó vacía (p. ej. se excluyó al último de la última página), se vuelve a la última que tiene clientes
  useEffect(() => {
    if (!datos || datos.filas.length || pagina === 1) return
    const ultima = Math.max(1, Math.ceil(datos.total / datos.tamano))
    if (ultima < pagina) setPaginaDe({ clave, pagina: ultima })
  }, [datos, pagina, clave])

  // Después de un cambio desde un filtro, la fila (y su botón con el foco) puede desaparecer: el foco vuelve a la lista
  useEffect(() => {
    if (cambiosVistos.current === cambios || !datos) return
    cambiosVistos.current = cambios
    const foco = document.activeElement
    if (!foco || foco === document.body || !foco.isConnected) contenedor.current?.focus()
  }, [datos, cambios])

  if (errores.length) return <ErrorCarga errores={errores} onReintentar={recargar} className="adm-error-carga" />
  if (!datos) return <LoadingDefault texto="Cargando clientes…" />
  if (!datos.filas.length) return pagina > 1 ? <LoadingDefault texto="Cargando clientes…" /> : <p className="vacio">{vacio}</p>
  const meses = datos.meses

  return (
    <div ref={contenedor} tabIndex={-1} className={cargando ? 'adm-lista recargando' : 'adm-lista'} aria-label="Clientes">
      <div className="adm-tabla-scroll">
        <table className="tabla adm-tabla adm-tabla-clientes">
          <thead>
            <tr>
              <th className="adm-col-codigo">Código</th>
              <th>Cliente</th>
              {meses.length > 0 && (
                <th className="adm-col-meses">
                  <span className="adm-meses-cabecera">
                    {meses.map((m) => (
                      <span key={m}>{nombreMesCorto(m)}</span>
                    ))}
                  </span>
                </th>
              )}
              <th>Última compra</th>
              <th>Estado</th>
              <th className="adm-col-accion"><span className="sr-solo">Acción</span></th>
            </tr>
          </thead>
          <tbody>
            {datos.filas.map((f) => {
              const { cliente: c, clase, estado, accion } = fila(f, recibidoEn)
              return (
                <tr key={c.idCliente} className={clase}>
                  <td className="adm-col-codigo">{c.idCliente}</td>
                  <td>
                    <div className="celda-principal">{c.razonSocial}</div>
                    <div className="celda-secundaria">
                      {[c.ruta ? nombrePropio(c.ruta) : 'Sin ruta', c.localidad, conVendedor ? (c.vendedor ? nombrePropio(c.vendedor) : 'Sin vendedor') : null]
                        .filter(Boolean)
                        .join(' · ')}
                    </div>
                  </td>
                  {meses.length > 0 && (
                    <td className="adm-col-meses">
                      <span className="adm-meses" aria-label="Últimos meses">
                        {meses.map((m, i) => (
                          <span key={m} className="adm-mes">
                            {/* En el celular no está la cabecera: cada círculo lleva su mes */}
                            <span className="adm-mes-inicial" aria-hidden>{nombreMesCorto(m)}</span>
                            {c.estados[i] ? <CeldaEstado estado={c.estados[i]} mes={m} chico /> : <span className="estado-mes chico" />}
                          </span>
                        ))}
                      </span>
                    </td>
                  )}
                  <td>
                    <span className="adm-rotulo-movil">Última compra: </span>
                    {c.ultimaCompra ? (
                      <>
                        {formatoFecha(c.ultimaCompra)}
                        {c.diasSinComprar !== null && <div className="celda-secundaria">{textoDias(c.diasSinComprar)}</div>}
                      </>
                    ) : (
                      <span className="apagado">Nunca</span>
                    )}
                  </td>
                  <td>{estado}</td>
                  <td className="adm-col-accion">{accion}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <Paginado pagina={pagina} tamano={datos.tamano} total={datos.total} deshabilitado={cargando} onPagina={(n) => setPaginaDe({ clave, pagina: n })} />
    </div>
  )
}

/** «hoy», «hace 1 día», «hace 45 días». */
const textoDias = (dias: number) => (dias <= 0 ? 'hoy' : dias === 1 ? 'hace 1 día' : `hace ${formatoEntero(dias)} días`)
