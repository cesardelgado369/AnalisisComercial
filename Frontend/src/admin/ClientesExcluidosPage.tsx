import { useEffect, useRef, useState } from 'react'
import { avisarCambio } from '../api/cambios'
import type { ClienteAdmin, PaginaClientesAdmin, ResumenClientesVendedor } from '../api/types'
import { useConsulta } from '../api/useConsulta'
import { Paginado } from '../components/Paginado'
import { ErrorCarga } from '../components/ErrorCarga'
import { LoadingDefault } from '../components/loading/LoadingDefault'
import { CeldaEstado } from '../cobertura/CeldaEstado'
import { nombrePropio } from '../cobertura/estados'
import { cantidad, fechaUtc, formatoEntero, formatoFecha, haceCuanto, nombreMesCorto } from '../utils/formato'
import { ModalExcluir, type CambioExclusion } from './ModalExcluir'
import '../cobertura/cobertura.css'
import './admin.css'

type Filtro = 'todos' | 'sugeridos' | 'solo' | 'sin'
const FILTROS: { clave: Filtro; texto: string }[] = [
  { clave: 'todos', texto: 'Todos' },
  { clave: 'sugeridos', texto: 'Sugeridos para excluir' },
  { clave: 'solo', texto: 'Excluidos' },
  { clave: 'sin', texto: 'Sin excluir' },
]
/** Lo que dice la lista sola de cada filtro cuando no hay nadie. */
const VACIO: Record<Filtro, string> = {
  todos: 'No hay clientes.',
  sugeridos: 'No hay clientes sugeridos para excluir.',
  solo: 'No hay clientes excluidos.',
  sin: 'No hay clientes sin excluir.',
}
const TAMANO = 50
const ESPERA = 300

/** Grupos desplegados (preferencia de cada usuario en este navegador). */
const CLAVE_ABIERTOS = 'analisis.clientes.abiertos'
function leerAbiertos(): string[] {
  try {
    return JSON.parse(localStorage.getItem(CLAVE_ABIERTOS) ?? '[]') as string[]
  } catch {
    return []
  }
}

const claveGrupo = (r: ResumenClientesVendedor) => (r.idPersonal === null ? 'sin' : String(r.idPersonal))

/** Un cambio hecho desde la pantalla, con su momento: vale hasta que la API manda datos más nuevos. */
interface CambioLocal {
  fila: ClienteAdmin
  en: number
}

/**
 * Clientes excluidos (`/admin/exclusiones`, solo admin; pedido de Cesar del 29/10): toda la base de clientes que baja de
 * Chess, **agrupada por vendedor** (en De Ruta se agrupa por A, B y C), para excluir los que no tienen que contar en
 * ninguna cartera (p. ej. CLIENTE TEST) o volver a incluirlos. Cada cliente muestra su **estadística rápida** (los
 * últimos meses, la última compra) y, si hace mucho que no compra, la **sugerencia** del backend («No compra hace 4
 * meses»). «Todos» va por vendedor (grupos plegables); los otros filtros y la búsqueda, en una lista sola con el
 * vendedor en cada fila. Excluir cambia la Cobertura (se avisa para releerla).
 *
 * Todo confirmado en CONTRATO_API.md (29/10), incluidas la estadística y la sugerencia: la regla y los textos son del
 * backend (90 días sin comprar → excluir; 60 a 89, o dejó de comprar el último mes cerrado → revisar).
 */
