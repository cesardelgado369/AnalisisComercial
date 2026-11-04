/**
 * TODO testing — Administración fake para `npm run dev:mock`: cuentas de Madomi con su acceso, vendedores de Chess
 * (también uno dado de baja, el caso de un renombre) y la base de clientes por vendedor con sus exclusiones y sus
 * Vitales (CONTRATO_API.md, «Clasificación de clientes: Vital», 30/10). Sigue la
 * forma propuesta al backend el 29/10 (todavía sin confirmar en CONTRATO_API.md). Todo vive en memoria: reiniciar el
 * servidor de prueba vuelve al estado inicial.
 */
import { ErrorMock, VENDEDORES, compro, datos, estado, excluidos, hoyArgentina, indiceMes, mesDe, PRIMER_MES, sumarMeses } from './datosCobertura.ts'

type Rol = 'admin' | 'supervisor' | 'operario'

/** Los de la sesión más uno dado de baja: el peor caso de un renombre en Chess (mismo vendedor, otro id). */
export const VENDEDORES_CHESS = [
  ...VENDEDORES.filter((v) => !v.esCasa).map((v) => ({ ...v, activo: true })),
  { id: 7, nombre: 'NICO CORDOBA', esCasa: false, activo: false },
  // Como el backend: personas activas por nombre, después las de baja y la casa al final, con su nombre de Chess
  { id: 6, nombre: 'DEPOSITO', esCasa: true, activo: true },
]

interface Cuenta {
  /** null: acceso dado por email a alguien sin cuenta en la plataforma (todavía no puede entrar). */
  idUsuario: string | null
  usuario: string
  nombre: string | null
  cuentaActiva: boolean
  ultimoIngreso: string | null
  rol: Rol | null
  idAcceso: number | null
  idsPersonal: number[]
  accesoActivo: boolean
  /** El acceso está atado a esta cuenta (se ata al guardarlo con la cuenta ya creada, nunca al entrar). */
  accesoEnlazado: boolean
  version: string | null
  /** Entra con su usuario de De Ruta (sin clave en la plataforma). */
  federada?: boolean
}

const hace = (dias: number) => new Date(Date.now() - dias * 86_400_000).toISOString()
let siguienteAcceso = 20
let siguienteVersion = 1
const nuevaVersion = () => `v${siguienteVersion++}`

const cuentas: Cuenta[] = [
  { idUsuario: 'u-checho', usuario: 'checho@madomi', nombre: 'Checho', cuentaActiva: true, ultimoIngreso: hace(0), rol: 'admin', idAcceso: null, idsPersonal: [], accesoActivo: false, accesoEnlazado: false, version: null },
  { idUsuario: 'u-nicolas', usuario: 'nicolas.cordoba', nombre: 'Nicolás Córdoba', cuentaActiva: true, ultimoIngreso: hace(1), rol: 'operario', idAcceso: 11, idsPersonal: [1, 7], accesoActivo: true, accesoEnlazado: true, version: nuevaVersion(), federada: true },
  // Un acceso viejo (de antes del 04/11) de alguien que nunca entró: la cuenta existe pero falta habilitarlo
  { idUsuario: 'u-franco', usuario: 'franco@madomi', nombre: 'Franco Baigorria', cuentaActiva: true, ultimoIngreso: null, rol: 'operario', idAcceso: 12, idsPersonal: [2], accesoActivo: true, accesoEnlazado: false, version: nuevaVersion() },
  { idUsuario: 'u-mauricio', usuario: 'mauricio.soria', nombre: 'Mauricio Soria', cuentaActiva: true, ultimoIngreso: hace(9), rol: 'operario', idAcceso: 13, idsPersonal: [3], accesoActivo: false, accesoEnlazado: true, version: nuevaVersion() },
  { idUsuario: 'u-super', usuario: 'supervisor@madomi', nombre: 'Supervisor PRUEBA', cuentaActiva: true, ultimoIngreso: hace(3), rol: 'supervisor', idAcceso: 14, idsPersonal: [2, 3], accesoActivo: true, accesoEnlazado: true, version: nuevaVersion() },
  { idUsuario: 'u-adm', usuario: 'administracion@madomi', nombre: 'Administración', cuentaActiva: true, ultimoIngreso: hace(20), rol: null, idAcceso: null, idsPersonal: [], accesoActivo: false, accesoEnlazado: false, version: null },
  { idUsuario: null, usuario: 'jimena@madomi', nombre: null, cuentaActiva: false, ultimoIngreso: null, rol: 'operario', idAcceso: 15, idsPersonal: [4], accesoActivo: true, accesoEnlazado: false, version: nuevaVersion() },
  { idUsuario: 'u-mateo', usuario: 'mateo.rojas', nombre: 'Mateo Rojas', cuentaActiva: true, ultimoIngreso: null, rol: null, idAcceso: null, idsPersonal: [], accesoActivo: false, accesoEnlazado: false, version: null },
]

