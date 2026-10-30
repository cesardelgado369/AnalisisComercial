import { useEffect, useRef, useState } from 'react'
import { avisarCambio } from '../api/cambios'
import { ApiError, api } from '../api/client'
import type { EstadoSincronizacion, PasoSincronizacion, Sincronizaciones } from '../api/types'
import { useConsulta } from '../api/useConsulta'
import { ErrorCarga } from '../components/ErrorCarga'
import { LoadingAnalisis } from '../components/loading/LoadingAnalisis'
import { LoadingDefault } from '../components/loading/LoadingDefault'
import { fechaUtc, formatoEntero, formatoFecha, formatoFechaCorta, formatoInstante, haceCuanto } from '../utils/formato'
import './admin.css'

/** Mientras hay una actualización pedida o en curso, se vuelve a mirar cada tanto. */
const CADA_MS = 5000
/** Una corrida sin pasos nuevos en este tiempo se da por cortada (p. ej. se reinició el proceso a la mitad). */
const CORTADA_MS = 30 * 60_000

/** Qué trae cada paso de Chess, en palabras. */
const NOMBRE_PASO: Record<string, string> = {
  'personalComercial/': 'Vendedores',
  'rutasVenta/': 'Rutas',
  'clientes/': 'Clientes',
  'articulos/': 'Artículos',
  'ventas/': 'Ventas',
  'compras-mes': 'Compras de cada mes',
  'cartera-mes': 'Carteras de cada mes',
}
const nombrePaso = (p: PasoSincronizacion) => NOMBRE_PASO[p.endpoint] ?? p.endpoint

interface Corrida {
  id: string
  inicio: string
  fin: string | null
  /** Del primero al último. */
  pasos: PasoSincronizacion[]
  terminada: boolean
  ok: boolean
  registros: number
}

/**
 * Las corridas a partir de los pasos (vienen del más nuevo al más viejo). La sincronización no anota el final de la
 * corrida: termina con las carteras, o antes si fallaron las rutas o los clientes (sin ellos no las arma). Una más
 * vieja que la última, o sin pasos nuevos hace mucho (`ahora`: cuándo llegaron los datos; 0 = todavía no se sabe), se da
 * por terminada aunque haya quedado cortada: si no, el botón quedaría trabado hasta la corrida de las 5.
 */
function agrupar(pasos: PasoSincronizacion[], ahora: number): Corrida[] {
  const porId = new Map<string, PasoSincronizacion[]>()
  for (const p of pasos) porId.set(p.idCorrida, [...(porId.get(p.idCorrida) ?? []), p])
  return [...porId.entries()].map(([id, deLaCorrida], i) => {
    const orden = [...deLaCorrida].reverse()
    const ultimo = orden[orden.length - 1]
    const corriendo = orden.some((p) => p.fin === null)
    const completa = orden.some((p) => p.endpoint === 'cartera-mes' && p.fin !== null)
    const sinCarteras = orden.some((p) => !p.ok && p.fin !== null && (p.endpoint === 'rutasVenta/' || p.endpoint === 'clientes/'))
    const quieta = ahora > 0 && ahora - fechaUtc(ultimo.fin ?? ultimo.inicio).getTime() > CORTADA_MS
    const terminada = i > 0 || quieta || (!corriendo && (completa || sinCarteras))
    return {
      id,
      inicio: orden[0].inicio,
      fin: terminada ? ultimo.fin : null,
      pasos: orden,
      terminada,
      ok: terminada && completa && orden.every((p) => p.ok),
      registros: orden.reduce((s, p) => s + p.registros, 0),
    }
  })
}

/** «2 min 10 s», «45 s». */
function duracion(desde: string, hasta: string) {
  const seg = Math.max(0, Math.round((fechaUtc(hasta).getTime() - fechaUtc(desde).getTime()) / 1000))
  return seg < 60 ? `${seg} s` : `${Math.floor(seg / 60)} min${seg % 60 ? ` ${seg % 60} s` : ''}`
}

/** «05:00», la hora de un instante en la hora de quien mira. */
const hora = (iso: string) => formatoInstante(iso).slice(-5)

/**
 * Sincronización con Chess (`/admin/sincronizacion`, solo admin; pedido de Cesar del 30/10): de cuándo son los datos,
 * «Actualizar ahora» (la toma el proceso de sincronización en menos de un minuto y tarda unos minutos) y las últimas
 * corridas con sus errores. Mientras hay una pedida o en curso se vuelve a mirar cada 5 s; al terminar, se avisa a
 * las otras pantallas para que se vuelvan a leer (la cabecera, Cobertura). CONTRATO_API.md, «Sincronización con Chess».
 */
