import { useState, type ReactNode } from 'react'
import { MarcoModal, type TamanoModal } from './Modal'

export interface PasoModal {
  titulo: string
  /** Nombre de un ícono de Material Symbols. */
  icono: string
  /** Texto chico a la derecha del paso, p. ej. "(94)". */
  contador?: ReactNode
}

interface Props {
  abierto: boolean
  onCerrar: () => void
  titulo: string
  subtitulo?: ReactNode
  tamano?: TamanoModal
  pasos: PasoModal[]
  /** Índice del paso actual (controlado desde afuera). */
  paso: number
  onPaso: (paso: number) => void
  /** Contenido del paso actual. */
  children: ReactNode
  /** Texto del centro del pie (resumen de lo elegido). */
  resumen?: ReactNode
  /** Si se puede pasar al paso siguiente (default true). */
  puedeAvanzar?: boolean
  /** Se corre al tocar "Siguiente" (p. ej. guardar). Si devuelve false, se queda en el paso. */
  alAvanzar?: () => Promise<boolean> | boolean
  /** Botón del último paso (p. ej. "Publicar"). Sin esto, el último paso no tiene botón a la derecha. */
  accionFinal?: ReactNode
}

/**
 * Modal con riel de pasos a la izquierda y pie "Volver · resumen · Siguiente".
 * Navegación lineal: los pasos ya hechos se pueden revisitar; los siguientes, solo con "Siguiente".
 */
export function ModalPasos(props: Props) {
  const { pasos, paso, onPaso, children, resumen, puedeAvanzar = true, alAvanzar, accionFinal, tamano = 'grande', ...marco } = props
  const ultimo = paso === pasos.length - 1
  const [avanzando, setAvanzando] = useState(false)

  async function siguiente() {
    if (alAvanzar) {
      setAvanzando(true)
      try {
        if (!(await alAvanzar())) return
      } finally {
        setAvanzando(false)
      }
    }
    onPaso(paso + 1)
  }

  return (
    <MarcoModal {...marco} tamano={tamano}>
      <div className="modal-pasos">
        <aside className="modal-pasos-riel">
          <nav aria-label="Pasos">
            {pasos.map((p, i) => (
              <button
                key={p.titulo}
                type="button"
                className={i === paso ? 'actual' : i < paso ? 'hecho' : undefined}
                aria-current={i === paso ? 'step' : undefined}
                disabled={i > paso}
                onClick={() => onPaso(i)}
              >
                <span className="icono icono-chico">{i < paso ? 'check_circle' : p.icono}</span>
                <span>
                  {i + 1}. {p.titulo}
                </span>
                {p.contador !== undefined && <span className="modal-pasos-contador">{p.contador}</span>}
              </button>
            ))}
          </nav>
        </aside>

        <div className="modal-seccion">
          <div className="modal-contenido">{children}</div>
          <footer className="modal-pie modal-pie-pasos">
            <button className="btn" disabled={paso === 0} onClick={() => onPaso(paso - 1)}>
              <span className="icono icono-chico">arrow_back</span>
              {paso > 0 ? `Volver a ${pasos[paso - 1].titulo}` : 'Volver'}
            </button>
            <div className="modal-pie-resumen">{resumen}</div>
            {ultimo ? (
              accionFinal ?? <span />
            ) : (
              <button className="btn btn-primario" disabled={!puedeAvanzar || avanzando} onClick={() => void siguiente()}>
                {avanzando ? 'Guardando…' : `Siguiente: ${pasos[paso + 1].titulo}`}
                <span className="icono icono-chico">arrow_forward</span>
              </button>
            )}
          </footer>
        </div>
      </div>
    </MarcoModal>
  )
}
