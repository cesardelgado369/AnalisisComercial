/**
 * Aviso de «cambiaron los datos» (se guardó algo): las consultas abiertas (`useConsulta`) se vuelven a leer
 * solas, así lo guardado desde un modal aparece enseguida en la pantalla que se esté mirando.
 */
const EVENTO = 'analisis:cambio'

export function avisarCambio() {
  window.dispatchEvent(new Event(EVENTO))
}

export function alCambiar(fn: () => void) {
  window.addEventListener(EVENTO, fn)
  return () => window.removeEventListener(EVENTO, fn)
}
