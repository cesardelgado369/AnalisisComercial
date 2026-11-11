import { useState, type ReactNode } from 'react'

const TANDA = 25

/**
 * En el celular, las listas de clientes de a 25 (Cesar, 11/11: que el celular no sea un scroll sin fin). El buscador,
 * los chips y los filtros siguen buscando en todos: al cambiar la lista, vuelve a la primera tanda.
 */
export function TarjetasPorTandas<T>({ items, children }: { items: T[]; children: (item: T) => ReactNode }) {
  const [estado, setEstado] = useState({ items, cuantos: TANDA })
  const cuantos = estado.items === items ? estado.cuantos : TANDA
  const quedan = items.length - cuantos
  return (
    <>
      <ul className="cob-tarjetas">{items.slice(0, cuantos).map(children)}</ul>
      {quedan > 0 && (
        <div className="tandas-pie">
          <span>
            Ves <strong>{cuantos}</strong> de <strong>{items.length}</strong> clientes. Para ir directo a uno, buscalo por
            nombre o código.
          </span>
          <button type="button" className="btn" onClick={() => setEstado({ items, cuantos: cuantos + TANDA })}>
            Ver {Math.min(TANDA, quedan)} más
          </button>
        </div>
      )}
    </>
  )
}
