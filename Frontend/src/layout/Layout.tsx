import { Suspense, useEffect, useState } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { LoadingDefault } from '../components/loading/LoadingDefault'
import { precargar } from '../rutas'
import { useEnLinea } from '../utils/useEnLinea'
import { useMedia } from '../utils/useMedia'
import { Animacion } from '../animations/Animacion'
import '../animations/entrada.css'
import '../animations/ola.css'
import { tomarIngreso } from '../api/sesion'
import type { EstadoSincronizacion, Rol } from '../api/types'
import { useConsulta } from '../api/useConsulta'
import { useAuth } from '../auth/AuthContext'
import { NOMBRE_ROL, useSesionApp } from '../auth/SesionApp'
import { LogoEmpresa } from '../images/LogoEmpresa'
import { formatoInstante, horasDesde, iniciales } from '../utils/formato'
import { MenuAplicaciones } from './MenuAplicaciones'
import { PanelCabecera } from './PanelCabecera'

interface ItemMenu {
  ruta: string
  texto: string
  icono: string
  /** Quién lo ve (el rol lo da `GET /api/sesion`). */
  roles: Rol[]
  /** Solo con `sesion.veBultos` (hoy, el operario no ve Volumen ni Devoluciones). */
  conBultos?: boolean
  grupo: 'comercial' | 'admin' | 'prueba'
}

const TODOS: Rol[] = ['admin', 'supervisor', 'operario']

/** `npm run dev:mock`: el login y la sesión los responde mock/sesionPrueba.ts, no la plataforma ni la API. */
const MODO_PRUEBA = import.meta.env.MODE === 'mock'

/**
 * Secciones (CONTEXTO_FRONTEND.md y CONTRATO_API.md; fase 2 del 29/10): todos ven Cobertura, Volumen y Devoluciones;
 * el admin, Administración (el Tablero de supervisor y admin está oculto por ahora). Lo que cada uno ve adentro lo
 * filtra la API.
 */
export const MENU: ItemMenu[] = [
  { ruta: '/', texto: 'Cobertura', icono: 'groups', roles: TODOS, grupo: 'comercial' },
  { ruta: '/volumen', texto: 'Volumen', icono: 'inventory_2', roles: TODOS, grupo: 'comercial', conBultos: true },
  { ruta: '/devoluciones', texto: 'Devoluciones', icono: 'assignment_return', roles: TODOS, grupo: 'comercial', conBultos: true },
  // Mi ruta de hoy, oculta hasta que tenga pantalla (29/10). El Tablero, oculto por ahora (30/10, pedido de Cesar):
  // { ruta: '/resumen', texto: 'Tablero', icono: 'dashboard', roles: ['admin', 'supervisor'], grupo: 'comercial' },
  { ruta: '/admin/usuarios', texto: 'Gestión de cuentas', icono: 'manage_accounts', roles: ['admin'], grupo: 'admin' },
  { ruta: '/admin/exclusiones', texto: 'Clientes excluidos', icono: 'person_off', roles: ['admin'], grupo: 'admin' },
  { ruta: '/admin/clasificacion', texto: 'Clasificación de clientes', icono: 'star', roles: ['admin'], grupo: 'admin' },
  { ruta: '/admin/sincronizacion', texto: 'Sincronización con Chess', icono: 'sync', roles: ['admin'], grupo: 'admin' },
  // TODO testing: vitrina de los componentes genéricos (modales, cargas, la animación), solo en desarrollo
  ...(import.meta.env.DEV
    ? [{ ruta: '/vitrina', texto: 'Vitrina de componentes', icono: 'palette', roles: TODOS, grupo: 'prueba' as const }]
    : []),
]

const GRUPOS_MENU: { grupo: ItemMenu['grupo']; titulo: string }[] = [
  { grupo: 'comercial', titulo: 'Comercial' },
  { grupo: 'admin', titulo: 'Administración' },
  { grupo: 'prueba', titulo: 'Desarrollo' },
]

/** Igual a `--duracion-lateral` en index.css (el margen del contenido acompaña al lateral). */
const DURACION_LATERAL = 240

