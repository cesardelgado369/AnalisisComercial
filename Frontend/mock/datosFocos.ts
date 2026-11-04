/**
 * TODO testing — Focos del mes para `npm run dev:mock` (CONTRATO_API.md, «Focos del mes», pedido de Checho del 03/11):
 * grupos de artículos con nombre que el admin prende o apaga, el filtro `?foco=` y los artículos para elegirlos. Todo
 * en memoria: reiniciar el servidor de prueba vuelve al estado inicial.
 */
import { ARTICULOS, articuloDe, articulosDelMes, idArticulo, lineas } from './datosArticulos.ts'
import { ErrorMock, datos, hoyArgentina, indiceMes, mesDe, type ClienteFake, type FocoConsulta } from './datosCobertura.ts'

interface FocoMock {
  idFoco: number
  nombre: string
  activo: boolean
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
let siguiente = 5
const focos: FocoMock[] = [
  { idFoco: 1, nombre: 'Dulce de leche', activo: true, idsArticulo: [id('DULCE DE LECHE 400G')], actualizadoPor: 'checho@madomi', actualizado: hace(2) },
  { idFoco: 2, nombre: 'Ravioles', activo: true, idsArticulo: [id('ATM RAVIOLES DE VERDURA 1KG'), id('RAVIOLES DE RICOTA 500G')], actualizadoPor: 'checho@madomi', actualizado: hace(2) },
  {
    idFoco: 3,
    nombre: 'Tapas de empanada',
    activo: true,
    idsArticulo: [id('TAPAS DE EMPANADA COPETIN X24'), id('TAPAS DE EMPANADA FREIR X12'), id('TAPAS DE EMPANADA HORNO X12')],
    actualizadoPor: 'checho@madomi',
    actualizado: hace(5),
  },
  { idFoco: 4, nombre: 'Pan rallado', activo: false, idsArticulo: [id('PAN RALLADO 1KG'), id('PAN RALLADO 500G')], actualizadoPor: 'checho@madomi', actualizado: hace(30) },
]

const descripcionDe = (idArt: number) => (idArt === ANULADO.idArticulo ? ANULADO.descripcion : articuloDe(idArt).descripcion)
const respuesta = (f: FocoMock) => ({
  idFoco: f.idFoco,
  nombre: f.nombre,
  activo: f.activo,
  articulos: f.idsArticulo.map((a) => ({ idArticulo: a, descripcion: descripcionDe(a) })),
  actualizadoPor: f.actualizadoPor,
  actualizado: f.actualizado,
})

/** `GET /api/cobertura/focos` (solo los prendidos) y `GET /api/admin/focos` (todos), por nombre. */
export const listar = (soloPrendidos: boolean) =>
  focos
    .filter((f) => !soloPrendidos || f.activo)
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
    .map(respuesta)

/** `?foco=` de Cobertura, Volumen y Devoluciones: 400 si no existe (uno apagado sigue andando, como la API). */
export function deConsulta(p: URLSearchParams): FocoConsulta | null {
  const texto = p.get('foco')
  if (!texto) return null
  const foco = focos.find((f) => String(f.idFoco) === texto)
  if (!foco) throw new ErrorMock(400, 'Ese foco no existe.', { foco: ['Ese foco no existe.'] })
  const articulos = new Set(foco.idsArticulo)
  return {
    nombre: foco.nombre,
    articulos,
    delFoco: (c: ClienteFake, m: number, u: number) => articulosDelMes(c.idCliente, m, u).some((a) => articulos.has(idArticulo(u, a))),
  }
}

/** Las validaciones del contrato: nombre 1–60 y único; entre 1 y 50 artículos, todos existentes. */
function validar(cuerpo: Record<string, unknown>, idFoco: number | null) {
  const errores: Record<string, string[]> = {}
  const nombre = typeof cuerpo.nombre === 'string' ? cuerpo.nombre.trim() : ''
  if (!nombre || nombre.length > 60) errores.nombre = ['El nombre va de 1 a 60 letras.']
  else if (focos.some((f) => f.idFoco !== idFoco && f.nombre.toLowerCase() === nombre.toLowerCase())) errores.nombre = ['Ya hay un foco con ese nombre.']
  const ids = Array.isArray(cuerpo.idsArticulo) ? [...new Set(cuerpo.idsArticulo.filter((x): x is number => typeof x === 'number'))] : []
  if (ids.length < 1 || ids.length > 50) errores.idsArticulo = ['Elegí entre 1 y 50 artículos.']
  else if (ids.some((a) => !articulos().some((x) => x.idArticulo === a))) errores.idsArticulo = ['Hay un artículo que no existe.']
  if (Object.keys(errores).length) throw new ErrorMock(400, 'Revisá el foco.', errores)
  return { nombre, ids }
}

/** `POST /api/admin/focos` → 201. */
export function crear(cuerpo: Record<string, unknown>, email: string) {
  const { nombre, ids } = validar(cuerpo, null)
  const foco: FocoMock = { idFoco: siguiente++, nombre, activo: cuerpo.activo !== false, idsArticulo: ids, actualizadoPor: email, actualizado: new Date().toISOString() }
  focos.push(foco)
  return respuesta(foco)
}

/** `PUT /api/admin/focos/{id}`: reemplaza nombre y artículos; `activo`, si viene. */
export function editar(idFoco: number, cuerpo: Record<string, unknown>, email: string) {
  const foco = focos.find((f) => f.idFoco === idFoco)
  if (!foco) throw new ErrorMock(404, 'Ese foco no existe.')
  const { nombre, ids } = validar(cuerpo, idFoco)
  Object.assign(foco, { nombre, idsArticulo: ids, actualizadoPor: email, actualizado: new Date().toISOString() })
  if (typeof cuerpo.activo === 'boolean') foco.activo = cuerpo.activo
  return respuesta(foco)
}

/** `DELETE /api/admin/focos/{id}` → 204; 404 si no existe. */
export function borrar(idFoco: number) {
  const i = focos.findIndex((f) => f.idFoco === idFoco)
  if (i < 0) throw new ErrorMock(404, 'Ese foco no existe.')
  focos.splice(i, 1)
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
