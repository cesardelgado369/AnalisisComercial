import { useEffect, useState, type FormEvent } from 'react'
import { avisarCambio } from '../api/cambios'
import { ApiError, api } from '../api/client'
import type { CoberturaFoco, Foco, FocoAnalizado } from '../api/types'
import { useSesionApp } from '../auth/SesionApp'
import { nombrePropio, sumarMes } from '../cobertura/estados'
import { Modal } from '../components/Modal'
import { formatoBultos, formatoEntero, nombreMes } from '../utils/formato'
import { ETIQUETA_MEDIDA } from './medidas'

const MAXIMO_CLIENTES = 10_000
const MAXIMO_BULTOS = 1_000_000
/** Los VOL también traen la cartera y los clientes con compra de cada vendedor (CONTRATO_API.md, «vienen igual»). */
const clientesDe = (v: object | undefined) => (v ?? {}) as Partial<Pick<CoberturaFoco, 'clientesCartera' | 'clientesConCompra'>>
/** «4.785,5» → 4785.5 (puntos de miles y coma decimal, como se escribe acá). */
const numero = (texto: string | undefined) => (texto?.trim() ? Number(texto.trim().replace(/\./g, '').replace(',', '.')) : null)

/**
 * Los **objetivos** de un foco, a mano (Cesar, 12/11: «que Checho le ponga un objetivo de clientes a cada uno de los
 * empleados»; 17/11: «que permita editar el objetivo manualmente»). Un renglón por vendedor:
 * - CCC: en clientes. Su cartera y cuántos compraron hasta ahora; vacío = sin objetivo.
 * - VOL: en bultos (17/11: «la idea es que supere el del mes anterior pero que también permita modificar»). De entrada,
 *   lo que vendió todo el mes anterior; vacío vuelve a eso.
 * Guarda todos juntos (`PUT /api/admin/focos/{id}/objetivos`). Los vendedores lo ven en la sección Focos y en su PDF.
 */
