import type { ClaseAbc, MovimientosCliente } from '../api/types'
import { useState } from 'react'
import { useConsulta } from '../api/useConsulta'
import { nombrePropio } from '../cobertura/estados'
import { unidadVisible } from '../comercial/filtros'
import { Capsula, EtiquetaAbc } from '../comercial/lista'
import { LoadingDefault } from '../components/loading/LoadingDefault'
import { Ventana } from '../components/Ventana'
import { BarritasMes } from '../components/BarritasMes'
import { ventanaDe } from '../cobertura/estados'
import { formatoBultos, formatoFechaCorta, formatoPorcentajeDecimal, hoyIso, nombreMes, nombreMesTitulo } from '../utils/formato'

const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
const diaDe = (fecha: string) => DIAS[new Date(`${fecha}T12:00:00Z`).getUTCDay()]

/**
 * El mes del cliente en orden (`GET /api/clientes/{id}/movimientos`): cada factura y nota de crédito con su fecha, quién
 * se la vendió, lo entregado y lo devuelto, y artículo por artículo con su tipo de producto. Con los filtros de tipo de
 * producto y foco de la pantalla, como la lista.
 */
export function VentanaCliente(props: {
  idCliente: number
  fila: DOMRect
  mes: string
  /** La categoría del cliente (solo el dueño), que viene en la fila. */
  abc?: ClaseAbc
  /** El graficito de arriba: lo que pidió mes a mes (Volumen) o lo que devolvió (Devoluciones). */
  serie: 'volumen' | 'devueltos'
  filtros: URLSearchParams
  onEntrar: () => void
  onSalir: () => void
}) {
  const { idCliente, fila, mes, abc, serie, filtros, onEntrar, onSalir } = props
  // Mes a mes, los cuatro meses que se ven hasta el de la ventanita (la ficha: todos los productos)
  const meses = ventanaDe(mes)
  const rango = `mesDesde=${meses[0]}&mesHasta=${mes}`
  // El mes del graficito que se está mirando (al pasar el mouse por su barra); de entrada, el de la ventanita
  const [elegido, setElegido] = useState(mes)
  const ficha = useConsulta<FichaMeses>(serie === 'volumen' ? `/clientes/${idCliente}?${rango}` : null, 'No pudimos leer sus meses.')
  // La pestaña Devoluciones de la ficha trae el detalle por artículo de un mes: el elegido
  const fichaDev = useConsulta<FichaDevolucionesMeses>(
    serie === 'devueltos' ? `/clientes/${idCliente}/devoluciones?${rango}&mes=${elegido}` : null,
    'No pudimos leer sus meses.',
  )
  const enCursoIso = `${hoyIso().slice(0, 8)}01`
  const barras =
    serie === 'volumen'
      ? ficha.datos?.meses.map((m, i) => ({ mes: m, valor: ficha.datos!.bultos[i], enCurso: m === enCursoIso }))
      : fichaDev.datos?.kpis.map((k) => ({ mes: k.mes, valor: k.bultosDevueltos, enCurso: k.mesEnCurso }))
  const qs = new URLSearchParams({ mes })
  for (const clave of ['unidad', 'foco']) if (filtros.get(clave)) qs.set(clave, filtros.get(clave)!)
  const consulta = useConsulta<MovimientosCliente>(`/clientes/${idCliente}/movimientos?${qs}`, 'No pudimos leer sus comprobantes.')
  const d = consulta.datos?.idCliente === idCliente && consulta.datos.mes === mes ? consulta.datos : null
  // El vendedor va en la cabecera, donde estaba el mes (Cesar, 10/11: ya se sabe qué mes es). Si le vendieron varios,
  // también en cada comprobante
  const vendedores = [...new Set((d?.movimientos ?? []).map((m) => m.vendedor).filter((v): v is string => !!v))]
  const varios = vendedores.length > 1
  const entregados = d?.movimientos.reduce((s, m) => s + m.entregados, 0) ?? 0
  const devueltos = d?.movimientos.reduce((s, m) => s + m.devueltos, 0) ?? 0

  const cabecera = (
    <>
      <strong className="ventana-cliente-nombre">
        {d ? d.razonSocial : 'Buscando…'}
        <EtiquetaAbc abc={abc} />
      </strong>
      {vendedores.length > 0 && (
        <span className="ventana-vendedores">
          {vendedores.map((v) => (
            <Capsula key={v} icono="person" que="Vendedor" texto={nombrePropio(v)} />
          ))}
        </span>
      )}
    </>
  )
  const pie = d ? (
    <>
      <span>Total del mes</span>
      <Numeros entregados={entregados} devueltos={devueltos} className="mov-totales" siempre />
    </>
  ) : (
    <span>{nombreMesTitulo(mes)}…</span>
  )

  return (
    <Ventana
      fila={fila}
      etiqueta={`Comprobantes de ${d ? d.razonSocial : 'el cliente'} en ${nombreMes(mes)}`}
      cabecera={cabecera}
      pie={pie}
      onEntrar={onEntrar}
      onSalir={onSalir}
    >
      {consulta.errores.length > 0 ? (
        <p className="ventana-cliente-aviso">{consulta.errores.join(' ')}</p>
      ) : !d ? (
        <LoadingDefault texto="Buscando sus comprobantes…" />
      ) : d.movimientos.length === 0 ? (
        <p className="ventana-cliente-aviso">Sin comprobantes en {nombreMes(mes)} con estos filtros.</p>
      ) : (
        <>
          {barras && barras.length > 1 && (
            <>
              <BarritasMes
                titulo={serie === 'volumen' ? 'Bultos por mes' : 'Devolvió por mes'}
                datos={barras}
                elegido={elegido}
                onElegir={setElegido}
              />
              <p className="barritas-detalle">
                {serie === 'volumen' ? <DetalleVolumen ficha={ficha.datos} mes={elegido} /> : <DetalleDevuelto ficha={fichaDev.datos} mes={elegido} />}
              </p>
            </>
          )}
          <div className="ventana-columnas" aria-hidden>
            <span>Se entregó</span>
            <span>Se devolvió</span>
          </div>
          <ol className="ventana-linea">
            {d.movimientos.map((m) => (
              <li key={`${m.tipo}-${m.comprobante}`} className={`mov mov-${m.tipo}`}>
                <span className="mov-punto" aria-hidden>{m.tipo === 'factura' ? '+' : '−'}</span>
                <div className="mov-cuerpo">
                  <div className="mov-cabecera">
                    <span className="mov-fecha">
                      {diaDe(m.fecha)} {formatoFechaCorta(m.fecha)}
                    </span>
                    <span className="mov-tipo">{m.tipo === 'factura' ? 'Compró' : 'Devolvió'}</span>
                    {varios && m.vendedor && <Capsula icono="person" que="Vendedor" texto={nombrePropio(m.vendedor)} />}
                    <Numeros entregados={m.entregados} devueltos={m.devueltos} className="mov-totales" />
                  </div>
                  <ul className="mov-lineas">
                    {m.lineas.map((l) => (
                      <li key={l.idArticulo}>
                        <span className="mov-articulo">
                          {nombrePropio(l.descripcion)}
                          <span className="mov-rubro">{unidadVisible(l.unidadNegocio)}</span>
                        </span>
                        <Numeros entregados={l.entregados} devueltos={l.devueltos} className="mov-numeros" />
                      </li>
                    ))}
                  </ul>
                  <span className="mov-comprobante">
                    {m.tipo === 'factura' ? 'Factura' : 'Nota de crédito'} {m.comprobante}
                  </span>
                </div>
              </li>
            ))}
          </ol>
        </>
      )}
    </Ventana>
  )
}

