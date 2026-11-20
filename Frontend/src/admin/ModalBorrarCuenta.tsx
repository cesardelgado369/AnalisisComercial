import { useState } from 'react'
import { ApiError, api } from '../api/client'
import type { CuentaMadomi } from '../api/types'
import { Modal } from '../components/Modal'

/**
 * Borrar una cuenta desde Gestión de cuentas (Checho, 19/11: «Nico Córdoba ya no trabaja con nosotros, necesito
 * eliminar cuenta»). Solo las que la API marca con `seBorra`. Con cuenta en la plataforma, `DELETE
 * /api/admin/cuentas/{idUsuario}`: la da de baja (no entra más y se le cierran las sesiones) y le saca el acceso. Un
 * acceso sin cuenta, `DELETE /api/admin/usuarios/{idAcceso}`. Sus clientes y ventas no se tocan.
 */
export function ModalBorrarCuenta(props: {
  cuenta: CuentaMadomi
  /** Se borra solo el acceso (no tiene cuenta en la plataforma, o la API todavía no lista cuentas). */
  soloAcceso: boolean
  onCerrar: () => void
  onBorrada: (texto: string) => void
}) {
  const { cuenta: c, soloAcceso, onCerrar, onBorrada } = props
  const quien = c.nombre ?? c.usuario
  const [borrando, setBorrando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function borrar() {
    if (borrando) return
    setBorrando(true)
    setError(null)
    try {
      await api.borrar(soloAcceso ? `/admin/usuarios/${c.idAcceso}` : `/admin/cuentas/${encodeURIComponent(c.idUsuario!)}`)
      onBorrada(
        soloAcceso
          ? `Listo: se borró el acceso de ${quien}.`
          : `Listo: se borró la cuenta de ${quien}. Ya no puede entrar a Análisis Comercial.`,
      )
    } catch (err) {
      setBorrando(false)
      // Ya no estaba (otro la borró): queda como borrada
      if (err instanceof ApiError && err.status === 404) {
        onBorrada(`La cuenta de ${quien} ya no estaba: se actualizó la lista.`)
        return
      }
      setError(err instanceof ApiError ? err.mensajes.join(' ') : 'No se pudo borrar. Revisá la conexión y probá de nuevo.')
    }
  }

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      cerrable={!borrando}
      titulo={soloAcceso ? 'Borrar el acceso' : 'Borrar la cuenta'}
      tamano="chico"
      pie={
        <>
          {error && (
            <p className="aviso-fila adm-error-general" role="alert">
              <span className="icono icono-chico" aria-hidden>error</span>
              {error}
            </p>
          )}
          <button type="button" className="btn" onClick={onCerrar} disabled={borrando} data-autofocus>
            Cancelar
          </button>
          <button type="button" className="btn foco-btn-borrar" onClick={() => void borrar()} disabled={borrando}>
            {borrando ? 'Borrando…' : soloAcceso ? 'Sí, borrar el acceso' : 'Sí, borrar la cuenta'}
          </button>
        </>
      }
    >
      {/* Solo la pregunta, sin subtítulo (Cesar, 20/11: «así nomás») */}
      <div className="adm-borrar-texto">
        <p>¿Desea eliminar a {quien}?</p>
      </div>
    </Modal>
  )
}
