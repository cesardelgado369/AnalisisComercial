/**
 * TODO testing — Focos del mes para `npm run dev:mock` (CONTRATO_API.md, «Focos del mes», pedido de Checho del 03/11;
 * por mes desde el 05/11): cada mes tiene sus focos (grupos de artículos con nombre, medidos con CCC o VOL y con una
 * meta opcional), el filtro `?foco=`, los artículos para elegirlos y el análisis del mes por vendedor. Todo en
 * memoria: reiniciar el servidor de prueba vuelve al estado inicial.
 */
import { ARTICULOS, articuloDe, articulosDelMes, idArticulo, lineas } from './datosArticulos.ts'
import {
  ErrorMock,
  PRIMER_MES,
  VENDEDORES,
  ayerArgentina,
  azar,
  compro,
  datos,
  enCartera,
  excluidos,
  filtroCompra,
  hoyArgentina,
  indiceMes,
  mesDe,
  sumarMeses,
  type ClienteFake,
  type FocoConsulta,
} from './datosCobertura.ts'
import { filtroCategoria } from './datosAbc.ts'
import { comparacion, volumen } from './datosVolumen.ts'

type Medida = 'ccc' | 'vol'

interface FocoMock {
  idFoco: number
  mes: string
  nombre: string
  medida: Medida
  meta: number | null
  /** El objetivo de cada vendedor (idPersonal → clientes en un CCC, bultos en un VOL; Cesar, 12/11 y 17/11). */
  objetivos: Map<number, number>
  idsArticulo: number[]
  actualizadoPor: string
  actualizado: string
}

/** Un artículo por su descripción (los de `ARTICULOS`). */
function id(descripcion: string) {
  for (let u = 0; u < ARTICULOS.length; u++) {
    const i = ARTICULOS[u].indexOf(descripcion)
    if (i >= 0) return idArticulo(u, i)
  }
  throw new Error(`No existe el artículo ${descripcion}`)
}

/** Uno anulado en Chess (no se vende), para ver «Mostrar los anulados». */
const ANULADO = { idArticulo: 990, descripcion: 'DULCE DE LECHE 1KG (DISCONTINUADO)', unidadNegocio: 'SIN UNIDAD DE NEGOCIO' }

/** La DIVISION de Chess, inventada por el nombre (la de verdad la manda Chess; null = sin división). */
function division(descripcion: string) {
  if (/RAVIOLES/.test(descripcion)) return 'RAVIOLES'
  if (/^TAPAS/.test(descripcion)) return 'TAPAS'
  if (/DULCE DE LECHE/.test(descripcion)) return 'DULCE DE LECHE'
  if (/TACOS/.test(descripcion)) return 'TACOS'
  if (/PAN RALLADO|REBOZADOR/.test(descripcion)) return 'PAN RALLADO'
  return null
}

const hace = (dias: number) => new Date(Date.now() - dias * 86_400_000).toISOString()
const MES = mesDe(hoyArgentina())
const ANTERIOR = sumarMeses(MES, -1)
const DOS_ANTES = sumarMeses(MES, -2)
const DULCE = [6000, 6001]
const MANTECA = [6002, 6003]
const TACOS = [19]
const PIONONO = [6004]
const RAVIOLES = [id('ATM RAVIOLES DE VERDURA 1KG'), id('RAVIOLES DE RICOTA 500G')]
/** VOL Tapas: toda la DIVISION TAPAS (de empanada y de pascualina). */
const TAPAS = ARTICULOS.flatMap((lista, u) => lista.flatMap((d, i) => (division(d) === 'TAPAS' ? [idArticulo(u, i)] : [])))
const PAN = [id('PAN RALLADO 1KG'), id('PAN RALLADO 500G')]

/**
 * El mes en curso con los objetivos de Checho de noviembre (Cesar, 10/11): VOL Tapas y CCC Manteca, Dulce de leche,
 * Masa para tacos y Pionono, con los códigos de Chess (PREVENTA queda afuera hasta que Checho diga qué mide). Las de
 * Checho no tienen meta; acá Manteca y Dulce de leche llevan una para ver la meta en la vista Focos (cumplida y no). El anterior con dos y uno más atrás; el que viene, vacío.
 */
