import { nombrePropio } from '../cobertura/estados'

/**
 * El título de la tarjeta principal de Cobertura, Volumen y Devoluciones (el vendedor elegido o Todos los vendedores):
 * una banda negra de punta a punta y centrada, como los títulos de los filtros, sin ícono (Cesar, 10/11). Se muestra
 * enseguida, sin esperar los datos.
 */
export function TituloTarjeta({ titulo }: { titulo: string }) {
  return <h1 className="cob-titulo">{nombrePropio(titulo)}</h1>
}
