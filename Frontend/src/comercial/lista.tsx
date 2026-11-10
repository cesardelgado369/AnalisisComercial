import type { MouseEvent, ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import type { ClaseAbc } from '../api/types'
import { nombrePropio } from '../cobertura/estados'
import { formatoEntero } from '../utils/formato'
import { unidadVisible } from './filtros'

/**
 * Las piezas de las listas de clientes de Cobertura, Volumen y Devoluciones: los chips, la lista vacía, las cabeceras
 * ordenables y la fila (o la tarjeta, en el celular) que abre la ficha.
 */

/** Un solo comparador para todas las filas (crear uno por comparación con `localeCompare(…, 'es')` es lento). */
export const porNombre = new Intl.Collator('es')

/** Lo mínimo de un cliente para listarlo: código, nombre y su ruta y vendedor (null: el admin ve rutas sin vendedor). */
interface ClienteDeLista {
  idCliente: number
  razonSocial: string
  ruta: string | null
  vendedor: string | null
  /** Solo para los dueños (la API no la manda a los demás). */
  abc?: ClaseAbc
}

const TEXTO_ABC: Record<ClaseAbc, string> = {
  A: 'Clase A: de los que más compran (juntos suman el 80 % de los bultos de los últimos 3 meses)',
  B: 'Clase B: los que siguen, hasta el 95 % de los bultos de los últimos 3 meses',
  C: 'Clase C: el resto, y los que no compraron en los últimos 3 meses',
}

/** La categoría A, B o C del cliente, después del nombre (Cesar, 10/11). Solo la ven los dueños: si no viene, nada. */
export function EtiquetaAbc({ abc, grande = false }: { abc?: ClaseAbc; grande?: boolean }) {
  if (!abc) return null
  return (
    <span className={`abc abc-${abc.toLowerCase()}${grande ? ' grande' : ''}`} title={TEXTO_ABC[abc]}>
      <span className="sr-solo">Clase </span>
      {abc}
    </span>
  )
}

/**
 * La ruta y el vendedor del cliente en cápsulas (Cesar, 10/11, pensado para Checho): el ícono en blanco sobre violeta y
 * el nombre en violeta sobre blanco. Sin vendedor a la vista (el operario de un vendedor), solo la ruta.
 */
export function DetalleCliente({ cliente: c, conVendedor }: { cliente: ClienteDeLista; conVendedor: boolean }) {
  return (
    <span className="cliente-capsulas">
      <Capsula icono="location_on" que="Ruta" texto={c.ruta ? nombrePropio(c.ruta) : 'Sin ruta'} />
      {conVendedor && <Capsula icono="person" que="Vendedor" texto={c.vendedor ? nombrePropio(c.vendedor) : 'Sin vendedor'} />}
    </span>
  )
}

function Capsula({ icono, que, texto }: { icono: string; que: string; texto: string }) {
  return (
    <span className="capsula">
      <span className="capsula-icono">
        <span className="icono" aria-hidden>{icono}</span>
        <span className="sr-solo">{que}: </span>
      </span>
      <span className="capsula-texto">{texto}</span>
    </span>
  )
}

/** Los chips de arriba de la lista, con la cantidad de cada uno (la cuenta la API). El de alerta va en rojo. */
export function Chips<C extends string>(props: {
  chips: readonly C[]
  elegido: C
  alerta: C
  texto: (chip: C) => string
  /** Hasta que llegan los datos, sin números. */
  cantidades: Record<C, number> | null
  onElegir: (chip: C) => void
}) {
  const { chips, elegido, alerta, texto, cantidades, onElegir } = props
  return (
    <div className="cob-chips" role="group" aria-label="Qué clientes mostrar">
      {chips.map((c) => (
        <button key={c} type="button" className={c === alerta ? 'cob-chip alerta' : 'cob-chip'} aria-pressed={elegido === c} onClick={() => onElegir(c)}>
          {texto(c)}
          {cantidades && <strong>{formatoEntero(cantidades[c])}</strong>}
        </button>
      ))}
    </div>
  )
}

/** Sin clientes para los filtros; si había búsqueda o chip, el botón para verlos a todos. */
export function SinClientes({ icono, filtrado, onVerTodos }: { icono: string; filtrado: boolean; onVerTodos: () => void }) {
  return (
    <div className="cob-estado">
      <span className="icono cob-estado-icono" aria-hidden>{icono}</span>
      <p>No hay clientes para estos filtros.</p>
      {filtrado && (
        <button type="button" className="btn" onClick={onVerTodos}>
          Ver todos los clientes
        </button>
      )}
    </div>
  )
}

/**
 * Cabecera de columna que ordena: el primer toque ordena de menor a mayor (`campo`), el segundo al revés
 * (`campo-desc`). `campo` es el valor ascendente del orden de la tabla.
 */
export function CabeceraOrden<O extends string>(props: { campo: O; texto: string; orden: O; onOrden: (orden: O) => void; className?: string }) {
  const { campo, texto, orden, onOrden, className } = props
  const activo = orden.replace('-desc', '') === campo
  const desc = orden.endsWith('-desc')
  return (
    <th aria-sort={activo ? (desc ? 'descending' : 'ascending') : 'none'} className={className}>
      <button type="button" className={activo ? 'cob-orden activo' : 'cob-orden'} onClick={() => onOrden(activo && !desc ? (`${campo}-desc` as O) : campo)}>
        {texto}
        <span className="icono icono-chico" aria-hidden>{activo ? (desc ? 'arrow_upward' : 'arrow_downward') : 'unfold_more'}</span>
      </button>
    </th>
  )
}

/**
 * Cómo se abre la ficha desde una lista: el link (con la pestaña y el mes que se miraban, en `consulta`) y el estado
 * para que «Volver a {seccion}» regrese a la misma vista, con sus filtros.
 */
export function useAbrirFicha(seccion: string, consulta = '') {
  const navegar = useNavigate()
  const { pathname, search } = useLocation()
  const state = { volver: `${pathname}${search}`, seccion }
  const ruta = (id: number) => `/cliente/${id}${consulta ? `?${consulta}` : ''}`
  return {
    enlace: (id: number) => ({ to: ruta(id), state }),
    /**
     * Tocar la fila también la abre, salvo que se toque el nombre (ya es un link: teclado y click medio) o se esté
     * seleccionando texto (p. ej. el código, para buscarlo en Chess).
     */
    alTocarFila: (id: number) => (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest('a') || window.getSelection()?.toString()) return
      navegar(ruta(id), { state })
    },
  }
}