let siguiente = 1
const nuevo = (mes: string, nombre: string, idsArticulo: number[], dias: number, medida: Medida = 'ccc', meta: number | null = null): FocoMock => ({
  idFoco: siguiente++,
  mes,
  nombre,
  medida,
  meta,
  objetivos: new Map(),
  idsArticulo,
  actualizadoPor: 'checho@madomi',
  actualizado: hace(dias),
})
const focos: FocoMock[] = [
  nuevo(MES, 'Tapas', TAPAS, 4, 'vol', 1500),
  nuevo(MES, 'Manteca', MANTECA, 4, 'ccc', 5),
  nuevo(MES, 'Dulce de leche', DULCE, 4, 'ccc', 25),
  nuevo(MES, 'Masa para tacos', TACOS, 4),
  nuevo(MES, 'Pionono', PIONONO, 4),
  nuevo(ANTERIOR, 'Ravioles', RAVIOLES, 33),
  nuevo(ANTERIOR, 'Pan rallado', PAN, 33, 'vol', 400),
  nuevo(DOS_ANTES, 'Dulce de leche', DULCE, 64),
]
// Los objetivos de clientes de Dulce de leche de noviembre (para probar: Nicolás cumple, los demás no todavía), y en
// Tapas (VOL, en bultos) uno guardado para Franco; los demás quedan con el del mes anterior
focos[2].objetivos = new Map([[1, 10], [2, 20], [3, 15], [4, 12], [5, 25]])
focos[0].objetivos = new Map([[2, 150]])

const descripcionDe = (idArt: number) => (idArt === ANULADO.idArticulo ? ANULADO.descripcion : articuloDe(idArt).descripcion)
/** Qué parte del mes pasó, en días hábiles (como Volumen): 1 en un mes cerrado, null en uno que no empezó. */
function fraccionDelMes(mes: string) {
  if (mes > MES) return null
  if (mes < MES) return 1
  try {
    const c = comparacion('admin', mes).publica
    return c.diasHabilesMes ? c.diaHabil / c.diasHabilesMes : null
  } catch {
    return null
  }
}
const uno = (n: number) => Math.round(n * 10) / 10
/** La tendencia del Excel de Checho: lo de hoy llevado a fin de mes, contra el objetivo. */
const tendencia = (actual: number, objetivo: number, fraccion: number | null) =>
  fraccion === null || fraccion <= 0 || objetivo <= 0 ? null : uno((actual / fraccion / objetivo) * 100)

/**
 * Los objetivos del foco (Cesar, 12/11 y 17/11), de los vendedores que se ven (null = todos, el dueño), con lo que llevan
 * y la tendencia. CCC: los guardados, en clientes. VOL (solo con `conBultos`): todos los vendedores con cartera, en
 * bultos; sin uno guardado, lo de todo el mes anterior (`sugerido`).
 */
function objetivosDe(f: FocoMock, visibles: number[] | null, conBultos: boolean) {
  const m = f.mes > MES ? -1 : indiceMes(f.mes)
  const filtro = filtroCompra(null, comoConsulta(f))
  const fraccion = fraccionDelMes(f.mes)
  const cartera = (id: number, mes: number) => datos().filter((c) => !excluidos.has(c.idCliente) && c.ruta.idPersonal === id && enCartera(c, mes))
  const conCompra = (id: number) => (m < 0 ? 0 : cartera(id, m).filter((c) => compro(c, m, filtro)).length)
  const visibleEs = (id: number) => !visibles || visibles.includes(id)
  if (f.medida === 'ccc')
    return VENDEDORES.filter((v) => f.objetivos.has(v.id) && visibleEs(v.id)).map((v) => {
      const clientes = f.objetivos.get(v.id)!
      const actual = conCompra(v.id)
      return { idPersonal: v.id, nombre: v.nombre, clientes, bultos: null, clientesConCompra: actual, bultosActual: null, tendencia: tendencia(actual, clientes, fraccion), sugerido: false }
    })
  if (!conBultos) return []
  // VOL: los bultos del mes y los de todo el mes anterior, como /api/volumen?foco= del admin
  const bultosDe = (id: number) => {
    if (m <= 0) return { actual: 0, anterior: 0 }
    const q = new URLSearchParams({ mes: f.mes, vendedor: String(id), comparacion: 'acumulado' })
    try {
      const { total } = volumen(q, 'admin', [], comoConsulta(f))
      return { actual: total.bultosActual ?? 0, anterior: total.bultosBase ?? 0 }
    } catch {
      return { actual: 0, anterior: 0 }
    }
  }
  return VENDEDORES.filter((v) => !v.esCasa && visibleEs(v.id) && (m < 0 ? true : cartera(v.id, m).length > 0)).map((v) => {
    const b = bultosDe(v.id)
    const guardado = f.objetivos.get(v.id)
    const objetivo = guardado ?? b.anterior
    return {
      idPersonal: v.id,
      nombre: v.nombre,
      clientes: null,
      bultos: objetivo,
      clientesConCompra: conCompra(v.id),
      bultosActual: b.actual,
      tendencia: tendencia(b.actual, objetivo, fraccion),
      sugerido: guardado === undefined,
    }
  })
}

