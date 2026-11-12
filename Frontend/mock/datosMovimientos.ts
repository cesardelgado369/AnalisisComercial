/**
 * TODO testing — `GET /api/clientes/{id}/movimientos?mes=&unidad=&foco=` para `npm run dev:mock` (pedido de Cesar del
 * 10/11: la ventanita de Devoluciones): los comprobantes del cliente en el mes, del más viejo al más nuevo. Se arman
 * con sus líneas inventadas del mes (`lineas`), repartidas en 1 a 3 facturas; lo devuelto va en la misma factura o en
 * una nota de crédito unos días después (desde el 12/11, un rechazo: `rechazados`, no devolución). Aproximado: el mock
 * de Devoluciones sigue contando las dos como devolución.
 * **No es la lógica oficial** (la del backend).
 */
import { articuloDe, lineas } from './datosArticulos.ts'
import {
  ErrorMock,
  PRIMER_MES,
  UNIDADES,
  VENDEDORES,
  ayerArgentina,
  azar,
  datos,
  enCartera,
  filtroCompra,
  hoyArgentina,
  indiceMes,
  mesDe,
  vendedoresVisibles,
  type FocoConsulta,
  type RolPrueba,
} from './datosCobertura.ts'

interface LineaMock {
  idArticulo: number
  descripcion: string
  unidadNegocio: string
  entregados: number
  devueltos: number
  rechazados: number
}
interface ComprobanteMock {
  fecha: string
  tipo: 'factura' | 'notaCredito'
  comprobante: string
  vendedor: string | null
  lineas: LineaMock[]
}

const medio = (n: number) => Math.round(n * 2) / 2

export function movimientos(idCliente: number, p: URLSearchParams, rol: RolPrueba, idsOperario: number[], foco: FocoConsulta | null) {
  const mesActual = mesDe(hoyArgentina())
  const mes = p.get('mes') ? mesDe(p.get('mes')!) : mesActual
  if (mes > mesActual || mes < PRIMER_MES) throw new ErrorMock(400, 'Ese mes no está disponible.', { mes: ['Elegí un mes con datos.'] })
  const m = indiceMes(mes)
  const c = datos().find((x) => x.idCliente === idCliente)
  // Gobernanza: el supervisor, solo si el cliente era de su cartera ese mes
  const suyos = vendedoresVisibles(rol, idsOperario).map((v) => v.id)
  if (!c || (rol !== 'admin' && (!suyos.includes(c.ruta.idPersonal) || !enCartera(c, m))))
    throw new ErrorMock(404, 'No existe el cliente o no tenés acceso.')
  const unidadTexto = p.get('unidad')
  const unidad = unidadTexto ? UNIDADES.indexOf(unidadTexto) : null
  const ls = lineas(c, m, filtroCompra(unidad, foco))

  const v = VENDEDORES.find((x) => x.id === c.ruta.idPersonal)
  const vendedor = !v || v.esCasa ? null : v.nombre
  const r = azar(idCliente * 613 + m * 97)
  const ultimoDia =
    mes === mesActual
      ? Math.max(1, Number(ayerArgentina().slice(8, 10)))
      : new Date(Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0)).getUTCDate()
  const fecha = (dia: number) => `${mes.slice(0, 8)}${String(Math.min(dia, ultimoDia)).padStart(2, '0')}`
  const numero = () => `A 0001-${String(10_000 + Math.floor(r() * 89_999)).padStart(8, '0')}`

  const cuantas = ls.length ? 1 + Math.floor(r() * Math.min(3, ls.length)) : 0
  const facturas: ComprobanteMock[] = Array.from({ length: cuantas }, () => 1 + Math.floor(r() * ultimoDia))
    .sort((a, b) => a - b)
    .map((dia) => ({ fecha: fecha(dia), tipo: 'factura', comprobante: numero(), vendedor, lineas: [] }))
  const notas: ComprobanteMock[] = []
  ls.forEach((l, i) => {
    const f = facturas[i % cuantas]
    const a = articuloDe(l.idArticulo)
    const enLaFactura = l.devueltos > 0 && r() < 0.5
    f.lineas.push({ ...a, entregados: medio(l.bultos + l.devueltos), devueltos: enLaFactura ? l.devueltos : 0, rechazados: 0 })
    if (l.devueltos > 0 && !enLaFactura)
      notas.push({
        fecha: fecha(Number(f.fecha.slice(8)) + 1 + Math.floor(r() * 5)),
        tipo: 'notaCredito',
        comprobante: numero(),
        vendedor,
        lineas: [{ ...a, entregados: 0, devueltos: 0, rechazados: l.devueltos }],
      })
  })

  const suma = (ls: LineaMock[], campo: 'entregados' | 'devueltos' | 'rechazados') => medio(ls.reduce((s, l) => s + l[campo], 0))
  return {
    idCliente,
    razonSocial: c.razonSocial,
    mes,
    movimientos: [...facturas, ...notas]
      .map((x) => ({
        ...x,
        // Las líneas, por unidad y descripción (como la API)
        lineas: [...x.lineas].sort((a, b) => a.unidadNegocio.localeCompare(b.unidadNegocio, 'es') || a.descripcion.localeCompare(b.descripcion, 'es')),
        entregados: suma(x.lineas, 'entregados'),
        devueltos: suma(x.lineas, 'devueltos'),
        rechazados: suma(x.lineas, 'rechazados'),
      }))
      .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.comprobante.localeCompare(b.comprobante)),
  }
}
