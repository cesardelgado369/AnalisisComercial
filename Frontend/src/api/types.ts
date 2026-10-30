/** El usuario de la sesión, como lo devuelve el login central (Vignoli.Plataforma). */
export interface Usuario {
  id: string
  email: string
  nombreCompleto: string
  esSuperAdmin: boolean
  tenantId: string
  roles: string[]
  permisos: string[]
  /** Nombre de la empresa con la que se entró (p. ej. Madomi Pastas). */
  empresa?: string | null
  /** Empresas a las que puede entrar (el login acepta `slug` para elegir una). */
  empresas?: { id: string; nombre: string; slug: string; esPrincipal: boolean }[]
  /** Módulos contratados por la empresa actual. */
  modulos?: ModuloPlataforma[]
  /** Aplicaciones a las que puede entrar en cualquiera de sus empresas: arman el menú del logo. */
  aplicaciones?: AplicacionPlataforma[]
}

export interface ModuloPlataforma {
  /** `logistica-rutas` · `mantenimiento` · `cashflow` · `analisis-comercial` … */
  codigo: string
  nombre: string
  /** Dónde vive la app (por entorno); null si todavía no está cargada. */
  urlBase: string | null
}

export interface AplicacionPlataforma extends ModuloPlataforma {
  /** En qué empresas la tiene. */
  empresas: { slug: string; nombre: string }[]
}

/** `GET /auth/me`: el usuario con los datos de su perfil. */
export interface Perfil extends Usuario {
  fechaAlta?: string
  /** Último login con contraseña (renovar el token no cuenta). */
  ultimoIngreso?: string | null
}

export interface LoginResponse {
  accessToken: string
  refreshToken: string
  expiraEn: string
  usuario: Usuario
}

/** Error del backend (ProblemDetails): `title` redactado para mostrar y `errors` por campo. */
export interface ProblemaApi {
  title: string
  status: number
  errors?: Record<string, string[]>
}

// ---- API de Análisis Comercial (proxy /api)
//
// Espejo del contrato v1 del backend (`AnalisisComercial/CONTRATO_API.md`, fuente de verdad, 26/10/2026). Si se
// contradicen, vale el contrato. Enums como texto camelCase; fechas `yyyy-MM-dd`; meses como su día 1 (`2026-10-01`);
// instantes ISO con zona.

/** Rol de la persona **en esta app** (lo resuelve el backend): arma el menú y decide qué controles se muestran. */
export type Rol = 'admin' | 'supervisor' | 'operario'

export interface OpcionVendedor {
  /** `idPersonal` de Chess. */
  id: number
  nombre: string
  /** «Cuentas de la casa (Deposito)»: solo admin, al final, y no entra en «Todos los vendedores». */
  esCasa: boolean
}

/** `GET /api/sesion`. 403 = entró por la plataforma pero no tiene acceso a esta app (el `title` ya viene redactado). */
export interface SesionApp {
  email: string
  rol: Rol
  /** El vendedor de Chess del operario con uno solo; null para admin, supervisor y el operario con varios. */
  vendedor: { idPersonal: number; nombre: string } | null
  /** Los que puede elegir (el operario, los suyos: uno o más), por nombre y con la casa al final. */
  vendedores: OpcionVendedor[]
  /** «Hoy» en Argentina. */
  hoy: string
  mesEnCurso: string
  /**
   * false = solo Cobertura y la ficha (Cesar, 30/10, la 1.2 para vendedores; hoy, el operario): sin Volumen ni
   * Devoluciones ni sus pestañas, que la API le responde con 403. Se abre desde la configuración del backend.
   */
  veBultos: boolean
}

/** `GET /api/sincronizacion/estado`: «Datos de Chess al …». Más de 36 h sin una corrida OK → aviso de datos viejos. */
export interface EstadoSincronizacion {
  ultimaOk: string | null
  /** Hasta qué día hay ventas cargadas. */
  ventasHasta: string | null
}

export type EstadoMes = 'compro' | 'noCompro' | 'sinCompraAun' | 'dejoDeComprar' | 'fueraDeCartera'

