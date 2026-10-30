import type { ReactNode } from 'react'
import type { ComparacionVolumen, TotalVolumen } from '../api/types'
import { formatoBultos, formatoFechaCorta, formatoPorcentaje as pct } from '../utils/formato'
import type { TextosComparacion } from './comparacion'
import './volumen.css'

/**
 * El total contra la base: para el operario en el mes en curso, la meta y el ritmo («vas debajo del ritmo»); para
 * admin y supervisor, la variación al mismo día hábil. Lo usan la sección Volumen y la ficha. Con `soloPorcentaje`
 * (el operario en la sección), el total de su cartera va solo en porcentajes, sin bultos (Cesar, 30/10).
 */
export function TotalComparado(props: {
  /** En la ficha, `bultosActual` null: ese mes el cliente ya no es de quien mira (con `soloPorcentaje` no se mira). */
  total: TotalVolumen
  c: ComparacionVolumen
  t: TextosComparacion
  sinBase: string
  sujeto?: string
  fueraDeCartera?: string
  soloPorcentaje?: boolean
  /** El ícono que explica el cálculo (el dueño), al lado del número. */
  ayuda?: ReactNode
}) {
  const { total, c, t, sinBase, sujeto = 'Vas', fueraDeCartera = 'Este mes no es de la cartera.', soloPorcentaje = false, ayuda } = props
  const { bultosActual, bultosBase, bultosEsperado, porcentaje } = total
  const corte = c.corteAl ? `Al ${formatoFechaCorta(c.corteAl)}` : 'Todavía sin ventas del mes'
  const habil = t.enCurso ? ` · día hábil ${c.diaHabil} de ${c.diasHabilesMes}` : ''
  const pie = <p className="vol-total-corte">{corte}{habil}</p>
  if (bultosActual === null && !soloPorcentaje) {
    return (
      <div className="vol-total">
        <p className="vol-total-detalle">{fueraDeCartera}</p>
        {pie}
      </div>
    )
  }
  // Sin bultos a la vista, sin porcentaje no queda número: solo el aviso de que no hay base
  if (soloPorcentaje ? porcentaje === null : bultosBase === null) {
    return (
      <div className="vol-total ayuda-ancla">
        {!soloPorcentaje && (
          <p className="vol-total-numero">
            <strong>{formatoBultos(bultosActual!)}</strong> bultos{ayuda}
          </p>
        )}
        <p className="vol-total-detalle">{sinBase}</p>
        {pie}
      </div>
    )
  }
  // Con base, el esperado es un número. Sin bultos, la misma cuenta en porcentaje: contra el ritmo o la base entera
  const arriba = soloPorcentaje ? porcentaje! >= t.referencia : bultosActual! >= bultosEsperado!
  const ritmo = soloPorcentaje ? `(el ${pct(t.referencia)} a esta altura)` : `(${formatoBultos(bultosEsperado!)} a esta altura)`
  const faltan = soloPorcentaje ? '' : ` ${formatoBultos(Math.round((bultosEsperado! - bultosActual!) * 10) / 10)} bultos`
  return (
    <div className="vol-total ayuda-ancla">
      <p className="vol-total-numero">
        {soloPorcentaje ? (
          <>
            <strong>{pct(porcentaje!)}</strong> de {t.base}
          </>
        ) : (
          <>
            <strong>{formatoBultos(bultosActual!)}</strong> bultos
          </>
        )}
        {ayuda}
      </p>
      {!soloPorcentaje && (
        <p className="vol-total-detalle">
          {t.ritmo ? 'de' : 'contra'} <strong>{formatoBultos(bultosBase!)}</strong> de {t.base}
          {porcentaje !== null && <> · <strong>{pct(porcentaje)}</strong></>}
        </p>
      )}
      <div className="vol-barra" role="img" aria-label={`${pct(porcentaje ?? 0)} de ${t.base}${t.ritmo ? `; el ritmo es ${pct(t.referencia)}` : ''}`}>
        <span className="vol-barra-relleno" style={{ width: `${Math.min(100, porcentaje ?? 0)}%` }} />
        {t.ritmo && <span className="vol-barra-ritmo" style={{ left: `${t.referencia}%` }} />}
      </div>
      <p className={`vol-estado ${arriba ? 'bien' : 'mal'}`}>
        <span className="icono icono-chico" aria-hidden>{arriba ? 'trending_up' : 'trending_down'}</span>
        {porcentaje === null
          ? 'Sin base para comparar'
          : t.ritmo
            ? arriba
              ? `${sujeto} arriba del ritmo ${ritmo}`
              : `${sujeto}${faltan} debajo del ritmo ${ritmo}`
            : `${porcentaje >= 100 ? '+' : '−'}${pct(Math.abs(porcentaje - 100))} contra ${t.base}`}
      </p>
      {pie}
    </div>
  )
}

/**
 * El avance de una fila contra su base: la barra, la marca de la referencia (el ritmo del mes para el operario, o la
 * base entera) y el porcentaje con su flecha (no depende solo del color).
 */
export function Avance({ porcentaje, referencia, sinBase = 'Sin base' }: { porcentaje: number | null; referencia: number; sinBase?: string }) {
  if (porcentaje === null) return <span className="vol-avance vacio-avance apagado">{sinBase}</span>
  const arriba = porcentaje >= referencia
  return (
    <span className="vol-avance" title={`${pct(porcentaje)} de la base`}>
      <span className="vol-barra chica">
        <span className="vol-barra-relleno" style={{ width: `${Math.min(100, porcentaje)}%` }} />
        {referencia < 100 && <span className="vol-barra-ritmo" style={{ left: `${referencia}%` }} />}
      </span>
      <span className={`vol-avance-numero ${arriba ? 'bien' : 'mal'}`}>
        <span className="icono icono-chico" aria-hidden>{arriba ? 'arrow_upward' : 'arrow_downward'}</span>
        {pct(porcentaje)}
      </span>
    </span>
  )
}