export function ClientesExcluidosPage() {
  const resumen = useConsulta<ResumenClientesVendedor[]>('/admin/clientes/resumen', 'No pudimos leer los vendedores.')
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const [texto, setTexto] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [abiertos, setAbiertos] = useState<string[]>(leerAbiertos)
  const [accion, setAccion] = useState<CambioExclusion | null>(null)
  const [cambiados, setCambiados] = useState<Record<number, CambioLocal>>({})
  /** Para lectores de pantalla: qué pasó con el último cambio. */
  const [aviso, setAviso] = useState('')
  /** Sube con cada cambio: la lista recupera el foco si la fila (y su botón) desapareció. */
  const [cambios, setCambios] = useState(0)

  useEffect(() => {
    const t = setTimeout(() => setBusqueda(texto.trim()), ESPERA)
    return () => clearTimeout(t)
  }, [texto])

  function alternar(clave: string) {
    const nuevos = abiertos.includes(clave) ? abiertos.filter((x) => x !== clave) : [...abiertos, clave]
    setAbiertos(nuevos)
    try {
      localStorage.setItem(CLAVE_ABIERTOS, JSON.stringify(nuevos))
    } catch {
      /* sin almacenamiento: no se recuerda */
    }
  }

  function alCambiar(fila: ClienteAdmin) {
    setCambiados((c) => ({ ...c, [fila.idCliente]: { fila, en: Date.now() } }))
    setAccion(null)
    setAviso(`${fila.razonSocial}: ${fila.excluido ? 'excluido' : 'vuelve a contar en las carteras'}.`)
    setCambios((n) => n + 1)
    resumen.recargar()
    avisarCambio() // Cobertura y lo demás se vuelven a leer
  }

  const filtros = (extra: Record<string, string>) => {
    const p = new URLSearchParams(extra)
    if (filtro === 'sugeridos') p.set('sugerencia', 'excluir')
    else if (filtro !== 'todos') p.set('excluidos', filtro)
    return p
  }
  const totalExcluidos = resumen.datos?.reduce((s, r) => s + r.excluidos, 0)
  const totalSugeridos = resumen.datos?.reduce((s, r) => s + r.sugeridos, 0)
  const listaSola = !!busqueda || filtro !== 'todos'

  return (
    <section className="pagina adm">
      <header className="encabezado">
        <div className="encabezado-textos">
          <h1>Clientes excluidos</h1>
          <p>
            La base de clientes de Chess, por vendedor. Un cliente excluido no cuenta en ninguna cartera
            {totalExcluidos !== undefined &&
              ` (hoy ${cantidad(totalExcluidos, 'excluido')}${totalSugeridos ? ` y ${cantidad(totalSugeridos, 'sugerido')} para excluir` : ''})`}
            .
          </p>
        </div>
      </header>
      <p className="sr-solo" role="status" aria-live="polite">{aviso}</p>

      <div className="adm-barra">
        <div className="pestanas" role="group" aria-label="Qué clientes mostrar">
          {FILTROS.map((f) => (
            <button key={f.clave} type="button" aria-pressed={filtro === f.clave} onClick={() => setFiltro(f.clave)}>
              {f.clave === 'sugeridos' && <span className="icono icono-chico adm-ic-sugerencia" aria-hidden>lightbulb</span>}
              {f.texto}
              {f.clave === 'sugeridos' && totalSugeridos !== undefined && <span className="adm-cantidad">{formatoEntero(totalSugeridos)}</span>}
              {f.clave === 'solo' && totalExcluidos !== undefined && <span className="adm-cantidad">{formatoEntero(totalExcluidos)}</span>}
            </button>
          ))}
        </div>
        <label className="buscador-pagina">
          <span className="sr-solo">Buscar un cliente</span>
          <span className="icono" aria-hidden>search</span>
          <input type="search" placeholder="Buscar cliente o código" value={texto} onChange={(e) => setTexto(e.target.value)} />
        </label>
      </div>

      {resumen.errores.length > 0 && (
        <ErrorCarga errores={resumen.errores} onReintentar={resumen.recargar} className="adm-error-carga" />
      )}

      {listaSola ? (
        // Un filtro o una búsqueda: una sola lista con el vendedor en cada fila (se ve el cambio al toque, sin abrir grupos)
        <div className="tarjeta adm-tarjeta">
          <ListaClientes
            filtros={filtros(busqueda ? { texto: busqueda } : {})}
            conVendedor
            cambiados={cambiados}
            cambios={cambios}
            onAccion={setAccion}
            vacio={busqueda ? 'Ningún cliente coincide con la búsqueda.' : VACIO[filtro]}
          />
        </div>
      ) : !resumen.datos ? (
        resumen.errores.length ? null : <LoadingDefault texto="Cargando los vendedores…" />
      ) : (
        <div className="adm-grupos">
          {resumen.datos.map((r) => {
            const clave = claveGrupo(r)
            const abierto = abiertos.includes(clave)
            // La administración trae el nombre de Chess tal cual, también para la casa («DEPOSITO»)
            const nombre = r.vendedor === null ? 'Sin vendedor' : r.esCasa ? `Cuentas de la casa (${nombrePropio(r.vendedor)})` : nombrePropio(r.vendedor)
            return (
              <section key={clave} className={abierto ? 'adm-grupo' : 'adm-grupo plegado'}>
                <button type="button" className="adm-grupo-cabecera" aria-expanded={abierto} onClick={() => alternar(clave)}>
                  <span className="icono" aria-hidden>{abierto ? 'expand_less' : 'expand_more'}</span>
                  <span className="adm-grupo-titulo">{nombre}</span>
                  <span className="adm-grupo-cuenta">
                    {cantidad(r.clientes, 'cliente')}
                    {r.sugeridos > 0 && (
                      <span className="adm-grupo-sugeridos">
                        <span className="icono icono-chico adm-ic-sugerencia" aria-hidden>lightbulb</span>
                        {cantidad(r.sugeridos, 'sugerido')} para excluir
                      </span>
                    )}
                    {r.excluidos > 0 && (
                      <span className="adm-grupo-excluidos">
                        <span className="icono icono-chico" aria-hidden>person_off</span>
                        {cantidad(r.excluidos, 'excluido')}
                      </span>
                    )}
                  </span>
                </button>
                {abierto && (
                  <div className="tarjeta adm-tarjeta">
                    <ListaClientes
                      filtros={filtros({ vendedor: clave })}
                      cambiados={cambiados}
                      cambios={cambios}
                      onAccion={setAccion}
                      vacio="Este vendedor no tiene clientes."
                    />
                  </div>
                )}
              </section>
            )
          })}
        </div>
      )}

      {accion && <ModalExcluir cambio={accion} onCerrar={() => setAccion(null)} onHecho={alCambiar} />}
    </section>
  )
}