/**
 * Lo entregado y lo devuelto en sus dos columnas (Se entregó · Se devolvió), alineadas en toda la ventanita. Un cero va
 * vacío para que se lea solo lo que pasó; en el total del mes (`siempre`), con su número.
 */
function Numeros(props: { entregados: number; devueltos: number; className: string; siempre?: boolean }) {
  const { entregados, devueltos, className, siempre = false } = props
  return (
    <span className={`${className} ventana-numeros`}>
      <span className="mov-entregado">{entregados > 0 || siempre ? `+${formatoBultos(entregados)}` : ''}</span>
      <span className="mov-devuelto">{devueltos > 0 || siempre ? `−${formatoBultos(devueltos)}` : ''}</span>
    </span>
  )
}

/** Lo que trae la ficha para el graficito de Volumen: los bultos de cada mes, en total y por artículo. */
type FichaMeses = {
  meses: string[]
  bultos: (number | null)[]
  articulos: { idArticulo: number; descripcion: string; bultos: (number | null)[] }[]
}
/** Lo de la pestaña Devoluciones de la ficha: cada mes y, del elegido (`mes`), lo devuelto por artículo. */
type FichaDevolucionesMeses = {
  kpis: { mes: string; bultosDevueltos: number | null; porcentaje: number | null; mesEnCurso: boolean }[]
  mes: string
  articulos: { idArticulo: number; descripcion: string; bultosDevueltos: number }[]
}