export type ChipCobertura = 'todos' | 'compraronMesActual' | 'sinCompraMesActual' | 'dejaronDeComprar'

export interface KpiMes {
  mes: string
  clientesConCompra: number
  clientesCartera: number
  /** 0–100 con un decimal: el front lo redondea («66%»). */
  porcentaje: number
  /** El mes en curso no se compara de igual a igual con los cerrados (va atenuado, «al 22/10»). */
  mesEnCurso: boolean
  /** Hasta qué día hay ventas (solo el mes en curso). */
  corteAl: string | null
}

export interface ClienteCobertura {
  idCliente: number
  razonSocial: string
  /** null: el admin ve rutas sin vendedor (y clientes sin ruta). */
  ruta: string | null
  vendedor: string | null
  /** Un estado por cada mes de `Cobertura.meses`. */
  meses: EstadoMes[]
  /** La marca roja de la fila (el último mes cerrado quedó en `dejoDeComprar` y no volvió). */
  dejoDeComprar: boolean
  /**
   * El vendedor de la cartera de `mesHasta` (el mismo que da `vendedor`): el color del mapa sigue al vendedor. null = ruta
   * sin vendedor (solo le pasa al admin, eligiendo la casa).
   */
  idPersonal: number | null
  /** Ubicación de Chess (la misma de la ficha y de Mi ruta); null si no la tiene. */
  lat: number | null
  lng: number | null
}

/** `GET /api/cobertura?vendedor=&dia=&unidad=&busqueda=&chip=&mesDesde=&mesHasta=`. */
export interface Cobertura {
  titulo: string
  subtitulo: string
  meses: string[]
  kpis: KpiMes[]
  /** No cambian con `chip` ni con `busqueda`. */
  chips: Record<ChipCobertura, number>
  /** La cartera de `mesHasta`, por razón social. */
  clientes: ClienteCobertura[]
}

export interface ArticuloMes {
  idArticulo: number
  descripcion: string
  /** Como en `/api/cobertura/unidades` (sin el «124 - »). */
  unidadNegocio: string
  /** Si lo compró en cada mes de `FichaCliente.meses` (false fuera de cartera). */
  meses: boolean[]
  /** Bultos netos de cada mes; null = fuera de tu cartera. */
  bultos: (number | null)[]
}

/**
 * `GET /api/clientes/{idCliente}?mesDesde=&mesHasta=` («CCC x bulto»). 404 si no existe o, para operario y supervisor,
 * si nunca estuvo en su cartera. Gobernanza: los meses que no fueron suyos vienen `fueraDeCartera`, sin bultos ni
 * artículos; `ruta`, `vendedor` y `diasVisita` son los del último mes en que fue suyo.
 */
export interface FichaCliente {
  idCliente: number
  razonSocial: string
  /** Está en la cartera de quien mira este mes (admin: en alguna). */
  enCartera: boolean
  ruta: string | null
  vendedor: string | null
  /** «Lunes y jueves» o «Sin día de visita». */
  diasVisita: string
  direccion: string | null
  lat: number | null
  lng: number | null
  ultimaCompra: string | null
  diasSinComprar: number | null
  meses: string[]
  estados: EstadoMes[]
  /** Bultos netos de cada mes; null = fuera de tu cartera. */
  bultos: (number | null)[]
  /** Los que compró al menos una vez en el rango, por unidad de negocio y descripción. */
  articulos: ArticuloMes[]
}

// ---- Volumen (en bultos) y Devoluciones

/**
 * La base de Volumen según el rol (Cesar, 29/10): el operario, contra el **mes anterior completo** (una meta); admin y
 * supervisor, contra el mes anterior **al mismo día hábil**. Con un mes cerrado, todos el mes entero contra el anterior.
 */
export interface ComparacionVolumen {
  tipo: 'mismoDiaHabil' | 'mesAnteriorCompleto'
  mes: string
  mesBase: string
  /** Último día completo con ventas (sin hoy); null: todavía ninguno del mes. */
  corteAl: string | null
  diaHabil: number
  diasHabilesMes: number
  /** Hasta qué día suma la base. */
  baseHasta: string | null
}

