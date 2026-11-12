/**
 * TODO testing — `GET /api/volumen` y `GET /api/devoluciones` para `npm run dev:mock`, con las reglas de CONTRATO_API.md
 * (bases según el rol, día hábil, chips, gobernanza). **No es la lógica oficial** (la del backend): la base «al mismo
 * día hábil» se aproxima con la proporción de días hábiles del mes base.
 */
import { clasesDelMes, coberturaAbc, filtroCategoria } from './datosAbc.ts'
import { articuloDe, lineas, suma } from './datosArticulos.ts'
import {
  ErrorMock,
  PRIMER_MES,
  UNIDADES,
  VENDEDORES,
  alcance,
  ayerArgentina,
  datos,
  enCartera,
  excluidos,
  filtroCompra,
  hoyArgentina,
  indiceMes,
  mesDe,
  rango,
  sinTildes,
  sumarMeses,
  type ClienteFake,
  type FocoConsulta,
  type RolPrueba,
} from './datosCobertura.ts'

/** Feriados nacionales de 2026 (aproximados) y el 24/9 (Batalla de Tucumán), como `Comercial:Feriados` del backend. */
const FERIADOS = new Set(['2026-07-09', '2026-07-10', '2026-08-17', '2026-09-24', '2026-10-12', '2026-11-23', '2026-12-08', '2026-12-25'])
const finDeMes = (mes: string) => new Date(Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0)).toISOString().slice(0, 10)

/** Días hábiles (lunes a sábado, sin feriados) entre `desde` y `hasta`, inclusive. */
function habiles(desde: string, hasta: string) {
  const dias: string[] = []
  for (let d = new Date(`${desde}T00:00:00Z`); d.toISOString().slice(0, 10) <= hasta; d.setUTCDate(d.getUTCDate() + 1)) {
    const iso = d.toISOString().slice(0, 10)
    if (d.getUTCDay() !== 0 && !FERIADOS.has(iso)) dias.push(iso)
  }
  return dias
}

const uno = (n: number) => Math.round(n * 10) / 10
const medio = (n: number) => Math.round(n * 2) / 2
const pct = (a: number, b: number | null) => (b ? uno((a / b) * 100) : null)

export type TipoComparacion = 'mismoDiaHabil' | 'mesAnteriorCompleto'

/** La comparación del contrato: el operario contra el mes anterior completo; admin y supervisor, al mismo día hábil. */
export function comparacion(rol: RolPrueba, mesParam: string | null, pedida: string | null = null) {
  // `comparacion=parcial|acumulado` (Cesar, 10/11): admin y supervisor eligen; el operario, siempre el mes completo
  if (pedida && pedida !== 'parcial' && pedida !== 'acumulado')
    throw new ErrorMock(400, 'Esa comparativa no existe.', { comparacion: ['Elegí parcial o acumulado.'] })
  const mesActual = mesDe(hoyArgentina())
  const mes = mesParam ? mesDe(mesParam) : mesActual
  if (mes <= PRIMER_MES || mes > mesActual) {
    throw new ErrorMock(400, 'Ese mes no tiene con qué compararse.', { mes: ['Elegí un mes desde agosto de 2026 hasta el actual.'] })
  }
  const mesBase = sumarMeses(mes, -1)
  const enCurso = mes === mesActual
  const ayer = ayerArgentina()
  const corteAl = enCurso ? (ayer >= mes ? ayer : null) : finDeMes(mes)
  const diasHabilesMes = habiles(mes, finDeMes(mes)).length
  const diaHabil = corteAl ? habiles(mes, corteAl).length : 0
  const tipo: TipoComparacion = enCurso && rol !== 'operario' && pedida !== 'acumulado' ? 'mismoDiaHabil' : 'mesAnteriorCompleto'
  const habilesBase = habiles(mesBase, finDeMes(mesBase))
  const baseHasta =
    tipo === 'mismoDiaHabil' ? (diaHabil ? habilesBase[Math.min(diaHabil, habilesBase.length) - 1] : null) : finDeMes(mesBase)
  return {
    publica: { tipo, mes, mesBase, corteAl, diaHabil, diasHabilesMes, baseHasta },
    m: indiceMes(mes),
    mBase: indiceMes(mesBase),
    /** Qué parte del mes base suma la base (mock: proporción de días hábiles). */
    fraccionBase: tipo === 'mismoDiaHabil' ? diaHabil / habilesBase.length : 1,
    /** El esperado = base × ritmo (el ritmo del mes para el operario en el mes en curso; si no, la base misma). */
    ritmo: enCurso && tipo === 'mesAnteriorCompleto' ? diaHabil / diasHabilesMes : 1,
  }
}

