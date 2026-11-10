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
import { Parrafo } from '../comercial/ayuda'
import { Ayuda } from '../components/Ayuda'
import { cantidad, formatoBultos, formatoPorcentaje, nombreMes, nombreMesTitulo } from '../utils/formato'
import { LeyendaFocos, MedicionFoco, useAnalisisFocos } from './AnalisisFocos'
import { ETIQUETA_MEDIDA } from './medidas'
import { VentanaVendedor, type ClaveVendedorFoco } from './VentanaVendedor'
import type { ClaseAbc } from '../api/types'
import { OpcionesCategoria, Titulo } from '../comercial/filtros'
import { IconoCalendario } from '../comercial/IconosFiltro'
import { Segmentado } from '../components/Segmentado'
import { useVentana } from '../components/Ventana'
import '../cobertura/cobertura.css'
import { ModalFoco } from './ModalFoco'
import './admin.css'

/**
 * Focos del mes (`/admin/focos?mes=`, solo el dueño; pedido de Checho del 03/11, por mes desde el 05/11): los objetivos
 * que el dueño quiere seguir cada mes, como los escribe Checho (CCC Manteca, VOL Tapas…). Arriba los meses (desde el
 * primero con datos hasta el que viene, para dejarlo armado); en cada uno, un contenedor por objetivo con todo junto
 * (Cesar, 05/11): qué se mide, la meta si tiene, sus artículos y cómo viene cada vendedor (AnalisisFocos). Los focos del
 * mes en el que está parada la app son los del filtro «Foco del mes» de Cobertura, Volumen y Devoluciones. Los
 * empleados no ven nada de esto. CONTRATO_API.md, «Focos del mes».
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
  // Cómo vienen: desde que el mes empieza (el que viene, todavía no) y si tiene focos
  // Comparativa (parcial o acumulado, solo en el mes en curso) y categoría de cliente, en la URL (Cesar, 10/11)
  const acumulado = mes === mesEnCurso && params.get('comparacion') === 'acumulado'
  const categoriaUrl = params.get('abc')
  const categoria: ClaseAbc | null = categoriaUrl === 'A' || categoriaUrl === 'B' || categoriaUrl === 'C' ? categoriaUrl : null
  const analisis = useAnalisisFocos(mes !== proximo && estos.length > 0 ? mes : null, { acumulado, categoria })
  const ctx = analisis.contexto
  // La ventanita de cada vendedor en el análisis
  const ventanita = useVentana<ClaveVendedorFoco>()
  const abiertoEn = ventanita.abierta && analisis.a?.focos.find((x) => x.idFoco === ventanita.abierta!.clave.idFoco)

  /** Cambia un parámetro de la URL sin perder los otros. */
  function cambiarParam(clave: string, valor: string | null) {
    const p = new URLSearchParams(params)
    if (valor) p.set(clave, valor)
    else p.delete(clave)
    setParams(p, { replace: true })
  }

  function elegirMes(m: string) {
    setAviso(null)
    cambiarParam('mes', m === referencia.mes ? null : m)
  }

  /** Un POST por foco (el contrato no tiene «copiar»): los que fallan se cuentan en el aviso y los demás quedan. */
  async function copiar() {
    if (copiando) return
    setCopiando(true)
    setAviso(null)
    const fallas: string[] = []
    for (const f of paraCopiar) {
      try {
        const cuerpo: FocoEnvio = { mes, nombre: f.nombre, idsArticulo: f.articulos.map((a) => a.idArticulo), medida: f.medida, meta: f.meta }
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
      <header className="encabezado foco-encabezado">
        <h1>Focos del mes</h1>
      </header>

      {/* Arriba, centradas, las cajitas como las de los filtros (Cesar, 10/11): el mes, la comparativa y la categoría */}
      <div className="foco-controles">
        <div className="cob-filtro foco-control">
          <Titulo icono={<IconoCalendario />}>Mes</Titulo>
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
        </div>
        {mes === mesEnCurso && estos.length > 0 && (
          <div className={acumulado ? 'cob-filtro cob-filtro-activo foco-control' : 'cob-filtro foco-control'}>
            <Titulo icono={<span className="icono-filtro icono-abc" aria-hidden>%</span>}>Comparativa</Titulo>
            <div className="foco-control-cuerpo">
              <Segmentado
                etiqueta="Comparativa"
                valor={acumulado ? 'acumulado' : 'parcial'}
                opciones={[
                  { valor: 'parcial', texto: 'Mes parcial' },
                  { valor: 'acumulado', texto: 'Mes acumulado' },
                ]}
                onCambio={(v) => cambiarParam('comparacion', v === 'acumulado' ? v : null)}
              />
            </div>
          </div>
        )}
        {mes !== proximo && estos.length > 0 && (
          <div className={categoria ? 'cob-filtro cob-filtro-activo foco-control foco-control-categoria' : 'cob-filtro foco-control foco-control-categoria'}>
            <Titulo icono={<span className="icono-filtro icono-abc" aria-hidden>ABC</span>}>Categoría de cliente</Titulo>
            <OpcionesCategoria valor={categoria} onCambio={(v) => cambiarParam('abc', v)} />
          </div>
        )}
      </div>

      {focos.errores.length > 0 && <ErrorCarga errores={focos.errores} onReintentar={focos.recargar} className="adm-error-carga" />}
      {aviso && (
        <p className={aviso.ok ? 'sinc-resultado ok' : 'aviso-bloque adm-error-carga'} role={aviso.ok ? 'status' : 'alert'}>
          <span className="icono icono-chico" aria-hidden>{aviso.ok ? 'check_circle' : 'error'}</span>
          {aviso.texto}
        </p>
      )}

      <section className="foco-del-mes" aria-labelledby="foco-mes-titulo">
        {/* Focos de noviembre en banda negra, como los títulos de las otras pantallas */}
        <h2 id="foco-mes-titulo" className="foco-del-mes-titulo">
          Focos de {nombreMes(mes)}
          {conAnio(mes)}
        </h2>
        <div className="foco-del-mes-cabecera">
          {estos.length > 0 && mes !== proximo && ctx ? <LeyendaFocos ctx={ctx} conMeta={estos.some((f) => f.meta !== null)} /> : <span />}
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

        {estos.length > 0 &&
          (mes === proximo ? (
            <p className="foco-analisis-espera">
              <span className="icono icono-chico" aria-hidden>calendar_month</span>
              Cómo viene cada vendedor se ve desde el 1 de {nombreMes(mes)}, cuando haya ventas.
            </p>
          ) : null)}
        {analisis.errores.length > 0 && <ErrorCarga errores={analisis.errores} onReintentar={analisis.recargar} className="adm-error-carga" />}

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
          <div className="foco-contenedores">
            {estos.map((f) => {
              const analizado = analisis.a?.focos.find((x) => x.idFoco === f.idFoco)
              return (
                <article key={f.idFoco} className="tarjeta foco-contenedor" aria-labelledby={`foco-${f.idFoco}`}>
                  {/* Simple, como lo escribe Checho (Cesar, 10/11): CCC - Dulce de leche; qué mide va en el globito */}
                  <header className="foco-contenedor-cabecera ayuda-ancla">
                    <h3 id={`foco-${f.idFoco}`} className="foco-contenedor-nombre">
                      <span className="foco-tipo-texto">{ETIQUETA_MEDIDA[f.medida]}</span> - {f.nombre}
                      <Ayuda etiqueta={`Qué mide ${ETIQUETA_MEDIDA[f.medida]} ${f.nombre}`}>
                        {f.medida === 'vol' ? (
                          <Parrafo titulo="VOL, volumen en bultos:">
                            los bultos de estos artículos contra {ctx?.vol ?? `${nombreMes(anterior)} al mismo día hábil`}.
                            100 % es vender lo mismo que entonces.
                          </Parrafo>
                        ) : (
                          <Parrafo titulo="CCC, clientes que compraron:">
                            qué parte de la cartera de cada vendedor compró alguno de estos artículos en el mes.
                          </Parrafo>
                        )}
                        <Parrafo titulo="La flecha:">
                          cuánto subió o bajó contra {(f.medida === 'vol' ? ctx?.vol : ctx?.ccc) ?? nombreMes(anterior)}
                          {f.medida === 'vol' ? ' (en %).' : ' (en puntos: +6 es 6 puntos más que entonces).'}
                        </Parrafo>
                      </Ayuda>
                    </h3>
                    <button type="button" className="btn-texto foco-editar" onClick={() => setModal({ foco: f })}>
                      <span className="icono icono-chico" aria-hidden>edit</span>
                      Editar<span className="sr-solo"> {f.nombre}</span>
                    </button>
                  </header>
                  {f.meta !== null && (
                    <p className="foco-contenedor-mide">
                      <strong className="foco-meta">
                        {f.medida === 'vol' ? `Meta ${formatoBultos(f.meta)} bultos` : `Meta ${formatoPorcentaje(f.meta)} de los clientes`}
                      </strong>
                    </p>
                  )}
                  <div className="foco-tarjeta-articulos" aria-label="Artículos">
                    {f.articulos.map((a) => (
                      <span key={a.idArticulo} className="foco-tarjeta-articulo">{nombrePropio(a.descripcion)}</span>
                    ))}
                  </div>
                  {analizado && ctx ? (
                    <MedicionFoco
                      f={analizado}
                      ctx={ctx}
                      alPasar={ventanita.alPasar}
                      enfocado={ventanita.abierta?.clave.idFoco === f.idFoco ? ventanita.abierta.clave.idPersonal : null}
                    />
                  ) : mes !== proximo && !analisis.errores.length ? (
                    <LoadingDefault texto="Armando cómo viene…" />
                  ) : null}
                </article>
              )
            })}
          </div>
        )}
      </section>

      {ventanita.abierta && abiertoEn && (
        <VentanaVendedor
          clave={ventanita.abierta.clave}
          foco={abiertoEn}
          mes={mes}
          acumulado={acumulado}
          categoria={categoria}
          fila={ventanita.abierta.fila}
          onEntrar={ventanita.quedarse}
          onSalir={ventanita.salir}
        />
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
