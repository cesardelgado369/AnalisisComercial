/**
 * TODO testing — plugin de Vite para `npm run dev:mock`: responde el login de la plataforma (`/plataforma/api/auth/*`)
 * y la API de Análisis Comercial (`/api/*`) con datos de prueba (`datosCobertura.ts`), así el front se usa sin ningún
 * backend. Sigue CONTRATO_API.md pero no es la lógica oficial. Solo existe en desarrollo (no entra al build). Se borra
 * cuando estén la API (5030) y la plataforma.
 *
 * El rol sale del usuario que se escribe (cualquier contraseña): con «vendedores» entra como un operario con dos
 * vendedores de Chess (Nicolás Córdoba y Mateo Rojas: la unión de carteras); con «vendedor», como operario (Nicolás
 * Córdoba); con «supervisor», como supervisor (Franco y Mauricio); con «sinacceso», sin acceso a la app; con cualquier
 * otro, como admin (Checho).
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'
import * as admi from './datosAdmin.ts'
import { ErrorMock, UNIDADES, ayerArgentina, cobertura, hoyArgentina, vendedoresVisibles, type RolPrueba } from './datosCobertura.ts'
import { ficha, fichaDevoluciones, fichaVolumen } from './datosFicha.ts'
import * as sinc from './datosSincronizacion.ts'
import { devoluciones, volumen } from './datosVolumen.ts'

const APP = { codigo: 'analisis-comercial', nombre: 'Análisis Comercial', urlBase: 'http://localhost:5177' }
const MADOMI = { slug: 'madomi', nombre: 'Madomi Pastas' }

function rolDe(email: string): RolPrueba | null {
  if (/sinacceso/i.test(email)) return null
  if (/vendedor/i.test(email)) return 'operario'
  if (/supervisor/i.test(email)) return 'supervisor'
  return 'admin'
}

/** Los vendedores de Chess del operario de prueba: con «vendedores», dos (para probar la unión). */
const vendedoresDelOperario = (email: string) => (/vendedores/i.test(email) ? [1, 4] : [1])

function sesion(email: string) {
  const rol = rolDe(email)
  return {
    accessToken: `token-de-prueba:${email}`,
    refreshToken: `refresh-de-prueba:${email}`,
    expiraEn: new Date(Date.now() + 30 * 60_000).toISOString(),
    usuario: {
      id: '00000000-0000-4000-8000-0000000000a1',
      email,
      nombreCompleto:
        rol === 'operario'
          ? vendedoresDelOperario(email).length > 1
            ? 'Nicolás Córdoba (dos vendedores)'
            : 'Nicolás Córdoba'
          : rol === 'supervisor'
            ? 'Supervisor PRUEBA'
            : rol
              ? 'Checho'
              : 'Sin acceso PRUEBA',
      esSuperAdmin: false,
      tenantId: 'A1B2C3D4-0000-4000-8000-000000000001',
      roles: rol === 'admin' ? ['Administrador'] : [],
      permisos: rol === 'admin' ? ['analisis-comercial.ver', 'analisis-comercial.admin'] : ['analisis-comercial.ver'],
      empresa: MADOMI.nombre,
      empresas: [{ id: 'A1B2C3D4-0000-4000-8000-000000000001', nombre: MADOMI.nombre, slug: MADOMI.slug, esPrincipal: true }],
      modulos: [APP],
      aplicaciones: [
        { ...APP, empresas: [MADOMI] },
        { codigo: 'logistica-rutas', nombre: 'De Ruta', urlBase: 'http://localhost:5173', empresas: [MADOMI] },
      ],
    },
  }
}

/** `GET /api/sesion` (CONTRATO_API.md): el operario con varios vendedores va con `vendedor: null` y todos en `vendedores`. */
function sesionApp(email: string, rol: RolPrueba) {
  const vendedores = vendedoresVisibles(rol, vendedoresDelOperario(email))
  const vendedor = rol === 'operario' && vendedores.length === 1 ? { idPersonal: vendedores[0].id, nombre: vendedores[0].nombre } : null
  const hoy = hoyArgentina()
  // Como la API de la 1.2 (Comercial:OperarioSoloCobertura): el operario, solo Cobertura y la ficha
  return { email, rol, vendedor, vendedores, hoy, mesEnCurso: `${hoy.slice(0, 7)}-01`, veBultos: rol !== 'operario' }
}

