import { useEffect, useRef, useState } from 'react'

const ESPERA = 300

/**
 * Buscador de Cobertura («Buscar cliente o código»). Lo escrito pasa a la URL (y a la API) 300 ms después de dejar de
 * tipear. Es un componente aparte a propósito: cada tecla re-dibuja solo el campo, no la tabla con cientos de filas.
 * Si la búsqueda cambia por fuera (Atrás, un link, «Ver todos los clientes»), el campo la acompaña; un cambio propio
 * no pisa lo que se sigue tipeando.
 */
export function BuscadorCobertura({ busqueda, onBuscar }: { busqueda: string; onBuscar: (texto: string | null) => void }) {
  const [texto, setTexto] = useState(busqueda)
  /** Lo último que este buscador mandó a la URL (o recibió de afuera). */
  const enviada = useRef(busqueda)

  useEffect(() => {
    if (texto.trim() === enviada.current) return
    const t = setTimeout(() => {
      enviada.current = texto.trim()
      onBuscar(enviada.current || null)
    }, ESPERA)
    return () => clearTimeout(t)
  }, [texto, onBuscar])

  useEffect(() => {
    if (busqueda === enviada.current) return
    enviada.current = busqueda
    setTexto(busqueda)
  }, [busqueda])

  return (
    <label className="cob-buscador">
      <span className="sr-solo">Buscar cliente o código</span>
      <span className="icono" aria-hidden>search</span>
      <input type="search" placeholder="Buscar cliente o código" value={texto} onChange={(e) => setTexto(e.target.value)} />
    </label>
  )
}
