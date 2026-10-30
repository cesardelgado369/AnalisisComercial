import { useState, type FormEvent } from 'react'
import { ApiError, auth } from '../api/client'
import type { LoginResponse } from '../api/types'
import { Modal } from '../components/Modal'

const ID_FORM = 'form-contrasena'
const MINIMO = 8

/**
 * Cambio de contraseña: pide la actual; las reglas de la nueva las valida el backend (acá solo se avisa antes de mandar).
 * El backend cierra todas las sesiones del usuario y devuelve tokens nuevos para esta: `onCambiada` los guarda.
 */
export function ModalContrasena(props: { onCerrar: () => void; onCambiada: (sesion: LoginResponse) => void }) {
  const { onCerrar, onCambiada } = props
  const [actual, setActual] = useState('')
  const [nueva, setNueva] = useState('')
  const [repetida, setRepetida] = useState('')
  const [ver, setVer] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [errores, setErrores] = useState<Record<string, string[]>>({})
  const [errorGeneral, setErrorGeneral] = useState<string[]>([])

  const noCoinciden = repetida.length > 0 && repetida !== nueva
  const listo = actual && nueva.length >= MINIMO && repetida === nueva

  async function guardar(e: FormEvent) {
    e.preventDefault()
    if (!listo) return
    setEnviando(true)
    setErrores({})
    setErrorGeneral([])
    try {
      onCambiada(await auth.post<LoginResponse>('/auth/cambiar-password', { passwordActual: actual, passwordNueva: nueva }))
      onCerrar()
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.errores).length) setErrores(err.errores)
      else setErrorGeneral(err instanceof ApiError ? err.mensajes : ['No se pudo cambiar la contraseña.'])
    } finally {
      setEnviando(false)
    }
  }

  const error = (campo: string) =>
    Object.entries(errores)
      .filter(([k]) => k.toLowerCase() === campo.toLowerCase())
      .flatMap(([, m]) => m)
      .map((m) => <span key={m} className="campo-error">{m}</span>)

  const tipo = ver ? 'text' : 'password'

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      cerrable={!enviando}
      titulo="Cambiar contraseña"
      tamano="chico"
      pie={
        <>
          <button type="button" className="btn" disabled={enviando} onClick={onCerrar}>Cancelar</button>
          <button type="submit" form={ID_FORM} className="btn btn-primario" disabled={enviando || !listo}>
            {enviando ? 'Cambiando…' : 'Cambiar contraseña'}
          </button>
        </>
      }
    >
      <form id={ID_FORM} className="form-perfil" onSubmit={guardar} noValidate>
        <label className="campo">
          Contraseña actual
          <input type={tipo} value={actual} onChange={(e) => setActual(e.target.value)} autoComplete="current-password" data-autofocus />
          {error('passwordActual')}
        </label>
        <label className="campo">
          Contraseña nueva
          <input type={tipo} value={nueva} onChange={(e) => setNueva(e.target.value)} autoComplete="new-password" />
          <span className="campo-ayuda">Al menos {MINIMO} caracteres.</span>
          {error('passwordNueva')}
        </label>
        <label className="campo">
          Repetir la contraseña nueva
          <input type={tipo} value={repetida} onChange={(e) => setRepetida(e.target.value)} autoComplete="new-password" />
          {noCoinciden && <span className="campo-error">No coincide con la nueva.</span>}
        </label>
        <label className="check-linea">
          <input type="checkbox" checked={ver} onChange={(e) => setVer(e.target.checked)} />
          Mostrar contraseñas
        </label>
        {errorGeneral.length > 0 && (
          <div className="aviso aviso-error" role="alert">
            {errorGeneral.map((m) => <div key={m}>{m}</div>)}
          </div>
        )}
      </form>
    </Modal>
  )
}
