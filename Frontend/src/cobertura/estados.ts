import type { ChipCobertura, ClienteCobertura, EstadoMes } from '../api/types'

/** Cómo se lee cada estado (lectores de pantalla y tooltip): «Octubre: compró». */
export const TEXTO_ESTADO: Record<EstadoMes, string> = {
  compro: 'compró',
  noCompro: 'no compró',
  sinCompraAun: 'todavía no compró',
  dejoDeComprar: 'dejó de comprar',
  fueraDeCartera: 'no era cliente de esta cartera',
}

/** Días de visita con el código de Chess (2 lunes … 7 sábado), para el filtro. */
export const DIAS_VISITA = [
  { codigo: 2, nombre: 'Lunes' },
  { codigo: 3, nombre: 'Martes' },
  { codigo: 4, nombre: 'Miércoles' },
  { codigo: 5, nombre: 'Jueves' },
  { codigo: 6, nombre: 'Viernes' },
  { codigo: 7, nombre: 'Sábado' },
]

/** Primer mes con datos de Chess (CONTRATO_API.md): no se puede pedir antes. */
export const PRIMER_MES = '2026-07-01'

/** Los meses desde el primero con datos hasta `hasta` (el mes en curso, o el que eligió el dueño). */
export function mesesDisponibles(hasta: string) {
  const meses: string[] = []
  let [anio, mes] = PRIMER_MES.split('-').map(Number)
  for (let m = PRIMER_MES; m <= hasta && meses.length < 24; ) {
    meses.push(m)
    mes = mes === 12 ? 1 : mes + 1
    if (mes === 1) anio++
    m = `${anio}-${String(mes).padStart(2, '0')}-01`
  }
  return meses
}

/** Cuántos meses se ven (Cesar, 30/10): el mes y los tres anteriores. Es también el rango por defecto de la API. */
const MESES_VISIBLES = 4

/** Los meses que se ven parado en `mes`: ese y los tres anteriores, sin pasar del primero con datos. */
export const ventanaDe = (mes: string) => mesesDisponibles(mes).slice(-MESES_VISIBLES)

export const CHIPS: ChipCobertura[] = ['todos', 'compraronMesActual', 'sinCompraMesActual', 'dejaronDeComprar']

/** El texto de cada chip, con el mes del final del rango («Compraron en octubre»). */
export function textoChip(chip: ChipCobertura, mes: string | null) {
  if (chip === 'todos') return 'Todos'
  if (chip === 'dejaronDeComprar') return 'Dejaron de comprar'
  const en = mes ? ` en ${mes}` : ''
  return chip === 'compraronMesActual' ? `Compraron${en}` : `Sin compra${en}`
}

const MINUSCULAS = new Set(['de', 'del', 'la', 'las', 'los', 'el', 'y'])

/**
 * Los nombres de Chess vienen en mayúsculas («ELENA WHITE», «NICOLAS CORDOBA»): para la ruta y el vendedor se muestran
 * como nombre propio («Elena White»), como en la web actual. Lo que no está todo en mayúsculas queda como viene.
 */
export function nombrePropio(texto: string) {
  if (texto !== texto.toUpperCase()) return texto
  return texto
    .toLowerCase()
    .split(' ')
    .map((p, i) => (i > 0 && MINUSCULAS.has(p) ? p : p.charAt(0).toUpperCase() + p.slice(1)))
    .join(' ')
}

/** Unidades que no salen bien con la regla general («PAN RALLADO1» viene así de Chess; ATM es una sigla). */
const UNIDADES_CONOCIDAS: Record<string, string> = {
  ATM: 'ATM',
  'PAN RALLADO1': 'Pan rallado',
}

/**
 * La unidad de negocio para mostrar («PASTAS FRESCAS» → «Pastas frescas»). Solo el texto: el filtro `?unidad=` manda
 * siempre el valor tal cual viene de `/api/cobertura/unidades`.
 */
export function nombreUnidad(unidad: string) {
  if (UNIDADES_CONOCIDAS[unidad]) return UNIDADES_CONOCIDAS[unidad]
  return unidad === unidad.toUpperCase() ? unidad.charAt(0) + unidad.slice(1).toLowerCase() : unidad
}

/** La unidad dentro de una frase: «pastas frescas», pero las siglas quedan («ATM»). */
export function unidadEnFrase(unidad: string) {
  const n = nombreUnidad(unidad)
  return n === n.toUpperCase() ? n : n.charAt(0).toLowerCase() + n.slice(1)
}

/**
 * Ruta (y vendedor, si hace falta) debajo del nombre, como nombre propio: «Elena White · Nicolas Cordoba». El admin ve
 * rutas sin vendedor y clientes sin ruta (vienen en null).
 */
export function detalleCliente(c: Pick<ClienteCobertura, 'ruta' | 'vendedor'>, conVendedor: boolean) {
  const ruta = c.ruta ? nombrePropio(c.ruta) : 'Sin ruta'
  if (!conVendedor) return ruta
  return `${ruta} · ${c.vendedor ? nombrePropio(c.vendedor) : 'Sin vendedor'}`
}
