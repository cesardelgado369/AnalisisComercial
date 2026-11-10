import type { ClaseAbc, Cobertura, Volumen } from '../api/types'
import { useConsulta } from '../api/useConsulta'
import { nombrePropio } from '../cobertura/estados'
import { EtiquetaAbc } from '../comercial/lista'
import { LoadingDefault } from '../components/loading/LoadingDefault'
import { Ventana } from '../components/Ventana'
import { formatoBultos, formatoEntero, formatoPorcentaje } from '../utils/formato'
import { ETIQUETA_MEDIDA } from './medidas'

/** Qué vendedor y qué foco: lo que se guarda al pasar el mouse por una fila del análisis. */
export interface ClaveVendedorFoco {
  idFoco: number
  idPersonal: number
  nombre: string
}

/**
 * La ventanita de un vendedor en Focos del mes (Cesar, 10/11): sus clientes del mes con los que ya compraron el foco
 * resaltados arriba. CCC: los de `GET /api/cobertura?vendedor=&foco=` de ese mes (compró o no); VOL: los de
 * `GET /api/volumen?vendedor=&foco=` (con sus bultos). Con la comparativa y la categoría elegidas en la pantalla.
 */
export function VentanaVendedor(props: {
  clave: ClaveVendedorFoco
  foco: { nombre: string; medida: 'ccc' | 'vol' }
  mes: string
  acumulado: boolean
  categoria: ClaseAbc | null
  fila: DOMRect
  onEntrar: () => void
  onSalir: () => void
}) {
  const { clave, foco, mes, acumulado, categoria, fila, onEntrar, onSalir } = props
  const qs = new URLSearchParams({ vendedor: String(clave.idPersonal), foco: String(clave.idFoco) })
  if (categoria) qs.set('abc', categoria)
  if (foco.medida === 'vol') {
    qs.set('mes', mes)
    if (acumulado) qs.set('comparacion', 'acumulado')
  } else {
    qs.set('mesDesde', mes)
    qs.set('mesHasta', mes)
  }
  const ruta = `/${foco.medida === 'vol' ? 'volumen' : 'cobertura'}?${qs}`
  const consulta = useConsulta<Cobertura | Volumen>(ruta, 'No pudimos leer sus clientes.')

  // Una lista para las dos medidas: si compró (CCC) o si lleva bultos del foco (VOL), y los que compraron primero
  const clientes = consulta.datos
    ? ('kpis' in consulta.datos
        ? consulta.datos.clientes.map((c) => ({ ...c, compro: c.meses[c.meses.length - 1] === 'compro', bultos: null as number | null }))
        : consulta.datos.clientes.map((c) => ({ ...c, compro: c.bultosActual > 0, bultos: c.bultosActual }))
      ).sort((a, b) => Number(b.compro) - Number(a.compro) || (b.bultos ?? 0) - (a.bultos ?? 0) || a.razonSocial.localeCompare(b.razonSocial, 'es'))
    : null
  const compraron = clientes?.filter((c) => c.compro).length ?? 0

  return (
    <Ventana
      fila={fila}
      etiqueta={`Clientes de ${nombrePropio(clave.nombre)} con ${foco.nombre}`}
      cabecera={
        <>
          <strong>{nombrePropio(clave.nombre)}</strong>
          <span className="ventana-foco">
            {ETIQUETA_MEDIDA[foco.medida]} - {foco.nombre}
          </span>
        </>
      }
      pie={
        clientes ? (
          <>
            <span>Ya compraron</span>
            <span>
              {formatoEntero(compraron)} de {formatoEntero(clientes.length)}
              {clientes.length > 0 && ` · ${formatoPorcentaje((compraron / clientes.length) * 100)}`}
            </span>
          </>
        ) : (
          <span>Buscando…</span>
        )
      }
      onEntrar={onEntrar}
      onSalir={onSalir}
    >
      {consulta.errores.length > 0 ? (
        <p className="ventana-cliente-aviso">{consulta.errores.join(' ')}</p>
      ) : !clientes ? (
        <LoadingDefault texto="Buscando sus clientes…" />
      ) : clientes.length === 0 ? (
        <p className="ventana-cliente-aviso">No tiene clientes con estos filtros.</p>
      ) : (
        <ul className="ventana-clientes">
          {clientes.map((c) => (
            <li key={c.idCliente} className={c.compro ? 'compro' : undefined}>
              <span className="ventana-clientes-marca" aria-hidden>{c.compro ? '✓' : ''}</span>
              <span className="ventana-clientes-nombre">
                {c.razonSocial}
                <EtiquetaAbc abc={c.abc} />
              </span>
              <span className="ventana-clientes-dato">
                {c.bultos !== null && c.bultos > 0 ? `${formatoBultos(c.bultos)} bultos` : c.compro ? 'compró' : 'todavía no'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Ventana>
  )
}