export const listarCuentas = () => [...cuentas].sort((a, b) => (a.nombre ?? a.usuario).localeCompare(b.nombre ?? b.usuario, 'es'))

/** Vendedores válidos para un acceso: que existan y no sean la casa (la casa la ve solo el admin). */
function validarVendedores(ids: unknown, errores: Record<string, string[]>) {
  const lista = Array.isArray(ids) ? ids.filter((x): x is number => typeof x === 'number') : []
  if (!lista.length) errores.idsPersonal = ['Elegí al menos un vendedor de Chess.']
  else if (lista.some((id) => !VENDEDORES_CHESS.some((v) => v.id === id && !v.esCasa)))
    errores.idsPersonal = ['Hay un vendedor que no existe o es la casa.']
  return [...new Set(lista)]
}

const textoCuerpo = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

/** `POST /api/admin/cuentas`: crea la cuenta (la «plataforma» del mock) y su acceso de operario. */
export function crearCuenta(cuerpo: Record<string, unknown>) {
  const errores: Record<string, string[]> = {}
  const usuario = textoCuerpo(cuerpo.usuario).toLowerCase()
  const nombre = textoCuerpo(cuerpo.nombre)
  const password = typeof cuerpo.password === 'string' ? cuerpo.password : ''
  if (usuario.length < 2 || usuario.length > 200 || /\s/.test(usuario)) errores.usuario = ['Poné un email o un usuario sin espacios.']
  else if (cuentas.some((c) => c.usuario === usuario)) errores.usuario = ['Ya existe una cuenta con ese usuario.']
  if (!nombre) errores.nombre = ['Poné el nombre de la persona.']
  else if (nombre.length > 100) errores.nombre = ['Máximo 100 caracteres.']
  if (password.length < 8) errores.password = ['La contraseña tiene que tener al menos 8 caracteres.']
  const idsPersonal = validarVendedores(cuerpo.idsPersonal, errores)
  if (Object.keys(errores).length) throw new ErrorMock(400, 'Revisá los datos de la cuenta.', errores)
  const cuenta: Cuenta = {
    idUsuario: `u-${usuario}`, usuario, nombre, cuentaActiva: true, ultimoIngreso: null, rol: 'operario',
    idAcceso: siguienteAcceso++, idsPersonal, accesoActivo: true, accesoEnlazado: true, version: nuevaVersion(),
  }
  cuentas.push(cuenta)
  return cuenta
}

/** Un acceso con la forma de `GET /api/admin/usuarios` (CONTRATO_API.md). */
const acceso = (c: Cuenta) => ({
  idAcceso: c.idAcceso!,
  email: c.usuario,
  nombre: c.nombre,
  rol: c.rol as 'supervisor' | 'operario',
  idsPersonal: c.idsPersonal,
  activo: c.accesoActivo,
  entro: c.ultimoIngreso !== null,
  enlazado: c.accesoEnlazado,
  ultimoIngreso: c.ultimoIngreso,
  actualizadoPor: 'checho@madomi',
  actualizado: new Date().toISOString(),
  version: c.version!,
})

/** `GET /api/admin/usuarios`: los accesos cargados (supervisores y operarios). */
export const listarAccesos = () => listarCuentas().filter((c) => c.idAcceso !== null).map(acceso)

/**
 * `POST /api/admin/usuarios`: da acceso a un usuario. Como la API real, no hace falta que la cuenta ya esté en la lista:
 * si existe, el acceso queda atado a ella; si no, queda pendiente hasta que se lo vuelva a guardar con la cuenta creada.
 */
