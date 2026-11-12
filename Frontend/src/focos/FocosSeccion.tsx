import { useCallback } from 'react'
import { BarraFiltros, deLista, useFiltrosComerciales } from '../comercial/filtros'
import { VistaFocos } from '../cobertura/VistaFocos'
import type { Orden } from '../cobertura/TablaCobertura'
import '../cobertura/cobertura.css'

const ORDENES: Orden[] = ['codigo', 'codigo-desc', 'nombre', 'nombre-desc']

/**
 * La sección **Focos** (`/focos`, Cesar 12/11: «que focos sea una sección»; antes era la tercera vista de Cobertura).
 * Los focos del mes que armó Checho, para todos: arriba el número de cada foco (con su meta y el objetivo del vendedor),
 * abajo los clientes con una columna por foco. Cada uno ve su cartera (lo recorta la API). Los filtros son los de
 * Cobertura, sin el de foco (están todos, uno por columna).
 */
export function FocosSeccion() {
  const filtros = useFiltrosComerciales()
  const orden = deLista<Orden>(filtros.params.get('orden'), ORDENES, 'codigo')
  const { cambiar } = filtros
  const cambiarOrden = useCallback((o: Orden) => cambiar('orden', o === 'codigo' ? null : o, false), [cambiar])
  return (
    <section className="pagina cob">
      <BarraFiltros filtros={filtros} sinFoco />
      <VistaFocos filtros={filtros} mes={filtros.mesRef} orden={orden} onOrden={cambiarOrden} />
    </section>
  )
}
