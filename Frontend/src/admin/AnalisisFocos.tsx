import { Link } from 'react-router-dom'
import type { AnalisisFocos as Analisis, ClaseAbc, CoberturaFoco, FocoAnalizado, ObjetivoFoco, VolumenFoco } from '../api/types'
import { useConsulta } from '../api/useConsulta'
import { useMesReferencia } from '../comercial/mesReferencia'
import type { ClaveVendedorFoco } from './VentanaVendedor'
import { nombrePropio } from '../cobertura/estados'
import { formatoBultos, formatoEntero, formatoFechaCorta, formatoPorcentaje, formatoPorcentajeDecimal, nombreMes, nombreMesCorto } from '../utils/formato'

/**
 * Un número del análisis, igual para las dos medidas: el porcentaje, su detalle, dónde va la rayita del mes anterior y
 * la diferencia. CCC: clientes que compraron, contra el mismo foco el mes anterior (en puntos). VOL: los bultos contra
 * el mes anterior al mismo día hábil, así que la rayita es siempre el 100 % y la diferencia, lo que creció o cayó.
 */
interface Medicion {
  valor: number | null
  detalle: string
  antes: number | null
  dif: number | null
  unidadDif: 'pts' | '%'
}

const deCcc = (c: CoberturaFoco, conClientes = false): Medicion => ({
  valor: c.porcentaje,
  detalle: `${formatoEntero(c.clientesConCompra)} de ${formatoEntero(c.clientesCartera)}${conClientes ? ' clientes' : ''}`,
  antes: c.porcentajeAnterior,
  dif: c.porcentajeAnterior === null ? null : Math.round(c.porcentaje) - Math.round(c.porcentajeAnterior),
  unidadDif: 'pts',
})

/** Contra el objetivo de clientes (20/11): lo que compraron sobre el objetivo, sin comparación con el mes anterior. */
const deObjetivo = (actual: number, objetivo: number, conClientes = false): Medicion => ({
  valor: (actual / objetivo) * 100,
  detalle: `${formatoEntero(actual)} de ${formatoEntero(objetivo)}${conClientes ? ' clientes' : ''}`,
  antes: null,
  dif: null,
  unidadDif: 'pts',
})

const deVol = (c: VolumenFoco): Medicion => ({
  valor: c.porcentaje,
  detalle:
    c.bultosBase === null || c.porcentaje === null
      ? `${formatoBultos(c.bultosActual)} bultos`
      : `${formatoBultos(c.bultosActual)} de ${formatoBultos(c.bultosBase)} bultos`,
  antes: c.porcentaje === null ? null : 100,
  dif: c.porcentaje === null ? null : Math.round(c.porcentaje) - 100,
  unidadDif: '%',
})

/**
 * «↑ +6 vs oct.» (CCC, en puntos) o «↓ -12% vs oct.» (VOL): con flecha y texto, el color solo acompaña. Cesar no
 * entendía «pts» (10/11): el globito y el lector de pantalla lo dicen con todas las letras.
 */
function Diferencia({ m, contra, corto }: { m: Medicion; contra: string; corto: string }) {
  if (m.dif === null)
    return (
      <span className="foco-dif sin" title={`Sin datos de ${contra}`}>
        —<span className="sr-solo"> sin datos de {contra}</span>
      </span>
    )
  const d = m.dif
  const clase = d > 0 ? 'foco-dif sube' : d < 0 ? 'foco-dif baja' : 'foco-dif igual'
  const explicacion =
    m.unidadDif === 'pts'
      ? `En ${contra} era ${formatoPorcentaje(m.antes ?? 0)}: ${Math.abs(d)} ${Math.abs(d) === 1 ? 'punto' : 'puntos'} ${d < 0 ? 'menos' : 'más'}.`
      : `Vendió el ${formatoPorcentaje(100 + d)} de lo de ${contra}.`
  return (
    <span className={clase} title={explicacion}>
      <span className="icono icono-chico" aria-hidden>{d > 0 ? 'arrow_upward' : d < 0 ? 'arrow_downward' : 'remove'}</span>
      <span aria-hidden>
        {d > 0 ? '+' : ''}
        {d}
        {m.unidadDif === '%' ? '%' : ''} vs {corto}
      </span>
      <span className="sr-solo">{explicacion}</span>
    </span>
  )
}

