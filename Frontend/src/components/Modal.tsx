import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import './modal.css'

export type TamanoModal = 'chico' | 'mediano' | 'grande'

interface MarcoProps {
  abierto: boolean
  onCerrar: () => void
  /** Título accesible del diálogo (también se muestra en la cabecera). */
  titulo: string
  subtitulo?: ReactNode
  tamano?: TamanoModal
  /** false = sin X y sin Esc (p. ej. mientras corre un proceso que no se puede cortar). */
  cerrable?: boolean
  /** `grande` usa alto fijo (casi toda la pantalla); los demás crecen con el contenido. */
  children: ReactNode
}

/** Modales abiertos, del de abajo al de arriba: Esc y Tab los maneja solo el de arriba (modal sobre modal). */
const pila: symbol[] = []

const ENFOCABLES = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Base de todos los modales: portal, fondo, cabecera oscura con título y X.
 * Cierra con Esc o con la X (no con un click en el fondo, para no perder lo cargado por accidente).
 * Atrapa el foco adentro, lo devuelve al cerrar y bloquea el scroll de la página.
 * Para usar: `Modal` (una sección) o `ModalPasos` (asistente con riel de pasos).
 */
export function MarcoModal({ abierto, onCerrar, titulo, subtitulo, tamano = 'mediano', cerrable = true, children }: MarcoProps) {
  const caja = useRef<HTMLDivElement>(null)
  const cerrar = useRef(onCerrar)
  const puedeCerrar = useRef(cerrable)
  useEffect(() => {
    cerrar.current = onCerrar
    puedeCerrar.current = cerrable
  }, [onCerrar, cerrable])

  useEffect(() => {
    if (!abierto) return
    const yo = Symbol('modal')
    pila.push(yo)
    const previo = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    // El foco va al campo marcado con `data-autofocus` (el `autoFocus` de React se aplica antes y este efecto lo pisaría;
    // además React no escribe `autofocus` en el DOM); si no hay, a la caja del diálogo.
    const inicial = caja.current?.querySelector<HTMLElement>('[data-autofocus]')
    ;(inicial ?? caja.current)?.focus()

    function teclas(e: KeyboardEvent) {
      if (pila[pila.length - 1] !== yo) return
      if (e.key === 'Escape') {
        // Con un mapa expandido (pantalla completa), Esc solo sale de la pantalla completa: el modal sigue abierto.
        if (document.fullscreenElement) return
        e.stopPropagation()
        if (puedeCerrar.current) cerrar.current()
        return
      }
      if (e.key !== 'Tab' || !caja.current) return
      const lista = [...caja.current.querySelectorAll<HTMLElement>(ENFOCABLES)]
      if (!lista.length) return
      const primero = lista[0]
      const ultimo = lista[lista.length - 1]
      if (e.shiftKey && (document.activeElement === primero || document.activeElement === caja.current)) {
        e.preventDefault()
        ultimo.focus()
      } else if (!e.shiftKey && document.activeElement === ultimo) {
        e.preventDefault()
        primero.focus()
      }
    }

    document.addEventListener('keydown', teclas)
    return () => {
      document.removeEventListener('keydown', teclas)
      pila.splice(pila.indexOf(yo), 1)
      if (!pila.length) document.body.style.overflow = overflow
      previo?.focus()
    }
  }, [abierto])

  if (!abierto) return null

  return createPortal(
    <div className="modal-fondo">
      <div
        ref={caja}
        className={`modal modal-${tamano}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-titulo"
        tabIndex={-1}
      >
        <header className="modal-cabecera">
          <div className="modal-titulos">
            <h2 id="modal-titulo">{titulo}</h2>
            {subtitulo && <div className="modal-subtitulo">{subtitulo}</div>}
          </div>
          {cerrable && (
            <button type="button" className="modal-cerrar" onClick={onCerrar} aria-label="Cerrar" title="Cerrar (Esc)">
              <span className="icono">close</span>
            </button>
          )}
        </header>
        <div className="modal-cuerpo">{children}</div>
      </div>
    </div>,
    document.body,
  )
}

interface ModalProps extends Omit<MarcoProps, 'children'> {
  children: ReactNode
  /** Botonera de abajo (p. ej. Cancelar / Guardar). Sin pie, el modal es solo contenido. */
  pie?: ReactNode
}

/** Modal de una sola sección: contenido con scroll y pie opcional. */
export function Modal({ children, pie, ...marco }: ModalProps) {
  return (
    <MarcoModal {...marco}>
      <div className="modal-seccion">
        <div className="modal-contenido">{children}</div>
        {pie && <footer className="modal-pie">{pie}</footer>}
      </div>
    </MarcoModal>
  )
}