/** La fila Totales del Excel: la suma de los objetivos que se ven, lo que llevan y su tendencia. */
function equipoDe(f: FocoMock, objetivos: ReturnType<typeof objetivosDe>) {
  if (!objetivos.length) return null
  const objetivo = objetivos.reduce((s, o) => s + (o.clientes ?? o.bultos ?? 0), 0)
  const actual = objetivos.reduce((s, o) => s + (f.medida === 'ccc' ? o.clientesConCompra : (o.bultosActual ?? 0)), 0)
  return { objetivo: uno(objetivo), actual: uno(actual), tendencia: tendencia(actual, objetivo, fraccionDelMes(f.mes)) }
}

const respuesta = (f: FocoMock, visibles: number[] | null = null, conBultos = true) => {
  const objetivos = objetivosDe(f, visibles, conBultos)
  return {
  idFoco: f.idFoco,
  mes: f.mes,
  nombre: f.nombre,
  medida: f.medida,
  meta: f.meta,
  objetivos,
  objetivoEquipo: equipoDe(f, objetivos),
  articulos: f.idsArticulo.map((a) => ({ idArticulo: a, descripcion: descripcionDe(a) })),
  actualizadoPor: f.actualizadoPor,
  actualizado: f.actualizado,
  }
}
const porNombre = (a: FocoMock, b: FocoMock) => a.nombre.localeCompare(b.nombre, 'es')

/** Un `mes` del contrato: día 1, desde el primer mes con datos hasta el que viene. */
function mesValido(texto: unknown, campo = 'mes') {
  const mes = typeof texto === 'string' && /^\d{4}-\d{2}-01$/.test(texto) ? texto : null
  if (!mes || mes < PRIMER_MES || mes > sumarMeses(MES, 1))
    throw new ErrorMock(400, 'Revisá el mes.', { [campo]: ['Elegí un mes entre el primero con datos y el que viene.'] })
  return mes
}

/**
 * `GET /api/cobertura/focos?mes=`: los de ese mes, por nombre. Sin mes, el en curso. Los objetivos, solo de los
 * vendedores que la persona ve (`visibles`; null = el dueño, todos).
 */
export function delMes(p: URLSearchParams, visibles: number[] | null = null, conBultos = true) {
  const mes = p.get('mes') ? mesValido(p.get('mes')) : MES
  return focos.filter((f) => f.mes === mes).sort(porNombre).map((f) => respuesta(f, visibles, conBultos))
}

/** `GET /api/admin/focos`: los de todos los meses, el más nuevo primero y por nombre. */
export const listar = () => [...focos].sort((a, b) => b.mes.localeCompare(a.mes) || porNombre(a, b)).map((f) => respuesta(f))

/** Los artículos de un foco como filtro de compra (como `?foco=` en Cobertura). */
function comoConsulta(foco: FocoMock): FocoConsulta {
  const articulos = new Set(foco.idsArticulo)
  return {
    nombre: foco.nombre,
    articulos,
    delFoco: (c: ClienteFake, m: number, u: number) => articulosDelMes(c.idCliente, m, u).some((a) => articulos.has(idArticulo(u, a))),
  }
}

/** `?foco=` de Cobertura, Volumen y Devoluciones: 400 si no existe. */
export function deConsulta(p: URLSearchParams): FocoConsulta | null {
  const texto = p.get('foco')
  if (!texto) return null
  const foco = focos.find((f) => String(f.idFoco) === texto)
  if (!foco) throw new ErrorMock(400, 'Ese foco no existe.', { foco: ['Ese foco no existe.'] })
  return comoConsulta(foco)
}

