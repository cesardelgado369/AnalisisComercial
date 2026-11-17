import { useEffect, useRef } from 'react'
import { DIAS_VISITA } from '../cobertura/estados'

/** El día de visita de hoy (Lunes = 2 … Sábado = 7, como Chess); el domingo, ninguno. */
export function diaDeHoy() {
  const d = new Date().getDay()
  return d === 0 ? null : d + 1
}

/**
 * La ventanita del PDF de focos (Cesar, 17/11: «al exportar en PDF selecciono el día de la semana, así aparecen los datos
 * de ese día, no todos los clientes de golpe»): un botón por día de visita y, abajo, toda la semana. Se abre debajo del
 * botón del PDF; al elegir, se cierra y arma el PDF. Se cierra también con Esc o tocando afuera.
 */
export function ElegirDiaPdf(props: {
  /** El día que se marca: el del filtro de la pantalla o, si no hay, el de hoy. */
  sugerido: number | null
  onElegir: (dia: number | null) => void
  onCerrar: () => void
}) {
  const { sugerido, onElegir, onCerrar } = props
  const caja = useRef<HTMLDivElement>(null)
  const cerrar = useRef(onCerrar)
  useEffect(() => {
    cerrar.current = onCerrar
  })

  useEffect(() => {
    const botones = caja.current
    ;(botones?.querySelector<HTMLButtonElement>('button.sugerido') ?? botones?.querySelector<HTMLButtonElement>('button'))?.focus()
    function afuera(e: PointerEvent) {
      const t = e.target as Element
      if (!caja.current?.contains(t) && !t.closest?.('.foco-pdf')) cerrar.current()
    }
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && cerrar.current()
    document.addEventListener('pointerdown', afuera)
    document.addEventListener('keydown', tecla)
    return () => {
      document.removeEventListener('pointerdown', afuera)
      document.removeEventListener('keydown', tecla)
    }
  }, [])

  return (
    <div ref={caja} className="foco-pdf-dias" role="dialog" aria-label="Elegí el día del PDF">
      <p className="foco-pdf-dias-titulo">¿De qué día?</p>
      <p className="foco-pdf-dias-ayuda">Solo los clientes que se visitan ese día.</p>
      <div className="foco-pdf-dias-lista">
        {DIAS_VISITA.map((d) => (
          <button key={d.codigo} type="button" className={d.codigo === sugerido ? 'btn sugerido' : 'btn'} onClick={() => onElegir(d.codigo)}>
            {d.nombre}
          </button>
        ))}
      </div>
      <button type="button" className="btn foco-pdf-dias-todos" onClick={() => onElegir(null)}>
        Toda la semana
      </button>
    </div>
  )
}
