import type { FichaDevoluciones, FichaVolumen } from '../api/types'
import { useConsulta } from '../api/useConsulta'
import { NombreArticulo } from '../comercial/lista'
import { ErrorCarga } from '../components/ErrorCarga'
import { LoadingDefault } from '../components/loading/LoadingDefault'
import { formatoBultos, formatoFechaCorta, formatoPorcentajeDecimal as pct, nombreMes, nombreMesCorto, nombreMesTitulo } from '../utils/formato'
import { Avance, TotalComparado } from '../volumen/Avance'
import { textosComparacion } from '../volumen/comparacion'

type ArticuloVolumen = FichaVolumen['articulos'][number]

/**
 * Pestaña Volumen de la ficha: el total del cliente contra su base y, por artículo, **qué fue bajando y qué fue
 * subiendo** (pedido del dueño), con su porcentaje. La base es la del rol (CONTRATO_API.md). Bajó o subió se lee contra
 * la misma referencia de la sección: el ritmo del mes para el operario, la base entera para los demás.
 */
export function PestanaVolumen(props: { idCliente: number; mes: string | null; mesEnCurso: string; esOperario: boolean }) {
  const { idCliente, mes: mesElegido, mesEnCurso, esOperario } = props
  const { datos, errores, recargar } = useConsulta<FichaVolumen>(
    `/clientes/${idCliente}/volumen${mesElegido ? `?mes=${mesElegido}` : ''}`,
    'No pudimos cargar el volumen del cliente.',
  )
  if (errores.length) return <ErrorCarga errores={errores} onReintentar={recargar} className="ficha-error ficha-pestana-error" />
  if (!datos) return <LoadingDefault texto="Cargando el volumen…" />

  const t = textosComparacion(datos.comparacion, mesEnCurso)
  const conBase = datos.articulos.filter((a) => a.porcentaje !== null)
  const bajaron = conBase.filter((a) => a.porcentaje! < t.referencia).sort((a, b) => a.porcentaje! - b.porcentaje!)
  const subieron = conBase.filter((a) => a.porcentaje! >= t.referencia).sort((a, b) => b.porcentaje! - a.porcentaje!)
  const sinBase = datos.articulos.filter((a) => a.porcentaje === null)
  const mes = nombreMes(datos.comparacion.mes)

  const fila = (a: ArticuloVolumen) => (
    <li key={a.idArticulo} className="ficha-vol-fila">
      <NombreArticulo articulo={a} className="ficha-vol-articulo" />
      <span className="ficha-vol-numeros">
        <strong>{a.bultosActual === null ? '—' : formatoBultos(a.bultosActual)}</strong>
        <span className="apagado"> de {a.bultosBase === null ? '—' : formatoBultos(a.bultosBase)}</span>
      </span>
      <Avance
        porcentaje={a.porcentaje}
        referencia={t.referencia}
        sinBase={a.bultosBase === null ? (esOperario ? 'Sin base en tu cartera' : 'Sin base') : 'Nuevo este mes'}
      />
    </li>
  )

  return (
    <div className="ficha-pestana">
      <div className="ficha-vol-resumen">
        <TotalComparado
          total={datos.total}
          c={datos.comparacion}
          t={t}
          sujeto="Va"
          sinBase={esOperario ? 'Sin base para comparar: el mes anterior no estaba en tu cartera.' : 'Sin base para comparar.'}
          fueraDeCartera={esOperario ? 'Este mes el cliente ya no está en tu cartera.' : 'Este mes el cliente ya no está en la cartera de tus vendedores.'}
        />
      </div>
      {datos.articulos.length === 0 ? (
        <p className="vacio">No llevó nada en {mes} ni en {t.base}.</p>
      ) : (
        <div className="ficha-vol-grupos">
          {bajaron.length > 0 && (
            <section>
              <h3 className="ficha-vol-titulo baja">
                <span className="icono icono-chico" aria-hidden>trending_down</span>
                {t.ritmo ? 'Vienen debajo del ritmo' : 'Bajaron'} <span className="ficha-grupo-cantidad">{bajaron.length}</span>
              </h3>
              <ul className="ficha-vol-lista">{bajaron.map(fila)}</ul>
            </section>
          )}
          {subieron.length > 0 && (
            <section>
              <h3 className="ficha-vol-titulo sube">
                <span className="icono icono-chico" aria-hidden>trending_up</span>
                {t.ritmo ? 'En ritmo o arriba' : 'Subieron o se mantienen'} <span className="ficha-grupo-cantidad">{subieron.length}</span>
              </h3>
              <ul className="ficha-vol-lista">{subieron.map(fila)}</ul>
            </section>
          )}
          {sinBase.length > 0 && (
            <section>
              <h3 className="ficha-vol-titulo">
                <span className="icono icono-chico" aria-hidden>fiber_new</span>
                Sin base para comparar <span className="ficha-grupo-cantidad">{sinBase.length}</span>
              </h3>
              <ul className="ficha-vol-lista">{sinBase.map(fila)}</ul>
            </section>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Pestaña Devoluciones de la ficha: un recuadro por mes (bultos devueltos, los cambios, sobre lo vendido; tocándolo se elige) y
 * los artículos devueltos en el mes elegido. Gobernanza: los meses que no fueron de su cartera vienen en null.
 */
export function PestanaDevoluciones(props: {
  idCliente: number
  /** `mesDesde=…&mesHasta=…`: los meses que se ven. */
  rango: string
  mes: string | null
  onMes: (mes: string | null) => void
  esOperario: boolean
}) {
  const { idCliente, rango, mes, onMes, esOperario } = props
  const ruta = `/clientes/${idCliente}/devoluciones?${rango}${mes ? `&mes=${mes}` : ''}`
  const { datos, errores, cargando, recargar } = useConsulta<FichaDevoluciones>(ruta, 'No pudimos cargar las devoluciones del cliente.')
  if (errores.length) return <ErrorCarga errores={errores} onReintentar={recargar} className="ficha-error ficha-pestana-error" />
  if (!datos) return <LoadingDefault texto="Cargando las devoluciones…" />
  const ultimo = datos.meses[datos.meses.length - 1]

  return (
    <div className={`ficha-pestana${cargando ? ' recargando' : ''}`}>
      <p className="apagado ficha-dev-ayuda">Bultos devueltos (los cambios) sobre los vendidos. Tocá un mes para ver qué devolvió.</p>
      <ol className="ficha-dev-meses">
        {datos.kpis.map((k) => {
          const fuera = k.bultosVendidos === null
          return (
            <li key={k.mes}>
              <button
                type="button"
                className={`ficha-dev-mes${fuera ? ' fuera' : ''}`}
                aria-pressed={datos.mes === k.mes}
                disabled={fuera}
                onClick={() => onMes(k.mes === ultimo ? null : k.mes)}
              >
                <span className="ficha-mes-nombre">
                  <span className="ficha-mes-largo">{nombreMesTitulo(k.mes)}</span>
                  <span className="ficha-mes-corto" aria-hidden>{nombreMesCorto(k.mes)}</span>
                </span>
                {fuera ? (
                  <span className="ficha-mes-nota">{esOperario ? 'Fuera de tu cartera' : 'Fuera de cartera'}</span>
                ) : (
                  <>
                    <strong className="ficha-dev-pct">{pct(k.porcentaje)}</strong>
                    <span className="ficha-dev-detalle">
                      {formatoBultos(k.bultosDevueltos ?? 0)} de {formatoBultos(k.bultosVendidos ?? 0)}
                    </span>
                    {k.mesEnCurso && k.corteAl && <span className="ficha-dev-detalle">al {formatoFechaCorta(k.corteAl)}</span>}
                  </>
                )}
              </button>
            </li>
          )
        })}
      </ol>
      <h3 className="ficha-dev-titulo">Qué devolvió en {nombreMes(datos.mes)}</h3>
      {datos.articulos.length === 0 ? (
        <p className="vacio">No devolvió nada en {nombreMes(datos.mes)}.</p>
      ) : (
        <ul className="ficha-vol-lista">
          {datos.articulos.map((a) => (
            <li key={a.idArticulo} className="ficha-vol-fila">
              <NombreArticulo articulo={a} className="ficha-vol-articulo" />
              <span className="ficha-vol-numeros">
                <strong>{formatoBultos(a.bultosDevueltos)}</strong>
                <span className="apagado"> de {formatoBultos(a.bultosVendidos)}</span>
              </span>
              <strong className="ficha-dev-pct-fila">{pct(a.porcentaje)}</strong>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