/** La de package.json, sin el «.0» del final («1.0.0» → «1.0»): para que digan qué versión tienen. */
const VERSION = ((import.meta.env.VITE_VERSION as string | undefined) ?? '').replace(/\.0$/, '')

const esAncho = () => typeof window === 'undefined' || window.innerWidth > 860

/** Más de 36 h sin una corrida OK de Chess: los números pueden estar viejos (CONTRATO_API.md). */
const HORAS_DATOS_VIEJOS = 36

/**
 * Cabecera y lateral de De Ruta en violeta: empresa | logo de la app (con el menú de aplicaciones), de cuándo son los
 * datos de Chess, chat, notificaciones, usuario y salir; lateral con las secciones según el rol. En el celular el
 * lateral se abre encima del contenido y se cierra al elegir o al tocar afuera.
 */
export function Layout() {
  const { usuario, salir } = useAuth()
  const { rol, veBultos } = useSesionApp()
  const [lateralVisible, setLateralVisible] = useState(esAncho)
  // Solo cuando se acaba de ingresar: la cabecera, el lateral y el contenido entran uno atrás del otro.
  const [entrada] = useState(tomarIngreso)
  const sincronizacion = useConsulta<EstadoSincronizacion>('/sincronizacion/estado', 'No se pudo leer la fecha de los datos.')
  const enLinea = useEnLinea()
  // El vendedor en el celular ve solo el logo de esta app: no salta a las otras (Cesar, 30/10)
  const celular = useMedia('(max-width: 767px)')
  // Con la app ya armada, las pantallas del rol se bajan en segundo plano (abrir la ficha en la calle no espera la red)
  useEffect(() => precargar(rol, veBultos), [rol, veBultos])

  const clases = ['app', lateralVisible ? 'menu-abierto' : 'colapsado', entrada && 'entrada'].filter(Boolean).join(' ')
  const nombre = usuario?.nombreCompleto || usuario?.email || ''
  const estadoSync = sincronizacion.datos
  const ultimaOk = estadoSync?.ultimaOk ?? null
  // Sin ninguna corrida OK (null) también se avisa: los números pueden estar incompletos
  const viejos = estadoSync !== null && (ultimaOk === null || horasDesde(ultimaOk) > HORAS_DATOS_VIEJOS)
  const cerrarEnCelular = () => !esAncho() && setLateralVisible(false)

  return (
    <div className={clases}>
      <header className="header entra-cabecera">
        <div className="header-izq">
          <button className="header-boton" aria-label="Mostrar u ocultar el menú" onClick={() => setLateralVisible((v) => !v)}>
            <span className="icono">menu</span>
          </button>
          <div className="logos">
            <LogoEmpresa />
            <span className="logos-separador" aria-hidden />
            <MenuAplicaciones soloLogo={celular && rol === 'operario'} />
          </div>
        </div>

        <div className="header-der">
          {estadoSync && (
            <span className={viejos ? 'header-datos viejos' : 'header-datos'}>
              <span className="icono icono-chico" aria-hidden>{viejos ? 'warning' : 'cloud_done'}</span>
              {viejos && <span className="sr-solo">Datos desactualizados: </span>}
              {ultimaOk ? `Datos de Chess al ${formatoInstante(ultimaOk)}` : 'Sin datos de Chess todavía'}
            </span>
          )}
          {MODO_PRUEBA && (
            <span className="header-prueba" title="npm run dev:mock: el login y la sesión son de prueba (no corre la plataforma ni la API)">
              <span className="icono icono-chico" aria-hidden>science</span>
              <span>Modo de prueba</span>
            </span>
          )}
          {/* En un celular angosto el chat no entra: el soporte queda para la PC */}
          <div className="header-chat">
            <PanelCabecera icono="chat" titulo="Chat">
              <div className="panel-vacio">
                <span className="icono">forum</span>
                <span>
                  Todavía no está disponible el servicio de Tickets. Chateá al teléfono de WhatsApp:{' '}
                  <a className="panel-enlace" href="https://wa.me/5493814639028" target="_blank" rel="noopener noreferrer">
                    +54 9 381 463-9028
                  </a>
                </span>
              </div>
            </PanelCabecera>
          </div>
          <PanelCabecera icono="notifications" titulo="Notificaciones">
            <div className="panel-vacio">
              <span className="icono">notifications_off</span>
              No tenés notificaciones.
            </div>
          </PanelCabecera>

          <span className="header-separador" aria-hidden />

          <div className="usuario">
            <Link to="/perfil" className="usuario-enlace" title="Mi perfil">
              <div className="usuario-texto">
                <div className="usuario-nombre">{nombre}</div>
                <div className="usuario-rol">{NOMBRE_ROL[rol]}</div>
              </div>
              <span className="usuario-avatar" aria-hidden>{iniciales(nombre)}</span>
            </Link>
            <button className="header-boton header-salir" title="Cerrar sesión" aria-label="Cerrar sesión" onClick={() => void salir()}>
              <span className="icono">logout</span>
            </button>
          </div>
        </div>
      </header>

      <Animacion as="aside" className="lateral entra-lateral" visible={lateralVisible} efecto="deslizar-izquierda" duracion={DURACION_LATERAL}>
        <nav className="menu">
          {GRUPOS_MENU.map(({ grupo, titulo }) => {
            const items = MENU.filter((m) => m.grupo === grupo && m.roles.includes(rol) && (!m.conBultos || veBultos))
            return (
              items.length > 0 && (
                <div key={grupo} className="menu-grupo">
                  <div className="etiqueta">{titulo}</div>
                  {items.map((m) => (
                    <NavLink
                      key={m.ruta}
                      to={m.ruta}
                      end={m.ruta === '/'}
                      className={({ isActive }) => (isActive ? 'activo' : 'ola')}
                      onClick={cerrarEnCelular}
                    >
                      <span className="icono">{m.icono}</span>
                      {m.texto}
                    </NavLink>
                  ))}
                </div>
              )
            )
          })}
        </nav>
        {/* En el celular, la cuenta y salir van acá: en la cabecera no entran junto al logo */}
        <div className="menu-grupo lateral-cuenta">
          <div className="etiqueta">{nombre}</div>
          <Link to="/perfil" className="lateral-cuenta-item" onClick={cerrarEnCelular}>
            <span className="icono">person</span>
            Mi perfil
          </Link>
          <button type="button" className="lateral-cuenta-item" onClick={() => void salir()}>
            <span className="icono">logout</span>
            Cerrar sesión
          </button>
        </div>
        <p className="lateral-version">Versión {VERSION}</p>
      </Animacion>
      <div className="lateral-velo" aria-hidden onClick={cerrarEnCelular} />

      <main className="contenido entra-contenido">
        {/* Datos viejos: franja propia debajo de la cabecera, también en el celular (CONTEXTO_FRONTEND §6) */}
        {viejos && (
          <p className="aviso-datos-viejos" role="status">
            <span className="icono icono-chico" aria-hidden>warning</span>
            <span>
              {ultimaOk
                ? `Hace más de 36 horas que no se actualizan los datos de Chess (última vez: ${formatoInstante(ultimaOk)}). Los números pueden estar desactualizados.`
                : 'Todavía no se completó ninguna actualización desde Chess: los números pueden estar incompletos.'}
            </span>
          </p>
        )}
        {!enLinea && (
          <p className="aviso-sin-conexion" role="status">
            <span className="icono icono-chico" aria-hidden>cloud_off</span>
            <span>Sin conexión. Lo que ves es lo último que se cargó; cuando vuelva la señal, tocá «Probar de nuevo» si algo no carga.</span>
          </p>
        )}
        {/* Las pantallas que no son Cobertura se bajan aparte (rutas.ts): mientras llegan, el círculo de carga */}
        <Suspense fallback={<LoadingDefault texto="Cargando…" />}>
          <Outlet />
        </Suspense>
      </main>
    </div>
  )
}
