import type { ClaseAbc, MovimientosCliente } from '../api/types'
import { useState } from 'react'
import { useConsulta } from '../api/useConsulta'
import { nombrePropio } from '../cobertura/estados'
import { LineaComprobantes, Numeros, totalesDelMes } from '../comercial/LineaComprobantes'
import { Capsula, EtiquetaAbc } from '../comercial/lista'
import { LoadingDefault } from '../components/loading/LoadingDefault'
import { Ventana } from '../components/Ventana'
import { BarritasMes } from '../components/BarritasMes'
import { ventanaDe } from '../cobertura/estados'
import { formatoBultos, formatoPorcentajeDecimal, hoyIso, nombreMes, nombreMesTitulo } from '../utils/formato'

/**
 * El mes del cliente en orden (`GET /api/clientes/{id}/movimientos`, la línea de tiempo de comercial/LineaComprobantes,
 * la misma de la ficha): cada factura y nota de crédito con su fecha, quién se la vendió, lo entregado y lo devuelto, y
 * artículo por artículo con su tipo de producto. Con los filtros de tipo de producto y foco de la pantalla, como la lista.
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
  // El mes del graficito que se está mirando (al pasar el mouse por su barra): su globito
  const [elegido, setElegido] = useState<string | null>(null)
  const ficha = useConsulta<FichaMeses>(serie === 'volumen' ? `/clientes/${idCliente}?${rango}` : null, 'No pudimos leer sus meses.')
  // La pestaña Devoluciones de la ficha trae el detalle por artículo de un mes: el elegido
  const fichaDev = useConsulta<FichaDevolucionesMeses>(
    serie === 'devueltos' ? `/clientes/${idCliente}/devoluciones?${rango}&mes=${elegido ?? mes}` : null,
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
  const { entregados, devueltos, rechazados, conRechazos } = totalesDelMes(d?.movimientos ?? [])

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
      <Numeros entregados={entregados} devueltos={devueltos} rechazados={rechazados} conRechazos={conRechazos} className="mov-totales" siempre />
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
            <BarritasMes
              titulo={serie === 'volumen' ? 'Bultos por mes' : 'Devolvió por mes'}
              datos={barras}
              elegido={elegido}
              onElegir={setElegido}
              // El mes en palabras, en el globito de su barra (Cesar, 10/11)
              detalle={
                elegido &&
                (serie === 'volumen' ? <DetalleVolumen ficha={ficha.datos} mes={elegido} /> : <DetalleDevuelto ficha={fichaDev.datos} mes={elegido} />)
              }
            />
          )}
          <LineaComprobantes movimientos={d.movimientos} />
        </>
      )}
    </Ventana>
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
 * Papa 500g. En total, el 4,8 % de lo vendido».
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
      .{k.porcentaje !== null && <> En total, el <strong>{formatoPorcentajeDecimal(k.porcentaje)}</strong> de lo vendido.</>}
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

