/**
 * TODO testing — la ficha del cliente y sus pestañas para `npm run dev:mock`: `GET /api/clientes/{id}`,
 * `/clientes/{id}/volumen` y `/clientes/{id}/devoluciones`, con los clientes de `datosCobertura.ts` y los artículos de
 * `datosArticulos.ts`. **No es la lógica oficial** (la del backend).
 *
 * Gobernanza (CONTRATO_API.md): operario y supervisor ven al cliente **solo en los meses en que estuvo en su cartera**.
 * Los otros meses van `fueraDeCartera`, sin bultos ni artículos, y la última compra es la de sus meses.
 */
import { articuloDe, lineas, suma } from './datosArticulos.ts'
import {
  ErrorMock,
  VENDEDORES,
  ayerArgentina,
  azar,
  compro,
  datos,
  enCartera,
  estado,
  hoyArgentina,
  indiceMes,
  mesDe,
  rango,
  vendedoresVisibles,
  type RolPrueba,
} from './datosCobertura.ts'
import { comparacion, medio, pct, porcentajeDevolucion } from './datosVolumen.ts'

const CALLES = ['AV. MATE DE LUNA', 'SAN JUAN', 'LAPRIDA', 'CRISOSTOMO ALVAREZ', 'AV. ACONQUIJA', 'MENDOZA', 'JUNIN', 'LAS HERAS', 'AV. SOLDATI', 'BOLIVAR']
const LOCALIDADES: Record<string, string> = {
  'YERBA BUENA': 'YERBA BUENA', 'SAN PABLO': 'SAN PABLO', ALDERETES: 'ALDERETES', 'BANDA DEL RIO SALI': 'BANDA DEL RIO SALI',
  'LAS TALITAS': 'LAS TALITAS', 'TAFI VIEJO': 'TAFI VIEJO', LULES: 'LULES', FAMAILLA: 'FAMAILLA', CONCEPCION: 'CONCEPCION',
}
const NOMBRE_DIA: Record<number, string> = { 2: 'lunes', 3: 'martes', 4: 'miércoles', 5: 'jueves', 6: 'viernes', 7: 'sábado' }

