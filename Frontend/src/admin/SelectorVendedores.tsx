import type { VendedorChess } from '../api/types'
import { nombrePropio } from '../cobertura/estados'

interface Props {
  vendedores: VendedorChess[]
  elegidos: number[]
  onCambio: (ids: number[]) => void
  error?: string
}

/**
 * Los vendedores de Chess de una cuenta: **uno o más**. El peor caso es que Chess le cambie el nombre a un vendedor y lo
 * dé de alta con otro id: se tildan los dos (el viejo aparece en «Dados de baja en Chess») y la cuenta sigue viendo a
 * todos sus clientes. La casa (Deposito) no se ofrece: la ve solo el admin.
 */
export function SelectorVendedores({ vendedores, elegidos, onCambio, error }: Props) {
  const personas = vendedores.filter((v) => !v.esCasa)
  const activos = personas.filter((v) => v.activo)
  const deBaja = personas.filter((v) => !v.activo)
  const alternar = (id: number) => onCambio(elegidos.includes(id) ? elegidos.filter((x) => x !== id) : [...elegidos, id])

  const casilla = (v: VendedorChess) => (
    <label key={v.id} className={elegidos.includes(v.id) ? 'adm-vendedor elegido' : 'adm-vendedor'}>
      <input type="checkbox" checked={elegidos.includes(v.id)} onChange={() => alternar(v.id)} />
      <span className="adm-vendedor-nombre">{nombrePropio(v.nombre)}</span>
      <span className="adm-vendedor-id">#{v.id}</span>
    </label>
  )

  return (
    <fieldset className="adm-vendedores" aria-invalid={!!error}>
      <legend>Vendedores de Chess</legend>
      <p className="campo-ayuda">
        Ve los clientes de todos los que tildes. Si en Chess le cambian el nombre a un vendedor y aparece como uno nuevo,
        tildá también el nuevo.
      </p>
      <div className="adm-vendedores-lista">{activos.map(casilla)}</div>
      {deBaja.length > 0 && (
        <>
          <span className="adm-vendedores-titulo">Dados de baja en Chess</span>
          <div className="adm-vendedores-lista">{deBaja.map(casilla)}</div>
        </>
      )}
      {error && <span className="campo-error">{error}</span>}
    </fieldset>
  )
}