function responder(res: ServerResponse, estado: number, cuerpo?: unknown) {
  res.statusCode = estado
  if (cuerpo === undefined) return res.end()
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(cuerpo))
}

async function leerCuerpo(req: IncomingMessage): Promise<Record<string, unknown>> {
  let texto = ''
  for await (const parte of req) texto += parte
  try {
    return JSON.parse(texto || '{}') as Record<string, unknown>
  } catch {
    return {}
  }
}

/**
 * El email viaja dentro de los tokens de prueba: así el refresh, `/auth/me` y `/api/*` saben con qué rol se entró.
 * Sin un token de prueba no hay sesión (401, como en el contrato): nunca se cae por defecto en admin.
 */
const emailDe = (token: unknown) => (typeof token === 'string' && /^(token|refresh)-de-prueba:.+/.test(token) ? token.slice(token.indexOf(':') + 1) : null)
const emailDelEncabezado = (req: IncomingMessage) => emailDe(req.headers.authorization?.replace(/^Bearer /, ''))
const sinSesion = (res: ServerResponse) => responder(res, 401, { status: 401, title: 'Sin sesión.' })

/** Una demora chica, para ver los estados de carga como con la API real. */
const demora = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function api(ruta: string, p: URLSearchParams, req: IncomingMessage, res: ServerResponse) {
  const email = emailDelEncabezado(req)
  if (!email) return sinSesion(res)
  const rol = rolDe(email)
  if (!rol) return responder(res, 403, { status: 403, title: 'Todavía no tenés acceso a Análisis Comercial. Pedíselo al administrador.' })
  try {
    if (ruta === '/api/sesion') return responder(res, 200, sesionApp(email, rol))
    if (ruta === '/api/sincronizacion/estado') return responder(res, 200, sinc.estado(ayerArgentina()))
    if (ruta === '/api/cobertura/vendedores') return responder(res, 200, vendedoresVisibles(rol, vendedoresDelOperario(email)))
    if (ruta === '/api/cobertura/unidades') return responder(res, 200, UNIDADES)
    if (ruta === '/api/cobertura') {
      await demora(350)
      return responder(res, 200, cobertura(p, rol, vendedoresDelOperario(email)))
    }
    const cliente = ruta.match(/^\/api\/clientes\/(\d+)(\/volumen|\/devoluciones)?$/)
    // Sin veBultos (el operario), Volumen y Devoluciones y sus pestañas dan 403, como la API
    if (rol === 'operario' && (cliente?.[2] || ruta === '/api/volumen' || ruta === '/api/devoluciones'))
      return responder(res, 403, { status: 403, title: 'Volumen y Devoluciones todavía no están habilitados para los vendedores.' })
    if (cliente) {
      await demora(300)
      const armar = cliente[2] === '/volumen' ? fichaVolumen : cliente[2] === '/devoluciones' ? fichaDevoluciones : ficha
      return responder(res, 200, armar(Number(cliente[1]), p, rol, vendedoresDelOperario(email)))
    }
    if (ruta === '/api/volumen' || ruta === '/api/devoluciones') {
      await demora(350)
      return responder(res, 200, (ruta === '/api/volumen' ? volumen : devoluciones)(p, rol, vendedoresDelOperario(email)))
    }
    if (ruta.startsWith('/api/admin/')) return await admin(ruta, p, req, res, rol, email)
    return responder(res, 503, { status: 503, title: 'Esta parte de la API todavía no está en el modo de prueba.' })
  } catch (e) {
    if (e instanceof ErrorMock) return responder(res, e.status, { status: e.status, title: e.message, errors: e.errors })
    throw e
  }
}