function filtros(p: URLSearchParams, rol: RolPrueba, idsOperario: number[], foco: FocoConsulta | null) {
  const vendedor = p.get('vendedor') ? Number(p.get('vendedor')) : null
  const ids = alcance(rol, vendedor, idsOperario)
  const dia = p.get('dia') ? Number(p.get('dia')) : null
  const unidadTexto = p.get('unidad')
  const unidadElegida = unidadTexto ? UNIDADES.indexOf(unidadTexto) : null
  if (unidadElegida === -1) throw new ErrorMock(400, 'La unidad de negocio no existe.', { unidad: ['No es una de las unidades.'] })
  const unidad = filtroCompra(unidadElegida, foco)
  const titulo =
    vendedor !== null
      ? VENDEDORES.find((v) => v.id === vendedor)!.nombre
      : rol === 'operario'
        ? VENDEDORES.filter((v) => idsOperario.includes(v.id)).map((v) => v.nombre).join(' / ')
        : 'Todos los vendedores'
  const delFiltro = datos().filter(
    (c) => !excluidos.has(c.idCliente) && ids.includes(c.ruta.idPersonal) && (dia === null || c.ruta.dias.includes(dia)),
  )
  const deLaCategoria = filtroCategoria(p)
  const cartera = (m: number) =>
    delFiltro.filter((c) => enCartera(c, m) && deLaCategoria(c, m)).sort((a, b) => a.razonSocial.localeCompare(b.razonSocial, 'es'))
  return { unidad, titulo, cartera, dia }
}

const fila = (c: ClienteFake) => {
  const v = VENDEDORES.find((x) => x.id === c.ruta.idPersonal)!
  return { idCliente: c.idCliente, razonSocial: c.razonSocial, ruta: c.ruta.nombre, vendedor: v.esCasa ? null : v.nombre, idPersonal: c.ruta.idPersonal }
}

type ChipVolumen = 'todos' | 'sinCompraAun' | 'nuevos' | 'bajaron' | 'subieron'

/** `GET /api/volumen` (CONTRATO_API.md). */
export function volumen(p: URLSearchParams, rol: RolPrueba, idsOperario: number[], foco: FocoConsulta | null = null) {
  const { unidad, titulo, cartera } = filtros(p, rol, idsOperario, foco)
  const comp = comparacion(rol, p.get('mes'), p.get('comparacion'))
  const estricto = rol !== 'admin'
  const chip = (p.get('chip') ?? 'todos') as ChipVolumen
  const busqueda = sinTildes(p.get('busqueda')?.trim() ?? '')

  // La clase A, B o C, solo para el admin (Cesar, 10/11)
  const clases = rol === 'admin' ? clasesDelMes(comp.m) : null
  const filas = cartera(comp.m).map((c) => {
    const delMes = lineas(c, comp.m, unidad)
    const bultosActual = suma(delMes, 'bultos')
    // Lo que compró, de más a menos bultos (para el ícono de cada producto)
    const articulos = delMes
      .filter((l) => l.bultos > 0)
      .map((l) => ({ ...articuloDe(l.idArticulo), bultos: l.bultos }))
      .sort((a, b) => b.bultos - a.bultos || a.descripcion.localeCompare(b.descripcion, 'es'))
      .map(({ idArticulo, descripcion, unidadNegocio }) => ({ idArticulo, descripcion, unidadNegocio }))
    // Gobernanza: si en el mes base no era de su cartera, la base no viaja («nuevo en tu cartera»)
    const bultosBase = estricto && !enCartera(c, comp.mBase) ? null : medio(suma(lineas(c, comp.mBase, unidad), 'bultos') * comp.fraccionBase)
    const esperado = bultosBase === null ? null : bultosBase * comp.ritmo
    const grupo: Exclude<ChipVolumen, 'todos'> =
      bultosActual <= 0 ? 'sinCompraAun' : esperado === null ? 'nuevos' : bultosActual < esperado ? 'bajaron' : 'subieron'
    return { ...fila(c), bultosActual, bultosBase, porcentaje: pct(bultosActual, bultosBase), grupo, articulos, ...(clases ? { abc: clases.get(c.idCliente) } : {}) }
  })

  const bultosActual = medio(filas.reduce((s, f) => s + f.bultosActual, 0))
  const conBase = filas.filter((f) => f.bultosBase !== null)
  const bultosBase = conBase.length ? medio(conBase.reduce((s, f) => s + f.bultosBase!, 0)) : null
  const chips = { todos: filas.length, sinCompraAun: 0, nuevos: 0, bajaron: 0, subieron: 0 }
  for (const f of filas) chips[f.grupo]++

  // Gobernanza (30/10): el operario recibe el total de su cartera solo en porcentaje
  const soloPorcentaje = rol === 'operario'
  return {
    titulo,
    comparacion: comp.publica,
    total: {
      bultosActual: soloPorcentaje ? null : bultosActual,
      bultosBase: soloPorcentaje ? null : bultosBase,
      bultosEsperado: soloPorcentaje || bultosBase === null ? null : uno(bultosBase * comp.ritmo),
      porcentaje: pct(bultosActual, bultosBase),
    },
    chips,
    ...(clases ? { abc: coberturaAbc(cartera(comp.m), comp.m, unidad, clases) } : {}),
    clientes: filas
      .filter((f) => !busqueda || String(f.idCliente) === busqueda || sinTildes(f.razonSocial).includes(busqueda))
      .filter((f) => chip === 'todos' || f.grupo === chip)
      .map((f) => {
        const { grupo, ...resto } = f
        void grupo
        return resto
      }),
  }
}

