import { useMesReferencia } from '../comercial/mesReferencia'
import { nombreMes, nombreMesTitulo } from '../utils/formato'

/** «Septiembre 2026». */
const mesConAnio = (mes: string) => `${nombreMesTitulo(mes)} ${mes.slice(0, 4)}`

/**
 * El mes en el que se para toda la app (solo el dueño), en la cabecera: se ve en todas las pantallas, también en la
 * ficha (Cesar, 30/10: con el filtro de la barra no lo encontraba). En un mes pasado se pone ámbar. En el celular no
 * entra en la cabecera: va en la barra de filtros.
 */
export function MesCabecera() {
  const { mes, enCurso, opciones, puedeElegir, elegir } = useMesReferencia()
  if (!puedeElegir) return null
  const ultimo = opciones[opciones.length - 1]
  return (
    <label className={enCurso ? 'header-mes' : 'header-mes pasado'} title="El mes que muestra toda la app (con los tres anteriores)">
      <span className="icono icono-chico" aria-hidden>calendar_month</span>
      <span className="sr-solo">Mes que estás viendo</span>
      <select value={enCurso ? '' : mes} onChange={(e) => elegir(e.target.value || null)}>
        {[...opciones].reverse().map((m) => (
          <option key={m} value={m === ultimo ? '' : m}>
            {mesConAnio(m)}
            {m === ultimo ? ' (en curso)' : ''}
          </option>
        ))}
      </select>
    </label>
  )
}

/** Parado en un mes pasado: el aviso arriba de cada pantalla comercial, con la vuelta al mes en curso. */
export function AvisoMesPasado() {
  const { mes, enCurso, opciones, puedeElegir, elegir } = useMesReferencia()
  if (!puedeElegir || enCurso) return null
  return (
    <p className="aviso-mes-pasado" role="status">
      <span className="icono icono-chico" aria-hidden>calendar_month</span>
      <span>
        Estás viendo <strong>{nombreMes(mes)} de {mes.slice(0, 4)}</strong>: Cobertura, Volumen, Devoluciones y la ficha
        muestran ese mes y los tres anteriores.
      </span>
      <button type="button" className="btn" onClick={() => elegir(null)}>
        Volver a {nombreMes(opciones[opciones.length - 1])}
      </button>
    </p>
  )
}