export function ModalObjetivos(props: {
  foco: Foco
  /** El foco en el análisis del mes (cartera y lo de cada vendedor); null en un mes que no empezó. */
  analizado: FocoAnalizado | null
  /** El vendedor en el que arranca (el elegido en la pantalla), resaltado. */
  enfocar?: number | null
  onCerrar: () => void
  onGuardado: (texto: string) => void
}) {
  const { foco, analizado, enfocar = null, onCerrar, onGuardado } = props
  const sesion = useSesionApp()
  const vol = foco.medida === 'vol'
  const anterior = nombreMes(sumarMes(foco.mes, -1))
  const objetivos = foco.objetivos ?? []
  // Los vendedores con cartera ese mes (el análisis); si el mes no empezó, los de la sesión sin la casa
  const vendedores = analizado
    ? analizado.vendedores.map((v) => ({ id: v.idPersonal, nombre: v.nombre, cartera: clientesDe(v).clientesCartera ?? null }))
    : sesion.vendedores.filter((v) => !v.esCasa).map((v) => ({ id: v.id, nombre: v.nombre, cartera: null }))
  const objetivoDe = (id: number) => objetivos.find((o) => o.idPersonal === id)
  const inicial = (id: number) => {
    const o = objetivoDe(id)
    const n = vol ? o?.bultos : o?.clientes
    return n === null || n === undefined ? '' : vol ? formatoBultos(n) : String(n)
  }
  const [valores, setValores] = useState<Record<number, string>>(() => Object.fromEntries(vendedores.map((v) => [v.id, inicial(v.id)])))
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const total = vendedores.reduce((s, v) => s + (numero(valores[v.id]) ?? 0), 0)
  // Con un vendedor elegido, arranca en el suyo
  useEffect(() => {
    if (enfocar === null) return
    const campo = document.querySelector<HTMLInputElement>(`#form-objetivos [data-vendedor="${enfocar}"]`)
    campo?.scrollIntoView({ block: 'center' })
    campo?.focus()
  }, [enfocar])
  const unidad = (n: number) => (vol ? (n === 1 ? 'bulto' : 'bultos') : n === 1 ? 'cliente' : 'clientes')

  async function guardar(e: FormEvent) {
    e.preventDefault()
    if (guardando) return
    const lista: { idPersonal: number; clientes?: number; bultos?: number }[] = []
    for (const v of vendedores) {
      const n = numero(valores[v.id])
      if (n === null) continue
      const o = objetivoDe(v.id)
      // VOL: el de lo del mes anterior que nadie tocó sigue siendo el sugerido (acompaña si cambia)
      if (vol && o?.sugerido && valores[v.id] === inicial(v.id)) continue
      const mal = vol
        ? Number.isNaN(n) || n < 0.5 || n > MAXIMO_BULTOS || Math.round(n * 10) !== n * 10
        : !Number.isInteger(n) || n < 1 || n > MAXIMO_CLIENTES
      if (mal) {
        setError(
          vol
            ? `El objetivo de ${nombrePropio(v.nombre)} tiene que ir de 0,5 a ${formatoEntero(MAXIMO_BULTOS)} bultos, con un decimal como mucho. Vacío vuelve a lo de ${anterior}.`
            : `El objetivo de ${nombrePropio(v.nombre)} tiene que ser un número entero de 1 a ${formatoEntero(MAXIMO_CLIENTES)} clientes. Para sacarlo, dejalo vacío.`,
        )
        document.querySelector<HTMLInputElement>(`#form-objetivos [data-vendedor="${v.id}"]`)?.focus()
        return
      }
      lista.push(vol ? { idPersonal: v.id, bultos: n } : { idPersonal: v.id, clientes: n })
    }
    setError(null)
    setGuardando(true)
    try {
      await api.put<Foco>(`/admin/focos/${foco.idFoco}/objetivos`, { objetivos: lista })
      avisarCambio()
      onGuardado(
        vol
          ? `${foco.nombre}: objetivos guardados (${formatoBultos(total)} bultos entre todos).`
          : lista.length
            ? `${foco.nombre}: objetivos guardados (${formatoEntero(total)} ${unidad(total)} entre ${lista.length} ${lista.length === 1 ? 'vendedor' : 'vendedores'}).`
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
          {vol ? (
            <>
              Cuántos bultos de <strong>{foco.nombre}</strong> tiene que vender cada uno en {nombreMes(foco.mes)}. De entrada, lo que vendió en
              todo {anterior}: la idea es superarlo. Vacío vuelve a lo de {anterior}.
            </>
          ) : (
            <>
              Cuántos clientes de su cartera tienen que comprar algún artículo de <strong>{foco.nombre}</strong> en {nombreMes(foco.mes)}. Vacío,
              sin objetivo.
            </>
          )}
        </p>
        <ul className="objetivos-lista">
          {vendedores.map((v) => {
            const o = objetivoDe(v.id)
            const compraron = o?.clientesConCompra ?? clientesDe(analizado?.vendedores.find((x) => x.idPersonal === v.id)).clientesConCompra ?? null
            const sugerido = vol && o?.sugerido && valores[v.id] === inicial(v.id)
            return (
              <li key={v.id} className={v.id === enfocar ? 'objetivos-fila elegido' : 'objetivos-fila'}>
                <label htmlFor={`objetivo-${v.id}`} className="objetivos-vendedor">
                  <strong>{nombrePropio(v.nombre)}</strong>
                  <span className="objetivos-dato">
                    {vol
                      ? o?.bultosActual !== null && o?.bultosActual !== undefined
                        ? `lleva ${formatoBultos(o.bultosActual)} bultos${sugerido ? ` · el objetivo es lo de ${anterior}` : ''}`
                        : 'Sin ventas todavía'
                      : v.cartera !== null
                        ? `${formatoEntero(v.cartera)} clientes en su cartera${compraron !== null ? ` · ya compraron ${formatoEntero(compraron)}` : ''}`
                        : 'Sin ventas todavía'}
                  </span>
                </label>
                <span className="objetivos-entrada">
                  <input
                    id={`objetivo-${v.id}`}
                    data-vendedor={v.id}
                    className={sugerido ? 'sugerido' : undefined}
                    type="text"
                    inputMode={vol ? 'decimal' : 'numeric'}
                    placeholder={vol ? `Lo de ${anterior}` : 'Sin objetivo'}
                    value={valores[v.id] ?? ''}
                    onChange={(e) => setValores((x) => ({ ...x, [v.id]: e.target.value.replace(vol ? /[^\d.,]/g : /[^\d.]/g, '') }))}
                  />
                  {vol ? 'bultos' : 'clientes'}
                </span>
              </li>
            )
          })}
        </ul>
        <p className="objetivos-total">
          Entre todos: <strong>{vol ? formatoBultos(total) : formatoEntero(total)} {unidad(total)}</strong>
        </p>
      </form>
    </Modal>
  )
}
