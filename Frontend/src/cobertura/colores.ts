/**
 * Un color por vendedor para el mapa de Cobertura. El color **sigue al vendedor** (por su `idPersonal` de Chess), así no
 * cambia al filtrar ni según quién mire. Validado con el validador de la guía de dataviz para un mapa (todos los pares
 * a la vista, sobre el fondo en grises) **junto con el rojo del aro de «dejó de comprar»**: ΔE CVD 11,3 y visión normal
 * 16,8. Sin verde (en la tabla verde = compró) ni naranjas o rojos (se confundían con el aro). Algunos tienen poco
 * contraste con el fondo: por eso cada punto lleva su nombre al pasar el mouse, la leyenda los nombra y la tabla es la
 * vista accesible.
 *
 * Madomi tiene cinco vendedores (1 a 5) y la casa (6). Un vendedor nuevo no recibe un color inventado: va en gris
 * («Otros») hasta que se valide un sexto color.
 */
const POR_VENDEDOR: Record<number, string> = {
  1: '#184f95', // azul marino
  2: '#f59e0b', // ámbar
  3: '#a855f7', // violeta
  4: '#6da7ec', // celeste
  5: '#e87ba4', // rosa
}

/** La casa (Deposito), rutas sin vendedor y vendedores sin color validado. */
export const COLOR_OTROS = '#6b7280'

/** «Dejó de comprar»: el rojo de alerta, solo para el aro (nunca para un vendedor). */
export const COLOR_DEJO = '#d03b3b'

export const colorVendedor = (idPersonal: number | null) => (idPersonal !== null && POR_VENDEDOR[idPersonal]) || COLOR_OTROS