/** `GET /admin/clientes` paginado con su tabla. La página vuelve a la primera cuando cambian los filtros. */
function ListaClientes({
  filtros,
  conVendedor = false,
  cambiados,
  cambios,
  onAccion,
  vacio,
}: {
  filtros: URLSearchParams
  conVendedor?: boolean
  cambiados: Record<number, CambioLocal>
  cambios: number
  onAccion: (c: CambioExclusion) => void
  vacio: string
}) {
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

  // Después de excluir o incluir desde un filtro, la fila (y su botón con el foco) desaparece: el foco vuelve a la lista
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
              // Lo cambiado acá pisa solo la exclusión, y solo hasta que la API manda datos más nuevos que el cambio
              const cambio = cambiados[f.idCliente]
              const c: ClienteAdmin =
                cambio && cambio.en > recibidoEn
                  ? { ...f, excluido: cambio.fila.excluido, motivo: cambio.fila.motivo, excluidoPor: cambio.fila.excluidoPor, excluidoEn: cambio.fila.excluidoEn }
                  : f
              // Un excluido nunca trae sugerencia; recién excluido desde acá, se apaga sin esperar a la API
              const sugerencia = c.excluido ? null : c.sugerencia
              return (
                <tr key={c.idCliente} className={c.excluido ? 'adm-excluido' : sugerencia === 'excluir' ? 'adm-sugerido' : undefined}>
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
                  <td>
                    {c.excluido ? (
                      <>
                        <div className="adm-marca-excluido">
                          <span className="icono icono-chico" aria-hidden>person_off</span>
                          Excluido{c.motivo ? `: ${c.motivo}` : ''}
                        </div>
                        {(c.excluidoPor || c.excluidoEn) && (
                          <div className="celda-secundaria">
                            {[c.excluidoPor, c.excluidoEn ? haceCuanto(fechaUtc(c.excluidoEn)) : null].filter(Boolean).join(' · ')}
                          </div>
                        )}
                      </>
                    ) : sugerencia ? (
                      <div className={`adm-sugerencia-estado ${sugerencia}`}>
                        <span className="icono icono-chico" aria-hidden>{sugerencia === 'excluir' ? 'lightbulb' : 'visibility'}</span>
                        <span>
                          <strong>{sugerencia === 'excluir' ? 'Sugerido excluir' : 'Para revisar'}</strong>
                          {c.motivoSugerencia && <span className="celda-secundaria">{c.motivoSugerencia}</span>}
                        </span>
                      </div>
                    ) : (
                      <span className="apagado">Cliente normal</span>
                    )}
                  </td>
                  <td className="adm-col-accion">
                    <button
                      type="button"
                      className={sugerencia === 'excluir' ? 'btn btn-acento' : 'btn'}
                      onClick={() => onAccion({ tipo: c.excluido ? 'incluir' : 'excluir', cliente: c })}
                    >
                      <span className="icono icono-chico" aria-hidden>{c.excluido ? 'person_add' : 'person_off'}</span>
                      {c.excluido ? 'Volver a incluir' : 'Excluir'}
                    </button>
                  </td>
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
