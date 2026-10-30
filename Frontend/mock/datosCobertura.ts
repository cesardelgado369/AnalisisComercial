/**
 * TODO testing — datos fake para `npm run dev:mock`: vendedores, rutas, clientes y compras inventados (con los nombres
 * del contexto), y `GET /api/cobertura` armado con las reglas de CONTRATO_API.md. **No es la lógica oficial**: la
 * oficial es la del backend. Se borra cuando la API esté arriba (puerto 5030).
 */

export type EstadoMes = 'compro' | 'noCompro' | 'sinCompraAun' | 'dejoDeComprar' | 'fueraDeCartera'
type Chip = 'todos' | 'compraronMesActual' | 'sinCompraMesActual' | 'dejaronDeComprar'
export type RolPrueba = 'admin' | 'supervisor' | 'operario'

/** Vendedores de Chess (CONTEXTO_BACKEND.md), por nombre y con la casa al final, como `GET /api/sesion`. */
export const VENDEDORES = [
  { id: 5, nombre: 'ALEJANDRO LIZARRAGA', esCasa: false },
  { id: 2, nombre: 'FRANCO BAIGORRIA', esCasa: false },
  { id: 4, nombre: 'MATEO ROJAS', esCasa: false },
  { id: 3, nombre: 'MAURICIO SORIA', esCasa: false },
  { id: 1, nombre: 'NICOLAS CORDOBA', esCasa: false },
  { id: 6, nombre: 'Cuentas de la casa (Deposito)', esCasa: true },
]

/**
 * Qué vendedores ve cada rol de prueba: el operario, los suyos (`idsOperario`: Nicolás Córdoba, o Nicolás y Mateo para
 * probar al operario con varios); el supervisor, Franco y Mauricio; el admin, todos.
 */
export function vendedoresVisibles(rol: RolPrueba, idsOperario: number[] = [1]) {
  if (rol === 'operario') return VENDEDORES.filter((v) => idsOperario.includes(v.id))
  if (rol === 'supervisor') return VENDEDORES.filter((v) => v.id === 2 || v.id === 3)
  return VENDEDORES
}

/** Como las manda Chess (sin el «124 - » de la web vieja), confirmadas por el backend el 26/10. */
export const UNIDADES = ['ATM', 'COMIDAS CONGELADAS', 'PAN RALLADO1', 'PASTAS FRESCAS', 'SIN UNIDAD DE NEGOCIO', 'TAPAS']
/** Cuánto pesa cada unidad en las compras (las pastas frescas y las tapas son lo que más sale). */
const PESO_UNIDAD = [0.35, 0.3, 0.2, 0.9, 0.05, 0.7]
const PASTAS_FRESCAS = 3

/**
 * Rutas vigentes: vendedor, días de visita (código de Chess: 2 lunes … 7 sábado) y un centro aproximado de la zona
 * (inventado, para el mapa): los clientes de la ruta se reparten alrededor.
 */
const RUTAS = [
  { nombre: 'ELENA WHITE', idPersonal: 1, dias: [2, 5], centro: [-26.812, -65.225] },
  { nombre: 'COLMENAR', idPersonal: 1, dias: [3, 6], centro: [-26.785, -65.205] },
  { nombre: 'BARRIO NORTE', idPersonal: 1, dias: [4], centro: [-26.808, -65.205] },
  { nombre: 'YERBA BUENA', idPersonal: 2, dias: [2, 5], centro: [-26.815, -65.29] },
  { nombre: 'EL MANANTIAL', idPersonal: 2, dias: [3], centro: [-26.848, -65.278] },
  { nombre: 'SAN PABLO', idPersonal: 2, dias: [6], centro: [-26.872, -65.31] },
  { nombre: 'ALDERETES', idPersonal: 3, dias: [2], centro: [-26.818, -65.135] },
  { nombre: 'BANDA DEL RIO SALI', idPersonal: 3, dias: [4, 7], centro: [-26.84, -65.168] },
  { nombre: 'LAS TALITAS', idPersonal: 3, dias: [3, 6], centro: [-26.765, -65.205] },
  { nombre: 'TAFI VIEJO', idPersonal: 4, dias: [2, 5], centro: [-26.733, -65.26] },
  { nombre: 'VILLA CARMELA', idPersonal: 4, dias: [3], centro: [-26.768, -65.268] },
  { nombre: 'CENTRO', idPersonal: 4, dias: [4, 7], centro: [-26.83, -65.205] },
  { nombre: 'LULES', idPersonal: 5, dias: [2], centro: [-26.925, -65.338] },
  { nombre: 'FAMAILLA', idPersonal: 5, dias: [5], centro: [-27.054, -65.403] },
  { nombre: 'CONCEPCION', idPersonal: 5, dias: [3], centro: [-27.343, -65.592] },
  { nombre: 'SUR TUCUMAN', idPersonal: 5, dias: [], centro: [-26.875, -65.215] },
  { nombre: 'Deposito', idPersonal: 6, dias: [2, 3, 4, 5, 6, 7], centro: [-26.8057, -65.195] },
]

