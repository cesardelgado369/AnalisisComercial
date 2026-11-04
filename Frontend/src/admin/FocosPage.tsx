import { useState } from 'react'
import { avisarCambio } from '../api/cambios'
import { ApiError, api } from '../api/client'
import type { Foco, FocoEnvio } from '../api/types'
import { useConsulta } from '../api/useConsulta'
import { ErrorCarga } from '../components/ErrorCarga'
import { LoadingDefault } from '../components/loading/LoadingDefault'
import { nombrePropio } from '../cobertura/estados'
import { fechaUtc, haceCuanto } from '../utils/formato'
import { ModalFoco } from './ModalFoco'
import './admin.css'

/**
 * Focos del mes (`/admin/focos`, solo admin; pedido de Checho del 03/11): los productos que se pueden filtrar en
 * Cobertura, Volumen y Devoluciones según los objetivos de los vendedores (CCC Manteca, CCC Dulce de leche…). Cada foco
 * agrupa artículos de Chess bajo un nombre y se prende o apaga con un click: el filtro «Foco del mes» muestra solo los
 * prendidos. CONTRATO_API.md, «Focos del mes».
 */
export function FocosPage() {
  const focos = useConsulta<Foco[]>('/admin/focos', 'No pudimos leer los focos.')
  const [modal, setModal] = useState<{ foco: Foco | null } | null>(null)
  const [cambiando, setCambiando] = useState<number | null>(null)
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null)
  const prendidos = focos.datos?.filter((f) => f.activo).length ?? 0

  /** Prende o apaga: el mismo PUT con el nombre y los artículos que tiene. */
  async function alternar(f: Foco) {
    if (cambiando !== null) return
    setCambiando(f.idFoco)
    setAviso(null)
    try {
      const cuerpo: FocoEnvio = { nombre: f.nombre, idsArticulo: f.articulos.map((a) => a.idArticulo), activo: !f.activo }
      await api.put<Foco>(`/admin/focos/${f.idFoco}`, cuerpo)
      setAviso({ ok: true, texto: f.activo ? `${f.nombre}: apagado, ya no aparece en el filtro.` : `${f.nombre}: prendido, ya aparece en el filtro.` })
      // Los filtros abiertos (y esta lista) se vuelven a leer
      avisarCambio()
    } catch (e) {
      setAviso({ ok: false, texto: `No pudimos ${f.activo ? 'apagar' : 'prender'} ${f.nombre}. ${e instanceof ApiError ? e.mensajes.join(' ') : 'Probá de nuevo.'}` })
      focos.recargar()
    } finally {
      setCambiando(null)
    }
  }

  return (
    <section className="pagina adm">
      <header className="encabezado">
        <div className="encabezado-textos">
          <h1>Focos del mes</h1>
          <p>
            Los productos que se pueden filtrar en Cobertura, Volumen y Devoluciones. Armá cada foco con todas sus
            presentaciones y prendé los que son objetivo de este mes: los apagados no aparecen en el filtro, pero quedan
            guardados para otro mes.
          </p>
        </div>
        <button type="button" className="btn btn-primario adm-nuevo" onClick={() => setModal({ foco: null })}>
          <span className="icono icono-chico" aria-hidden>add</span>
          Nuevo foco
        </button>
      </header>

      {focos.errores.length > 0 && <ErrorCarga errores={focos.errores} onReintentar={focos.recargar} className="adm-error-carga" />}
      {aviso && (
        <p className={aviso.ok ? 'sinc-resultado ok' : 'aviso-bloque adm-error-carga'} role={aviso.ok ? 'status' : 'alert'}>
          <span className="icono icono-chico" aria-hidden>{aviso.ok ? 'check_circle' : 'error'}</span>
          {aviso.texto}
        </p>
      )}

      <div className="tarjeta adm-tarjeta">
        {!focos.datos ? (
          focos.errores.length ? null : <LoadingDefault texto="Cargando los focos…" />
        ) : focos.datos.length === 0 ? (
          <p className="vacio">Todavía no hay focos. Creá el primero con «Nuevo foco»: por ejemplo, Manteca con sus dos presentaciones.</p>
        ) : (
          <>
            <p className="foco-resumen">
              {prendidos === 0
                ? 'Ningún foco prendido: el filtro no aparece en las pantallas.'
                : `${prendidos === 1 ? 'Un foco prendido' : `${prendidos} focos prendidos`} en el filtro.`}
            </p>
            <div className="adm-tabla-scroll">
              <table className="tabla adm-tabla foco-tabla">
                <thead>
                  <tr>
                    <th>Foco</th>
                    <th>Artículos</th>
                    <th>En el filtro</th>
                    <th className="adm-col-accion"><span className="sr-solo">Acción</span></th>
                  </tr>
                </thead>
                <tbody>
                  {focos.datos.map((f) => (
                    <tr key={f.idFoco} className={f.activo ? 'cliqueable' : 'cliqueable foco-apagado'} onClick={() => setModal({ foco: f })}>
                      <td>
                        <div className="celda-principal">{f.nombre}</div>
                        <div className="celda-secundaria">
                          {f.actualizadoPor} · {haceCuanto(fechaUtc(f.actualizado))}
                        </div>
                      </td>
                      <td>
                        <ul className="adm-lista-vendedores">
                          {f.articulos.map((a) => (
                            <li key={a.idArticulo}>{nombrePropio(a.descripcion)}</li>
                          ))}
                        </ul>
                      </td>
                      <td>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={f.activo}
                          aria-label={`${f.nombre} en el filtro`}
                          className={f.activo ? 'foco-interruptor prendido' : 'foco-interruptor'}
                          disabled={cambiando !== null}
                          onClick={(e) => {
                            e.stopPropagation()
                            void alternar(f)
                          }}
                        >
                          <span className="foco-interruptor-riel" aria-hidden>
                            <span className="foco-interruptor-perilla" />
                          </span>
                          {cambiando === f.idFoco ? (f.activo ? 'Apagando…' : 'Prendiendo…') : f.activo ? 'Prendido' : 'Apagado'}
                        </button>
                      </td>
                      <td className="adm-col-accion">
                        <button
                          type="button"
                          className="btn"
                          onClick={(e) => {
                            e.stopPropagation()
                            setModal({ foco: f })
                          }}
                        >
                          <span className="icono icono-chico" aria-hidden>edit</span>
                          Editar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {modal && (
        <ModalFoco
          foco={modal.foco}
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