/**
 * En `/api/volumen`, el operario recibe los tres bultos en null: el total de su cartera va solo en porcentaje (Cesar,
 * 30/10). En la ficha, `bultosActual` null = ese mes el cliente ya no es de quien mira.
 */
export interface TotalVolumen {
  bultosActual: number | null
  /** null si no hay base (operario o supervisor con clientes nuevos en su cartera) o para el operario. */
  bultosBase: number | null
  /** Lo que debería llevar a esta altura: la base, o el ritmo del mes anterior para el operario. */
  bultosEsperado: number | null
  /** bultosActual / bultosBase × 100, un decimal; null sin base o con base 0. */
  porcentaje: number | null
}

export type ChipVolumen = 'todos' | 'sinCompraAun' | 'nuevos' | 'bajaron' | 'subieron'

export interface ClienteVolumen {
  idCliente: number
  razonSocial: string
  ruta: string | null
  vendedor: string | null
  idPersonal: number | null
  bultosActual: number
  /** null: ese cliente no era de su cartera en el mes base («nuevo en tu cartera»). */
  bultosBase: number | null
  porcentaje: number | null
}

/** `GET /api/volumen?vendedor=&dia=&unidad=&busqueda=&chip=&mes=`. Cada cliente cae en un solo chip. */
export interface Volumen {
  titulo: string
  comparacion: ComparacionVolumen
  /** Sin mirar `chip` ni `busqueda`. */
  total: TotalVolumen
  chips: Record<ChipVolumen, number>
  clientes: ClienteVolumen[]
}

/** `GET /api/clientes/{id}/volumen?mes=`: la pestaña Volumen de la ficha. */
export interface FichaVolumen {
  comparacion: ComparacionVolumen
  /** `bultosActual` null: ese mes el cliente ya no es de quien mira (p. ej. pasó a otro equipo). */
  total: TotalVolumen
  /** Por unidad de negocio y descripción. null = ese período no era suyo. */
  articulos: {
    idArticulo: number
    descripcion: string
    unidadNegocio: string
    bultosActual: number | null
    bultosBase: number | null
    porcentaje: number | null
  }[]
}

export interface KpiDevolucion {
  mes: string
  /** null = fuera de tu cartera (en la ficha) o el operario en `/api/devoluciones` (solo el porcentaje, 30/10). */
  bultosVendidos: number | null
  bultosDevueltos: number | null
  /** devueltos / (vendidos + devueltos) × 100, un decimal; null si los dos son 0. */
  porcentaje: number | null
  mesEnCurso: boolean
  corteAl: string | null
}

export interface ArticuloDevolucion {
  idArticulo: number
  descripcion: string
  unidadNegocio: string
  bultosVendidos: number
  bultosDevueltos: number
  porcentaje: number | null
}

/** `GET /api/devoluciones?vendedor=&dia=&unidad=&mesDesde=&mesHasta=`. */
export interface Devoluciones {
  titulo: string
  meses: string[]
  kpis: KpiDevolucion[]
  /** = mesHasta: el mes de `clientes` y `articulos`. */
  mes: string
  /** Los de la cartera de `mes` con alguna devolución, de mayor a menor porcentaje. */
  clientes: {
    idCliente: number
    razonSocial: string
    ruta: string | null
    vendedor: string | null
    idPersonal: number | null
    bultosVendidos: number
    bultosDevueltos: number
    porcentaje: number | null
  }[]
  /** De más a menos bultos devueltos. Para el operario, los bultos en null: solo el porcentaje (30/10). */
  articulos: (Omit<ArticuloDevolucion, 'bultosVendidos' | 'bultosDevueltos'> & { bultosVendidos: number | null; bultosDevueltos: number | null })[]
}

