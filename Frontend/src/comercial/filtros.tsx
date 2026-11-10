import { useCallback, type ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import type { Foco } from '../api/types'
import { useConsulta } from '../api/useConsulta'
import { useSesionApp } from '../auth/SesionApp'
import { DIAS_VISITA, nombrePropio, nombreUnidad, unidadEnFrase } from '../cobertura/estados'
import { cantidad, nombreMes, nombreMesTitulo } from '../utils/formato'
import type { ContextoAyuda } from './ayuda'
import { IconoCalendario, IconoFoco, IconoPaquete, IconoVendedor } from './IconosFiltro'
import { useMesReferencia, useVistaFocos, type MesReferencia } from './mesReferencia'

/** Un valor de la URL, si es uno de los válidos; si no (o si no está), el de siempre. */
export function deLista<T extends string>(valor: string | null, validos: readonly T[], defecto: T): T {
  return valor !== null && (validos as readonly string[]).includes(valor) ? (valor as T) : defecto
}

/**
 * Los filtros de las secciones comerciales (Cobertura, Volumen y Devoluciones): vendedor (no para el operario de un
 * solo vendedor), día de visita, unidad de negocio y foco del mes, todo en la URL (`?vendedor=2&dia=2`): se puede
 * compartir el link o volver atrás. Lo que no es válido se ignora.
 */
export function useFiltrosComerciales() {
  const sesion = useSesionApp()
  const referencia = useMesReferencia()
  const [params, setParams] = useSearchParams()
  const esAdmin = sesion.rol === 'admin'
  // Los focos del mes en el que está parada la app (Checho, 03/11; de cada mes desde el 05/11), solo para el dueño:
  // los empleados no los ven (Cesar, 05/11; la API les da 403). Sin ninguno, el filtro no se muestra
  const focos = useConsulta<Foco[]>(
    !esAdmin ? null : referencia.enCurso ? '/cobertura/focos' : `/cobertura/focos?mes=${referencia.mes}`,
    'No se pudieron leer los focos del mes.',
  )
  const esOperario = sesion.rol === 'operario'
  // El operario elige solo si tiene más de un vendedor de Chess (p. ej. el mismo vendedor renombrado en Chess con otro id)
  const eligeVendedor = !esOperario || sesion.vendedores.length > 1

  const vendedorUrl = Number(params.get('vendedor'))
  const vendedor = eligeVendedor && sesion.vendedores.some((v) => v.id === vendedorUrl) ? vendedorUrl : null
  const diaUrl = Number(params.get('dia'))
  const dia = DIAS_VISITA.some((d) => d.codigo === diaUrl) ? diaUrl : null
  const unidad = params.get('unidad') || null
  // Un foco de otro mes (o borrado) deja de filtrar; mientras llega la lista, vale el de la URL
  const focoUrl = Number(params.get('foco'))
  const foco = esAdmin && focoUrl > 0 && (focos.datos === null || focos.datos.some((f) => f.idFoco === focoUrl)) ? focoUrl : null
  const focoElegido = focos.datos?.find((f) => f.idFoco === foco) ?? null
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
  if (foco !== null) consulta.set('foco', String(foco))

  // El título: el vendedor elegido, los del operario (unidos, como la API) o «Todos los vendedores». Se arma acá
  // (recomendado en el contrato: el `titulo` de la API es de referencia y trae los nombres como Chess, en mayúsculas)
  const titulo =
    vendedor !== null
      ? nombrePropio(sesion.vendedores.find((v) => v.id === vendedor)?.nombre ?? '')
      : esOperario
        ? nombrePropio(sesion.vendedor?.nombre ?? sesion.vendedores.map((v) => v.nombre).join(' / '))
        : 'Todos los vendedores'

  /** Como la web actual: «246 clientes, lunes, todas las unidades» (y, con un foco, «…, foco Manteca»). */
  const subtitulo = (clientes: number, conFoco = true) =>
    [
      cantidad(clientes, 'cliente'),
      dia !== null ? DIAS_VISITA.find((d) => d.codigo === dia)!.nombre.toLowerCase() : 'todos los días',
      unidad ? unidadEnFrase(unidad) : 'todos los tipos de producto',
      ...(focoElegido && conFoco ? [`foco ${focoElegido.nombre}`] : []),
    ].join(', ')

  /** El dueño ve cómo se calculó cada número (comercial/ayuda.tsx); los demás roles, no. */
  const ayuda: ContextoAyuda | null = esAdmin ? { vendedor: vendedor === null ? null : titulo, dia, unidad, foco: focoElegido } : null

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
    focos,
    foco,
    busqueda,
    consulta,
    titulo,
    subtitulo,
    ayuda,
  }
}

export type Filtros = ReturnType<typeof useFiltrosComerciales>

/**
 * Los desplegables. En el celular el dueño suma el mes en el que se para la app (en la PC lo tiene en la cabecera,
 * layout/MesCabecera; Volumen tiene el suyo y lo saca con `conMes={false}`). En el celular van compactos: el vendedor arriba y día y unidad lado a lado, sin el nombre
 * del filtro a la vista (el valor elegido ya lo dice: «Todos los días», «Lunes»); el lector de pantalla lo lee igual.
 */