export function darAcceso(cuerpo: Record<string, unknown>) {
  const usuario = textoCuerpo(cuerpo.email).toLowerCase()
  const errores: Record<string, string[]> = {}
  if (usuario.length < 2 || usuario.length > 200 || /\s/.test(usuario)) errores.email = ['Poné un email o un usuario sin espacios.']
  let cuenta = cuentas.find((c) => c.usuario === usuario)
  if (cuenta && (cuenta.idAcceso !== null || cuenta.rol === 'admin')) errores.email = ['Ese usuario ya tiene acceso.']
  const rol = cuerpo.rol === 'supervisor' ? 'supervisor' : 'operario'
  const idsPersonal = validarVendedores(cuerpo.idsPersonal, errores)
  if (Object.keys(errores).length) throw new ErrorMock(400, 'Revisá el acceso.', errores)
  if (!cuenta) {
    // Como la API: el acceso queda a la espera de que la plataforma tenga la cuenta
    cuenta = { idUsuario: null, usuario, nombre: null, cuentaActiva: false, ultimoIngreso: null, rol: null, idAcceso: null, idsPersonal: [], accesoActivo: false, accesoEnlazado: false, version: null }
    cuentas.push(cuenta)
  }
  Object.assign(cuenta, { rol, idsPersonal, idAcceso: siguienteAcceso++, accesoActivo: true, accesoEnlazado: cuenta.idUsuario !== null, version: nuevaVersion() })
  return acceso(cuenta)
}

/**
 * `PUT /api/admin/usuarios/{idAcceso}`: rol, vendedores y si está activo, con `version` (409 si otro guardó). Como la
 * API, guardarlo lo ata a la cuenta si ya existe (así se habilita un acceso pendiente).
 */
export function editarAcceso(idAcceso: number, cuerpo: Record<string, unknown>) {
  const cuenta = cuentas.find((c) => c.idAcceso === idAcceso)
  if (!cuenta) throw new ErrorMock(404, 'No existe ese acceso.')
  if (!cuerpo.version) throw new ErrorMock(400, 'Falta la versión.', { version: ['Falta la versión.'] })
  if (cuerpo.version !== cuenta.version) throw new ErrorMock(409, 'Otra persona cambió este acceso mientras lo editabas. Se volvió a leer: revisalo y guardá de nuevo.')
  const errores: Record<string, string[]> = {}
  const rol = cuerpo.rol === 'supervisor' ? 'supervisor' : 'operario'
  const idsPersonal = validarVendedores(cuerpo.idsPersonal, errores)
  if (Object.keys(errores).length) throw new ErrorMock(400, 'Revisá el acceso.', errores)
  Object.assign(cuenta, { rol, idsPersonal, accesoActivo: cuerpo.activo !== false, accesoEnlazado: cuenta.idUsuario !== null, version: nuevaVersion() })
  return acceso(cuenta)
}

/** Para probar el 409 desde la pantalla: alguien más guardó este acceso (cambia la versión, nada más). */
export function tocarAcceso(idAcceso: number) {
  const cuenta = cuentas.find((c) => c.idAcceso === idAcceso)
  if (cuenta) cuenta.version = nuevaVersion()
}

// ---- Clientes por vendedor

const LOCALIDAD: Record<string, string> = {
  'YERBA BUENA': 'Yerba Buena', 'EL MANANTIAL': 'El Manantial', 'SAN PABLO': 'San Pablo', ALDERETES: 'Alderetes',
  'BANDA DEL RIO SALI': 'Banda del Río Salí', 'LAS TALITAS': 'Las Talitas', 'TAFI VIEJO': 'Tafí Viejo', LULES: 'Lules',
  FAMAILLA: 'Famaillá', CONCEPCION: 'Concepción',
}
const localidad = (ruta: string) => LOCALIDAD[ruta] ?? 'San Miguel de Tucumán'
const sinTildes = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** La última compra inventada: el día 15 del último mes en que compró (en el mes en curso, ayer). */
function ultimaCompra(compras: number[][]) {
  const actual = indiceMes(mesDe(hoyArgentina()))
  for (let m = compras.length - 1; m >= 0; m--) {
    if (!compras[m].length) continue
    if (m === actual) return new Date(Date.now() - 27 * 3_600_000).toISOString().slice(0, 10)
    return `${sumarMeses(PRIMER_MES, m).slice(0, 7)}-15`
  }
  return null
}

/**
 * Como el backend: la administración manda el nombre crudo de Chess, también para la casa («DEPOSITO»). La etiqueta
 * «Cuentas de la casa (…)» es solo de `/api/sesion`.
 */
const nombreCrudo = (v: (typeof VENDEDORES)[number]) => (v.esCasa ? 'DEPOSITO' : v.nombre)
const nombreVendedor = (id: number) => {
  const v = VENDEDORES.find((x) => x.id === id)
  return v ? nombreCrudo(v) : null
}