/** `GET /api/clientes/{id}/devoluciones?mesDesde=&mesHasta=&mes=`: la pestaña Devoluciones de la ficha. */
export interface FichaDevoluciones {
  meses: string[]
  kpis: KpiDevolucion[]
  mes: string
  /** Con devoluciones en `mes`. */
  articulos: ArticuloDevolucion[]
}

/** `GET /api/ruta-hoy?vendedor=&fecha=`: primero los que dejaron de comprar, después los sin compra aún. */
export interface ClienteRutaHoy {
  idCliente: number
  razonSocial: string
  ruta: string
  direccion: string | null
  lat: number | null
  lng: number | null
  estadoMesActual: EstadoMes
  dejoDeComprar: boolean
  ultimaCompra: string | null
}

/** `GET /api/resumen?mesDesde=&mesHasta=` (admin y supervisor). */
export interface ResumenVendedor {
  idPersonal: number
  vendedor: string
  esCasa: boolean
  kpis: KpiMes[]
  dejaronDeComprar: number
  /** Clientes que entraron / salieron de su cartera de `mesHasta` contra el mes anterior. */
  altas: number
  bajas: number
}

// ---- Administración (solo admin)

/** `GET /api/admin/usuarios`: quién tiene acceso (supervisores y operarios; los admin salen del permiso de la plataforma). */
export interface AccesoUsuario {
  idAcceso: number
  email: string
  nombre: string | null
  rol: Exclude<Rol, 'admin'>
  /** Operario y supervisor: sus vendedores, uno o más (desde el 29/10 el operario también puede tener varios). */
  idsPersonal: number[]
  activo: boolean
  /** false = todavía no entró nunca (el acceso se enlaza a la cuenta la primera vez). */
  entro: boolean
  ultimoIngreso: string | null
  actualizadoPor: string
  actualizado: string
  version: string
}

/** Body de `POST /api/admin/usuarios`; el `PUT /{idAcceso}` suma `activo` y `version`. */
export interface AccesoUsuarioEnvio {
  email: string
  nombre?: string | null
  rol: Exclude<Rol, 'admin'>
  idsPersonal: number[]
  activo?: boolean
  version?: string
}

// ---- Vendedores de Chess y clientes por vendedor (pedido de Cesar, 29/10; confirmado en CONTRATO_API.md)

/**
 * Un vendedor de Chess, también los dados de baja o renombrados (`GET /api/admin/vendedores`). Orden: personas activas
 * por nombre, después las de baja y la casa al final.
 */
export interface VendedorChess {
  id: number
  nombre: string
  /** false = Chess lo dio de baja (p. ej. lo renombró con otro id): se puede enlazar igual, junto al nuevo. */
  activo: boolean
  esCasa: boolean
}

// ---- Gestión de cuentas
// La API las cruza con las cuentas de la plataforma (en producción desde el 30/10: listar y crear; editar, dar de baja
// o cambiar la clave todavía no existe). Sin la plataforma (en local), `GET /api/admin/cuentas` da 404 y la pantalla
// muestra solo los accesos de `/admin/usuarios`.

/**
 * Una cuenta de Madomi en la plataforma con su acceso a esta app (`GET /api/admin/cuentas`, por nombre). `rol` null =
 * la cuenta existe pero no entra a Análisis Comercial; `admin` = tiene el rol «Administrador comercial» de la
 * plataforma (sin acceso en la app: no se edita acá).
 */
export interface CuentaMadomi {
  /** null: un acceso dado por email a alguien que todavía no tiene cuenta en la plataforma. */
  idUsuario: string | null
  /** Con lo que entra (email o usuario sin dominio, como `jimena`). */
  usuario: string
  nombre: string | null
  cuentaActiva: boolean
  ultimoIngreso: string | null
  rol: Rol | null
  idAcceso: number | null
  /** Operario: 1 a N vendedores (si Chess renombra a uno con otro id, se suman los dos); supervisor: sus vendedores. */
  idsPersonal: number[]
  accesoActivo: boolean
  version: string | null
  /** Entra con su usuario de De Ruta: no tiene clave en la plataforma. */
  federada?: boolean
}