/** Administración (solo admin): cuentas, accesos, vendedores de Chess y clientes por vendedor con sus exclusiones. */
async function admin(ruta: string, p: URLSearchParams, req: IncomingMessage, res: ServerResponse, rol: string, email: string) {
  if (rol !== 'admin') return responder(res, 403, { status: 403, title: 'Solo un administrador puede ver esto.' })
  await demora(250)
  const metodo = req.method ?? 'GET'
  const acceso = ruta.match(/^\/api\/admin\/usuarios\/(\d+)$/)
  const exclusion = ruta.match(/^\/api\/admin\/exclusiones\/(\d+)$/)
  const vital = ruta.match(/^\/api\/admin\/clientes\/(\d+)\/vital$/)
  // Con «sincuentas» en el usuario, /admin/cuentas responde 404 sin cuerpo, como la API real de hoy (sin ese endpoint)
  if (ruta.startsWith('/api/admin/cuentas') && /sincuentas/i.test(email)) return responder(res, 404)
  if (metodo === 'GET' && ruta === '/api/admin/cuentas') return responder(res, 200, admi.listarCuentas())
  if (metodo === 'GET' && ruta === '/api/admin/usuarios') return responder(res, 200, admi.listarAccesos())
  // TODO testing: simula que otra persona guardó el acceso (para ver el 409 en la pantalla)
  const tocar = ruta.match(/^\/api\/admin\/usuarios\/(\d+)\/tocar$/)
  if (metodo === 'POST' && tocar) {
    admi.tocarAcceso(Number(tocar[1]))
    return responder(res, 204)
  }
  if (metodo === 'POST' && ruta === '/api/admin/cuentas') return responder(res, 201, admi.crearCuenta(await leerCuerpo(req)))
  if (metodo === 'POST' && ruta === '/api/admin/usuarios') return responder(res, 201, admi.darAcceso(await leerCuerpo(req)))
  if (metodo === 'PUT' && acceso) return responder(res, 200, admi.editarAcceso(Number(acceso[1]), await leerCuerpo(req)))
  if (metodo === 'GET' && ruta === '/api/admin/vendedores') return responder(res, 200, admi.VENDEDORES_CHESS)
  if (metodo === 'GET' && ruta === '/api/admin/clientes/resumen') return responder(res, 200, admi.resumenClientes())
  if (metodo === 'GET' && ruta === '/api/admin/clientes') return responder(res, 200, admi.buscarClientes(p))
  if (metodo === 'POST' && ruta === '/api/admin/exclusiones') return responder(res, 201, admi.excluir(await leerCuerpo(req), email))
  if (metodo === 'DELETE' && exclusion) {
    admi.incluir(Number(exclusion[1]))
    return responder(res, 204)
  }
  if (metodo === 'GET' && ruta === '/api/admin/sincronizaciones') return responder(res, 200, sinc.listar(Number(p.get('cantidad')) || 30))
  if (metodo === 'POST' && ruta === '/api/admin/sincronizaciones') return responder(res, 202, sinc.pedir(email))
  if (metodo === 'PUT' && vital) return responder(res, 200, admi.marcarVital(Number(vital[1]), email))
  if (metodo === 'DELETE' && vital) {
    admi.quitarVital(Number(vital[1]))
    return responder(res, 204)
  }
  return responder(res, 503, { status: 503, title: 'Esta parte de la API todavía no está en el modo de prueba.' })
}

export function servidorPrueba(): Plugin {
  return {
    name: 'analisis-servidor-prueba',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (req, res, siguiente) => {
        const url = new URL(req.url ?? '/', 'http://localhost')
        const ruta = url.pathname
        if (ruta.startsWith('/api/')) return api(ruta, url.searchParams, req, res)
        if (!ruta.startsWith('/plataforma/api/auth/')) return siguiente()

        const accion = ruta.slice('/plataforma/api/auth/'.length)
        if (accion === 'login') {
          const { email } = await leerCuerpo(req)
          return responder(res, 200, sesion(String(email || 'checho@madomi.local')))
        }
        if (accion === 'refresh') {
          const email = emailDe((await leerCuerpo(req)).refreshToken)
          return email ? responder(res, 200, sesion(email)) : sinSesion(res)
        }
        if (accion === 'logout') return responder(res, 204)
        if (accion === 'me') {
          const email = emailDelEncabezado(req)
          return email ? responder(res, 200, { ...sesion(email).usuario, fechaAlta: '2026-10-26T12:00:00Z' }) : sinSesion(res)
        }
        return responder(res, 400, { title: 'No disponible en el modo de prueba.' })
      })
    },
  }
}