/** Las validaciones del contrato: mes; nombre 1–60 y único en el mes; entre 1 y 50 artículos, todos existentes. */
function validar(cuerpo: Record<string, unknown>, idFoco: number | null) {
  const errores: Record<string, string[]> = {}
  let mes = ''
  try {
    mes = mesValido(cuerpo.mes)
  } catch (e) {
    Object.assign(errores, (e as ErrorMock).errors)
  }
  const nombre = typeof cuerpo.nombre === 'string' ? cuerpo.nombre.trim() : ''
  if (!nombre || nombre.length > 60) errores.nombre = ['El nombre va de 1 a 60 letras.']
  else if (focos.some((f) => f.idFoco !== idFoco && f.mes === mes && f.nombre.toLowerCase() === nombre.toLowerCase()))
    errores.nombre = ['Ya hay un foco con ese nombre en ese mes.']
  const ids = Array.isArray(cuerpo.idsArticulo) ? [...new Set(cuerpo.idsArticulo.filter((x): x is number => typeof x === 'number'))] : []
  if (ids.length < 1 || ids.length > 50) errores.idsArticulo = ['Elegí entre 1 y 50 artículos.']
  else if (ids.some((a) => !articulos().some((x) => x.idArticulo === a))) errores.idsArticulo = ['Hay un artículo que no existe.']
  const medida = cuerpo.medida ?? 'ccc'
  if (medida !== 'ccc' && medida !== 'vol') errores.medida = ['Elegí qué se mide: CCC o VOL.']
  const meta = cuerpo.meta ?? null
  // CCC: porcentaje opcional; VOL: bultos
  // Desde el 20/11 la meta es opcional también en un VOL (los objetivos van por vendedor)
  if (medida === 'vol' && meta !== null && (typeof meta !== 'number' || meta <= 0 || meta > 1_000_000))
    errores.meta = ['La cantidad de bultos va de 1 a 1.000.000.']
  else if (medida !== 'vol' && meta !== null && (typeof meta !== 'number' || meta < 1 || meta > 100)) errores.meta = ['La meta va de 1 a 100 %.']
  if (Object.keys(errores).length) throw new ErrorMock(400, 'Revisá el foco.', errores)
  return { mes, nombre, ids, medida: medida as Medida, meta: meta as number | null }
}

/** `POST /api/admin/focos` → 201. */
export function crear(cuerpo: Record<string, unknown>, email: string) {
  const { mes, nombre, ids, medida, meta } = validar(cuerpo, null)
  const foco: FocoMock = { idFoco: siguiente++, mes, nombre, medida, meta, objetivos: new Map(), idsArticulo: ids, actualizadoPor: email, actualizado: new Date().toISOString() }
  focos.push(foco)
  return respuesta(foco)
}

/** `PUT /api/admin/focos/{id}`: reemplaza mes, nombre y artículos. */
export function editar(idFoco: number, cuerpo: Record<string, unknown>, email: string) {
  const foco = focos.find((f) => f.idFoco === idFoco)
  if (!foco) throw new ErrorMock(404, 'Ese foco no existe.')
  const { mes, nombre, ids, medida, meta } = validar(cuerpo, idFoco)
  Object.assign(foco, { mes, nombre, medida, meta, idsArticulo: ids, actualizadoPor: email, actualizado: new Date().toISOString() })
  return respuesta(foco)
}

/**
 * `PUT /api/admin/focos/{id}/objetivos` `{ objetivos: [{ idPersonal, clientes }] }` (Cesar, 12/11): reemplaza los
 * objetivos de clientes del foco; el vendedor que no va queda sin objetivo. Cada uno, un vendedor (no la casa) una sola
 * vez, con 1 a 10.000 clientes. → 200 con el foco.
 */
