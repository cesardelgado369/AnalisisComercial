import { useEffect, useRef, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { useAnalisisFocos } from '../admin/AnalisisFocos'
import { ModalObjetivos } from '../admin/ModalObjetivos'
import { avisarCambio } from '../api/cambios'
import { ApiError, api } from '../api/client'
import type { Foco } from '../api/types'
import { formatoEntero } from '../utils/formato'
import '../admin/admin.css'
import './editarFoco.css'

const ANCHO = 280

/**
 * Editar un foco desde el resumen de la sección Focos, solo el dueño (Cesar, 17/11: «al posicionarme por encima de la
 * meta, que me permita editar»). En un CCC, una ventanita con la meta (`PUT /api/admin/focos/{id}`, el foco entero con la
 * meta nueva) y el acceso a los objetivos por vendedor; en un VOL, directo los objetivos (su meta en bultos no se ve
 * acá). Se carga recién al abrirla.
 */
export default function EditarFoco(props: { foco: Foco; ancla: DOMRect; onCerrar: () => void }) {
  const { foco, ancla, onCerrar } = props
  const [paso, setPaso] = useState<'meta' | 'objetivos'>(foco.medida === 'vol' ? 'objetivos' : 'meta')
  return paso === 'meta' ? (
    <VentanitaMeta foco={foco} ancla={ancla} onCerrar={onCerrar} onObjetivos={() => setPaso('objetivos')} />
  ) : (
    <Objetivos foco={foco} onCerrar={onCerrar} />
  )
}

function VentanitaMeta(props: { foco: Foco; ancla: DOMRect; onCerrar: () => void; onObjetivos: () => void }) {
  const { foco, ancla, onCerrar, onObjetivos } = props
  const caja = useRef<HTMLFormElement>(null)
  const entrada = useRef<HTMLInputElement>(null)
  const cerrar = useRef(onCerrar)
  useEffect(() => {
    cerrar.current = onCerrar
  })
  const [meta, setMeta] = useState(foco.meta === null ? '' : String(foco.meta).replace('.', ','))
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  // Debajo del renglón, en el documento (acompaña el scroll; el teclado del celular no la cierra)
  const left = Math.max(12, Math.min(ancla.left + ancla.width / 2 - ANCHO / 2, window.innerWidth - ANCHO - 12)) + window.scrollX
  const top = ancla.bottom + 6 + window.scrollY

  useEffect(() => {
    entrada.current?.focus()
    entrada.current?.select()
    function afuera(e: PointerEvent) {
      const t = e.target as Element
      if (!caja.current?.contains(t) && !t.closest?.('.cob-kpi-editar')) cerrar.current()
    }
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && cerrar.current()
    document.addEventListener('pointerdown', afuera)
    document.addEventListener('keydown', tecla)
    return () => {
      document.removeEventListener('pointerdown', afuera)
      document.removeEventListener('keydown', tecla)
    }
  }, [])

  async function guardar(e: FormEvent) {
    e.preventDefault()
    if (guardando) return
    const texto = meta.trim()
    const numero = texto === '' ? null : Number(texto.replace(/\./g, '').replace(',', '.'))
    if (numero !== null && (!Number.isFinite(numero) || numero < 1 || numero > 100)) {
      setError('La meta va de 1 a 100 %. Para sacarla, dejala vacía.')
      entrada.current?.focus()
      return
    }
    setError(null)
    setGuardando(true)
    try {
      // El PUT reemplaza el foco entero: va todo como está, con la meta nueva
      await api.put<Foco>(`/admin/focos/${foco.idFoco}`, {
        mes: foco.mes,
        nombre: foco.nombre,
        idsArticulo: foco.articulos.map((a) => a.idArticulo),
        medida: foco.medida,
        meta: numero,
      })
      avisarCambio()
      onCerrar()
    } catch (err) {
      setGuardando(false)
      if (!(err instanceof ApiError)) {
        setError('No se pudo guardar la meta. Revisá la conexión y probá de nuevo.')
        return
      }
      const deLaMeta = Object.entries(err.errores).find(([k]) => k.toLowerCase() === 'meta')?.[1]
      setError((deLaMeta ?? err.mensajes).join(' '))
      // Lo borraron o cambió mientras tanto: que la pantalla se ponga al día
      if (err.status === 404) avisarCambio()
    }
  }

  const conObjetivo = foco.objetivos.filter((o) => o.clientes !== null)
  const totalObjetivo = conObjetivo.reduce((s, o) => s + (o.clientes ?? 0), 0)

  return createPortal(
    <form
      ref={caja}
      className="editar-foco"
      style={{ top, left, width: ANCHO }}
      onSubmit={(e) => void guardar(e)}
      role="dialog"
      aria-label={`Meta de ${foco.nombre}`}
      noValidate
      autoComplete="off"
    >
      <p className="editar-foco-titulo">{foco.nombre}</p>
      <label className="editar-foco-campo">
        <span>Meta</span>
        <span className="editar-foco-entrada">
          <input
            ref={entrada}
            type="text"
            inputMode="decimal"
            value={meta}
            placeholder="Sin meta"
            aria-invalid={!!error}
            onChange={(e) => {
              setMeta(e.target.value.replace(/[^\d.,]/g, ''))
              setError(null)
            }}
          />
          %
        </span>
      </label>
      <p className="editar-foco-ayuda">Qué parte de la cartera tiene que comprar. Vacía, sin meta.</p>
      {error && (
        <p className="editar-foco-error" role="alert">
          {error}
        </p>
      )}
      <div className="editar-foco-botones">
        <button type="button" className="btn" onClick={onCerrar} disabled={guardando}>
          Cancelar
        </button>
        <button type="submit" className="btn btn-primario" disabled={guardando}>
          {guardando ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
      <button type="button" className="editar-foco-objetivos" onClick={onObjetivos} disabled={guardando}>
        <span className="icono icono-chico" aria-hidden>groups</span>
        <span>
          Objetivos por vendedor
          <small>
            {conObjetivo.length
              ? `${formatoEntero(totalObjetivo)} clientes entre ${conObjetivo.length} ${conObjetivo.length === 1 ? 'vendedor' : 'vendedores'}`
              : 'Sin objetivos'}
          </small>
        </span>
        <span className="icono icono-chico" aria-hidden>chevron_right</span>
      </button>
    </form>,
    document.body,
  )
}

/**
 * Los objetivos por vendedor, con el mismo editor que Focos del mes. Espera el análisis del mes (la cartera y lo que
 * lleva cada vendedor) para que el editor arranque con los vendedores que corresponden.
 */
function Objetivos(props: { foco: Foco; onCerrar: () => void }) {
  const { foco, onCerrar } = props
  const analisis = useAnalisisFocos(foco.mes, { acumulado: false, categoria: null })
  const listo = !!analisis.a || analisis.errores.length > 0
  if (!listo)
    return createPortal(
      <div className="editar-foco-cargando" role="status">
        Cargando los vendedores de {foco.nombre}…
      </div>,
      document.body,
    )
  return (
    <ModalObjetivos
      foco={foco}
      analizado={analisis.a?.focos.find((x) => x.idFoco === foco.idFoco) ?? null}
      onCerrar={onCerrar}
      onGuardado={onCerrar}
    />
  )
}