export function SincronizacionPage() {
  const sinc = useConsulta<Sincronizaciones>('/admin/sincronizaciones?cantidad=60', 'No pudimos leer las sincronizaciones.')
  const estado = useConsulta<EstadoSincronizacion>('/sincronizacion/estado', 'No pudimos leer de cuándo son los datos.')
  const [pidiendo, setPidiendo] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** Lo que pidió esta persona desde acá (`solicitadoEn`): para mostrar cómo terminó. */
  const [pedidoEn, setPedidoEn] = useState<string | null>(null)

  const datos = sinc.datos
  const corridas = datos ? agrupar(datos.pasos, sinc.recibidoEn) : []
  const pendiente = datos?.pendiente ?? null
  const enCurso = corridas[0] && !corridas[0].terminada ? corridas[0] : null
  // La que arrancó por lo pedido acá (una corrida que empezó después del pedido)
  const pedida = pedidoEn ? corridas.find((c) => fechaUtc(c.inicio) >= fechaUtc(pedidoEn)) ?? null : null
  const fase: 'pedida' | 'corriendo' | 'quieta' = pendiente || (pedidoEn && !pedida) ? 'pedida' : enCurso ? 'corriendo' : 'quieta'

  // Mientras hay algo pedido o corriendo, se vuelve a mirar cada tanto
  const { recargar } = sinc
  useEffect(() => {
    if (fase === 'quieta') return
    const t = setInterval(recargar, CADA_MS)
    return () => clearInterval(t)
  }, [fase, recargar])

  // Al terminar una corrida que se estaba mirando, las otras pantallas se vuelven a leer (y la cabecera, «Datos al…»)
  const faseAntes = useRef(fase)
  useEffect(() => {
    if (faseAntes.current !== 'quieta' && fase === 'quieta') avisarCambio()
    faseAntes.current = fase
  }, [fase])

  async function actualizar() {
    setPidiendo(true)
    setError(null)
    try {
      const r = await api.post<{ solicitadoEn: string }>('/admin/sincronizaciones')
      setPedidoEn(r.solicitadoEn)
    } catch (e) {
      // 409: ya había una pedida sin tomar (otra persona): se sigue esa
      if (e instanceof ApiError && e.status === 409) setPedidoEn(pendiente?.solicitadoEn ?? new Date().toISOString())
      else setError(e instanceof ApiError ? e.mensajes.join(' ') : 'No pudimos pedir la actualización. Probá de nuevo.')
    } finally {
      setPidiendo(false)
      recargar()
    }
  }

  const ultimaOk = estado.datos?.ultimaOk ?? null
  const pasoActual = enCurso?.pasos.find((p) => p.fin === null) ?? null

  return (
    <section className="pagina adm">
      <header className="encabezado">
        <div className="encabezado-textos">
          <h1>Sincronización con Chess</h1>
          <p>
            Los datos se actualizan solos todos los días a las 5 de la mañana. Si necesitás los de hoy, pedí una
            actualización: tarda unos minutos y mientras tanto la app se sigue usando.
          </p>
        </div>
      </header>

      <div className="tarjeta sinc-estado">
        <div className="sinc-estado-textos">
          <span className="icono sinc-estado-icono" aria-hidden>{ultimaOk ? 'cloud_done' : 'cloud_off'}</span>
          <div>
            <p className="sinc-estado-titulo">
              {ultimaOk ? `Datos de Chess al ${formatoInstante(ultimaOk)}` : estado.datos ? 'Todavía no hay una actualización completa' : ' '}
            </p>
            {ultimaOk && (
              <p className="celda-secundaria">
                Última actualización completa {haceCuanto(fechaUtc(ultimaOk))}
                {estado.datos?.ventasHasta && ` · ventas cargadas hasta el ${formatoFecha(estado.datos.ventasHasta)}`}
              </p>
            )}
          </div>
        </div>
        <button type="button" className="btn btn-acento" disabled={pidiendo || fase !== 'quieta' || !datos} onClick={() => void actualizar()}>
          <span className="icono icono-chico" aria-hidden>sync</span>
          Actualizar ahora
        </button>
      </div>

      {error && (
        <p className="aviso-bloque adm-error-carga" role="alert">
          <span className="icono icono-chico" aria-hidden>error</span>
          {error}
        </p>
      )}
      {sinc.errores.length > 0 && <ErrorCarga errores={sinc.errores} onReintentar={recargar} className="adm-error-carga" />}

      {fase !== 'quieta' && (
        <div className="tarjeta sinc-progreso">
          <LoadingAnalisis
            texto={
              fase === 'pedida'
                ? 'Actualización pedida: arranca en menos de un minuto…'
                : `Actualizando desde Chess${pasoActual ? `: ${nombrePaso(pasoActual).toLowerCase()}` : ''}…`
            }
            detalle={
              pendiente
                ? `La pidió ${pendiente.solicitadoPor} a las ${hora(pendiente.solicitadoEn)}. Suele tardar unos minutos.`
                : 'Suele tardar unos minutos. Podés seguir usando la app.'
            }
          />
          {enCurso && <ListaPasos pasos={enCurso.pasos} />}
        </div>
      )}

      {fase === 'quieta' && pedida && (
        <p className={pedida.ok ? 'sinc-resultado ok' : 'sinc-resultado con-errores'} role="status">
          <span className="icono icono-chico" aria-hidden>{pedida.ok ? 'check_circle' : 'warning'}</span>
          {pedida.ok
            ? `Listo: los datos están actualizados al ${formatoInstante(pedida.fin ?? pedida.inicio)}.`
            : 'La actualización terminó con errores: los pasos que fallaron quedan como estaban. Mirá el detalle abajo.'}
        </p>
      )}

      <section className="tarjeta adm-tarjeta" aria-labelledby="sinc-historial">
        <h2 id="sinc-historial" className="sinc-historial-titulo">Últimas actualizaciones</h2>
        {!datos ? (
          sinc.errores.length ? null : <LoadingDefault texto="Cargando las actualizaciones…" />
        ) : corridas.length === 0 ? (
          <p className="vacio">Todavía no corrió ninguna sincronización.</p>
        ) : (
          <div className="adm-tabla-scroll">
            <table className="tabla adm-tabla sinc-tabla">
              <thead>
                <tr>
                  <th>Empezó</th>
                  <th>Duró</th>
                  <th>Estado</th>
                  <th className="sinc-col-num">Registros</th>
                </tr>
              </thead>
              <tbody>
                {corridas.map((c) => {
                  const fallaron = c.pasos.filter((p) => !p.ok && p.fin !== null)
                  return (
                    <tr key={c.id}>
                      <td>
                        <div className="celda-principal">{formatoInstante(c.inicio)}</div>
                        <div className="celda-secundaria">{haceCuanto(fechaUtc(c.inicio))}</div>
                      </td>
                      <td>
                        <span className="adm-rotulo-movil">Duró </span>
                        {c.fin ? duracion(c.inicio, c.fin) : '—'}
                      </td>
                      <td>
                        {!c.terminada ? (
                          <span className="sinc-marca en-curso">
                            <span className="icono icono-chico" aria-hidden>sync</span>
                            En curso
                          </span>
                        ) : c.ok ? (
                          <span className="sinc-marca ok">
                            <span className="icono icono-chico" aria-hidden>check_circle</span>
                            Completa
                          </span>
                        ) : (
                          <span className="sinc-marca con-errores">
                            <span className="icono icono-chico" aria-hidden>warning</span>
                            {fallaron.length ? `Con ${fallaron.length === 1 ? 'un error' : `${fallaron.length} errores`}` : 'Cortada'}
                          </span>
                        )}
                        {fallaron.map((p) => (
                          <div key={`${p.endpoint}-${p.inicio}`} className="sinc-error">
                            <strong>{nombrePaso(p)}</strong>
                            {p.desde && p.hasta && ` (${formatoFechaCorta(p.desde)} al ${formatoFechaCorta(p.hasta)})`}: {p.error ?? 'falló'}
                          </div>
                        ))}
                      </td>
                      <td className="sinc-col-num">
                        {formatoEntero(c.registros)}
                        <span className="adm-rotulo-movil"> registros</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </section>
  )
}

/** Los pasos de la corrida en curso: hechos, el que está corriendo y los que fallaron. */
function ListaPasos({ pasos }: { pasos: PasoSincronizacion[] }) {
  return (
    <ol className="sinc-pasos" aria-label="Pasos de la actualización">
      {pasos.map((p) => (
        <li key={`${p.endpoint}-${p.inicio}`} className={p.fin === null ? 'corriendo' : p.ok ? 'ok' : 'con-error'}>
          <span className="icono icono-chico" aria-hidden>{p.fin === null ? 'sync' : p.ok ? 'check_circle' : 'error'}</span>
          {nombrePaso(p)}
          {p.fin !== null && p.ok && <span className="celda-secundaria"> · {formatoEntero(p.registros)}</span>}
        </li>
      ))}
    </ol>
  )
}