const DIAS: Record<number, string> = { 2: 'lunes', 3: 'martes', 4: 'miércoles', 5: 'jueves', 6: 'viernes', 7: 'sábado' }

const PRIMER_MES = '2026-07-01'

// ---- Fechas (todo en texto `yyyy-MM-dd`, «hoy» de Argentina = UTC−3)

export const hoyArgentina = () => new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10)
export const ayerArgentina = () => new Date(Date.now() - 27 * 3_600_000).toISOString().slice(0, 10)
const mesDe = (fecha: string) => `${fecha.slice(0, 7)}-01`
function sumarMeses(mes: string, n: number) {
  const total = Number(mes.slice(0, 4)) * 12 + Number(mes.slice(5, 7)) - 1 + n
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}-01`
}
const indiceMes = (mes: string) => (Number(mes.slice(0, 4)) - 2026) * 12 + Number(mes.slice(5, 7)) - 7

// ---- Clientes inventados (determinísticos: siempre los mismos)

function azar(semilla: number) {
  return () => {
    semilla = (semilla + 0x6d2b79f5) | 0
    let t = Math.imul(semilla ^ (semilla >>> 15), 1 | semilla)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const FIJOS: [number, string, string][] = [
  [1, 'CLIENTE TEST', 'Deposito'],
  [2, 'MINISERVICE CHUPA', 'COLMENAR'],
  [3, 'BENJAMÍN', 'Deposito'],
  [4, 'PLANIFICACIÓN FLORIDA', 'ELENA WHITE'],
  [5, 'NATALIA', 'ELENA WHITE'],
  [7, 'ORIGAMI', 'ELENA WHITE'],
  [8, 'DRUSTORE', 'ELENA WHITE'],
  [16, 'DESPENSA MARY', 'ELENA WHITE'],
  [35, 'ALMACÉN MYN', 'ELENA WHITE'],
  [36, 'POLIRUBRO NUESTRO PROGRESO', 'ELENA WHITE'],
]
const RUBROS = ['DESPENSA', 'ALMACÉN', 'KIOSCO', 'MINISERVICE', 'AUTOSERVICIO', 'SUPER', 'MINIMERCADO', 'POLIRUBRO', 'ROTISERÍA', 'DIETÉTICA', 'FIAMBRERÍA', 'DISTRIBUIDORA', 'PANADERÍA', 'MAXIKIOSCO']
const NOMBRES = ['DON JOSÉ', 'LA ESQUINA', 'EL SOL', 'LOS HERMANOS', 'SAN MARTÍN', 'LUCÍA', 'EL PUENTE', 'LA ECONOMÍA', 'DOÑA ROSA', 'EL TRÉBOL', 'SANTA ANA', 'LOS ANDES', 'MARTINA', 'EL PROGRESO', 'LA FAMILIA', 'DON PEDRO', 'EL CRUCE', 'GAUCHITO', 'LAS MARÍAS', 'EL PORTAL', 'FLORIDA', 'TUCUMÁN', 'AVENIDA', 'MI BARRIO', 'LA AMISTAD', 'SOFI', 'EL NONO', 'LA PERLA', 'SAN CAYETANO', 'DON CARLOS']

interface ClienteFake {
  idCliente: number
  razonSocial: string
  ruta: (typeof RUTAS)[number]
  /** Primer mes (índice desde julio 2026) en que está en la cartera; `baja`: desde cuándo ya no. */
  alta: number
  baja: number | null
  /** Por mes, las unidades que compró (vacío = no compró). */
  compras: number[][]
  /** Ubicación inventada cerca del centro de su ruta; null = Chess no la tiene. */
  lat: number | null
  lng: number | null
}

let clientes: ClienteFake[] | null = null

function generar(): ClienteFake[] {
  const r = azar(20261026)
  const mesActual = mesDe(hoyArgentina())
  const meses = Math.max(1, indiceMes(mesActual) + 1)
  // Del mes en curso pasó una parte: compró menos gente todavía
  const avanceMes = Number(hoyArgentina().slice(8, 10)) / 31
  const lista: ClienteFake[] = []
  const usados = new Set<string>()

  const crear = (idCliente: number, razonSocial: string, ruta: (typeof RUTAS)[number]) => {
    const perfil = r()
    const fidelidad = perfil < 0.55 ? 0.95 : perfil < 0.8 ? 0.75 : perfil < 0.93 ? 0.45 : 0.08
    const alta = r() < 0.9 ? 0 : 1 + Math.floor(r() * (meses - 1))
    const baja = r() < 0.04 && meses > 2 ? 1 + Math.floor(r() * (meses - 1)) : null
    // Algunos fieles se cortan de golpe en un mes cerrado: son los «dejaron de comprar»
    const corte = fidelidad > 0.7 && r() < 0.14 ? Math.max(1, meses - 1 - Math.floor(r() * 2)) : null
    const compras = Array.from({ length: meses }, (_, m) => {
      const enCurso = m === meses - 1
      const p = (corte !== null && m >= corte ? 0.04 : fidelidad) * (enCurso ? Math.min(1, avanceMes + 0.15) : 1)
      if (r() >= p) return []
      const unidades = PESO_UNIDAD.map((peso, u) => (r() < peso ? u : -1)).filter((u) => u >= 0)
      return unidades.length ? unidades : [PASTAS_FRESCAS]
    })
    // Alrededor del centro de la ruta (unos 1,5 km); 3 % sin ubicación
    const conUbicacion = r() >= 0.03
    const dist = Math.sqrt(r()) * 0.016
    const angulo = r() * Math.PI * 2
    const lat = conUbicacion ? Math.round((ruta.centro[0] + dist * Math.sin(angulo)) * 1e5) / 1e5 : null
    const lng = conUbicacion ? Math.round((ruta.centro[1] + dist * 1.15 * Math.cos(angulo)) * 1e5) / 1e5 : null
    lista.push({ idCliente, razonSocial, ruta, alta, baja: baja !== null && baja > alta ? baja : null, compras, lat, lng })
  }

  for (const [id, nombre, ruta] of FIJOS) {
    usados.add(nombre)
    crear(id, nombre, RUTAS.find((x) => x.nombre === ruta)!)
  }
  let id = 37
  while (lista.length < 760) {
    id += 1 + Math.floor(r() * 9)
    const nombre = `${RUBROS[Math.floor(r() * RUBROS.length)]} ${NOMBRES[Math.floor(r() * NOMBRES.length)]}`
    const unico = usados.has(nombre) ? `${nombre} ${Math.floor(r() * 90) + 10}` : nombre
    usados.add(unico)
    // La casa tiene pocas cuentas; el resto se reparte entre las rutas de los vendedores
    const ruta = r() < 0.02 ? RUTAS[RUTAS.length - 1] : RUTAS[Math.floor(r() * (RUTAS.length - 1))]
    crear(id, unico, ruta)
  }
  return lista
}

export const datos = () => (clientes ??= generar())

/** Clientes excluidos (no cuentan en ninguna cartera), en memoria mientras corre el servidor de prueba. */
export const excluidos = new Map<number, { motivo: string; por: string; en: string }>([
  [1, { motivo: 'Cliente de prueba', por: 'checho@madomi', en: '2026-10-20T10:15:00-03:00' }],
])

/** Para la administración de clientes (datosAdmin.ts). */
export type { ClienteFake }
export { RUTAS, indiceMes, mesDe, PRIMER_MES, sumarMeses, estadoMes as estado, compro, enCartera, rango, alcance, azar, sinTildes }

// ---- Reglas del contrato

const sinTildes = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const enCartera = (c: ClienteFake, m: number) => m >= c.alta && (c.baja === null || m < c.baja)
const compro = (c: ClienteFake, m: number, unidad: number | null) =>
  m >= 0 && m < c.compras.length && (unidad === null ? c.compras[m].length > 0 : c.compras[m].includes(unidad))

/**
 * `estricto` (operario y supervisor, Gobernanza del contrato): el mes anterior solo cuenta si también era de su cartera;
 * si no, «dejó de comprar» revelaría que el cliente le compraba a otro vendedor. El admin mira el anterior siempre.
 */
function estadoMes(c: ClienteFake, m: number, unidad: number | null, mesActual: number, estricto = false): EstadoMes {
  if (!enCartera(c, m)) return 'fueraDeCartera'
  if (compro(c, m, unidad)) return 'compro'
  if (m === mesActual) return 'sinCompraAun'
  return compro(c, m - 1, unidad) && (!estricto || enCartera(c, m - 1)) ? 'dejoDeComprar' : 'noCompro'
}

export class ErrorMock extends Error {
  status: number
  errors?: Record<string, string[]>

  constructor(status: number, titulo: string, errors?: Record<string, string[]>) {
    super(titulo)
    this.status = status
    this.errors = errors
  }
}

/** Alcance de la persona: vendedores que puede elegir, y los de «todos» (sin la casa). */
function alcance(rol: RolPrueba, vendedor: number | null, idsOperario: number[]) {
  const visibles = vendedoresVisibles(rol, idsOperario)
  if (rol === 'operario') {
    // El operario ve la unión de sus vendedores, o uno de los suyos si lo elige
    if (vendedor !== null && !idsOperario.includes(vendedor)) throw new ErrorMock(403, 'No podés ver los clientes de otro vendedor.')
    return vendedor !== null ? [vendedor] : idsOperario
  }
  if (vendedor === null) return visibles.filter((v) => !v.esCasa).map((v) => v.id)
  if (!visibles.some((v) => v.id === vendedor)) throw new ErrorMock(403, 'No podés ver los clientes de ese vendedor.')
  return [vendedor]
}

/** Rango de meses del contrato: por defecto los cuatro hasta el mes en curso; máximo 12; no antes de julio 2026. */
function rango(p: URLSearchParams) {
  const mesActual = mesDe(hoyArgentina())
  const hasta = p.get('mesHasta') ? mesDe(p.get('mesHasta')!) : mesActual
  let desde = p.get('mesDesde') ? mesDe(p.get('mesDesde')!) : sumarMeses(hasta, -3)
  if (desde > hasta) throw new ErrorMock(400, 'El rango de meses no es válido.', { mesDesde: ['Tiene que ser anterior a «hasta».'] })
  if (desde < PRIMER_MES) desde = PRIMER_MES
  if (indiceMes(hasta) - indiceMes(desde) > 11) desde = sumarMeses(hasta, -11)
  const meses: string[] = []
  for (let m = desde; m <= hasta && m <= mesActual; m = sumarMeses(m, 1)) meses.push(m)
  return { meses, actual: indiceMes(mesActual) }
}

/** `GET /api/cobertura` (CONTRATO_API.md). */
export function cobertura(p: URLSearchParams, rol: RolPrueba, idsOperario: number[] = [1]) {
  const vendedor = p.get('vendedor') ? Number(p.get('vendedor')) : null
  const ids = alcance(rol, vendedor, idsOperario)
  const dia = p.get('dia') ? Number(p.get('dia')) : null
  const unidadTexto = p.get('unidad')
  const unidad = unidadTexto ? UNIDADES.indexOf(unidadTexto) : null
  if (unidad === -1) throw new ErrorMock(400, 'La unidad de negocio no existe.', { unidad: ['No es una de las unidades.'] })
  const chip = (p.get('chip') ?? 'todos') as Chip
  const busqueda = sinTildes(p.get('busqueda')?.trim() ?? '')
  const { meses, actual } = rango(p)
  const indices = meses.map(indiceMes)
  const ultimo = indices[indices.length - 1]
  const estricto = rol !== 'admin'
  const estado = (c: ClienteFake, m: number, u: number | null, a: number) => estadoMes(c, m, u, a, estricto)

  // Los excluidos no cuentan en ninguna cartera (CONTRATO_API.md)
  const delFiltro = datos().filter(
    (c) => !excluidos.has(c.idCliente) && ids.includes(c.ruta.idPersonal) && (dia === null || c.ruta.dias.includes(dia)),
  )
  const kpis = meses.map((mes, i) => {
    const m = indices[i]
    const cartera = delFiltro.filter((c) => enCartera(c, m))
    const conCompra = cartera.filter((c) => compro(c, m, unidad)).length
    return {
      mes,
      clientesConCompra: conCompra,
      clientesCartera: cartera.length,
      porcentaje: cartera.length ? Math.round((conCompra / cartera.length) * 1000) / 10 : 0,
      mesEnCurso: m === actual,
      corteAl: m === actual ? ayerArgentina() : null,
    }
  })

  // El último mes cerrado del rango decide la marca roja; si el mes en curso está en el rango, que no haya vuelto
  const ultimoCerrado = ultimo === actual ? ultimo - 1 : ultimo
  const marcado = (c: ClienteFake) =>
    indices.includes(ultimoCerrado) &&
    estado(c, ultimoCerrado, unidad, actual) === 'dejoDeComprar' &&
    (ultimo !== actual || !compro(c, actual, unidad))

  const cartera = delFiltro
    .filter((c) => enCartera(c, ultimo))
    .sort((a, b) => a.razonSocial.localeCompare(b.razonSocial, 'es'))
  const chips: Record<Chip, number> = {
    todos: cartera.length,
    compraronMesActual: cartera.filter((c) => compro(c, ultimo, unidad)).length,
    sinCompraMesActual: cartera.filter((c) => !compro(c, ultimo, unidad)).length,
    dejaronDeComprar: cartera.filter(marcado).length,
  }

  // Como el backend: el operario sin vendedor elegido ve la unión, y el título son sus nombres unidos con « / »
  const nombreVendedor =
    vendedor !== null
      ? VENDEDORES.find((v) => v.id === vendedor)?.nombre
      : rol === 'operario'
        ? VENDEDORES.filter((v) => idsOperario.includes(v.id)).map((v) => v.nombre).join(' / ')
        : null
  const clientesFiltrados = cartera
    .filter((c) => !busqueda || String(c.idCliente) === busqueda || sinTildes(c.razonSocial).includes(busqueda))
    .filter((c) =>
      chip === 'compraronMesActual' ? compro(c, ultimo, unidad)
      : chip === 'sinCompraMesActual' ? !compro(c, ultimo, unidad)
      : chip === 'dejaronDeComprar' ? marcado(c)
      : true,
    )

  return {
    titulo: nombreVendedor ?? 'Todos los vendedores',
    subtitulo: `${cartera.length} clientes, ${dia ? DIAS[dia] : 'todos los días'}, ${unidadTexto ?? 'todas las unidades'}`,
    meses,
    kpis,
    chips,
    clientes: clientesFiltrados.map((c) => ({
      idCliente: c.idCliente,
      razonSocial: c.razonSocial,
      ruta: c.ruta.nombre,
      vendedor: VENDEDORES.find((v) => v.id === c.ruta.idPersonal)!.nombre,
      meses: indices.map((m) => estado(c, m, unidad, actual)),
      dejoDeComprar: marcado(c),
      idPersonal: c.ruta.idPersonal,
      lat: c.lat,
      lng: c.lng,
    })),
  }
}