/** Los últimos 4 meses hasta el en curso (como el rango por defecto de Cobertura), sin pasar del primero con datos. */
function ultimosMeses() {
  const actual = mesDe(hoyArgentina())
  const meses: string[] = []
  for (let i = 3; i >= 0; i--) {
    const m = sumarMeses(actual, -i)
    if (m >= PRIMER_MES) meses.push(m)
  }
  return meses
}

const MESES_NOMBRE = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const nombreDelMes = (mes: string) => MESES_NOMBRE[Number(mes.slice(5, 7)) - 1]
/** Los umbrales de la regla del backend (CONTRATO_API.md, configurables allá). */
const DIAS_EXCLUIR = 90
const DIAS_REVISAR = 60
const diasEntre = (desde: string, hasta: string) => Math.round((Date.parse(hasta) - Date.parse(desde)) / 86_400_000)

/**
 * Estadística rápida y sugerencia, con la regla del backend (CONTRATO_API.md, 29/10). Solo para los no excluidos:
 * - `excluir`: 90 días o más sin comprar, o nunca compró y está en la cartera hace 90 días o más (uno nuevo, no).
 * - `revisar`: dejó de comprar el último mes cerrado y no volvió, o entre 60 y 89 días sin comprar.
 * `estados` miran la cartera de toda la empresa, sin las exclusiones.
 */
function estadistica(c: ReturnType<typeof datos>[number]) {
  const hoy = hoyArgentina()
  const actual = indiceMes(mesDe(hoy))
  const meses = ultimosMeses()
  const estados = meses.map((m) => estado(c, indiceMes(m), null, actual))
  const ultima = ultimaCompra(c.compras)
  const diasSinComprar = ultima ? diasEntre(ultima, hoy) : null
  let sugerencia: 'excluir' | 'revisar' | null = null
  let motivoSugerencia: string | null = null
  if (!excluidos.has(c.idCliente)) {
    const cerrado = meses.length - 2
    const dejo = cerrado >= 0 && estados[cerrado] === 'dejoDeComprar' && !compro(c, actual, null)
    if (diasSinComprar === null) {
      const enCarteraDesde = sumarMeses(PRIMER_MES, c.alta)
      if (diasEntre(enCarteraDesde, hoy) >= DIAS_EXCLUIR) {
        sugerencia = 'excluir'
        motivoSugerencia = `Nunca compró desde ${nombreDelMes(enCarteraDesde)}`
      }
    } else if (diasSinComprar >= DIAS_EXCLUIR) {
      sugerencia = 'excluir'
      motivoSugerencia = `No compra hace ${Math.floor(diasSinComprar / 30)} meses`
    } else if (dejo) {
      sugerencia = 'revisar'
      motivoSugerencia = `Dejó de comprar en ${nombreDelMes(meses[cerrado])}`
    } else if (diasSinComprar >= DIAS_REVISAR) {
      sugerencia = 'revisar'
      motivoSugerencia = `No compra hace ${diasSinComprar} días`
    }
  }
  return { estados, diasSinComprar, sugerencia, motivoSugerencia }
}

/** Los clientes Vitales (30/10): el admin los marca con un click. Arranca con algunos marcados para ver la pantalla. */
const vitales = new Map<number, { por: string; en: string }>(
  datos()
    .filter((_, i) => i % 23 === 0)
    .map((c) => [c.idCliente, { por: 'checho@madomi', en: '2026-10-30T12:00:00Z' }]),
)

function fila(c: ReturnType<typeof datos>[number]) {
  const ex = excluidos.get(c.idCliente)
  const vital = vitales.get(c.idCliente)
  return {
    ...estadistica(c),
    idCliente: c.idCliente,
    razonSocial: c.razonSocial,
    ruta: c.ruta.nombre,
    idPersonal: c.ruta.idPersonal,
    vendedor: nombreVendedor(c.ruta.idPersonal),
    localidad: localidad(c.ruta.nombre),
    ultimaCompra: ultimaCompra(c.compras),
    excluido: !!ex,
    motivo: ex?.motivo ?? null,
    excluidoPor: ex?.por ?? null,
    excluidoEn: ex?.en ?? null,
    vital: !!vital,
    vitalPor: vital?.por ?? null,
    vitalEn: vital?.en ?? null,
  }
}

/** `GET /api/admin/clientes/resumen`: un renglón por vendedor (por nombre, la casa al final). */
export function resumenClientes() {
  return VENDEDORES.map((v) => {
    const suyos = datos().filter((c) => c.ruta.idPersonal === v.id)
    return {
      idPersonal: v.id,
      vendedor: nombreCrudo(v),
      esCasa: v.esCasa,
      clientes: suyos.length,
      excluidos: suyos.filter((c) => excluidos.has(c.idCliente)).length,
      sugeridos: suyos.filter((c) => estadistica(c).sugerencia === 'excluir').length,
      vitales: suyos.filter((c) => vitales.has(c.idCliente)).length,
    }
  }).filter((r) => r.clientes > 0)
}

