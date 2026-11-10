import { nombrePropio } from '../cobertura/estados'
import { IconoProducto } from './IconosRubro'

/**
 * El ícono de cada producto de un cliente, del de más bultos al de menos, debajo del número de la fila (Cesar, 10/11:
 * el del producto, ravioles, ñoquis o tallarines, no el del rubro). En Volumen, lo que compró; en Devoluciones, lo que
 * devolvió. Hasta 5; los nombres, al pasar el mouse.
 */
export function ProductosCliente(props: {
  articulos?: { idArticulo: number; descripcion: string; unidadNegocio: string }[]
  verbo: 'Compró' | 'Devolvió'
}) {
  const { articulos, verbo } = props
  if (!articulos?.length) return null
  const nombres = articulos.map((a) => nombrePropio(a.descripcion))
  return (
    <span className="productos-cliente" title={`${verbo} ${nombres.join(', ')}`}>
      {articulos.slice(0, 5).map((a) => (
        <IconoProducto key={a.idArticulo} descripcion={a.descripcion} unidad={a.unidadNegocio} />
      ))}
      {articulos.length > 5 && <span className="productos-cliente-mas">+{articulos.length - 5}</span>}
      <span className="sr-solo">
        {verbo} {nombres.join(', ')}
      </span>
    </span>
  )
}