/**
 * La barra del mes (violeta), la rayita del mes anterior y, si hay meta, su marca punteada. En VOL (`superado`), verde
 * cuando ya vendió más que el mes anterior: el objetivo es pasarlo (Cesar, 12/11).
 */
function Barra({ m, meta, escala, superado = false }: { m: Medicion; meta: number | null; escala: number; superado?: boolean }) {
  const lugar = (n: number) => `${Math.min(100, (Math.max(0, n) / escala) * 100)}%`
  return (
    <span className={superado ? 'foco-barra superado' : 'foco-barra'} aria-hidden>
      {m.valor !== null && <span className="foco-barra-relleno" style={{ width: lugar(m.valor) }} />}
      {meta !== null && <span className="foco-barra-meta" style={{ left: lugar(meta) }} />}
      {m.antes !== null && <span className="foco-barra-antes" style={{ left: lugar(m.antes) }} />}
    </span>
  )
}

/**
 * El total de un VOL (Cesar, 12/11: «hacele una barra de progreso mejor, el objetivo es que le vendan más tapas a los
 * clientes que lo que se vendió el mes anterior»): una barra gruesa hasta lo del mes anterior, con la marca rotulada,
 * verde si ya lo pasó, y en palabras cuánto falta para igualarlo o por cuánto lo pasó.
 */
function AvanceVolumen({ v, escala, ctx }: { v: VolumenFoco; escala: number; ctx: ContextoAnalisis }) {
  const lugar = (n: number) => `${Math.min(100, (Math.max(0, n) / escala) * 100)}%`
  if (v.bultosBase === null || v.porcentaje === null)
    return <p className="foco-vol-texto">Sin {ctx.anterior} para comparar: van {formatoBultos(v.bultosActual)} bultos.</p>
  const diferencia = v.bultosActual - v.bultosBase
  const superado = diferencia >= 0
  return (
    <div className="foco-vol-avance">
      <span className={superado ? 'foco-vol-barra superado' : 'foco-vol-barra'} aria-hidden>
        <span className="foco-vol-relleno" style={{ width: lugar(v.porcentaje) }} />
        <span className="foco-vol-marca" style={{ left: lugar(100) }}>
          <span className="foco-vol-marca-texto">{ctx.anteriorCorto}</span>
        </span>
      </span>
      <p className={superado ? 'foco-vol-texto superado' : 'foco-vol-texto'} title={`Contra ${ctx.vol}.`}>
        <span className="icono icono-chico" aria-hidden>{superado ? 'trending_up' : 'flag'}</span>
        {superado ? (
          <span>
            Ya pasó {ctx.parcial ? `${ctx.anterior} a esta altura` : ctx.anterior} por <strong>{formatoBultos(diferencia)} bultos</strong>
          </span>
        ) : (
          <span>
            Faltan <strong>{formatoBultos(-diferencia)} bultos</strong> para igualar {ctx.parcial ? `${ctx.anterior} a esta altura` : ctx.anterior}
          </span>
        )}
      </p>
    </div>
  )
}

/**
 * La tendencia del Excel de Checho (17/11): si sigue a este ritmo, en qué % del objetivo termina el mes. Verde desde el
 * 100 %, rojo abajo; el número dice cuánto, el color solo acompaña.
 */
export function Tendencia({ valor, enCurso }: { valor: number | null | undefined; enCurso: boolean }) {
  if (valor === null || valor === undefined) return null
  const explicacion = enCurso
    ? `Tendencia: si sigue a este ritmo, termina el mes en el ${formatoPorcentajeDecimal(valor)} del objetivo.`
    : `Terminó el mes en el ${formatoPorcentajeDecimal(valor)} del objetivo.`
  return (
    <span className={valor >= 100 ? 'foco-tendencia buena' : 'foco-tendencia mala'} title={explicacion}>
      {formatoPorcentajeDecimal(valor)}
      <span className="sr-solo"> {explicacion}</span>
    </span>
  )
}

/**
 * El objetivo de un vendedor, como lo sigue Checho en su Excel (12/11 y 17/11): el objetivo (clientes en CCC, bultos en
 * VOL; el de lo del mes anterior si nadie lo cambió), cuánto le falta y la tendencia.
 */