const cuantos = (n: number) => `${formatoBultos(n)} ${n === 1 ? 'bulto' : 'bultos'}`

/** «0,5 de Canelones y 1 de Ñoquis», hasta tres y «y 2 más». */
function deArticulos(lista: { descripcion: string; bultos: number }[]) {
  const partes = lista.slice(0, 3).map((a) => `${formatoBultos(a.bultos)} de ${nombrePropio(a.descripcion)}`)
  const mas = lista.length - partes.length
  if (mas > 0) partes.push(`${mas} más`)
  return partes.length > 1 ? `${partes.slice(0, -1).join(', ')} y ${partes[partes.length - 1]}` : partes[0]
}

/**
 * El mes elegido del graficito de Devoluciones, en palabras (Cesar, 10/11): «Agosto devolvió 1 bulto de Ñoquis de
 * Papa 500g. En total, el 4,8 % de lo facturado».
 */
function DetalleDevuelto({ ficha, mes }: { ficha: FichaDevolucionesMeses | null; mes: string }) {
  const k = ficha?.kpis.find((x) => x.mes === mes)
  if (!ficha || !k) return <>{nombreMesTitulo(mes)}…</>
  if (k.bultosDevueltos === null) return <>En {nombreMes(mes)} no era cliente de tu cartera.</>
  if (k.bultosDevueltos <= 0) return <><strong>{nombreMesTitulo(mes)}</strong> no devolvió nada.</>
  const articulos = ficha.mes === mes ? ficha.articulos.filter((a) => a.bultosDevueltos > 0) : []
  const solo = articulos.length === 1
  return (
    <>
      <strong>{nombreMesTitulo(mes)}</strong> devolvió <strong>{cuantos(k.bultosDevueltos)}</strong>
      {solo ? (
        <> de <strong>{nombrePropio(articulos[0].descripcion)}</strong></>
      ) : articulos.length > 1 ? (
        <>: {deArticulos(articulos.map((a) => ({ descripcion: a.descripcion, bultos: a.bultosDevueltos })))}</>
      ) : null}
      .{k.porcentaje !== null && <> En total, el <strong>{formatoPorcentajeDecimal(k.porcentaje)}</strong> de lo facturado.</>}
    </>
  )
}

/** El mes elegido del graficito de Volumen, en palabras: «Agosto pidió 31,5 bultos: 12 de Ravioles…». */
function DetalleVolumen({ ficha, mes }: { ficha: FichaMeses | null; mes: string }) {
  const i = ficha?.meses.indexOf(mes) ?? -1
  if (!ficha || i < 0) return <>{nombreMesTitulo(mes)}…</>
  const total = ficha.bultos[i]
  if (total === null) return <>En {nombreMes(mes)} no era cliente de tu cartera.</>
  if (total <= 0) return <><strong>{nombreMesTitulo(mes)}</strong> no pidió nada.</>
  const articulos = ficha.articulos
    .map((a) => ({ descripcion: a.descripcion, bultos: a.bultos[i] ?? 0 }))
    .filter((a) => a.bultos > 0)
    .sort((a, b) => b.bultos - a.bultos)
  return (
    <>
      <strong>{nombreMesTitulo(mes)}</strong> pidió <strong>{cuantos(total)}</strong>
      {articulos.length === 1 ? <> de <strong>{nombrePropio(articulos[0].descripcion)}</strong></> : articulos.length > 1 ? <>: {deArticulos(articulos)}</> : null}.
    </>
  )
}