export function guardarObjetivos(idFoco: number, cuerpo: Record<string, unknown>, email: string) {
  const foco = focos.find((f) => f.idFoco === idFoco)
  if (!foco) throw new ErrorMock(404, 'Ese foco no existe.')
  const lista = Array.isArray(cuerpo.objetivos) ? (cuerpo.objetivos as Record<string, unknown>[]) : null
  const nuevos = new Map<number, number>()
  const mal = (texto: string) => new ErrorMock(400, 'Revisá los objetivos.', { objetivos: [texto] })
  if (!lista) throw mal('Mandá la lista de objetivos.')
  for (const o of lista) {
    const id = o.idPersonal
    if (typeof id !== 'number' || !VENDEDORES.some((v) => v.id === id && !v.esCasa)) throw mal('Hay un vendedor que no existe.')
    if (nuevos.has(id)) throw mal('Hay un vendedor repetido.')
    // CCC en clientes; VOL en bultos (17/11): el que no viene vuelve a lo del mes anterior
    if (foco.medida === 'vol') {
      const bultos = o.bultos
      if (typeof bultos !== 'number' || bultos < 0.5 || bultos > 1_000_000 || Math.round(bultos * 10) !== bultos * 10)
        throw mal('Cada objetivo de volumen va de 0,5 a 1.000.000 bultos.')
      nuevos.set(id, bultos)
    } else {
      const clientes = o.clientes
      if (typeof clientes !== 'number' || !Number.isInteger(clientes) || clientes < 1 || clientes > 10_000)
        throw mal('Cada objetivo va de 1 a 10.000 clientes.')
      nuevos.set(id, clientes)
    }
  }
  Object.assign(foco, { objetivos: nuevos, actualizadoPor: email, actualizado: new Date().toISOString() })
  return respuesta(foco)
}

/** `DELETE /api/admin/focos/{id}` → 204; 404 si no existe. */
export function borrar(idFoco: number) {
  const i = focos.findIndex((f) => f.idFoco === idFoco)
  if (i < 0) throw new ErrorMock(404, 'Ese foco no existe.')
  focos.splice(i, 1)
}

/**
 * El día del mes en que el cliente compró por primera vez (inventado y fijo por cliente y mes): para el anterior «al
 * mismo día». La API lo saca de la fecha de los comprobantes.
 */
const diaDeCompra = (c: ClienteFake, m: number) => 1 + Math.floor(azar(c.idCliente * 31 + m * 7919)() * 28)
const redondeo = (n: number) => Math.round(n * 10) / 10

/**
 * `GET /api/admin/focos/analisis?mes=`: cada foco del mes por vendedor (sin la casa) y en total. Los `ccc`, con la
 * cobertura del foco contra el mes anterior al mismo día; los `vol`, con los bultos de Volumen mirado por el admin.
 */
