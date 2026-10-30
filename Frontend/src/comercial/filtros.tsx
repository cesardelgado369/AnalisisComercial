import { useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useConsulta } from '../api/useConsulta'
import { useSesionApp } from '../auth/SesionApp'
import { DIAS_VISITA, nombrePropio, nombreUnidad, unidadEnFrase } from '../cobertura/estados'
import { cantidad, nombreMesTitulo } from '../utils/formato'
import type { ContextoAyuda } from './ayuda'
import { useMesReferencia, type MesReferencia } from './mesReferencia'

/** Un valor de la URL, si es uno de los válidos; si no (o si no está), el de siempre. */
export function deLista<T extends string>(valor: string | null, validos: readonly T[], defecto: T): T {
  return valor !== null && (validos as readonly string[]).includes(valor) ? (valor as T) : defecto
}

/**
 * Los filtros de las secciones comerciales (Cobertura, Volumen y Devoluciones): vendedor (no para el operario de un
 * solo vendedor), día de visita y unidad de negocio, todo en la URL (`?vendedor=2&dia=2`): se puede compartir el link
 * o volver atrás. Lo que no es válido se ignora.
 */
export function useFiltrosComerciales() {
  const sesion = useSesionApp()
  const referencia = useMesReferencia()
  const [params, setParams] = useSearchParams()
  const esOperario = sesion.rol === 'operario'
  // El operario elige solo si tiene más de un vendedor de Chess (p. ej. el mismo vendedor renombrado en Chess con otro id)
  const eligeVendedor = !esOperario || sesion.vendedores.length > 1

  const vendedorUrl = Number(params.get('vendedor'))
  const vendedor = eligeVendedor && sesion.vendedores.some((v) => v.id === vendedorUrl) ? vendedorUrl : null
  const diaUrl = Number(params.get('dia'))
  const dia = DIAS_VISITA.some((d) => d.codigo === diaUrl) ? diaUrl : null
  const unidad = params.get('unidad') || null
  const busqueda = params.get('busqueda')?.trim() ?? ''
  /** Con «Todos los vendedores», debajo de la ruta de cada cliente va también su vendedor. */
  const conVendedor = eligeVendedor && vendedor === null

  /**
   * Cambia un parámetro de la URL, siempre sobre la URL **real del navegador** (el buscador lo llama 300 ms después de
   * tipear: no puede pisar un chip o un filtro elegido en el medio). No alcanza con los `params` del render: React
   * Router actualiza la URL al instante pero el render va en una transición, que con cientos de filas puede no haber
   * terminado. Los filtros quedan en el historial (Atrás vuelve); la búsqueda y el orden, no. Si la URL quedaría igual,
   * no navega (tocar el chip activo no suma entradas al historial).
   */
  const cambiar = useCallback(
    (clave: string, valor: string | null, historial = true) => {
      const actual = new URLSearchParams(window.location.search)
      const p = new URLSearchParams(actual)
      if (valor) p.set(clave, valor)
      else p.delete(clave)
      if (p.toString() === actual.toString()) return
      setParams(p, { replace: !historial })
    },
    [setParams],
  )
  const buscar = useCallback((texto: string | null) => cambiar('busqueda', texto, false), [cambiar])
  const elegirChip = useCallback((chip: string) => cambiar('chip', chip === 'todos' ? null : chip), [cambiar])
  /** «Ver todos los clientes»: saca la búsqueda y el chip (los filtros quedan). */
  const verTodos = useCallback(() => {
    const p = new URLSearchParams(window.location.search)
    p.delete('busqueda')
    p.delete('chip')
    setParams(p)
  }, [setParams])

  /** El mes de `?mes=` de la pantalla, si es uno de los que se pueden elegir; null = el mes en el que está parada la app. */
  const mesElegido = (disponibles: string[]) => {
    const mes = params.get('mes')
    return mes && mes !== referencia.mes && disponibles.includes(mes) ? mes : null
  }

  /** Los filtros comunes, listos para la consulta a la API. */
  const consulta = new URLSearchParams()
  if (vendedor !== null) consulta.set('vendedor', String(vendedor))
  if (dia !== null) consulta.set('dia', String(dia))
  if (unidad) consulta.set('unidad', unidad)

  // El título: el vendedor elegido, los del operario (unidos, como la API) o «Todos los vendedores». Se arma acá
  // (recomendado en el contrato: el `titulo` de la API es de referencia y trae los nombres como Chess, en mayúsculas)
  const titulo =
    vendedor !== null
      ? nombrePropio(sesion.vendedores.find((v) => v.id === vendedor)?.nombre ?? '')
      : esOperario
        ? nombrePropio(sesion.vendedor?.nombre ?? sesion.vendedores.map((v) => v.nombre).join(' / '))
        : 'Todos los vendedores'

  /** Como la web actual: «246 clientes, lunes, todas las unidades». */
  const subtitulo = (clientes: number) =>
    [
      cantidad(clientes, 'cliente'),
      dia !== null ? DIAS_VISITA.find((d) => d.codigo === dia)!.nombre.toLowerCase() : 'todos los días',
      unidad ? unidadEnFrase(unidad) : 'todas las unidades',
    ].join(', ')

  /** El dueño ve cómo se calculó cada número (comercial/ayuda.tsx); los demás roles, no. */
  const ayuda: ContextoAyuda | null =
    sesion.rol === 'admin' ? { vendedor: vendedor === null ? null : titulo, dia, unidad } : null

  return {
    sesion,
    referencia,
    /** El mes en el que está parada la app (el en curso, o el que eligió el dueño) y los cuatro que se ven. */
    mesRef: referencia.mes,
    ventana: referencia.ventana,
    params,
    cambiar,
    buscar,
    elegirChip,
    verTodos,
    mesElegido,
    esOperario,
    eligeVendedor,
    vendedor,
    conVendedor,
    dia,
    unidad,
    busqueda,
    consulta,
    titulo,
    subtitulo,
    ayuda,
  }
}