function diasVisita(dias: number[]) {
  if (!dias.length) return 'Sin día de visita'
  const nombres = dias.map((d) => NOMBRE_DIA[d])
  const texto = nombres.length === 1 ? nombres[0] : `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

/** Los artículos como los manda la API: por unidad de negocio y descripción. */
const porUnidadYNombre = (a: { unidadNegocio: string; descripcion: string }, b: { unidadNegocio: string; descripcion: string }) =>
  a.unidadNegocio.localeCompare(b.unidadNegocio, 'es') || a.descripcion.localeCompare(b.descripcion, 'es')

/** El día de la compra dentro del mes (inventado, fijo por cliente y mes); el mes en curso, hasta ayer. */
function diaDeCompra(idCliente: number, m: number, esMesActual: boolean) {
  const tope = esMesActual ? Math.max(1, Number(hoyArgentina().slice(8, 10)) - 1) : 28
  return 1 + Math.floor(azar(idCliente * 13 + m)() * tope)
}

/**
 * El cliente y qué meses ve quien pregunta. Fuera del alcance es igual que no existir: 404 (no revela que existe).
 * Operario y supervisor entran si el cliente estuvo alguna vez en su cartera (en el mock, los clientes no cambian de
 * vendedor: alcanza con la ruta).
 */
function clienteVisible(idCliente: number, rol: RolPrueba, idsOperario: number[]) {
  const visibles = vendedoresVisibles(rol, idsOperario).map((v) => v.id)
  const c = datos().find((x) => x.idCliente === idCliente)
  if (!c || !visibles.includes(c.ruta.idPersonal)) throw new ErrorMock(404, 'No encontramos ese cliente.')
  const admin = rol === 'admin'
  return { c, admin, visible: (m: number) => admin || enCartera(c, m) }
}

export function ficha(idCliente: number, p: URLSearchParams, rol: RolPrueba, idsOperario: number[]) {
  const { c, admin, visible } = clienteVisible(idCliente, rol, idsOperario)
  const { meses, actual } = rango(p)
  const indices = meses.map(indiceMes)

  const articulos = new Map<number, { idArticulo: number; descripcion: string; unidadNegocio: string; meses: boolean[]; bultos: (number | null)[] }>()
  indices.forEach((m, i) => {
    if (!visible(m)) return
    for (const l of lineas(c, m, null)) {
      if (!articulos.has(l.idArticulo)) articulos.set(l.idArticulo, { ...articuloDe(l.idArticulo), meses: meses.map(() => false), bultos: [] })
      const a = articulos.get(l.idArticulo)!
      a.meses[i] = true
    }
  })
  // Bultos de cada artículo en cada mes: null fuera de cartera, 0 si ese mes no lo llevó
  for (const a of articulos.values()) {
    a.bultos = indices.map((m) => (visible(m) ? (lineas(c, m, null).find((l) => l.idArticulo === a.idArticulo)?.bultos ?? 0) : null))
  }

  // Última compra: la de cualquier fecha para el admin; para operario y supervisor, solo la de sus meses
  let ultimaCompra: string | null = null
  for (let m = Math.min(actual, c.compras.length - 1); m >= 0 && !ultimaCompra; m--) {
    if (!visible(m) || !compro(c, m, null)) continue
    const mes = new Date(Date.UTC(2026, 6 + m, 1)).toISOString().slice(0, 8)
    ultimaCompra = `${mes}${String(diaDeCompra(c.idCliente, m, m === actual)).padStart(2, '0')}`
  }
  const diasSinComprar = ultimaCompra ? Math.round((Date.parse(hoyArgentina()) - Date.parse(ultimaCompra)) / 86_400_000) : null

  const r = azar(c.idCliente * 7)
  const direccion = c.lat === null ? null : `${CALLES[Math.floor(r() * CALLES.length)]} ${100 + Math.floor(r() * 2900)}, ${LOCALIDADES[c.ruta.nombre] ?? 'SAN MIGUEL DE TUCUMAN'}`
  const vendedor = VENDEDORES.find((v) => v.id === c.ruta.idPersonal)!

  return {
    idCliente: c.idCliente,
    razonSocial: c.razonSocial,
    enCartera: enCartera(c, actual),
    ruta: c.ruta.nombre,
    vendedor: vendedor.esCasa ? null : vendedor.nombre,
    diasVisita: diasVisita(c.ruta.dias),
    direccion,
    lat: c.lat,
    lng: c.lng,
    ultimaCompra,
    diasSinComprar,
    meses,
    estados: indices.map((m) => (visible(m) ? estado(c, m, null, actual, !admin) : 'fueraDeCartera')),
    bultos: indices.map((m) => (visible(m) ? suma(lineas(c, m, null), 'bultos') : null)),
    articulos: [...articulos.values()].sort(porUnidadYNombre),
  }
}

/** `GET /api/clientes/{id}/volumen?mes=`: por artículo, el mes contra la base (la de `/api/volumen` según el rol). */
export function fichaVolumen(idCliente: number, p: URLSearchParams, rol: RolPrueba, idsOperario: number[]) {
  const { c, visible } = clienteVisible(idCliente, rol, idsOperario)
  const comp = comparacion(rol, p.get('mes'))
  const delMes = visible(comp.m) ? lineas(c, comp.m, null) : null
  const delBase = visible(comp.mBase) ? lineas(c, comp.mBase, null) : null
  const ids = new Set([...(delMes ?? []), ...(delBase ?? [])].map((l) => l.idArticulo))
  const base = (ls: typeof delBase, id: number | null) => {
    if (ls === null) return null
    const total = id === null ? suma(ls, 'bultos') : (ls.find((l) => l.idArticulo === id)?.bultos ?? 0)
    return medio(total * comp.fraccionBase)
  }
  const actual = (id: number | null) => (delMes === null ? null : id === null ? suma(delMes, 'bultos') : (delMes.find((l) => l.idArticulo === id)?.bultos ?? 0))
  const bultosBase = base(delBase, null)
  // null: ese mes el cliente ya no es de quien mira (contrato)
  const bultosActual = actual(null)
  return {
    comparacion: comp.publica,
    total: {
      bultosActual,
      bultosBase,
      bultosEsperado: bultosBase === null ? null : Math.round(bultosBase * comp.ritmo * 10) / 10,
      porcentaje: bultosActual === null ? null : pct(bultosActual, bultosBase),
    },
    articulos: [...ids]
      .map((id) => {
        const a = actual(id)
        const b = base(delBase, id)
        return { ...articuloDe(id), bultosActual: a, bultosBase: b, porcentaje: a === null ? null : pct(a, b) }
      })
      .sort(porUnidadYNombre),
  }
}

/** `GET /api/clientes/{id}/devoluciones?mesDesde=&mesHasta=&mes=`: por mes y, en el mes elegido, por artículo. */
export function fichaDevoluciones(idCliente: number, p: URLSearchParams, rol: RolPrueba, idsOperario: number[]) {
  const { c, visible } = clienteVisible(idCliente, rol, idsOperario)
  const { meses, actual } = rango(p)
  const mes = p.get('mes') ? mesDe(p.get('mes')!) : meses[meses.length - 1]
  if (!meses.includes(mes)) throw new ErrorMock(400, 'El mes no está en el rango.', { mes: ['Elegí un mes del rango.'] })
  const kpis = meses.map((m) => {
    const i = indiceMes(m)
    const ls = visible(i) ? lineas(c, i, null) : null
    const vendidos = ls ? suma(ls, 'bultos') : null
    const devueltos = ls ? suma(ls, 'devueltos') : null
    return {
      mes: m,
      bultosVendidos: vendidos,
      bultosDevueltos: devueltos,
      porcentaje: vendidos === null || devueltos === null ? null : porcentajeDevolucion(vendidos, devueltos),
      mesEnCurso: i === actual,
      corteAl: i === actual ? ayerArgentina() : null,
    }
  })
  const i = indiceMes(mes)
  const articulos = (visible(i) ? lineas(c, i, null) : [])
    .filter((l) => l.devueltos > 0)
    .map((l) => ({ ...articuloDe(l.idArticulo), bultosVendidos: l.bultos, bultosDevueltos: l.devueltos, porcentaje: porcentajeDevolucion(l.bultos, l.devueltos) }))
    .sort((a, b) => b.bultosDevueltos - a.bultosDevueltos)
  return { meses, kpis, mes, articulos }
}