export function BarraFiltros({ filtros, conMes = true, sinFoco = false }: { filtros: Filtros; conMes?: boolean; sinFoco?: boolean }) {
  const { sesion, cambiar, esOperario, eligeVendedor, vendedor, dia, unidad, focos, foco } = filtros
  const unidades = useConsulta<string[]>('/cobertura/unidades', 'No se pudieron leer los tipos de producto.')
  // El foco, solo si el mes tiene alguno (si la lista no llegó, no se muestra: es un filtro de más). En la vista por
  // focos de Cobertura (`sinFoco`) tampoco: ahí están todos, uno por columna
  const conFoco = !sinFoco && !!focos.datos?.length
  return (
    <div className={['cob-filtros', !eligeVendedor && 'sin-vendedor', conFoco && 'con-foco'].filter(Boolean).join(' ')}>
      {eligeVendedor && (
        <label className="cob-filtro">
          <Titulo icono={<IconoVendedor />}>Vendedor</Titulo>
          <select value={vendedor ?? ''} onChange={(e) => cambiar('vendedor', e.target.value || null)}>
            <option value="">{esOperario ? 'Todos mis vendedores' : 'Todos los vendedores'}</option>
            {sesion.vendedores.map((v) => (
              <option key={v.id} value={v.id}>{v.esCasa ? v.nombre : nombrePropio(v.nombre)}</option>
            ))}
          </select>
        </label>
      )}
      <label className="cob-filtro">
        <Titulo icono={<IconoCalendario />}>Día de visita</Titulo>
        <select value={dia ?? ''} onChange={(e) => cambiar('dia', e.target.value || null)}>
          <option value="">Todos los días</option>
          {DIAS_VISITA.map((d) => (
            <option key={d.codigo} value={d.codigo}>{d.nombre}</option>
          ))}
        </select>
      </label>
      <div className="cob-filtro-con-aviso">
        <label className="cob-filtro">
          {/* Para Chess es la unidad de negocio; en pantalla, tipo de producto (Cesar, 10/11) */}
          <Titulo icono={<IconoPaquete />}>Tipo de producto</Titulo>
          <select value={unidad ?? ''} onChange={(e) => cambiar('unidad', e.target.value || null)}>
            <option value="">Todos los tipos</option>
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
            No pudimos cargar los tipos de producto.
            <button type="button" className="btn-texto enlace" onClick={unidades.recargar}>Probá de nuevo</button>
          </p>
        )}
      </div>
      {conFoco && (
        <label className={foco === null ? 'cob-filtro cob-filtro-foco' : 'cob-filtro cob-filtro-foco cob-filtro-activo'}>
          <Titulo icono={<IconoFoco />}>Foco del mes</Titulo>
          <select value={foco ?? ''} onChange={(e) => cambiar('foco', e.target.value || null)}>
            <option value="">Todos los productos</option>
            {focos.datos!.map((f) => (
              <option key={f.idFoco} value={f.idFoco}>{f.nombre}</option>
            ))}
          </select>
        </label>
      )}
      {conMes && filtros.referencia.puedeElegir && <SelectorMes referencia={filtros.referencia} />}
    </div>
  )
}

/**
 * El título de un filtro, con su ícono, en la banda negra de arriba del desplegable (Cesar, 10/11). Los íconos son los
 * dibujados para Madomi (comercial/IconosFiltro).
 */
function Titulo({ icono, children }: { icono: ReactNode; children: string }) {
  return (
    <span className="cob-filtro-nombre">
      {icono}
      {children}
    </span>
  )
}

/**
 * El mes en el que se para la app (solo el dueño), en la barra de filtros del celular: elegir otro cambia toda la
 * interfaz y sigue elegido en las otras secciones. Parado en un mes pasado, el desplegable se resalta.
 */
function SelectorMes({ referencia }: { referencia: MesReferencia }) {
  const { mes, enCurso, opciones, elegir } = referencia
  const focos = useVistaFocos()
  const navegar = useNavigate()
  const ultimo = opciones[opciones.length - 1]
  return (
    <div className="cob-filtro-mes">
      <label className={enCurso ? 'cob-filtro' : 'cob-filtro cob-filtro-pasado'}>
        <Titulo icono={<IconoCalendario />}>Mes</Titulo>
        <select value={enCurso ? '' : mes} onChange={(e) => elegir(e.target.value || null)}>
          {[...opciones].reverse().map((m) => (
            <option key={m} value={m === ultimo ? '' : m}>
              {nombreMesTitulo(m)}
              {m === ultimo ? ' (en curso)' : ''}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        className="btn cob-filtro-mes-focos"
        aria-pressed={focos.activa}
        onClick={() => navegar(focos.destino)}
        title={focos.activa ? 'Volver a los clientes por mes' : `Los clientes con una columna por foco de ${nombreMes(mes)}`}
      >
        <span className="icono icono-chico" aria-hidden>filter_alt</span>
        Focos
      </button>
    </div>
  )
}

/** La unidad de un artículo para mostrar (sin el «124 - » de la web vieja, por si viniera). */
export const unidadVisible = (u: string) => nombreUnidad(u.replace(/^\d+\s*-\s*/, ''))