/** `GET /api/admin/clientes?vendedor=&texto=&excluidos=todos|solo|sin&vitales=todos|solo|sin&pagina=&tamano=`. */
export function buscarClientes(p: URLSearchParams) {
  const vendedor = p.get('vendedor') ? Number(p.get('vendedor')) : null
  const texto = sinTildes(p.get('texto')?.trim() ?? '')
  const filtro = p.get('excluidos') ?? 'todos'
  const filtroVitales = p.get('vitales') ?? 'todos'
  if (!['todos', 'solo', 'sin'].includes(filtroVitales))
    throw new ErrorMock(400, 'El filtro de Vitales no es válido.', { vitales: ['Tiene que ser «todos», «solo» o «sin».'] })
  const sugerencia = p.get('sugerencia')
  if (sugerencia && sugerencia !== 'excluir' && sugerencia !== 'revisar')
    throw new ErrorMock(400, 'La sugerencia no es válida.', { sugerencia: ['Tiene que ser «excluir» o «revisar».'] })
  const pagina = Math.max(1, Number(p.get('pagina')) || 1)
  const tamano = Math.min(200, Math.max(1, Number(p.get('tamano')) || 50))
  const lista = datos()
    .filter((c) => vendedor === null || c.ruta.idPersonal === vendedor)
    .filter((c) => !texto || String(c.idCliente) === texto || sinTildes(c.razonSocial).includes(texto))
    .filter((c) => (filtro === 'solo' ? excluidos.has(c.idCliente) : filtro === 'sin' ? !excluidos.has(c.idCliente) : true))
    .filter((c) => !sugerencia || estadistica(c).sugerencia === sugerencia)
    .filter((c) => (filtroVitales === 'solo' ? vitales.has(c.idCliente) : filtroVitales === 'sin' ? !vitales.has(c.idCliente) : true))
    .sort((a, b) => a.razonSocial.localeCompare(b.razonSocial, 'es'))
  return { pagina, tamano, total: lista.length, meses: ultimosMeses(), filas: lista.slice((pagina - 1) * tamano, pagina * tamano).map(fila) }
}

/** `POST /api/admin/exclusiones`. */
export function excluir(cuerpo: Record<string, unknown>, por: string) {
  const id = Number(cuerpo.idCliente)
  const motivo = textoCuerpo(cuerpo.motivo)
  const cliente = datos().find((c) => c.idCliente === id)
  if (!cliente) throw new ErrorMock(400, 'El cliente no existe.', { idCliente: ['El cliente no existe.'] })
  if (excluidos.has(id)) throw new ErrorMock(400, 'Ya está excluido.', { idCliente: ['Ya está excluido.'] })
  if (!motivo) throw new ErrorMock(400, 'Falta el motivo.', { motivo: ['Escribí por qué se excluye.'] })
  if (motivo.length > 200) throw new ErrorMock(400, 'El motivo es muy largo.', { motivo: ['Máximo 200 caracteres.'] })
  excluidos.set(id, { motivo, por, en: new Date().toISOString() })
  return { idCliente: id, razonSocial: cliente.razonSocial, motivo, creadoPor: por, creadoEn: excluidos.get(id)!.en }
}

/** `DELETE /api/admin/exclusiones/{idCliente}`. */
export function incluir(id: number) {
  if (!excluidos.delete(id)) throw new ErrorMock(404, 'Ese cliente no estaba excluido.')
}

/** `PUT /api/admin/clientes/{id}/vital`: si ya era Vital, la marca que tenía; 404 si el cliente no existe. */
export function marcarVital(id: number, por: string) {
  const cliente = datos().find((c) => c.idCliente === id)
  if (!cliente) throw new ErrorMock(404, 'El cliente no existe.')
  if (!vitales.has(id)) vitales.set(id, { por, en: new Date().toISOString() })
  const marca = vitales.get(id)!
  return { idCliente: id, razonSocial: cliente.razonSocial, marcadoPor: marca.por, marcadoEn: marca.en }
}

/** `DELETE /api/admin/clientes/{id}/vital`: 204 aunque no fuera Vital. */
export function quitarVital(id: number) {
  vitales.delete(id)
}
