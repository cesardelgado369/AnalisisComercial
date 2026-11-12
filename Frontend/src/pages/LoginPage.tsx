import { useState, type FormEvent, type KeyboardEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { ApiError } from '../api/client'
import { emailRecordado, recordarEmail } from '../api/sesion'
import { avisoPase, useAuth } from '../auth/AuthContext'
import { LogoApp } from '../images/LogoApp'
import '../animations/ola.css'
import { PanelLogin } from './PanelLogin'
import './login.css'

/**
 * Login de Análisis Comercial: el de De Ruta y Mantenimiento (formulario a la izquierda, botón con la ola, Recordarme,
 * aviso de Bloq Mayús), contra el login central. Acepta email o nombre de usuario (la cuenta de administrador general
 * es `admin`). A la derecha, en vez de fotos, el panel violeta con la lupa (`LoadingAnalisis` en modo «una vez»).
 */
export function LoginPage() {
  const { usuario, ingresar } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const destino = (location.state as { desde?: string } | null)?.desde ?? '/'

  const [email, setEmail] = useState(emailRecordado)
  const [password, setPassword] = useState('')
  const [recordar, setRecordar] = useState(() => !!emailRecordado())
  const [verPassword, setVerPassword] = useState(false)
  const [mayusculas, setMayusculas] = useState(false)
  const [olvido, setOlvido] = useState(false)
  // Si se llegó con un pase de otra aplicación que no sirvió, se dice por qué
  const [errores, setErrores] = useState<string[]>(() => (avisoPase() ? [avisoPase()!] : []))
  const [enviando, setEnviando] = useState(false)

  if (usuario) return <Navigate to={destino} replace />

  async function enviar(e: FormEvent) {
    e.preventDefault()
    if (!email.trim() || !password) {
      setErrores(['Completá el usuario y la contraseña.'])
      return
    }
    setEnviando(true)
    setErrores([])
    try {
      await ingresar(email.trim(), password, recordar)
      recordarEmail(recordar ? email.trim() : null)
      navigate(destino, { replace: true })
    } catch (err) {
      setErrores(err instanceof ApiError ? err.mensajes : ['No se pudo conectar con el servidor. Probá de nuevo en un momento.'])
    } finally {
      setEnviando(false)
    }
  }

  const teclaPassword = (e: KeyboardEvent<HTMLInputElement>) => setMayusculas(e.getModifierState('CapsLock'))

  return (
    <div className="login">
      <main className="login-panel">
        <div className="login-contenido">
          <LogoApp oscuro className="login-logo" />

          <header className="login-titulos">
            <h1>Iniciar sesión</h1>
          </header>

          <form className="login-form" onSubmit={enviar} noValidate>
            <label className="login-campo">
              Usuario o email
              <input
                type="text"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="nombre@empresa.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoFocus={!email}
                aria-invalid={errores.length > 0}
              />
            </label>

            <label className="login-campo">
              Contraseña
              <span className="login-password">
                <input
                  type={verPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyUp={teclaPassword}
                  onKeyDown={teclaPassword}
                  onBlur={() => setMayusculas(false)}
                  autoFocus={!!email}
                  aria-invalid={errores.length > 0}
                />
                <button
                  type="button"
                  className="login-ver"
                  aria-label={verPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  title={verPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  onClick={() => setVerPassword((v) => !v)}
                >
                  <span className="icono icono-chico">{verPassword ? 'visibility_off' : 'visibility'}</span>
                </button>
              </span>
              {mayusculas && (
                <span className="aviso-fila login-mayus">
                  <span className="icono icono-chico" aria-hidden>keyboard_capslock</span>
                  Bloq Mayús está activado
                </span>
              )}
            </label>

            <div className="login-opciones">
              <label className="check-linea">
                <input type="checkbox" checked={recordar} onChange={(e) => setRecordar(e.target.checked)} />
                Recordarme
              </label>
              <button type="button" className="btn-texto login-olvido" aria-expanded={olvido} onClick={() => setOlvido((v) => !v)}>
                ¿Olvidaste tu contraseña?
              </button>
            </div>
            {olvido && (
              // TODO: recuperación por email cuando la plataforma la tenga. Hoy la restablece un administrador.
              <p className="login-nota">
                Pedile a un administrador de tu empresa que te genere una contraseña nueva. Después podés cambiarla desde «Mi perfil».
              </p>
            )}

            {errores.length > 0 && (
              <p className="aviso-fila login-error" role="alert">
                <span className="icono icono-chico" aria-hidden>error</span>
                {errores.join(' ')}
              </p>
            )}

            <button className={enviando ? 'login-boton ola lleno' : 'login-boton ola'} type="submit" disabled={enviando}>
              <span>{enviando ? 'Ingresando…' : 'Ingresar'}</span>
            </button>
          </form>
        </div>

        <footer className="login-pie">© {new Date().getFullYear()} Vignoli Consultora</footer>
      </main>

      <PanelLogin />
    </div>
  )
}
