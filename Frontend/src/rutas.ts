import { lazy } from 'react'
import type { Rol } from './api/types'

/**
 * Las pantallas que no son la primera (Cobertura) se bajan aparte: el vendedor, en la calle y con datos móviles, carga
 * solo lo que usa. Después de entrar, cuando el teléfono está libre, se bajan en segundo plano las de su rol, así
 * abrir la ficha o Volumen no espera a la red.
 */
const cargas = {
  ficha: () => import('./ficha/FichaPage'),
  volumen: () => import('./volumen/VolumenPage'),
  devoluciones: () => import('./devoluciones/DevolucionesPage'),
  perfil: () => import('./perfil/PerfilPage'),
  tablero: () => import('./resumen/TableroPage'),
  cuentas: () => import('./admin/CuentasPage'),
  exclusiones: () => import('./admin/ClientesExcluidosPage'),
  clasificacion: () => import('./admin/ClasificacionClientesPage'),
  sincronizacion: () => import('./admin/SincronizacionPage'),
  focos: () => import('./admin/FocosPage'),
}

export const FichaPage = lazy(() => cargas.ficha().then((m) => ({ default: m.FichaPage })))
export const VolumenPage = lazy(() => cargas.volumen().then((m) => ({ default: m.VolumenPage })))
export const DevolucionesPage = lazy(() => cargas.devoluciones().then((m) => ({ default: m.DevolucionesPage })))
export const PerfilPage = lazy(() => cargas.perfil().then((m) => ({ default: m.PerfilPage })))
export const TableroPage = lazy(() => cargas.tablero().then((m) => ({ default: m.TableroPage })))
export const CuentasPage = lazy(() => cargas.cuentas().then((m) => ({ default: m.CuentasPage })))
export const ClientesExcluidosPage = lazy(() => cargas.exclusiones().then((m) => ({ default: m.ClientesExcluidosPage })))
export const ClasificacionClientesPage = lazy(() => cargas.clasificacion().then((m) => ({ default: m.ClasificacionClientesPage })))
export const SincronizacionPage = lazy(() => cargas.sincronizacion().then((m) => ({ default: m.SincronizacionPage })))
export const FocosPage = lazy(() => cargas.focos().then((m) => ({ default: m.FocosPage })))

const DE_TODOS = [cargas.ficha, cargas.volumen, cargas.devoluciones]
/** Las que no se adelantan sin `sesion.veBultos` (no las va a abrir). */
const CON_BULTOS: unknown[] = [cargas.volumen, cargas.devoluciones]
const POR_ROL: Record<Rol, (() => Promise<unknown>)[]> = {
  operario: DE_TODOS,
  // El Tablero está oculto por ahora (30/10): no se adelanta
  supervisor: DE_TODOS,
  admin: [...DE_TODOS, cargas.cuentas, cargas.exclusiones, cargas.clasificacion, cargas.focos, cargas.sincronizacion],
}

/**
 * Baja en segundo plano las pantallas del rol, una por vez y cuando el navegador está libre. Con «ahorro de datos»
 * activado en el teléfono no se adelanta nada (se bajan recién al abrirlas).
 */
export function precargar(rol: Rol, veBultos: boolean) {
  const conexion = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection
  if (conexion?.saveData) return
  // Safari no tiene requestIdleCallback: ahí, un rato después
  const libre = (fn: () => void) =>
    typeof window.requestIdleCallback === 'function' ? window.requestIdleCallback(fn, { timeout: 5000 }) : setTimeout(fn, 1500)
  const pendientes = POR_ROL[rol].filter((c) => veBultos || !CON_BULTOS.includes(c))
  const siguiente = () => {
    const carga = pendientes.shift()
    if (carga) libre(() => void carga().catch(() => undefined).then(siguiente))
  }
  siguiente()
}
