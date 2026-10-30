import { useEffect, useRef, useState } from 'react'
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

/**
 * Logo de Análisis Comercial en la cabecera (como el de De Ruta y Mantenimiento). Si el usuario puede entrar a más de una
 * aplicación de Vignoli (`usuario.aplicaciones`, en cualquiera de sus empresas), el logo abre, animado, el menú
 * para saltar entre ellas; con una sola, es solo el logo. El salto navega a la `urlBase` de la otra aplicación y
 * allá se entra con la cookie de la plataforma, sin volver a loguearse. Con `soloLogo` (el vendedor en el celular),
 * es solo el logo: no se pasa a otra aplicación.
 */
export function MenuAplicaciones({ soloLogo = false }: { soloLogo?: boolean }) {
  const { usuario } = useAuth()
  const [abierto, setAbierto] = useState(false)
  const caja = useRef<HTMLDivElement>(null)

  const aplicaciones: AplicacionPlataforma[] =
    usuario?.aplicaciones ?? usuario?.modulos?.map((m) => ({ ...m, empresas: [] })) ?? []

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
  if (soloLogo || aplicaciones.length < 2) return logo

  function ir(app: AplicacionPlataforma) {
    if (app.codigo === ESTA_APP || !app.urlBase) return
    window.location.href = app.urlBase
  }

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
          {aplicaciones.map((app, i) => {
            const actual = app.codigo === ESTA_APP
            const disponible = actual || !!app.urlBase
            return (
              <button
                key={app.codigo}
                type="button"
                role="menuitem"
                className={actual ? 'menu-apps-item actual' : 'menu-apps-item'}
                style={{ animationDelay: `${60 + i * 50}ms` }}
                disabled={!disponible}
                aria-current={actual || undefined}
                onClick={() => ir(app)}
              >
                <span className="menu-apps-icono" aria-hidden>
                  <span className="icono">{ICONOS[app.codigo] ?? 'apps'}</span>
                </span>
                <span className="menu-apps-texto">
                  <span className="menu-apps-nombre">{app.nombre}</span>
                  <span className="menu-apps-detalle">
                    {actual
                      ? 'Estás acá'
                      : !app.urlBase
                        ? 'Todavía no disponible'
                        : app.empresas.map((e) => e.nombre).join(' · ')}
                  </span>
                </span>
                {actual && <span className="icono icono-chico menu-apps-tilde" aria-hidden>check</span>}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