// Como la 1.4.1 del back (12/11): devueltos ÷ vendidos, la fórmula del dueño
const porcentajeDevolucion = (vendidos: number, devueltos: number) => (vendidos > 0 ? uno((devueltos / vendidos) * 100) : null)

/** `GET /api/devoluciones` (CONTRATO_API.md). */
export function devoluciones(p: URLSearchParams, rol: RolPrueba, idsOperario: number[], foco: FocoConsulta | null = null) {
  const { unidad, titulo, cartera } = filtros(p, rol, idsOperario, foco)
  const { meses, actual } = rango(p)
  // Gobernanza (30/10): lo que suma la cartera del operario (por mes y por artículo) va solo en porcentaje
  const soloPorcentaje = rol === 'operario'
  const kpis = meses.map((mes) => {
    const m = indiceMes(mes)
    const ls = cartera(m).flatMap((c) => lineas(c, m, unidad))
    const bultosVendidos = suma(ls, 'bultos')
    const bultosDevueltos = suma(ls, 'devueltos')
    return {
      mes,
      bultosVendidos: soloPorcentaje ? null : bultosVendidos,
      bultosDevueltos: soloPorcentaje ? null : bultosDevueltos,
      porcentaje: porcentajeDevolucion(bultosVendidos, bultosDevueltos),
      mesEnCurso: m === actual,
      corteAl: m === actual ? ayerArgentina() : null,
    }
  })

  const mes = meses[meses.length - 1]
  const m = indiceMes(mes)
  // La categoría A, B o C, solo para el admin (Cesar, 10/11)
  const clases = rol === 'admin' ? clasesDelMes(m) : null
  const clientes = cartera(m)
    .map((c) => {
      const ls = lineas(c, m, unidad)
      const bultosVendidos = suma(ls, 'bultos')
      const bultosDevueltos = suma(ls, 'devueltos')
      // Los tipos de producto que devolvió, del que más al que menos (empate: por nombre)
      const porUnidad = new Map<string, number>()
      for (const l of ls) if (l.devueltos > 0) porUnidad.set(articuloDe(l.idArticulo).unidadNegocio, (porUnidad.get(articuloDe(l.idArticulo).unidadNegocio) ?? 0) + l.devueltos)
      const unidadesDevueltas = [...porUnidad].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'es')).map(([u]) => u)
      // Los artículos que devolvió, del más devuelto al menos (Cesar, 10/11: el ícono de cada producto, no del rubro)
      const articulosDevueltos = ls
        .filter((l) => l.devueltos > 0)
        .map((l) => ({ ...articuloDe(l.idArticulo), devueltos: l.devueltos }))
        .sort((a, b) => b.devueltos - a.devueltos || a.descripcion.localeCompare(b.descripcion, 'es'))
        .map(({ idArticulo, descripcion, unidadNegocio }) => ({ idArticulo, descripcion, unidadNegocio }))
      return {
        ...fila(c),
        bultosVendidos,
        bultosDevueltos,
        porcentaje: porcentajeDevolucion(bultosVendidos, bultosDevueltos),
        unidadesDevueltas,
        articulosDevueltos,
        ...(clases ? { abc: clases.get(c.idCliente) } : {}),
      }
    })
    .filter((c) => c.bultosDevueltos > 0)
    .sort((a, b) => (b.porcentaje ?? 0) - (a.porcentaje ?? 0))

  const porArticulo = new Map<number, { vendidos: number; devueltos: number }>()
  for (const c of cartera(m)) {
    for (const l of lineas(c, m, unidad)) {
      const a = porArticulo.get(l.idArticulo) ?? { vendidos: 0, devueltos: 0 }
      a.vendidos += l.bultos
      a.devueltos += l.devueltos
      porArticulo.set(l.idArticulo, a)
    }
  }
  const articulos = [...porArticulo.entries()]
    .filter(([, a]) => a.devueltos > 0)
    .map(([id, a]) => ({
      ...articuloDe(id),
      bultosVendidos: medio(a.vendidos),
      bultosDevueltos: medio(a.devueltos),
      porcentaje: porcentajeDevolucion(a.vendidos, a.devueltos),
    }))
    .sort((a, b) => b.bultosDevueltos - a.bultosDevueltos)
    .map((a) => (soloPorcentaje ? { ...a, bultosVendidos: null, bultosDevueltos: null } : a))

  return { titulo, meses, kpis, mes, clientes, articulos }
}

export { porcentajeDevolucion, pct, medio }
