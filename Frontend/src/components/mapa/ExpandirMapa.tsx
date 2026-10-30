import L from 'leaflet'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useMap } from 'react-leaflet'
import './mapa.css'

/**
 * Botón «Expandir mapa» (arriba a la derecha, como los de zoom): lleva el mapa a pantalla completa y lo
 * vuelve a su lugar con el mismo botón o con Esc. Va como hijo de cualquier `MapContainer`:
 * `<MapContainer …><TileLayer … /><ExpandirMapa />…</MapContainer>`.
 * Usa la pantalla completa del navegador, así funciona igual dentro de un modal.
 */
export function ExpandirMapa() {
  const mapa = useMap()
  const [caja, setCaja] = useState<HTMLElement | null>(null)
  const [expandido, setExpandido] = useState(false)

  // Control de Leaflet vacío: el botón se dibuja adentro con un portal.
  useEffect(() => {
    if (!document.fullscreenEnabled) return
    const Control = L.Control.extend({
      onAdd: () => {
        const div = L.DomUtil.create('div', 'leaflet-bar expandir-mapa')
        L.DomEvent.disableClickPropagation(div)
        L.DomEvent.disableScrollPropagation(div)
        return div
      },
    })
    const control = new Control({ position: 'topright' })
    control.addTo(mapa)
    setCaja(control.getContainer() ?? null)
    return () => {
      control.remove()
      setCaja(null)
    }
  }, [mapa])

  // Entra o sale (también con Esc): el mapa se reacomoda al tamaño nuevo sin perder el centro.
  useEffect(() => {
    const contenedor = mapa.getContainer()
    const alCambiar = () => {
      setExpandido(document.fullscreenElement === contenedor)
      mapa.invalidateSize()
    }
    // Esc sale siempre (el navegador suele hacerlo solo; esto cubre los casos en que la tecla llega a la página).
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && document.fullscreenElement === contenedor) void document.exitFullscreen()
    }
    document.addEventListener('fullscreenchange', alCambiar)
    document.addEventListener('keydown', tecla)
    return () => {
      document.removeEventListener('fullscreenchange', alCambiar)
      document.removeEventListener('keydown', tecla)
      if (document.fullscreenElement === contenedor) void document.exitFullscreen()
    }
  }, [mapa])

  function alternar() {
    const contenedor = mapa.getContainer()
    if (document.fullscreenElement === contenedor) void document.exitFullscreen()
    else void contenedor.requestFullscreen().catch(() => undefined)
  }

  if (!caja) return null
  const texto = expandido ? 'Achicar mapa' : 'Expandir mapa'
  return createPortal(
    <button type="button" title={texto} aria-label={texto} aria-pressed={expandido} onClick={alternar}>
      <span className="icono icono-chico" aria-hidden>{expandido ? 'close_fullscreen' : 'open_in_full'}</span>
    </button>,
    caja,
  )
}
