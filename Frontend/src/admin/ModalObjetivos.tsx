import { useState, type FormEvent } from 'react'
import { avisarCambio } from '../api/cambios'
import { ApiError, api } from '../api/client'
import type { CoberturaFoco, Foco, FocoAnalizado } from '../api/types'
import { useSesionApp } from '../auth/SesionApp'
import { nombrePropio } from '../cobertura/estados'
import { Modal } from '../components/Modal'
import { formatoEntero, nombreMes } from '../utils/formato'
import { ETIQUETA_MEDIDA } from './medidas'

const MAXIMO = 10_000
/** Los VOL también traen la cartera y los clientes con compra de cada vendedor (CONTRATO_API.md, «vienen igual»). */
const clientesDe = (v: object | undefined) => (v ?? {}) as Partial<Pick<CoberturaFoco, 'clientesCartera' | 'clientesConCompra'>>

/**
 * Los **objetivos** de un foco (Cesar, 12/11: «que Checho le ponga un objetivo de clientes a cada uno de los empleados,
 * por ejemplo que le hagan 80 en total comprar el dulce de leche»). Un renglón por vendedor con su cartera y cuántos
 * compraron hasta ahora (del análisis del mes, si ya empezó) y el objetivo en clientes; vacío = sin objetivo. Guarda
 * todos juntos (`PUT /api/admin/focos/{id}/objetivos`). Los vendedores lo ven en la sección Focos.
 */
export function ModalObjetivos(props: {
  foco: Foco
  /** El foco en el análisis del mes (cartera y compras de cada vendedor); null en un mes que no empezó. */
  analizado: FocoAnalizado | null
  onCerrar: () => void
  onGuardado: (texto: string) => void
}) {
  const { foco, analizado, onCerrar, onGuardado } = props
  const sesion = useSesionApp()
  // Los vendedores con cartera ese mes (el análisis); si el mes no empezó, los de la sesión sin la casa
  const vendedores = analizado
    ? analizado.vendedores.map((v) => ({ id: v.idPersonal, nombre: v.nombre, cartera: clientesDe(v).clientesCartera ?? null }))
    : sesion.vendedores.filter((v) => !v.esCasa).map((v) => ({ id: v.id, nombre: v.nombre, cartera: null }))
  const [valores, setValores] = useState<Record<number, string>>(() =>
    Object.fromEntries((foco.objetivos ?? []).map((o) => [o.idPersonal, String(o.clientes)])),
  )
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const yaCompraron = (id: number) => foco.objetivos?.find((o) => o.idPersonal === id)?.clientesConCompra ?? clientesDe(analizado?.vendedores.find((v) => v.idPersonal === id)).clientesConCompra ?? null

  const numero = (texto: string | undefined) => (texto?.trim() ? Number(texto.replace(/\./g, '')) : null)
  const total = vendedores.reduce((s, v) => s + (numero(valores[v.id]) ?? 0), 0)

  async function guardar(e: FormEvent) {
    e.preventDefault()
    if (guardando) return
    const objetivos: { idPersonal: number; clientes: number }[] = []
    for (const v of vendedores) {
      const n = numero(valores[v.id])
      if (n === null) continue
      if (!Number.isInteger(n) || n < 1 || n > MAXIMO) {
        setError(`El objetivo de ${nombrePropio(v.nombre)} tiene que ser un número entero de 1 a ${formatoEntero(MAXIMO)} clientes. Para sacarlo, dejalo vacío.`)
        document.querySelector<HTMLInputElement>(`#form-objetivos [data-vendedor="${v.id}"]`)?.focus()
        return
      }
      objetivos.push({ idPersonal: v.id, clientes: n })
    }
    setError(null)
    setGuardando(true)
    try {
      await api.put<Foco>(`/admin/focos/${foco.idFoco}/objetivos`, { objetivos })
      avisarCambio()
      onGuardado(
        objetivos.length
          ? `${foco.nombre}: objetivos guardados (${formatoEntero(total)} ${total === 1 ? 'cliente' : 'clientes'} entre ${objetivos.length} ${objetivos.length === 1 ? 'vendedor' : 'vendedores'}).`
          : `${foco.nombre}: sin objetivos.`,
      )
    } catch (err) {
      setError(err instanceof ApiError ? err.mensajes.join(' ') : 'No se pudieron guardar los objetivos. Probá de nuevo.')
      if (err instanceof ApiError && err.status === 404) avisarCambio()
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo="Objetivos"
      subtitulo={`${ETIQUETA_MEDIDA[foco.medida]} - ${foco.nombre} · ${nombreMes(foco.mes)}`}
      cerrable={!guardando}
      pie={
        <>
          {error && (
            <p className="aviso-fila adm-error-general" role="alert">
              <span className="icono icono-chico" aria-hidden>error</span>
              {error}
            </p>
          )}
          <button type="button" className="btn" onClick={onCerrar} disabled={guardando}>Cancelar</button>
          <button type="submit" form="form-objetivos" className="btn btn-primario" disabled={guardando}>
            {guardando ? 'Guardando…' : 'Guardar objetivos'}
          </button>
        </>
      }
    >
      <form id="form-objetivos" className="adm-form objetivos-form" onSubmit={(e) => void guardar(e)} noValidate autoComplete="off">
        <p className="objetivos-explicacion">
          Cuántos clientes de su cartera tienen que comprar algún artículo de <strong>{foco.nombre}</strong> en {nombreMes(foco.mes)}. Vacío, sin
          objetivo.
        </p>
        <ul className="objetivos-lista">
          {vendedores.map((v) => {
            const compraron = yaCompraron(v.id)
            return (
              <li key={v.id} className="objetivos-fila">
                <label htmlFor={`objetivo-${v.id}`} className="objetivos-vendedor">
                  <strong>{nombrePropio(v.nombre)}</strong>
                  <span className="objetivos-dato">
                    {v.cartera !== null ? `${formatoEntero(v.cartera)} clientes en su cartera` : 'Sin ventas todavía'}
                    {compraron !== null && v.cartera !== null && ` · ya compraron ${formatoEntero(compraron)}`}
                  </span>
                </label>
                <span className="objetivos-entrada">
                  <input
                    id={`objetivo-${v.id}`}
                    data-vendedor={v.id}
                    type="text"
                    inputMode="numeric"
                    placeholder="Sin objetivo"
                    value={valores[v.id] ?? ''}
                    onChange={(e) => setValores((x) => ({ ...x, [v.id]: e.target.value.replace(/[^\d.]/g, '') }))}
                  />
                  clientes
                </span>
              </li>
            )
          })}
        </ul>
        <p className="objetivos-total">
          Entre todos: <strong>{formatoEntero(total)} {total === 1 ? 'cliente' : 'clientes'}</strong>
        </p>
      </form>
    </Modal>
  )
}
