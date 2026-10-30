import type { ChipVolumen, ComparacionVolumen } from '../api/types'
import { nombreMes, nombreMesTitulo } from '../utils/formato'

/**
 * La comparación de Volumen en palabras (CONTRATO_API.md). El operario, en el mes en curso, compara contra el mes
 * anterior **completo**: es una meta, y lo que importa es el ritmo («a esta altura deberías ir por…»). Admin y
 * supervisor, al mismo día hábil. Con un mes cerrado, todos el mes entero contra el anterior.
 */
export function textosComparacion(c: ComparacionVolumen, mesEnCurso: string) {
  const enCurso = c.mes === mesEnCurso
  const ritmo = enCurso && c.tipo === 'mesAnteriorCompleto'
  const base = nombreMes(c.mesBase)
  return {
    ritmo,
    enCurso,
    base: c.tipo === 'mismoDiaHabil' ? `${base} al mismo día hábil` : `${base} completo`,
    columnaBase: c.tipo === 'mismoDiaHabil' ? `${nombreMesTitulo(c.mesBase)} al día ${c.diaHabil}` : `${nombreMesTitulo(c.mesBase)} completo`,
    /**
     * Contra qué parte de la base se lee cada fila: el ritmo del mes (operario: día hábil ÷ días hábiles) o la base
     * entera. Es solo para dibujar la marca y la flecha; los chips los decide la API.
     */
    referencia: ritmo && c.diasHabilesMes ? (c.diaHabil / c.diasHabilesMes) * 100 : 100,
    textoChip: {
      todos: 'Todos',
      bajaron: ritmo ? 'Debajo del ritmo' : 'Bajaron',
      subieron: ritmo ? 'En ritmo o arriba' : 'Subieron',
      nuevos: 'Nuevos en la cartera',
      sinCompraAun: enCurso ? 'Sin compra aún' : 'Sin compra',
    } satisfies Record<ChipVolumen, string>,
  }
}

export type TextosComparacion = ReturnType<typeof textosComparacion>
