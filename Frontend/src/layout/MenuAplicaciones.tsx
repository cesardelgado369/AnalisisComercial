import { useEffect, useRef, useState } from 'react'
import { ApiError, irAOtraAplicacion } from '../api/client'
import type { AplicacionPlataforma } from '../api/types'
import { ESTA_APP, useAuth } from '../auth/AuthContext'
import { LogoApp } from '../images/LogoApp'
import './menu-aplicaciones.css'

/** Ícono de cada aplicación de Vignoli (Material Symbols); las que no están acá usan `apps`. */
const ICONOS: Record<string, string> = {
  'logistica-rutas': 'alt_route',
  mantenimiento: 'handyman',
  cashflow: 'account_balance_wallet',
  'analisis-comercial': 'query_stats',
}

/** Destino del pase que es el portal (no es una aplicación). */
const PORTAL = 'portal'

/**
 * Logo de Análisis Comercial en la cabecera (como el de De Ruta y Mantenimiento). **Solo para el Dueño** (y el
 * SuperAdmin; `usuario.cambiaDeAplicacion`, 12/11/2026), el logo abre, animado, el menú para saltar a las otras
 * aplicaciones de Vignoli que tiene (`usuario.aplicaciones`) y al portal. El salto pide un pase a la plataforma y la
 * otra aplicación abre su propia sesión con él, sin volver a loguearse. Para el resto, y con `soloLogo` (el vendedor en
 * el celular), es solo el logo.
 */
export function MenuAplicaciones({ soloLogo = false }: { soloLogo?: boolean }) {
  const { usuario } = useAuth()
  const [abierto, setAbierto] = useState(false)
  const [yendo, setYendo] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const caja = useRef<HTMLDivElement>(null)

  const aplicaciones: AplicacionPlataforma[] = usuario?.aplicaciones ?? []

  useEffect(() => {
    if (!abierto) return
    const afuera = (e: MouseEvent) => {
      if (!caja.current?.contains(e.target as Node)) setAbierto(false)
    }
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && setAbierto(false)
    document.addEventListener('mousedown', afuera)
    document.addEventListener('keydown', tecla)
    return () => {
      document.removeEventListener('mousedown', afuera)
      document.removeEventListener('keydown', tecla)
    }
  }, [abierto])

  const logo = <LogoApp className="logo-app" />
  if (soloLogo || !usuario?.cambiaDeAplicacion) return logo

  async function ir(destino: string) {
    if (destino === ESTA_APP || yendo) return
    setYendo(destino)
    setError(null)
    try {
      await irAOtraAplicacion(destino)
    } catch (e) {
      setYendo(null)
      setError(e instanceof ApiError ? e.mensajes.join(' ') : 'No se pudo abrir la otra aplicación. Probá de nuevo.')
    }
  }

  const otras = [
    ...aplicaciones.map((app) => ({
      codigo: app.codigo,
      nombre: app.nombre,
      icono: ICONOS[app.codigo] ?? 'apps',
      disponible: !!app.urlBase,
      detalle: !app.urlBase ? 'Todavía no disponible' : app.empresas.map((e) => e.nombre).join(' · '),
    })),
    { codigo: PORTAL, nombre: 'Portal de Vignoli', icono: 'home', disponible: true, detalle: 'Tableros y todas tus aplicaciones' },
  ]

  return (
    <div className="menu-apps" ref={caja}>
      <button
        type="button"
        className="menu-apps-boton"
        aria-haspopup="menu"
        aria-expanded={abierto}
        title="Cambiar de aplicación"
        onClick={() => setAbierto((v) => !v)}
      >
        {logo}
        <span className="icono icono-chico" aria-hidden>expand_more</span>
      </button>

      {abierto && (
        <div className="menu-apps-panel" role="menu" aria-label="Tus aplicaciones">
          <div className="menu-apps-titulo">Tus aplicaciones</div>
          {otras.map((app, i) => {
            const actual = app.codigo === ESTA_APP
            return (
              <button
                key={app.codigo}
                type="button"
                role="menuitem"
                className={actual ? 'menu-apps-item actual' : 'menu-apps-item'}
                style={{ animationDelay: `${60 + i * 50}ms` }}
                disabled={!actual && (!app.disponible || !!yendo)}
                aria-current={actual || undefined}
                onClick={() => void ir(app.codigo)}
              >
                <span className="menu-apps-icono" aria-hidden>
                  <span className="icono">{app.icono}</span>
                </span>
                <span className="menu-apps-texto">
                  <span className="menu-apps-nombre">{app.nombre}</span>
                  <span className="menu-apps-detalle">
                    {actual ? 'Estás acá' : yendo === app.codigo ? 'Abriendo…' : app.detalle}
                  </span>
                </span>
                {actual && <span className="icono icono-chico menu-apps-tilde" aria-hidden>check</span>}
              </button>
            )
          })}
          {error && (
            <p className="menu-apps-error" role="alert">
              <span className="icono icono-chico" aria-hidden>error</span>
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
