import { LoadingAnalisis } from '../components/loading/LoadingAnalisis'

/**
 * Costado derecho del login (donde De Ruta tiene las fotos y Mantenimiento el taller): panel violeta con la escena de
 * la lupa, que corre **una vez** al entrar y queda armada (no gira para siempre: marea). Sin frases (29/10, pedido de
 * Cesar). Se oculta en pantallas angostas.
 */
export function PanelLogin() {
  return (
    <section className="carrusel panel-lupa" aria-hidden>
      <div className="panel-lupa-escena">
        <LoadingAnalisis modo="una-vez" sobreOscuro />
      </div>
    </section>
  )
}
