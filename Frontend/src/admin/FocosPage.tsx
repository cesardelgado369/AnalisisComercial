import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { avisarCambio } from '../api/cambios'
import { ApiError, api } from '../api/client'
import type { Foco, FocoEnvio } from '../api/types'
import { useConsulta } from '../api/useConsulta'
import { useSesionApp } from '../auth/SesionApp'
import { useMesReferencia } from '../comercial/mesReferencia'
import { ErrorCarga } from '../components/ErrorCarga'
import { LoadingDefault } from '../components/loading/LoadingDefault'
import { mesesDisponibles, nombrePropio, sumarMes } from '../cobertura/estados'
import { cantidad, fechaUtc, haceCuanto, nombreMes, nombreMesTitulo } from '../utils/formato'
import { AnalisisFocos } from './AnalisisFocos'
import { ModalFoco } from './ModalFoco'
import './admin.css'

/**
 * Focos del mes (`/admin/focos?mes=`, solo el dueño; pedido de Checho del 03/11, por mes desde el 05/11): los productos
 * que el dueño quiere seguir cada mes (CCC Manteca, CCC Dulce de leche…). Arriba los meses (desde el primero con datos
 * hasta el que viene, para dejarlo armado); en cada uno, sus focos como tarjetas, y abajo cómo vienen vendiendo por
 * vendedor (AnalisisFocos). Los focos del mes en el que está parada la app son los del filtro «Foco del mes» de
 * Cobertura, Volumen y Devoluciones. Los empleados no ven nada de esto. CONTRATO_API.md, «Focos del mes».
 */
