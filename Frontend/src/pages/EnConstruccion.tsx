/**
 * Sección que todavía no tiene pantalla: el título, qué va a haber ahí y un aviso quieto.
 * Sin animación a propósito: la carga larga (`LoadingAnalisis`) es solo para esperas largas, no de relleno
 * (pedido del usuario: una animación que gira siempre marea).
 */
export function EnConstruccion({ titulo, detalle }: { titulo: string; detalle?: string }) {
  return (
    <section className="en-construccion">
      <h1>{titulo}</h1>
      {detalle && <p className="apagado">{detalle}</p>}
      <AvisoEnConstruccion />
    </section>
  )
}

/** «Estamos armando esta sección», quieto: para un bloque o una pantalla que todavía no está. */
export function AvisoEnConstruccion() {
  return (
    <p className="aviso-construccion">
      <span className="icono" aria-hidden>construction</span>
      Estamos armando esta sección.
    </p>
  )
}