type Filtros = ReturnType<typeof useFiltrosComerciales>

/**
 * Los desplegables (el dueño suma el mes en el que se para la app). En el celular van compactos: el vendedor arriba y día y unidad lado a lado, sin el nombre
 * del filtro a la vista (el valor elegido ya lo dice: «Todos los días», «Lunes»); el lector de pantalla lo lee igual.
 */
export function BarraFiltros({ filtros }: { filtros: Filtros }) {
  const { sesion, cambiar, esOperario, eligeVendedor, vendedor, dia, unidad } = filtros
  const unidades = useConsulta<string[]>('/cobertura/unidades', 'No se pudieron leer las unidades de negocio.')
  return (
    <div className={['cob-filtros', !eligeVendedor && 'sin-vendedor', filtros.referencia.puedeElegir && 'con-mes'].filter(Boolean).join(' ')}>
      {eligeVendedor && (
        <label className="cob-filtro">
          <span className="cob-filtro-nombre">Vendedor</span>
          <select value={vendedor ?? ''} onChange={(e) => cambiar('vendedor', e.target.value || null)}>
            <option value="">{esOperario ? 'Todos mis vendedores' : 'Todos los vendedores'}</option>
            {sesion.vendedores.map((v) => (
              <option key={v.id} value={v.id}>{v.esCasa ? v.nombre : nombrePropio(v.nombre)}</option>
            ))}
          </select>
        </label>
      )}
      <label className="cob-filtro">
        <span className="cob-filtro-nombre">Día de visita</span>
        <select value={dia ?? ''} onChange={(e) => cambiar('dia', e.target.value || null)}>
          <option value="">Todos los días</option>
          {DIAS_VISITA.map((d) => (
            <option key={d.codigo} value={d.codigo}>{d.nombre}</option>
          ))}
        </select>
      </label>
      <div className="cob-filtro-con-aviso">
        <label className="cob-filtro">
          <span className="cob-filtro-nombre">Unidad de negocio</span>
          <select value={unidad ?? ''} onChange={(e) => cambiar('unidad', e.target.value || null)}>
            <option value="">Todas las unidades</option>
            {/* Si la URL trae una unidad que todavía no llegó en la lista, igual se muestra elegida */}
            {unidad && !unidades.datos?.includes(unidad) && <option value={unidad}>{nombreUnidad(unidad)}</option>}
            {unidades.datos?.map((u) => (
              <option key={u} value={u}>{nombreUnidad(u)}</option>
            ))}
          </select>
        </label>
        {unidades.errores.length > 0 && (
          <p className="cob-filtro-aviso" role="alert">
            <span className="icono icono-chico" aria-hidden>error</span>
            No pudimos cargar las unidades.
            <button type="button" className="btn-texto enlace" onClick={unidades.recargar}>Probá de nuevo</button>
          </p>
        )}
      </div>
      {filtros.referencia.puedeElegir && <SelectorMes referencia={filtros.referencia} />}
    </div>
  )
}

/**
 * El mes en el que se para la app (solo el dueño): elegir otro cambia toda la interfaz y sigue elegido en las otras
 * secciones. Parado en un mes pasado, el desplegable se resalta para que no se olvide.
 */
export function SelectorMes({ referencia }: { referencia: MesReferencia }) {
  const { mes, enCurso, opciones, elegir } = referencia
  const ultimo = opciones[opciones.length - 1]
  return (
    <label className={enCurso ? 'cob-filtro cob-filtro-mes' : 'cob-filtro cob-filtro-mes cob-filtro-pasado'}>
      <span className="cob-filtro-nombre">Mes</span>
      <select value={enCurso ? '' : mes} onChange={(e) => elegir(e.target.value || null)}>
        {[...opciones].reverse().map((m) => (
          <option key={m} value={m === ultimo ? '' : m}>
            {nombreMesTitulo(m)}
            {m === ultimo ? ' (en curso)' : ''}
          </option>
        ))}
      </select>
    </label>
  )
}

/** La unidad de un artículo para mostrar (sin el «124 - » de la web vieja, por si viniera). */
export const unidadVisible = (u: string) => nombreUnidad(u.replace(/^\d+\s*-\s*/, ''))
