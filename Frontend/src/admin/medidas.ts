import type { MedidaFoco } from '../api/types'

/** Como las escribe Checho en sus objetivos del mes: «CCC Manteca», «VOL Tapas». */
export const ETIQUETA_MEDIDA: Record<MedidaFoco, string> = { ccc: 'CCC', vol: 'VOL' }

/** Para elegirla al armar el foco. */
export const MEDIDAS: { valor: MedidaFoco; texto: string; ayuda: string; metaMaxima: number; metaEjemplo: string }[] = [
  {
    valor: 'ccc',
    texto: 'CCC · clientes que compraron',
    ayuda: 'Qué parte de la cartera de cada vendedor compró algún artículo del foco en el mes.',
    metaMaxima: 100,
    metaEjemplo: 'Por ejemplo 40: que 4 de cada 10 clientes lo compren.',
  },
  {
    valor: 'vol',
    texto: 'VOL · volumen en bultos',
    ayuda: 'Los bultos del foco contra el mes anterior al mismo día hábil, como en Volumen.',
    metaMaxima: 999,
    metaEjemplo: 'Contra el mes anterior: 100 es igualarlo y 110, venderle un 10 % más.',
  },
]
