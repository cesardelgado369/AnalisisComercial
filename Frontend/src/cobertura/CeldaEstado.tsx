import type { EstadoMes } from '../api/types'
import { nombreMesTitulo } from '../utils/formato'
import { TEXTO_ESTADO } from './estados'

const ICONO: Record<EstadoMes, string | null> = {
  compro: 'check',
  noCompro: 'close',
  dejoDeComprar: 'close',
  sinCompraAun: 'remove',
  fueraDeCartera: null,
}

/**
 * El estado de un cliente en un mes (CONTRATO_API.md): ✓ lleno si compró, ✗ con borde si no, «–» punteado si es el mes
 * en curso y todavía no compró (neutral, no es alarma), ✗ en rojo el mes en que dejó de comprar, y vacío si ese mes no
 * era de la cartera. El estado no depende solo del color: cada uno tiene su ícono y su texto («Octubre: compró»).
 */
export function CeldaEstado({ estado, mes, chico = false }: { estado: EstadoMes; mes: string; chico?: boolean }) {
  const texto = `${nombreMesTitulo(mes)}: ${TEXTO_ESTADO[estado]}`
  const icono = ICONO[estado]
  return (
    <span className={`estado-mes estado-${estado}${chico ? ' chico' : ''}`} role="img" aria-label={texto} title={texto}>
      {icono && <span className="icono" aria-hidden>{icono}</span>}
    </span>
  )
}
