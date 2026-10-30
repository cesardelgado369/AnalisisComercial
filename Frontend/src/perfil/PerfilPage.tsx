import { useEffect, useState } from 'react'
import { auth } from '../api/client'
import { emailRecordado, guardarSesion, leerSesion, recordarEmail } from '../api/sesion'
import type { LoginResponse, Perfil } from '../api/types'
import { useConsulta } from '../api/useConsulta'
import { useAuth } from '../auth/AuthContext'
import { fechaUtc, haceCuanto, iniciales } from '../utils/formato'
import { ModalContrasena } from './ModalContrasena'
import { ModalDatos } from './ModalDatos'
import './perfil.css'

const fechaLarga = new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })

/**
 * Mi perfil: datos del usuario logueado (`GET /auth/me`), cambio de nombre, email y contraseña.
 * Mientras llega se muestra lo que vino en el login.
 */
export function PerfilPage() {
  const { usuario, salir, actualizarUsuario } = useAuth()
  const consulta = useConsulta<Perfil>('/auth/me', 'No se pudo leer el perfil.', auth)
  const [perfil, setPerfil] = useState<Perfil | null>(null)
  const [modal, setModal] = useState<'datos' | 'contrasena' | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  useEffect(() => {
    if (consulta.datos) setPerfil(consulta.datos)
  }, [consulta.datos])

  const p: Perfil | null = perfil ?? usuario
  if (!p) return null
  const nombre = p.nombreCompleto || p.email

  async function datosGuardados(nuevo: Perfil) {
    const emailViejo = p?.email
    const cambioEmail = nuevo.email !== emailViejo
    setPerfil(nuevo)
    actualizarUsuario(nuevo)
    setAviso(cambioEmail ? 'Datos actualizados. Desde ahora ingresás con tu nuevo email.' : 'Datos actualizados.')
    if (!cambioEmail) return
    if (emailViejo && emailRecordado() === emailViejo) recordarEmail(nuevo.email)
    // El token sigue con el email viejo hasta renovarlo: se renueva ya (no hace falta volver a ingresar).
    const sesion = leerSesion()
    if (!sesion) return
    try {
      const renovada = await auth.post<LoginResponse>('/auth/refresh', { refreshToken: sesion.refreshToken })
      guardarSesion(renovada)
      actualizarUsuario({ ...nuevo, ...renovada.usuario })
    } catch {
      /* si falla, se renueva solo en el próximo 401 */
    }
  }

  function contrasenaCambiada(sesion: LoginResponse) {
    guardarSesion(sesion) // los tokens viejos ya no sirven
    actualizarUsuario(sesion.usuario)
    setAviso('Contraseña cambiada. Se cerraron tus sesiones en otras computadoras.')
  }

  return (
    <section className="perfil">
      <header className="perfil-cabecera">
        <span className="perfil-avatar" aria-hidden>{iniciales(nombre)}</span>
        <div>
          <h1>{nombre}</h1>
          <p className="apagado">
            {[p.email, p.roles.join(', '), p.empresa].filter(Boolean).join(' · ')}
          </p>
        </div>
      </header>

      {aviso && (
        <p className="perfil-aviso" role="status">
          <span className="icono icono-chico" aria-hidden>check</span>
          {aviso}
        </p>
      )}

      <section className="config-bloque">
        <header className="perfil-bloque-cabecera">
          <h2>Datos personales</h2>
          <button className="btn" onClick={() => setModal('datos')}>
            <span className="icono icono-chico" aria-hidden>edit</span>
            Editar
          </button>
        </header>
        <dl className="perfil-datos">
          <div>
            <dt>Nombre</dt>
            <dd>
              {p.nombreCompleto || <span className="apagado">Sin cargar</span>}
            </dd>
          </div>
          <div>
            <dt>Email</dt>
            <dd>
              {p.email}
              <span className="campo-ayuda">Es con el que ingresás.</span>
            </dd>
          </div>
          {p.fechaAlta && (
            <div>
              <dt>Usuario desde</dt>
              <dd>{fechaLarga.format(fechaUtc(p.fechaAlta))}</dd>
            </div>
          )}
          {p.ultimoIngreso && (
            <div>
              <dt>Último ingreso</dt>
              <dd>{haceCuanto(fechaUtc(p.ultimoIngreso))}</dd>
            </div>
          )}
        </dl>
      </section>

      <section className="config-bloque">
        <header>
          <h2>Seguridad</h2>
        </header>
        <div className="perfil-filas">
          <div className="perfil-fila">
            <div>
              <strong>Contraseña</strong>
              <div className="apagado">Para cambiarla te pide la actual.</div>
            </div>
            <button className="btn" onClick={() => setModal('contrasena')}>
              <span className="icono icono-chico" aria-hidden>key</span>
              Cambiar contraseña
            </button>
          </div>
          <div className="perfil-fila">
            <div>
              <strong>Sesión</strong>
              <div className="apagado">Cerrala si estás en una computadora compartida.</div>
            </div>
            <button className="btn" onClick={() => void salir()}>
              <span className="icono icono-chico" aria-hidden>logout</span>
              Cerrar sesión
            </button>
          </div>
        </div>
      </section>

      {modal === 'datos' && <ModalDatos perfil={p} onCerrar={() => setModal(null)} onGuardado={(n) => void datosGuardados(n)} />}
      {modal === 'contrasena' && (
        <ModalContrasena onCerrar={() => setModal(null)} onCambiada={contrasenaCambiada} />
      )}
    </section>
  )
}
