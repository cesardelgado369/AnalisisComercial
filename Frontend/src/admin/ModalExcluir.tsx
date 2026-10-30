import { useState, type FormEvent } from 'react'
import { avisarCambio } from '../api/cambios'
import { ApiError, api } from '../api/client'
import type { ClienteAdmin, Exclusion } from '../api/types'
import { Modal } from '../components/Modal'

export interface CambioExclusion {
  tipo: 'excluir' | 'incluir'
  cliente: ClienteAdmin
}

const SUGERENCIAS = ['Cliente de prueba', 'Cerró el local', 'Cuenta interna de Madomi', 'Duplicado en Chess']
const MAXIMO = 200

/**
 * Excluir a un cliente (con su motivo, obligatorio: queda a la vista de todos) o volver a incluirlo. Excluido, no cuenta
 * en ninguna cartera ni en los porcentajes de Cobertura.
 */
export function ModalExcluir({ cambio, onCerrar, onHecho }: { cambio: CambioExclusion; onCerrar: () => void; onHecho: (c: ClienteAdmin) => void }) {
  const { tipo, cliente } = cambio
  // Si el backend sugiere excluirlo, su motivo («No compra hace 4 meses») viene cargado: se puede cambiar
  const [motivo, setMotivo] = useState(() => (cliente.sugerencia === 'excluir' ? (cliente.motivoSugerencia ?? '') : ''))
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  async function confirmar(e: FormEvent) {
    e.preventDefault()
    if (tipo === 'excluir' && !motivo.trim()) {
      setError('Escribí por qué se excluye.')
      return
    }
    setGuardando(true)
    setError(null)
    try {
      if (tipo === 'excluir') {
        const ex = await api.post<Exclusion>('/admin/exclusiones', { idCliente: cliente.idCliente, motivo: motivo.trim() })
        onHecho({ ...cliente, excluido: true, motivo: ex.motivo, excluidoPor: ex.creadoPor, excluidoEn: ex.creadoEn })
      } else {
        await api.borrar(`/admin/exclusiones/${cliente.idCliente}`)
        onHecho({ ...cliente, excluido: false, motivo: null, excluidoPor: null, excluidoEn: null })
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.mensajes.join(' ') : 'No se pudo guardar. Probá de nuevo.')
      // «Ya está excluido» (400) o «no estaba excluido» (404): otro lo cambió; se vuelve a leer para ver cómo quedó
      if (err instanceof ApiError && (err.status === 404 || err.status === 400)) avisarCambio()
    } finally {
      setGuardando(false)
    }
  }

  const excluir = tipo === 'excluir'
  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo={excluir ? '¿Excluir a este cliente?' : '¿Volver a incluir a este cliente?'}
      subtitulo={`${cliente.razonSocial} · ${cliente.idCliente}`}
      tamano="chico"
      cerrable={!guardando}
      pie={
        <>
          <button type="button" className="btn" onClick={onCerrar} disabled={guardando}>Cancelar</button>
          <button type="submit" form="form-exclusion" className="btn btn-primario" disabled={guardando}>
            {guardando ? 'Guardando…' : excluir ? 'Excluir' : 'Volver a incluir'}
          </button>
        </>
      }
    >
      <form id="form-exclusion" className="adm-form" onSubmit={(e) => void confirmar(e)} noValidate>
        <p>
          {excluir
            ? 'Deja de contar en todas las carteras y en los porcentajes de Cobertura, para todos los vendedores.'
            : `Vuelve a contar en las carteras desde ahora.${cliente.motivo ? ` Estaba excluido por: «${cliente.motivo}».` : ''}`}
        </p>
        {excluir && (
          <div className="adm-campo">
            <label>
              Motivo
              <input type="text" value={motivo} maxLength={MAXIMO} onChange={(e) => setMotivo(e.target.value)} aria-invalid={!!error} data-autofocus />
            </label>
            <div className="adm-sugerencias" role="group" aria-label="Motivos frecuentes">
              {SUGERENCIAS.map((s) => (
                <button key={s} type="button" className="adm-sugerencia" onClick={() => setMotivo(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {error && (
          <p className="aviso-fila" role="alert">
            <span className="icono icono-chico" aria-hidden>error</span>
            {error}
          </p>
        )}
      </form>
    </Modal>
  )
}
