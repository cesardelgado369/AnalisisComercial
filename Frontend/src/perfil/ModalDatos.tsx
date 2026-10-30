import { useState, type FormEvent } from 'react'
import { ApiError, auth } from '../api/client'
import type { Perfil } from '../api/types'
import { Modal } from '../components/Modal'

const ID_FORM = 'form-datos-perfil'

/** Nombre y email del usuario logueado (`PUT /auth/me`). Cambiar el email (con el que ingresa) pide la contraseña actual. */
export function ModalDatos(props: { perfil: Perfil; onCerrar: () => void; onGuardado: (p: Perfil) => void }) {
  const { perfil, onCerrar, onGuardado } = props
  const [nombre, setNombre] = useState(perfil.nombreCompleto)
  const [email, setEmail] = useState(perfil.email)
  const [passwordActual, setPasswordActual] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [errores, setErrores] = useState<Record<string, string[]>>({})
  const [errorGeneral, setErrorGeneral] = useState<string[]>([])

  const cambiaEmail = email.trim().toLowerCase() !== perfil.email.toLowerCase()

  async function guardar(e: FormEvent) {
    e.preventDefault()
    setEnviando(true)
    setErrores({})
    setErrorGeneral([])
    try {
      onGuardado(
        await auth.put<Perfil>('/auth/me', {
          nombreCompleto: nombre.trim(),
          email: email.trim(),
          passwordActual: cambiaEmail ? passwordActual : null,
        }),
      )
      onCerrar()
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) setErrores({ email: ['Ya hay un usuario con ese email.'] })
      else if (err instanceof ApiError && Object.keys(err.errores).length) setErrores(err.errores)
      else setErrorGeneral(err instanceof ApiError ? err.mensajes : ['No se pudieron guardar los datos.'])
    } finally {
      setEnviando(false)
    }
  }

  const error = (campo: string) =>
    Object.entries(errores)
      .filter(([k]) => k.toLowerCase() === campo.toLowerCase())
      .flatMap(([, m]) => m)
      .map((m) => <span key={m} className="campo-error">{m}</span>)

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      cerrable={!enviando}
      titulo="Datos personales"
      tamano="chico"
      pie={
        <>
          <button type="button" className="btn" disabled={enviando} onClick={onCerrar}>Cancelar</button>
          <button type="submit" form={ID_FORM} className="btn btn-primario" disabled={enviando || !nombre.trim() || !email.trim() || (cambiaEmail && !passwordActual)}>
            {enviando ? 'Guardando…' : 'Guardar'}
          </button>
        </>
      }
    >
      <form id={ID_FORM} className="form-perfil" onSubmit={guardar} noValidate>
        <label className="campo">
          Nombre y apellido
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={120} autoComplete="name" data-autofocus />
          {error('nombreCompleto')}
        </label>
        <label className="campo">
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={200} autoComplete="email" />
          {cambiaEmail && <span className="campo-ayuda">Desde ahora vas a ingresar con este email.</span>}
          {error('email')}
        </label>
        {cambiaEmail && (
          <label className="campo">
            Tu contraseña actual
            <input type="password" value={passwordActual} onChange={(e) => setPasswordActual(e.target.value)} autoComplete="current-password" />
            <span className="campo-ayuda">Para cambiar el email hace falta confirmar que sos vos.</span>
            {error('passwordActual')}
          </label>
        )}
        {errorGeneral.length > 0 && (
          <div className="aviso aviso-error" role="alert">
            {errorGeneral.map((m) => <div key={m}>{m}</div>)}
          </div>
        )}
      </form>
    </Modal>
  )
}