export function analisis(p: URLSearchParams) {
  const mes = p.get('mes') ? mesValido(p.get('mes')) : MES
  if (mes > MES) throw new ErrorMock(400, 'Ese mes todavía no empezó.', { mes: ['Ese mes todavía no empezó.'] })
  const m = indiceMes(mes)
  const enCurso = mes === MES
  // Comparativa (Cesar, 10/11): parcial, contra el mes anterior al mismo día; acumulado, contra todo el mes anterior
  const pedida = p.get('comparacion')
  if (pedida && pedida !== 'parcial' && pedida !== 'acumulado')
    throw new ErrorMock(400, 'Esa comparativa no existe.', { comparacion: ['Elegí parcial o acumulado.'] })
  const acumulado = pedida === 'acumulado'
  // La categoría A, B o C: cada mes con la suya
  const categoria = p.get('abc')
  const deLaCategoria = filtroCategoria(p)
  const mesAnterior = sumarMeses(mes, -1)
  const corteAl = enCurso ? ayerArgentina() : null
  const diaCorte = corteAl && corteAl >= mes ? Number(corteAl.slice(8, 10)) : 31
  const finAnterior = new Date(Date.UTC(Number(mesAnterior.slice(0, 4)), Number(mesAnterior.slice(5, 7)), 0)).getUTCDate()
  const anteriorAl = enCurso && !acumulado ? `${mesAnterior.slice(0, 8)}${String(Math.min(diaCorte, finAnterior)).padStart(2, '0')}` : null
  const clientes = datos().filter((c) => !excluidos.has(c.idCliente))
  const vendedores = VENDEDORES.filter((v) => !v.esCasa)
  // El primer mes con datos no tiene con qué compararse en Volumen: sus focos `vol` van sin base
  let comp: { tipo: string; corteAl: string | null; baseHasta: string | null; diaHabil: number; diasHabilesMes: number } | null = null
  try {
    comp = comparacion('admin', mes, pedida).publica
  } catch {
    comp = null
  }

  /** Un foco `vol`: lo mismo que `/api/volumen?foco=` del admin, en total o de un vendedor. */
  const bultos = (f: FocoMock, vendedor: number | null) => {
    if (!comp) return { bultosActual: 0, bultosBase: null, porcentaje: null }
    const p = new URLSearchParams({ mes })
    if (vendedor !== null) p.set('vendedor', String(vendedor))
    if (acumulado) p.set('comparacion', 'acumulado')
    if (categoria) p.set('abc', categoria)
    const { total } = volumen(p, 'admin', [], comoConsulta(f))
    return { bultosActual: total.bultosActual ?? 0, bultosBase: total.bultosBase, porcentaje: total.porcentaje }
  }

  const medir = (ids: number[], filtro: ReturnType<typeof filtroCompra>) => {
    const cartera = clientes.filter((c) => ids.includes(c.ruta.idPersonal) && enCartera(c, m) && deLaCategoria(c, m))
    const conCompra = cartera.filter((c) => compro(c, m, filtro)).length
    const antes = m > 0 ? clientes.filter((c) => ids.includes(c.ruta.idPersonal) && enCartera(c, m - 1) && deLaCategoria(c, m - 1)) : []
    const conCompraAntes = antes.filter((c) => compro(c, m - 1, filtro) && (!enCurso || acumulado || diaDeCompra(c, m - 1) <= diaCorte)).length
    return {
      clientesConCompra: conCompra,
      clientesCartera: cartera.length,
      porcentaje: cartera.length ? redondeo((conCompra / cartera.length) * 100) : 0,
      porcentajeAnterior: antes.length ? redondeo((conCompraAntes / antes.length) * 100) : null,
    }
  }

  return {
    mes,
    mesEnCurso: enCurso,
    corteAl,
    mesAnterior,
    anteriorAl,
    volumen: comp && { tipo: comp.tipo, corteAl: comp.corteAl, baseHasta: comp.baseHasta, diaHabil: comp.diaHabil, diasHabilesMes: comp.diasHabilesMes },
    focos: focos
      .filter((f) => f.mes === mes)
      .sort(porNombre)
      .map((f) => {
        const cabecera = { idFoco: f.idFoco, nombre: f.nombre, medida: f.medida, meta: f.meta }
        // Con cartera ese mes: los mismos vendedores para las dos medidas
        const conCartera = vendedores.filter((v) => clientes.some((c) => c.ruta.idPersonal === v.id && enCartera(c, m) && deLaCategoria(c, m)))
        if (f.medida === 'vol') {
          const total = bultos(f, null)
          return {
            ...cabecera,
            total: { ...total, porcentajeMeta: f.meta ? Math.round((total.bultosActual / f.meta) * 1000) / 10 : null },
            vendedores: conCartera.map((v) => ({ idPersonal: v.id, nombre: v.nombre, ...bultos(f, v.id) })),
          }
        }
        const filtro = filtroCompra(null, comoConsulta(f))
        return {
          ...cabecera,
          total: medir(vendedores.map((v) => v.id), filtro),
          vendedores: conCartera.map((v) => ({ idPersonal: v.id, nombre: v.nombre, ...medir([v.id], filtro) })),
        }
      }),
  }
}

let cacheArticulos: { dia: string; lista: ReturnType<typeof armarArticulos> } | null = null

/** `GET /api/admin/articulos`: no anulados primero, por división (null al final, como «sin división») y descripción. */
export function articulos() {
  const hoy = hoyArgentina()
  if (cacheArticulos?.dia !== hoy) cacheArticulos = { dia: hoy, lista: armarArticulos() }
  return cacheArticulos.lista
}

function armarArticulos() {
  const anterior = indiceMes(mesDe(hoyArgentina())) - 1
  const clientes = new Map<number, number>()
  for (const c of datos()) for (const l of lineas(c, anterior, null)) clientes.set(l.idArticulo, (clientes.get(l.idArticulo) ?? 0) + 1)
  const lista = ARTICULOS.flatMap((deUnidad, u) =>
    deUnidad.map((descripcion, i) => {
      const a = articuloDe(idArticulo(u, i))
      return { ...a, division: division(descripcion), anulado: false, clientesMesAnterior: clientes.get(a.idArticulo) ?? 0 }
    }),
  )
  lista.push({ ...ANULADO, division: division(ANULADO.descripcion), anulado: true, clientesMesAnterior: 0 })
  return lista.sort(
    (a, b) =>
      Number(a.anulado) - Number(b.anulado) ||
      Number(a.division === null) - Number(b.division === null) ||
      (a.division ?? '').localeCompare(b.division ?? '', 'es') ||
      a.descripcion.localeCompare(b.descripcion, 'es'),
  )
}
