/**
 * TODO testing — artículos, bultos y devoluciones inventados para `npm run dev:mock` (ficha, Volumen y Devoluciones).
 * Siempre los mismos para un cliente y un mes. **No es la lógica oficial** (la del backend).
 */
import { UNIDADES, azar, compro, hoyArgentina, indiceMes, mesDe, type ClienteFake } from './datosCobertura.ts'

/** Artículos por unidad de negocio (en el orden de `UNIDADES`). */
export const ARTICULOS: string[][] = [
  ['ATM CANELONES DE VERDURA 1KG', 'ATM RAVIOLES DE VERDURA 1KG', 'ATM SORRENTINOS JAMÓN Y QUESO 1KG'],
  ['EMPANADAS DE CARNE X12', 'HAMBURGUESAS CASERAS X4', 'LASAGNA BOLOÑESA 1KG', 'MILANESAS DE SOJA X6'],
  ['PAN RALLADO 1KG', 'PAN RALLADO 500G', 'REBOZADOR 500G'],
  ['CAPELETTINIS DE POLLO 500G', 'FIDEOS CINTA 500G', 'ÑOQUIS DE PAPA 500G', 'RAVIOLES DE RICOTA 500G', 'SORRENTINOS JAMÓN Y QUESO 500G', 'TALLARIN AL HUEVO 500G', 'TALLARIN DE ESPINACA 500G'],
  ['DULCE DE LECHE 400G', 'QUESO RALLADO 150G', 'SALSA FILETTO 340G'],
  ['TAPAS DE EMPANADA COPETIN X24', 'TAPAS DE EMPANADA FREIR X12', 'TAPAS DE EMPANADA HORNO X12', 'TAPAS DE PASCUALINA X2'],
]
export const idArticulo = (u: number, i: number) => 100 + u * 20 + i
export const articuloDe = (id: number) => {
  const u = Math.floor((id - 100) / 20)
  return { idArticulo: id, descripcion: ARTICULOS[u][(id - 100) % 20], unidadNegocio: UNIDADES[u] }
}

/** Qué artículos de la unidad `u` compró el cliente en el mes `m` (sus preferidos, casi siempre). */
function articulosDelMes(idCliente: number, m: number, u: number) {
  const lista = ARTICULOS[u]
  const preferidos = azar(idCliente * 31 + u)
  const cuantos = 1 + Math.floor(preferidos() * Math.min(3, lista.length))
  const suyos = Array.from({ length: cuantos }, () => Math.floor(preferidos() * lista.length))
  const r = azar(idCliente * 977 + m * 53 + u * 7)
  const delMes = [...new Set(suyos)].filter(() => r() < 0.8)
  return delMes.length ? delMes : [suyos[0]]
}

const medio = (n: number) => Math.round(n * 2) / 2

/** Qué parte del mes en curso ya pasó (sin hoy: la sincronización corre de madrugada). */
function avanceMesActual() {
  const hoy = hoyArgentina()
  const dias = new Date(Date.UTC(Number(hoy.slice(0, 4)), Number(hoy.slice(5, 7)), 0)).getUTCDate()
  return Math.max(0.05, (Number(hoy.slice(8, 10)) - 1) / dias)
}

export interface Linea {
  idArticulo: number
  /** Bultos netos (lo facturado menos lo devuelto). */
  bultos: number
  /** Bultos devueltos (para el backend: notas de crédito y líneas negativas de las facturas). */
  devueltos: number
}

/**
 * Las líneas del cliente en el mes `m` (índice desde julio 2026), de la unidad `unidad` (null: todas). En el mes en
 * curso, la parte del mes que ya pasó. Las devoluciones: uno de cada cuatro artículos devuelve algo.
 */
export function lineas(c: ClienteFake, m: number, unidad: number | null): Linea[] {
  if (!compro(c, m, unidad)) return []
  const enCurso = m === indiceMes(mesDe(hoyArgentina()))
  const factor = enCurso ? avanceMesActual() : 1
  const resultado: Linea[] = []
  for (const u of c.compras[m]) {
    if (unidad !== null && u !== unidad) continue
    for (const a of articulosDelMes(c.idCliente, m, u)) {
      const r = azar(c.idCliente * 389 + m * 41 + u * 13 + a)
      const bultos = Math.max(0.5, medio((1 + r() * 7) * factor))
      const devueltos = r() < 0.25 ? Math.max(0.5, medio(bultos * (0.05 + r() * 0.3))) : 0
      resultado.push({ idArticulo: idArticulo(u, a), bultos, devueltos })
    }
  }
  return resultado
}

export const suma = (ls: Linea[], campo: 'bultos' | 'devueltos') => medio(ls.reduce((s, l) => s + l[campo], 0))
