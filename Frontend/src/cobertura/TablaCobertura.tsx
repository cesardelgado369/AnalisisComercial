import { memo, useMemo } from 'react'
import type { ClienteCobertura } from '../api/types'
import { CabeceraOrden, FilaCliente, TarjetaCliente, porNombre, useAbrirFicha } from '../comercial/lista'
import { nombreMes, nombreMesTitulo } from '../utils/formato'
import { useMedia } from '../utils/useMedia'
import { TarjetasPorTandas } from '../comercial/Tandas'
import { CeldaEstado } from './CeldaEstado'

export type Orden = 'codigo' | 'codigo-desc' | 'nombre' | 'nombre-desc'

interface Props {
  clientes: ClienteCobertura[]
  meses: string[]
  orden: Orden
  onOrden: (orden: Orden) => void
  /** Con «Todos los vendedores», debajo de la ruta va también el vendedor de cada cliente. */
  conVendedor: boolean
}

/** Por código o por razón social (lo único que se ordena en el navegador). También la usa la vista por focos. */
export function ordenar<C extends Pick<ClienteCobertura, 'idCliente' | 'razonSocial'>>(clientes: C[], orden: Orden) {
  const lista = [...clientes]
  if (orden.startsWith('codigo')) lista.sort((a, b) => a.idCliente - b.idCliente)
  else lista.sort((a, b) => porNombre.compare(a.razonSocial, b.razonSocial))
  if (orden.endsWith('-desc')) lista.reverse()
  return lista
}

const marcaDejo = <span className="cob-dejo">Dejó de comprar</span>

/**
 * Los clientes con un círculo por mes. En la computadora, tabla ordenable por código o razón social; en el celular
 * (menos de 768 px), una tarjeta por cliente con los meses en una fila (la inicial arriba de cada círculo). La fila de
 * quien dejó de comprar va marcada. Tocar un cliente abre su ficha.
 *
 * Memoizada: tipear en el buscador no vuelve a dibujar ni a ordenar cientos de filas (solo cambia cuando llegan datos
 * nuevos o cambia el orden).
 */
export const TablaCobertura = memo(function TablaCobertura({ clientes, meses, orden, onOrden, conVendedor }: Props) {
  const angosto = useMedia('(max-width: 767px)')
  const ficha = useAbrirFicha('Cobertura')
  const lista = useMemo(() => ordenar(clientes, orden), [clientes, orden])

  if (angosto) {
    return (
      <TarjetasPorTandas items={lista}>
        {(c) => (
          <TarjetaCliente
            key={c.idCliente}
            cliente={c}
            ficha={ficha}
            conVendedor={conVendedor}
            className={c.dejoDeComprar ? 'dejo' : undefined}
            marca={c.dejoDeComprar && marcaDejo}
          >
            <span className="cob-tarjeta-meses">
              {meses.map((m, i) => (
                <span key={m} className="cob-tarjeta-mes">
                  <span className="cob-tarjeta-inicial" aria-hidden>{nombreMes(m).charAt(0).toUpperCase()}</span>
                  <CeldaEstado estado={c.meses[i]} mes={m} />
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
            {meses.map((m) => (
              <th key={m} className="cob-col-mes">{nombreMesTitulo(m)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lista.map((c) => (
            <FilaCliente
              key={c.idCliente}
              cliente={c}
              ficha={ficha}
              conVendedor={conVendedor}
              className={c.dejoDeComprar ? 'dejo' : undefined}
              marca={c.dejoDeComprar && marcaDejo}
            >
              {meses.map((m, i) => (
                <td key={m} className="cob-col-mes">
                  <CeldaEstado estado={c.meses[i]} mes={m} />
                </td>
              ))}
            </FilaCliente>
          ))}
        </tbody>
      </table>
    </div>
  )
})