function Objetivo({ o, vol, ctx }: { o: ObjetivoFoco; vol: boolean; ctx: ContextoAnalisis }) {
  const objetivo = vol ? (o.bultos ?? null) : o.clientes
  if (objetivo === null) return null
  const actual = vol ? (o.bultosActual ?? 0) : o.clientesConCompra
  const faltan = objetivo - actual
  const cuanto = (n: number) => (vol ? formatoBultos(n) : formatoEntero(n))
  return (
    <span className={faltan <= 0 ? 'foco-objetivo cumplido' : 'foco-objetivo'}>
      <span className="icono icono-chico" aria-hidden>{faltan <= 0 ? 'check_circle' : 'flag'}</span>
      Objetivo {cuanto(objetivo)}
      {vol ? (o.sugerido ? ` b. (${ctx.anteriorCorto})` : ' b.') : ''}
      {faltan > 0 ? ` · ${!vol && faltan === 1 ? 'falta 1' : `faltan ${cuanto(faltan)}`}` : ' · cumplido'}
      <Tendencia valor={o.tendencia} enCurso={ctx.enCurso} />
    </span>
  )
}

/** Si llegó a la meta, para el lector de pantalla y el globito. */
const textoMeta = (m: Medicion, meta: number | null) =>
  meta === null || m.valor === null
    ? ''
    : m.valor >= meta
      ? ' Llegó a la meta.'
      : ` Le faltan ${Math.ceil(meta - m.valor)} puntos para la meta.`

/**
 * El análisis de los focos de un mes (`GET /api/admin/focos/analisis`, solo el dueño; null = no pedirlo, como el mes
 * que viene) y contra qué se compara cada medida, en palabras.
 */
export function useAnalisisFocos(mes: string | null, opciones: { acumulado: boolean; categoria: ClaseAbc | null }) {
  const qs = new URLSearchParams(mes ? { mes } : {})
  if (opciones.acumulado) qs.set('comparacion', 'acumulado')
  if (opciones.categoria) qs.set('abc', opciones.categoria)
  const consulta = useConsulta<Analisis>(mes && `/admin/focos/analisis?${qs}`, 'No pudimos armar cómo vienen los focos.')
  const a = consulta.datos?.mes === mes ? consulta.datos : null
  const anterior = a ? nombreMes(a.mesAnterior) : ''
  const anteriorCorto = a ? `${nombreMesCorto(a.mesAnterior)}.` : ''
  return {
    ...consulta,
    a,
    contexto: a && {
      enCurso: a.mesEnCurso,
      mes: a.mes,
      anterior,
      anteriorCorto,
      corteAl: a.corteAl,
      /** Contra el mes anterior al mismo día (parcial) o contra todo el mes anterior (acumulado, o un mes cerrado). */
      parcial: !!a.anteriorAl,
      ccc: a.anteriorAl ? `${anterior} al ${formatoFechaCorta(a.anteriorAl)}` : `todo ${anterior}`,
      vol:
        a.mesEnCurso && a.volumen?.tipo === 'mismoDiaHabil' && a.volumen.baseHasta
          ? `${anterior} al ${formatoFechaCorta(a.volumen.baseHasta)} (mismo día hábil)`
          : `todo ${anterior}`,
    },
  }
}

export type ContextoAnalisis = NonNullable<ReturnType<typeof useAnalisisFocos>['contexto']>

/** Qué quiere decir cada marca de las barras: el mes, la rayita del anterior y, si algún foco tiene, la meta. */
export function LeyendaFocos({ ctx, conMeta }: { ctx: ContextoAnalisis; conMeta: boolean }) {
  return (
    <p className="foco-leyenda">
      <span><span className="foco-leyenda-barra" aria-hidden /> {ctx.enCurso ? `${nombreMes(ctx.mes)} hasta hoy` : nombreMes(ctx.mes)}</span>
      <span><span className="foco-leyenda-antes" aria-hidden /> {ctx.parcial ? `${ctx.anterior} al mismo día` : `todo ${ctx.anterior}`}</span>
      {conMeta && <span><span className="foco-leyenda-meta" aria-hidden /> meta</span>}
    </p>
  )
}

/**
 * Cómo viene un foco (Cesar, 05/11), con los números de Checho: el total y una barra por vendedor (el mejor arriba).
 * CCC: los clientes de su cartera que compraron algún artículo del foco, contra el mes anterior al mismo día. VOL: los
 * bultos contra el mes anterior al mismo día hábil. La meta, si hay, va marcada en cada barra. Cada vendedor lleva a sus
 * clientes con ese foco (Cobertura o Volumen).
 */
