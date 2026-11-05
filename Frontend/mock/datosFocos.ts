/**
 * TODO testing — Focos del mes para `npm run dev:mock` (CONTRATO_API.md, «Focos del mes», pedido de Checho del 03/11;
 * por mes desde el 05/11): cada mes tiene sus focos (grupos de artículos con nombre), el filtro `?foco=`, los artículos
 * para elegirlos y el análisis del mes por vendedor. Todo en memoria: reiniciar el servidor de prueba vuelve al estado
 * inicial.
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

interface FocoMock {
  idFoco: number
  mes: string
  nombre: string
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
  if (/PAN RALLADO|REBOZADOR/.test(descripcion)) return 'PAN RALLADO'
  return null
}

const hace = (dias: number) => new Date(Date.now() - dias * 86_400_000).toISOString()
const MES = mesDe(hoyArgentina())
const ANTERIOR = sumarMeses(MES, -1)
const DOS_ANTES = sumarMeses(MES, -2)
const DULCE = [id('DULCE DE LECHE 400G')]
const RAVIOLES = [id('ATM RAVIOLES DE VERDURA 1KG'), id('RAVIOLES DE RICOTA 500G')]
const TAPAS = [id('TAPAS DE EMPANADA COPETIN X24'), id('TAPAS DE EMPANADA FREIR X12'), id('TAPAS DE EMPANADA HORNO X12')]
const PAN = [id('PAN RALLADO 1KG'), id('PAN RALLADO 500G')]

/** El mes en curso con tres focos, el anterior con dos (Ravioles se repite) y uno más atrás; el que viene, vacío. */
let siguiente = 1
const nuevo = (mes: string, nombre: string, idsArticulo: number[], dias: number): FocoMock => ({
  idFoco: siguiente++,
  mes,
  nombre,
  idsArticulo,
  actualizadoPor: 'checho@madomi',
  actualizado: hace(dias),
})
const focos: FocoMock[] = [
  nuevo(MES, 'Dulce de leche', DULCE, 2),
  nuevo(MES, 'Ravioles', RAVIOLES, 2),
  nuevo(MES, 'Tapas de empanada', TAPAS, 4),
  nuevo(ANTERIOR, 'Ravioles', RAVIOLES, 33),
  nuevo(ANTERIOR, 'Pan rallado', PAN, 33),
  nuevo(DOS_ANTES, 'Dulce de leche', DULCE, 64),
]

const descripcionDe = (idArt: number) => (idArt === ANULADO.idArticulo ? ANULADO.descripcion : articuloDe(idArt).descripcion)
const respuesta = (f: FocoMock) => ({
  idFoco: f.idFoco,
  mes: f.mes,
  nombre: f.nombre,
  articulos: f.idsArticulo.map((a) => ({ idArticulo: a, descripcion: descripcionDe(a) })),
  actualizadoPor: f.actualizadoPor,
  actualizado: f.actualizado,
})
const porNombre = (a: FocoMock, b: FocoMock) => a.nombre.localeCompare(b.nombre, 'es')

/** Un `mes` del contrato: día 1, desde el primer mes con datos hasta el que viene. */
function mesValido(texto: unknown, campo = 'mes') {
  const mes = typeof texto === 'string' && /^\d{4}-\d{2}-01$/.test(texto) ? texto : null
  if (!mes || mes < PRIMER_MES || mes > sumarMeses(MES, 1))
    throw new ErrorMock(400, 'Revisá el mes.', { [campo]: ['Elegí un mes entre el primero con datos y el que viene.'] })
  return mes
}

/** `GET /api/cobertura/focos?mes=` (solo admin): los de ese mes, por nombre. Sin mes, el en curso. */
export function delMes(p: URLSearchParams) {
  const mes = p.get('mes') ? mesValido(p.get('mes')) : MES
  return focos.filter((f) => f.mes === mes).sort(porNombre).map(respuesta)
}

/** `GET /api/admin/focos`: los de todos los meses, el más nuevo primero y por nombre. */
export const listar = () => [...focos].sort((a, b) => b.mes.localeCompare(a.mes) || porNombre(a, b)).map(respuesta)

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
  if (Object.keys(errores).length) throw new ErrorMock(400, 'Revisá el foco.', errores)
  return { mes, nombre, ids }
}

/** `POST /api/admin/focos` → 201. */
export function crear(cuerpo: Record<string, unknown>, email: string) {
  const { mes, nombre, ids } = validar(cuerpo, null)
  const foco: FocoMock = { idFoco: siguiente++, mes, nombre, idsArticulo: ids, actualizadoPor: email, actualizado: new Date().toISOString() }
  focos.push(foco)
  return respuesta(foco)
}

/** `PUT /api/admin/focos/{id}`: reemplaza mes, nombre y artículos. */
export function editar(idFoco: number, cuerpo: Record<string, unknown>, email: string) {
  const foco = focos.find((f) => f.idFoco === idFoco)
  if (!foco) throw new ErrorMock(404, 'Ese foco no existe.')
  const { mes, nombre, ids } = validar(cuerpo, idFoco)
  Object.assign(foco, { mes, nombre, idsArticulo: ids, actualizadoPor: email, actualizado: new Date().toISOString() })
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

/** `GET /api/admin/focos/analisis?mes=`: el CCC de cada foco del mes por vendedor (sin la casa) y en total. */
export function analisis(p: URLSearchParams) {
  const mes = p.get('mes') ? mesValido(p.get('mes')) : MES
  if (mes > MES) throw new ErrorMock(400, 'Ese mes todavía no empezó.', { mes: ['Ese mes todavía no empezó.'] })
  const m = indiceMes(mes)
  const enCurso = mes === MES
  const mesAnterior = sumarMeses(mes, -1)
  const corteAl = enCurso ? ayerArgentina() : null
  const diaCorte = corteAl && corteAl >= mes ? Number(corteAl.slice(8, 10)) : 31
  const finAnterior = new Date(Date.UTC(Number(mesAnterior.slice(0, 4)), Number(mesAnterior.slice(5, 7)), 0)).getUTCDate()
  const anteriorAl = enCurso ? `${mesAnterior.slice(0, 8)}${String(Math.min(diaCorte, finAnterior)).padStart(2, '0')}` : null
  const clientes = datos().filter((c) => !excluidos.has(c.idCliente))
  const vendedores = VENDEDORES.filter((v) => !v.esCasa)

  const medir = (ids: number[], filtro: ReturnType<typeof filtroCompra>) => {
    const cartera = clientes.filter((c) => ids.includes(c.ruta.idPersonal) && enCartera(c, m))
    const conCompra = cartera.filter((c) => compro(c, m, filtro)).length
    const antes = m > 0 ? clientes.filter((c) => ids.includes(c.ruta.idPersonal) && enCartera(c, m - 1)) : []
    const conCompraAntes = antes.filter((c) => compro(c, m - 1, filtro) && (!enCurso || diaDeCompra(c, m - 1) <= diaCorte)).length
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
    focos: focos
      .filter((f) => f.mes === mes)
      .sort(porNombre)
      .map((f) => {
        const filtro = filtroCompra(null, comoConsulta(f))
        return {
          idFoco: f.idFoco,
          nombre: f.nombre,
          total: medir(vendedores.map((v) => v.id), filtro),
          vendedores: vendedores
            .map((v) => ({ idPersonal: v.id, nombre: v.nombre, ...medir([v.id], filtro) }))
            .filter((v) => v.clientesCartera > 0),
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