/** `POST /api/admin/cuentas`: crea la cuenta en la plataforma y su acceso de operario, en un paso. */
export interface NuevaCuentaOperario {
  usuario: string
  nombre: string
  /** Contraseña inicial (mínimo 8, la regla de la plataforma); la persona la cambia desde «Mi perfil». */
  password: string
  rol: 'operario'
  idsPersonal: number[]
}

/** `GET /api/admin/clientes/resumen`: un renglón por vendedor (por nombre, la casa y al final «sin vendedor»). */
export interface ResumenClientesVendedor {
  /** null = clientes sin vendedor. */
  idPersonal: number | null
  vendedor: string | null
  esCasa: boolean
  clientes: number
  excluidos: number
  /** Cuántos tienen `sugerencia: "excluir"`. */
  sugeridos: number
  /** Cuántos están marcados como Vitales. */
  vitales: number
}

/**
 * Qué sugiere el backend para un cliente que no compra (la regla y el texto son del backend, CONTRATO_API.md):
 * `excluir` = 90 días o más sin comprar, o nunca compró y está en la cartera hace 90 días o más; `revisar` = dejó de
 * comprar el último mes cerrado y no volvió, o entre 60 y 89 días sin comprar. Un excluido nunca trae sugerencia.
 */
export type SugerenciaCliente = 'excluir' | 'revisar'

/**
 * Una fila de `GET /api/admin/clientes?vendedor=<id>|sin&texto=&excluidos=todos|solo|sin&pagina=&tamano=` (por razón
 * social, `tamano` hasta 200; con `texto`, código exacto o parte del nombre).
 */
export interface ClienteAdmin {
  idCliente: number
  razonSocial: string
  ruta: string | null
  idPersonal: number | null
  vendedor: string | null
  localidad: string | null
  ultimaCompra: string | null
  excluido: boolean
  motivo: string | null
  excluidoPor: string | null
  excluidoEn: string | null
  /**
   * Un estado por cada mes de `PaginaClientesAdmin.meses`, con la cartera de toda la empresa y sin mirar exclusiones
   * (un excluido igual muestra cómo viene). `fueraDeCartera` = ese mes no estaba en ninguna ruta.
   */
  estados: EstadoMes[]
  /** null = nunca compró. */
  diasSinComprar: number | null
  /** Solo para los no excluidos; el motivo viene redactado («No compra hace 4 meses»). */
  sugerencia: SugerenciaCliente | null
  motivoSugerencia: string | null
  /** Clasificación (30/10): el admin lo marcó como Vital. Por ahora es solo una marca: no cambia ningún cálculo. */
  vital: boolean
  vitalPor: string | null
  vitalEn: string | null
}

/** `PUT /api/admin/clientes/{id}/vital`: la marca (si ya era Vital, la que tenía). */
export interface MarcaVital {
  idCliente: number
  razonSocial: string
  marcadoPor: string
  marcadoEn: string
}

export interface Pagina<T> {
  pagina: number
  tamano: number
  total: number
  filas: T[]
}

/**
 * `GET /api/admin/clientes?…&sugerencia=excluir|revisar`: la página más los meses de `estados` (los mismos 4 de
 * `/cobertura`).
 */
export interface PaginaClientesAdmin extends Pagina<ClienteAdmin> {
  meses: string[]
}

export interface Exclusion {
  idCliente: number
  razonSocial: string
  motivo: string
  creadoPor: string
  creadoEn: string
}

export interface PasoSincronizacion {
  idCorrida: string
  inicio: string
  fin: string | null
  endpoint: string
  desde: string | null
  hasta: string | null
  registros: number
  ok: boolean
  error: string | null
}

/** `GET /api/admin/sincronizaciones?cantidad=30`; `POST` → 202 `{ solicitadoEn }` o 409 si ya hay una pedida. */
export interface Sincronizaciones {
  pendiente: { solicitadoPor: string; solicitadoEn: string } | null
  /** Del más nuevo al más viejo. */
  pasos: PasoSincronizacion[]
}
