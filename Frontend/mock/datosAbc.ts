/**
 * TODO testing — la clase A, B o C de cada cliente para `npm run dev:mock` (CONTRATO_API.md, pedido de Cesar del 10/11,
 * como el Grupo ABC de De Ruta): sus bultos de los 3 meses cerrados anteriores, de mayor a menor, acumulando el % del
 * total; A hasta el 80 %, B hasta el 95 %, C el resto y los que no compraron. El que cruza un corte queda donde empieza.
 * Los excluidos no cuentan. Solo la ve el admin. **No es la lógica oficial** (la del backend).
 */
import { lineas, suma } from './datosArticulos.ts'
import { ErrorMock, azar, compro, datos, excluidos, type ClienteFake, type FiltroCompra } from './datosCobertura.ts'

export type ClaseAbc = 'A' | 'B' | 'C'

const cache = new Map<number, Map<number, ClaseAbc>>()

/**
 * Los bultos inventados están muy parejos entre clientes (saldrían A casi todos): cada cliente tiene un tamaño fijo,
 * de cola larga, para que el reparto se parezca al de Madomi (en la planilla del 21/10, A son 211 de 1.300).
 */
const tamano = (c: ClienteFake) => Math.pow(Math.max(0.02, azar(c.idCliente * 7907)()), -1.3)

/** Las clases del mes `m` (índice desde julio 2026); el primer mes no tiene base: null. */
export function clasesDelMes(m: number): Map<number, ClaseAbc> | null {
  if (m <= 0) return null
  const guardadas = cache.get(m)
  if (guardadas) return guardadas
  const bultos = datos()
    .filter((c) => !excluidos.has(c.idCliente))
    .map((c) => {
      let total = 0
      for (let k = 1; k <= 3 && m - k >= 0; k++) total += suma(lineas(c, m - k, null), 'bultos')
      return { id: c.idCliente, total: total * tamano(c) }
    })
    .sort((a, b) => b.total - a.total)
  const general = bultos.reduce((s, b) => s + b.total, 0)
  const clases = new Map<number, ClaseAbc>()
  let acumulado = 0
  for (const b of bultos) {
    const antes = general ? acumulado / general : 1
    clases.set(b.id, b.total <= 0 ? 'C' : antes < 0.8 ? 'A' : antes < 0.95 ? 'B' : 'C')
    acumulado += b.total
  }
  cache.set(m, clases)
  return clases
}

/** `?abc=`: si el cliente es de esa categoría en el mes `m` (sin filtro, todos). 400 si no es A, B ni C. */
export function filtroCategoria(p: URLSearchParams) {
  const categoria = p.get('abc')
  if (categoria && categoria !== 'A' && categoria !== 'B' && categoria !== 'C')
    throw new ErrorMock(400, 'Esa categoría no existe.', { abc: ['Elegí A, B o C.'] })
  return (c: ClienteFake, m: number) => !categoria || clasesDelMes(m)?.get(c.idCliente) === categoria
}

/** El bloque `abc` de `/api/volumen`: de la cartera del mes, cuántos de cada clase compraron (con los filtros). */
export function coberturaAbc(cartera: ClienteFake[], m: number, filtro: FiltroCompra, clases: Map<number, ClaseAbc>) {
  return (['A', 'B', 'C'] as const).map((grupo) => {
    const delGrupo = cartera.filter((c) => clases.get(c.idCliente) === grupo)
    const conCompra = delGrupo.filter((c) => compro(c, m, filtro)).length
    return {
      grupo,
      clientes: delGrupo.length,
      conCompra,
      porcentaje: delGrupo.length ? Math.round((conCompra / delGrupo.length) * 1000) / 10 : 0,
    }
  })
}