export function MedicionFoco(props: {
  f: FocoAnalizado
  ctx: ContextoAnalisis
  /** Al pasar el mouse por un vendedor (o llegar con el teclado), y al salir: la ventanita con sus clientes. */
  alPasar?: (clave: ClaveVendedorFoco | null, fila?: HTMLElement) => void
  /** El vendedor de la ventanita abierta en este foco, resaltado. */
  enfocado?: number | null
  /** Los objetivos de cada vendedor (Cesar, 12/11 y 17/11), con lo que llevan sin filtros y su tendencia. */
  objetivos?: ObjetivoFoco[]
  /** La fila Totales del Excel: el objetivo del equipo, lo que lleva y su tendencia. */
  equipo?: { objetivo: number; actual: number; tendencia: number | null } | null
}) {
  const { f, ctx, alPasar, enfocado, objetivos = [], equipo = null } = props
  const referencia = useMesReferencia()
  const contra = f.medida === 'vol' ? ctx.vol : ctx.ccc
  const objetivoDe = (idPersonal: number) => objetivos.find((o) => o.idPersonal === idPersonal)
  // Un CCC con el objetivo de todos sus vendedores se cuenta contra el objetivo, no contra la cartera (Cesar, 20/11: «está
  // muy mal el indicador de progresión»: la barra iba al 15 % de 999 con un objetivo de 311). Cada vendedor, contra el
  // suyo. Si a alguno le falta, todo sigue contra la cartera
  const contraObjetivo =
    f.medida === 'ccc' &&
    !!equipo &&
    equipo.objetivo > 0 &&
    f.vendedores.length > 0 &&
    f.vendedores.every((v) => (objetivoDe(v.idPersonal)?.clientes ?? 0) > 0)
  const cartera = f.medida === 'ccc' ? deCcc(f.total, true) : null
  const total = f.medida === 'vol' ? deVol(f.total) : contraObjetivo ? deObjetivo(equipo!.actual, equipo!.objetivo, true) : cartera!
  // La meta en porcentaje (la de CCC) se marca en las barras; la de VOL es en bultos y va como avance en el total
  const metaBarra = f.medida === 'ccc' && !contraObjetivo ? f.meta : null
  const avanceMeta =
    f.medida === 'vol' && f.meta ? (f.total.porcentajeMeta ?? Math.round((f.total.bultosActual / f.meta) * 1000) / 10) : null
  const vendedores = (
    f.medida === 'vol'
      ? f.vendedores.map((v) => ({ ...v, m: deVol(v) }))
      : f.vendedores.map((v) => {
          const o = objetivoDe(v.idPersonal)
          return { ...v, m: contraObjetivo && o?.clientes ? deObjetivo(o.clientesConCompra, o.clientes) : deCcc(v) }
        })
  ).sort((x, y) => (y.m.valor ?? -1) - (x.m.valor ?? -1) || x.nombre.localeCompare(y.nombre, 'es'))
  // CCC va de 0 a 100; VOL puede pasar el 100 % del mes anterior: la escala crece hasta el más alto
  const escala =
    f.medida === 'ccc' ? 100 : Math.max(120, Math.ceil(Math.max(total.valor ?? 0, ...vendedores.map((v) => v.m.valor ?? 0)) / 10) * 10)
  const destino = (idPersonal: number) =>
    f.medida === 'vol' ? `/volumen?vendedor=${idPersonal}&foco=${f.idFoco}` : `/?vendedor=${idPersonal}&foco=${f.idFoco}`

  return (
    <div className="foco-medicion-resultado">
      <div className="foco-analisis-total">
        <span className="foco-analisis-numero">{total.valor === null ? '—' : formatoPorcentaje(total.valor)}</span>
        <span className="foco-analisis-detalle">
          {total.detalle}
          {contraObjetivo ? ' del objetivo' : ''}
          {f.medida === 'ccc' && ctx.corteAl ? ` al ${formatoFechaCorta(ctx.corteAl)}` : ''}
        </span>
        {contraObjetivo ? (
          <span className="foco-total-tendencia">
            tendencia <Tendencia valor={equipo!.tendencia} enCurso={ctx.enCurso} />
          </span>
        ) : (
          <Diferencia m={total} contra={contra} corto={ctx.anteriorCorto} />
        )}
        {metaBarra !== null && <span className="sr-solo">{textoMeta(total, metaBarra)}</span>}
        {avanceMeta !== null && f.meta !== null && (
          <span className="foco-meta foco-avance-meta">
            {formatoPorcentaje(avanceMeta)} de la meta de {formatoBultos(f.meta)} bultos
          </span>
        )}
      </div>
      {f.medida === 'vol' ? (
        <AvanceVolumen v={f.total} escala={escala} ctx={ctx} />
      ) : (
        <Barra m={total} meta={metaBarra} escala={escala} superado={contraObjetivo && (total.valor ?? 0) >= 100} />
      )}
      {contraObjetivo && cartera ? (
        // Lo de toda la cartera queda abajo, chico, con la comparación con el mes anterior
        <p className="foco-equipo foco-cartera">
          <span className="icono icono-chico" aria-hidden>groups</span>
          De toda la cartera: {cartera.valor === null ? '—' : formatoPorcentaje(cartera.valor)} ({cartera.detalle})
          <Diferencia m={cartera} contra={contra} corto={ctx.anteriorCorto} />
        </p>
      ) : equipo && (
        // La fila Totales del Excel de Checho (17/11)
        <p className="foco-equipo">
          <span className="icono icono-chico" aria-hidden>groups</span>
          Objetivo del equipo: <strong>{f.medida === 'vol' ? `${formatoBultos(equipo.objetivo)} bultos` : `${formatoEntero(equipo.objetivo)} clientes`}</strong>
          {' · '}
          {f.medida === 'vol' ? `lleva ${formatoBultos(equipo.actual)}` : `compraron ${formatoEntero(equipo.actual)}`}
          <Tendencia valor={equipo.tendencia} enCurso={ctx.enCurso} />
        </p>
      )}
      <ul className="foco-analisis-vendedores" aria-label={`${f.nombre} por vendedor`}>
        {vendedores.map((v) => (
          <li key={v.idPersonal}>
            <Link
              to={destino(v.idPersonal)}
              className={enfocado === v.idPersonal ? 'foco-vendedor enfocada' : 'foco-vendedor'}
              onMouseEnter={alPasar && ((e) => alPasar({ idFoco: f.idFoco, idPersonal: v.idPersonal, nombre: v.nombre }, e.currentTarget))}
              onMouseLeave={alPasar && (() => alPasar(null))}
              onFocus={alPasar && ((e) => alPasar({ idFoco: f.idFoco, idPersonal: v.idPersonal, nombre: v.nombre }, e.currentTarget))}
              onBlur={alPasar && (() => alPasar(null))}
              // Cobertura y Volumen muestran el mes en el que está parada la app: se para en el del análisis
              onClick={() => referencia.elegir(ctx.enCurso ? null : ctx.mes)}
              title={`${nombrePropio(v.nombre)} en ${f.medida === 'vol' ? 'Volumen' : 'Cobertura'}, con el foco ${f.nombre}.${textoMeta(v.m, metaBarra)}`}
            >
              <span className="foco-vendedor-nombre">{nombrePropio(v.nombre)}</span>
              <Barra m={v.m} meta={metaBarra} escala={escala} superado={(f.medida === 'vol' || contraObjetivo) && (v.m.valor ?? 0) >= 100} />
              <span className="foco-vendedor-numeros">
                <strong>{v.m.valor === null ? '—' : formatoPorcentaje(v.m.valor)}</strong>
                <span className="foco-analisis-detalle">{v.m.detalle}</span>
              </span>
              {contraObjetivo ? (
                // Contra su objetivo: la barra ya dice cuánto lleva; al costado, su tendencia
                <span className="foco-vendedor-tendencia">
                  <Tendencia valor={objetivoDe(v.idPersonal)?.tendencia} enCurso={ctx.enCurso} />
                </span>
              ) : (
                <Diferencia m={v.m} contra={contra} corto={ctx.anteriorCorto} />
              )}
              {/* El objetivo y su tendencia, en su renglón a todo el ancho (17/11); contra el objetivo, ya está en la fila */}
              {!contraObjetivo && objetivoDe(v.idPersonal) && <Objetivo o={objetivoDe(v.idPersonal)!} vol={f.medida === 'vol'} ctx={ctx} />}
              {metaBarra !== null && <span className="sr-solo">{textoMeta(v.m, metaBarra)}</span>}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