type AbrirFicha = ReturnType<typeof useAbrirFicha>

interface PropsCliente {
  cliente: ClienteDeLista
  ficha: AbrirFicha
  conVendedor: boolean
  /** Al lado del nombre («Dejó de comprar»). */
  marca?: ReactNode
  className?: string
  /** Las columnas (o los números de la tarjeta) de cada sección. */
  children: ReactNode
}

/** La fila de la tabla: código, nombre (link a la ficha) con su ruta debajo, y las columnas de la sección. */
export function FilaCliente({ cliente: c, ficha, conVendedor, marca, className, children }: PropsCliente) {
  return (
    <tr className={className} onClick={ficha.alTocarFila(c.idCliente)}>
      <td className="cob-col-codigo">{c.idCliente}</td>
      <td>
        <span className="cob-nombre">
          <Link {...ficha.enlace(c.idCliente)}>{c.razonSocial}</Link>
          <EtiquetaAbc abc={c.abc} />
          {marca}
        </span>
        <DetalleCliente cliente={c} conVendedor={conVendedor} />
      </td>
      {children}
    </tr>
  )
}

/** En el celular, una tarjeta por cliente que abre la ficha: el nombre, el código bien visible y la ruta. */
export function TarjetaCliente({ cliente: c, ficha, conVendedor, marca, className, children }: PropsCliente) {
  return (
    <li className={className}>
      <Link {...ficha.enlace(c.idCliente)} className="cob-tarjeta">
        <span className="cob-tarjeta-nombre">
          <strong>{c.razonSocial}</strong>
          <EtiquetaAbc abc={c.abc} />
          {marca}
        </span>
        <span className="cob-tarjeta-detalle">
          <strong className="cob-tarjeta-codigo">Cód. {c.idCliente}</strong>
        </span>
        <DetalleCliente cliente={c} conVendedor={conVendedor} />
        {children}
      </Link>
    </li>
  )
}

/** El artículo como nombre propio, con su unidad de negocio debajo. */
export function NombreArticulo({ articulo, className }: { articulo: { descripcion: string; unidadNegocio: string }; className: string }) {
  return (
    <span className={className}>
      <strong>{nombrePropio(articulo.descripcion)}</strong>
      <span className="apagado">{unidadVisible(articulo.unidadNegocio)}</span>
    </span>
  )
}
