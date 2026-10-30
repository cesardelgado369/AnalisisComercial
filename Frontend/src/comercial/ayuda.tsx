import type { ReactNode } from 'react'
import { DIAS_VISITA, unidadEnFrase } from '../cobertura/estados'
import { formatoFechaCorta, nombreMes, nombreMesTitulo } from '../utils/formato'

/**
 * Los globos de ayuda del dueño (pedido de Cesar, 30/10): cómo se calculó cada número de Cobertura, Volumen y
 * Devoluciones. Las reglas son las del backend (CONTRATO_API.md): si cambian allá, se cambian estos textos.
 */

/** Lo que hace falta para explicar un número: de quién es la cartera y los filtros que la recortan. */
export interface ContextoAyuda {
  /** El vendedor elegido («Mateo Rojas»); null = todos los vendedores. */
  vendedor: string | null
  dia: number | null
  unidad: string | null
}

/** Las facturas que cuentan para «compró», los bultos y las devoluciones. */
export const FACTURAS_QUE_CUENTAN = 'Factura o Factura cierre consig.'

/** Un párrafo del globo, con su título en negrita. */
export function Parrafo({ titulo, children }: { titulo?: ReactNode; children: ReactNode }) {
  return (
    <span className="ayuda-parrafo">
      {titulo && <><strong>{titulo}</strong> </>}
      {children}
    </span>
  )
}

/** « con artículos de pastas frescas» (o nada, sin unidad elegida). */
export const conUnidad = (ayuda: ContextoAyuda) => (ayuda.unidad ? ` con artículos de ${unidadEnFrase(ayuda.unidad)}` : '')

/** De quiénes es la cartera de un mes: la de las rutas de ese mes, con los filtros de la pantalla. */
export function ParrafoCartera({ mes, ayuda, children }: { mes: string; ayuda: ContextoAyuda; children?: ReactNode }) {
  const nombre = nombreMes(mes)
  const dia = ayuda.dia === null ? null : DIAS_VISITA.find((d) => d.codigo === ayuda.dia)?.nombre.toLowerCase()
  // «los lunes», «los sábados»
  const visita = dia ? `, con visita los ${dia.endsWith('o') ? `${dia}s` : dia}` : ''
  return (
    <Parrafo titulo={`Cartera de ${nombre}:`}>
      los clientes que figuraron en las rutas de {ayuda.vendedor ?? 'todos los vendedores (sin las cuentas de la casa)'} en{' '}
      {nombre}
      {visita}, sin los clientes excluidos.{children && <> {children}</>}
    </Parrafo>
  )
}

/** El mes en curso todavía no se compara de igual a igual con los cerrados. */
export function ParrafoEnCurso({ mes, corteAl }: { mes: string; corteAl: string | null }) {
  return (
    <Parrafo titulo={`${nombreMesTitulo(mes)} está en curso:`}>
      cuenta las facturas{corteAl ? ` hasta el ${formatoFechaCorta(corteAl)}` : ''}. Se completa a fin de mes; hasta
      entonces no se compara de igual a igual con los meses cerrados.
    </Parrafo>
  )
}
