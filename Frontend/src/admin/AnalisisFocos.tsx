import { Link } from 'react-router-dom'
import type { AnalisisFocos as Analisis, CoberturaFoco, FocoAnalizado, VolumenFoco } from '../api/types'
import { useConsulta } from '../api/useConsulta'
import { useMesReferencia } from '../comercial/mesReferencia'
import { nombrePropio } from '../cobertura/estados'
import { formatoBultos, formatoEntero, formatoFechaCorta, formatoPorcentaje, nombreMes } from '../utils/formato'

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

/** «▲ 3 pts» o «▼ 12 %»: con flecha y texto (el color solo acompaña). */
function Diferencia({ m, contra }: { m: Medicion; contra: string }) {
  if (m.dif === null)
    return (
      <span className="foco-dif sin" title={`Sin datos de ${contra}`}>
        —<span className="sr-solo"> sin datos de {contra}</span>
      </span>
    )
  const d = m.dif
  const clase = d > 0 ? 'foco-dif sube' : d < 0 ? 'foco-dif baja' : 'foco-dif igual'
  return (
    <span className={clase} title={`Contra ${contra}`}>
      <span className="icono icono-chico" aria-hidden>{d > 0 ? 'arrow_upward' : d < 0 ? 'arrow_downward' : 'remove'}</span>
      {d > 0 ? '+' : ''}
      {d} {m.unidadDif}
      <span className="sr-solo"> contra {contra}</span>
    </span>
  )
}

/** La barra del mes (violeta), la rayita del mes anterior y, si hay meta, su marca punteada. */
function Barra({ m, meta, escala }: { m: Medicion; meta: number | null; escala: number }) {
  const lugar = (n: number) => `${Math.min(100, (Math.max(0, n) / escala) * 100)}%`
  return (
    <span className="foco-barra" aria-hidden>
      {m.valor !== null && <span className="foco-barra-relleno" style={{ width: lugar(m.valor) }} />}
      {meta !== null && <span className="foco-barra-meta" style={{ left: lugar(meta) }} />}
      {m.antes !== null && <span className="foco-barra-antes" style={{ left: lugar(m.antes) }} />}
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
export function useAnalisisFocos(mes: string | null) {
  const consulta = useConsulta<Analisis>(mes && `/admin/focos/analisis?mes=${mes}`, 'No pudimos armar cómo vienen los focos.')
  const a = consulta.datos?.mes === mes ? consulta.datos : null
  const anterior = a ? nombreMes(a.mesAnterior) : ''
  return {
    ...consulta,
    a,
    contexto: a && {
      enCurso: a.mesEnCurso,
      mes: a.mes,
      anterior,
      corteAl: a.corteAl,
      ccc: a.anteriorAl ? `${anterior} al ${formatoFechaCorta(a.anteriorAl)}` : anterior,
      vol: a.mesEnCurso && a.volumen?.baseHasta ? `${anterior} al ${formatoFechaCorta(a.volumen.baseHasta)} (mismo día hábil)` : anterior,
    },
  }
}

export type ContextoAnalisis = NonNullable<ReturnType<typeof useAnalisisFocos>['contexto']>

/** Qué quiere decir cada marca de las barras: el mes, la rayita del anterior y, si algún foco tiene, la meta. */
export function LeyendaFocos({ ctx, conMeta }: { ctx: ContextoAnalisis; conMeta: boolean }) {
  return (
    <p className="foco-leyenda">
      <span><span className="foco-leyenda-barra" aria-hidden /> {ctx.enCurso ? `${nombreMes(ctx.mes)} hasta hoy` : nombreMes(ctx.mes)}</span>
      <span><span className="foco-leyenda-antes" aria-hidden /> {ctx.anterior} al mismo día</span>
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
export function MedicionFoco({ f, ctx }: { f: FocoAnalizado; ctx: ContextoAnalisis }) {
  const referencia = useMesReferencia()
  const contra = f.medida === 'vol' ? ctx.vol : ctx.ccc
  const total = f.medida === 'vol' ? deVol(f.total) : deCcc(f.total, true)
  const vendedores = (f.medida === 'vol' ? f.vendedores.map((v) => ({ ...v, m: deVol(v) })) : f.vendedores.map((v) => ({ ...v, m: deCcc(v) }))).sort(
    (x, y) => (y.m.valor ?? -1) - (x.m.valor ?? -1) || x.nombre.localeCompare(y.nombre, 'es'),
  )
  // CCC va de 0 a 100; VOL puede pasar el 100 % del mes anterior: la escala crece hasta el más alto
  const escala =
    f.medida === 'ccc'
      ? 100
      : Math.max(120, (f.meta ?? 0) + 10, Math.ceil(Math.max(total.valor ?? 0, ...vendedores.map((v) => v.m.valor ?? 0)) / 10) * 10)
  const destino = (idPersonal: number) =>
    f.medida === 'vol' ? `/volumen?vendedor=${idPersonal}&foco=${f.idFoco}` : `/?vendedor=${idPersonal}&foco=${f.idFoco}`

  return (
    <div className="foco-medicion-resultado">
      <div className="foco-analisis-total">
        <span className="foco-analisis-numero">{total.valor === null ? '—' : formatoPorcentaje(total.valor)}</span>
        <span className="foco-analisis-detalle">
          {total.detalle}
          {f.medida === 'ccc' && ctx.corteAl ? ` al ${formatoFechaCorta(ctx.corteAl)}` : ''}
        </span>
        <Diferencia m={total} contra={contra} />
        {f.meta !== null && <span className="sr-solo">{textoMeta(total, f.meta)}</span>}
      </div>
      <Barra m={total} meta={f.meta} escala={escala} />
      <ul className="foco-analisis-vendedores" aria-label={`${f.nombre} por vendedor`}>
        {vendedores.map((v) => (
          <li key={v.idPersonal}>
            <Link
              to={destino(v.idPersonal)}
              className="foco-vendedor"
              // Cobertura y Volumen muestran el mes en el que está parada la app: se para en el del análisis
              onClick={() => referencia.elegir(ctx.enCurso ? null : ctx.mes)}
              title={`${nombrePropio(v.nombre)} en ${f.medida === 'vol' ? 'Volumen' : 'Cobertura'}, con el foco ${f.nombre}.${textoMeta(v.m, f.meta)}`}
            >
              <span className="foco-vendedor-nombre">{nombrePropio(v.nombre)}</span>
              <Barra m={v.m} meta={f.meta} escala={escala} />
              <span className="foco-vendedor-numeros">
                <strong>{v.m.valor === null ? '—' : formatoPorcentaje(v.m.valor)}</strong>
                <span className="foco-analisis-detalle">{v.m.detalle}</span>
              </span>
              <Diferencia m={v.m} contra={contra} />
              {f.meta !== null && <span className="sr-solo">{textoMeta(v.m, f.meta)}</span>}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