export function FocosPage() {
  const { mesEnCurso } = useSesionApp()
  const referencia = useMesReferencia()
  const [params, setParams] = useSearchParams()
  const focos = useConsulta<Foco[]>('/admin/focos', 'No pudimos leer los focos.')
  const [modal, setModal] = useState<{ foco: Foco | null } | null>(null)
  const [copiando, setCopiando] = useState(false)
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null)

  const proximo = sumarMes(mesEnCurso, 1)
  const meses = [...mesesDisponibles(mesEnCurso), proximo]
  const mesUrl = params.get('mes')
  const mes = mesUrl && meses.includes(mesUrl) ? mesUrl : referencia.mes
  const delMes = (m: string) => focos.datos?.filter((f) => f.mes === m) ?? []
  const estos = delMes(mes)
  const anterior = sumarMes(mes, -1)
  // Los del mes anterior que este todavía no tiene (por nombre): «Copiar los de octubre»
  const paraCopiar = delMes(anterior).filter((f) => !estos.some((e) => e.nombre.toLowerCase() === f.nombre.toLowerCase()))

  function elegirMes(m: string) {
    setAviso(null)
    setParams(m === referencia.mes ? {} : { mes: m }, { replace: true })
  }

  /** Un POST por foco (el contrato no tiene «copiar»): los que fallan se cuentan en el aviso y los demás quedan. */
  async function copiar() {
    if (copiando) return
    setCopiando(true)
    setAviso(null)
    const fallas: string[] = []
    for (const f of paraCopiar) {
      try {
        const cuerpo: FocoEnvio = { mes, nombre: f.nombre, idsArticulo: f.articulos.map((a) => a.idArticulo) }
        await api.post<Foco>('/admin/focos', cuerpo)
      } catch (e) {
        fallas.push(`${f.nombre} (${e instanceof ApiError ? e.mensajes.join(' ') : 'probá de nuevo'})`)
      }
    }
    const copiados = paraCopiar.length - fallas.length
    setAviso(
      fallas.length
        ? { ok: false, texto: `Copiamos ${copiados} de ${paraCopiar.length}. No se pudo: ${fallas.join('; ')}.` }
        : { ok: true, texto: `Copiamos ${cantidad(copiados, 'foco')} de ${nombreMes(anterior)} a ${nombreMes(mes)}: revisá que sigan siendo los de este mes.` },
    )
    setCopiando(false)
    avisarCambio()
  }

  const etiqueta = (m: string) => (m === mesEnCurso ? 'en curso' : m === proximo ? 'el que viene' : null)
  const conAnio = (m: string) => (m.slice(0, 4) === mesEnCurso.slice(0, 4) ? '' : ` ${m.slice(0, 4)}`)

  return (
    <section className="pagina adm">
      <header className="encabezado">
        <div className="encabezado-textos">
          <h1>Focos del mes</h1>
          <p>
            Los productos que querés seguir cada mes, con todas sus presentaciones. Los del mes en el que estás parado
            aparecen en el filtro «Foco del mes» de Cobertura, Volumen y Devoluciones. Los vendedores y supervisores no
            ven los focos.
          </p>
        </div>
      </header>

      <div className="foco-meses" role="group" aria-label="Mes">
        {[...meses].reverse().map((m) => {
          const n = delMes(m).length
          return (
            <button key={m} type="button" className="foco-mes" aria-pressed={m === mes} onClick={() => elegirMes(m)}>
              <span className="foco-mes-nombre">
                {nombreMesTitulo(m)}
                {conAnio(m)}
              </span>
              <span className="foco-mes-detalle">
                {focos.datos ? (n ? cantidad(n, 'foco') : 'sin focos') : ' '}
                {etiqueta(m) && ` · ${etiqueta(m)}`}
              </span>
            </button>
          )
        })}
      </div>

      {focos.errores.length > 0 && <ErrorCarga errores={focos.errores} onReintentar={focos.recargar} className="adm-error-carga" />}
      {aviso && (
        <p className={aviso.ok ? 'sinc-resultado ok' : 'aviso-bloque adm-error-carga'} role={aviso.ok ? 'status' : 'alert'}>
          <span className="icono icono-chico" aria-hidden>{aviso.ok ? 'check_circle' : 'error'}</span>
          {aviso.texto}
        </p>
      )}

      <section className="foco-del-mes" aria-labelledby="foco-mes-titulo">
        <div className="foco-del-mes-cabecera">
          <h2 id="foco-mes-titulo">
            Focos de {nombreMes(mes)}
            {conAnio(mes)}
          </h2>
          <div className="foco-del-mes-acciones">
            {paraCopiar.length > 0 && (
              <button type="button" className="btn" onClick={() => void copiar()} disabled={copiando}>
                <span className="icono icono-chico" aria-hidden>content_copy</span>
                {copiando ? 'Copiando…' : `Copiar ${paraCopiar.length === 1 ? 'el' : 'los'} de ${nombreMes(anterior)} (${paraCopiar.length})`}
              </button>
            )}
            <button type="button" className="btn btn-primario adm-nuevo" onClick={() => setModal({ foco: null })}>
              <span className="icono icono-chico" aria-hidden>add</span>
              Nuevo foco
            </button>
          </div>
        </div>

        {!focos.datos ? (
          focos.errores.length ? null : <LoadingDefault texto="Cargando los focos…" />
        ) : estos.length === 0 ? (
          <p className="vacio foco-vacio">
            {nombreMesTitulo(mes)} todavía no tiene focos.{' '}
            {paraCopiar.length
              ? `Copiá los de ${nombreMes(anterior)} o armá uno nuevo.`
              : 'Armá el primero con «Nuevo foco»: por ejemplo, Manteca con sus dos presentaciones.'}
          </p>
        ) : (
          <div className="foco-tarjetas">
            {estos.map((f) => (
              <button key={f.idFoco} type="button" className="tarjeta foco-tarjeta" onClick={() => setModal({ foco: f })}>
                <span className="foco-tarjeta-cabecera">
                  <span className="foco-tarjeta-nombre">{f.nombre}</span>
                  <span className="foco-tarjeta-editar">
                    <span className="icono icono-chico" aria-hidden>edit</span>
                    Editar
                  </span>
                </span>
                <span className="foco-tarjeta-articulos">
                  {f.articulos.map((a) => (
                    <span key={a.idArticulo} className="foco-tarjeta-articulo">{nombrePropio(a.descripcion)}</span>
                  ))}
                </span>
                <span className="foco-tarjeta-pie">
                  {cantidad(f.articulos.length, 'artículo')} · {f.actualizadoPor} · {haceCuanto(fechaUtc(f.actualizado))}
                </span>
              </button>
            ))}
          </div>
        )}
      </section>

      {mes === proximo ? (
        <p className="foco-analisis-espera">
          <span className="icono icono-chico" aria-hidden>calendar_month</span>
          Cómo vienen se ve desde el 1 de {nombreMes(mes)}, cuando haya ventas.
        </p>
      ) : (
        estos.length > 0 && <AnalisisFocos mes={mes} />
      )}

      {modal && (
        <ModalFoco
          foco={modal.foco}
          mes={modal.foco?.mes ?? mes}
          onCerrar={() => setModal(null)}
          onGuardado={(texto) => {
            setModal(null)
            setAviso({ ok: true, texto })
          }}
        />
      )}
    </section>
  )
}
