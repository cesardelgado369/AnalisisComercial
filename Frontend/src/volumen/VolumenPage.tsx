import { memo, useCallback, useMemo } from 'react'
import type { ChipVolumen, ClienteVolumen, Volumen } from '../api/types'
import { useConsulta } from '../api/useConsulta'
import { BuscadorCobertura } from '../cobertura/BuscadorCobertura'
import { mesesDisponibles } from '../cobertura/estados'
import { BarraFiltros, deLista, useFiltrosComerciales } from '../comercial/filtros'
import { CabeceraOrden, Chips, FilaCliente, SinClientes, TarjetaCliente, porNombre, useAbrirFicha } from '../comercial/lista'
import { Ayuda } from '../components/Ayuda'
import { ErrorCarga } from '../components/ErrorCarga'
import { formatoBultos, nombreMesTitulo } from '../utils/formato'
import { useMedia } from '../utils/useMedia'
import { useRecordarAltura } from '../utils/useRecordarAltura'
import { Avance, TotalComparado } from './Avance'
import { textosComparacion as textos } from './comparacion'
import { ExplicacionVolumen } from './ExplicacionVolumen'
import '../cobertura/cobertura.css'
import './volumen.css'

type Orden = 'nombre' | 'nombre-desc' | 'codigo' | 'codigo-desc' | 'actual' | 'actual-desc' | 'porcentaje' | 'porcentaje-desc'
const ORDENES: Orden[] = ['nombre', 'nombre-desc', 'codigo', 'codigo-desc', 'actual', 'actual-desc', 'porcentaje', 'porcentaje-desc']
const CHIPS: ChipVolumen[] = ['todos', 'bajaron', 'subieron', 'nuevos', 'sinCompraAun']
/** Mientras llega la primera respuesta (después, los textos dependen de la comparación). */
const CHIP_SIN_DATOS: Record<ChipVolumen, string> = {
  todos: 'Todos',
  bajaron: 'Bajaron',
  subieron: 'Subieron',
  nuevos: 'Nuevos en la cartera',
  sinCompraAun: 'Sin compra aún',
}

/**
 * Volumen (`/volumen`): cuántos bultos lleva cada cliente en el mes contra la base que le toca a cada rol
 * (CONTRATO_API.md). Todos los números los arma la API; acá se muestran, se ordenan y se filtran por chip.
 * Gobernanza: un cliente que en el mes base no era de la cartera de quien mira viene sin base («nuevo»), y el
 * vendedor ve el total de su cartera solo en porcentajes, sin bultos (Cesar, 30/10). El dueño tiene la ayuda del total.
 */
export function VolumenPage() {
  const filtros = useFiltrosComerciales()
  const { sesion, params, cambiar, buscar, elegirChip, verTodos, esOperario, busqueda, conVendedor, titulo } = filtros
  const chip = deLista(params.get('chip'), CHIPS, 'todos')
  const orden = deLista(params.get('orden'), ORDENES, 'nombre')
  // Agosto en adelante (julio es el primer mes con datos: no tiene base)
  const meses = mesesDisponibles(sesion.mesEnCurso).slice(1).reverse()
  const mes = filtros.mesElegido(meses)

  const consulta = new URLSearchParams(filtros.consulta)
  if (busqueda) consulta.set('busqueda', busqueda)
  if (chip !== 'todos') consulta.set('chip', chip)
  if (mes) consulta.set('mes', mes)
  const qs = consulta.toString()
  const { datos, errores, cargando, recargar } = useConsulta<Volumen>(`/volumen${qs ? `?${qs}` : ''}`, 'No pudimos cargar el volumen. Probá de nuevo.')
  const vigentes = errores.length ? null : datos
  const t = vigentes ? textos(vigentes.comparacion, sesion.mesEnCurso) : null
  const cambiarOrden = useCallback((o: Orden) => cambiar('orden', o === 'nombre' ? null : o, false), [cambiar])
  useRecordarAltura(!!datos)

  // «Nuevos» no le pasa al admin (su base siempre es un número): el chip no se muestra si no hay ninguno
  const chips = CHIPS.filter((c) => c !== 'nuevos' || esOperario || sesion.rol === 'supervisor' || (vigentes?.chips.nuevos ?? 0) > 0)

  return (
    <section className="pagina cob vol">
      <BarraFiltros filtros={filtros} />

      <div className={cargando && datos ? 'cob-tarjeta-principal recargando' : 'cob-tarjeta-principal'} aria-busy={cargando}>
        <header className="cob-resumen vol-resumen">
          <div className="cob-resumen-textos">
            <h1>{titulo}</h1>
            <p>{vigentes ? filtros.subtitulo(vigentes.chips.todos) : ' '}</p>
            <label className="vol-mes">
              <span className="sr-solo">Mes</span>
              <select value={mes ?? ''} onChange={(e) => cambiar('mes', e.target.value || null)}>
                {meses.map((m) => (
                  <option key={m} value={m === sesion.mesEnCurso ? '' : m}>
                    {nombreMesTitulo(m)}{m === sesion.mesEnCurso ? ' (en curso)' : ''}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {/* Sin clientes (p. ej. todavía sin datos de Chess) no hay total que comparar: la lista lo explica */}
          {vigentes && t && vigentes.chips.todos > 0 ? (
            <TotalComparado
              total={vigentes.total}
              c={vigentes.comparacion}
              t={t}
              sinBase={`Sin base para comparar: son clientes nuevos en ${esOperario ? 'tu' : 'la'} cartera.`}
              soloPorcentaje={esOperario}
              ayuda={
                filtros.ayuda && (
                  <Ayuda etiqueta="Cómo se calculó el volumen">
                    <ExplicacionVolumen total={vigentes.total} c={vigentes.comparacion} t={t} ayuda={filtros.ayuda} />
                  </Ayuda>
                )
              }
            />
          ) : null}
        </header>

        <div className="cob-barra">
          <Chips
            chips={chips}
            elegido={chip}
            alerta="bajaron"
            texto={(c) => (t?.textoChip ?? CHIP_SIN_DATOS)[c]}
            cantidades={vigentes?.chips ?? null}
            onElegir={elegirChip}
          />
          <BuscadorCobertura busqueda={busqueda} onBuscar={buscar} />
        </div>

        <div className="cob-cuerpo">
          {errores.length > 0 ? (
            <ErrorCarga errores={errores} onReintentar={recargar} acento />
          ) : !datos || !t ? (
            <div className="cob-estado"><span className="esqueleto esqueleto-titulo" /></div>
          ) : datos.clientes.length === 0 ? (
            <SinClientes icono="inventory_2" filtrado={!!busqueda || chip !== 'todos'} onVerTodos={verTodos} />
          ) : (
            <TablaVolumen
              clientes={datos.clientes}
              orden={orden}
              onOrden={cambiarOrden}
              columnaBase={t.columnaBase}
              referencia={t.referencia}
              conVendedor={conVendedor}
              mes={mes}
            />
          )}
        </div>
      </div>
    </section>
  )
}

function ordenar(clientes: ClienteVolumen[], orden: Orden) {
  const lista = [...clientes]
  const campo = orden.replace('-desc', '')
  // Los que no tienen porcentaje (sin base) van siempre al final
  const nulos = (a: number | null, b: number | null) => (a === null ? 1 : 0) - (b === null ? 1 : 0)
  lista.sort((a, b) =>
    campo === 'codigo' ? a.idCliente - b.idCliente
    : campo === 'actual' ? a.bultosActual - b.bultosActual
    : campo === 'porcentaje' ? nulos(a.porcentaje, b.porcentaje) || (a.porcentaje ?? 0) - (b.porcentaje ?? 0)
    : porNombre.compare(a.razonSocial, b.razonSocial),
  )
  if (orden.endsWith('-desc')) lista.reverse()
  if (campo === 'porcentaje') lista.sort((a, b) => nulos(a.porcentaje, b.porcentaje))
  return lista
}

interface PropsTabla {
  clientes: ClienteVolumen[]
  orden: Orden
  onOrden: (o: Orden) => void
  columnaBase: string
  referencia: number
  conVendedor: boolean
  mes: string | null
}

/** Memoizada como la de Cobertura: tipear en el buscador no re-dibuja cientos de filas. */
const TablaVolumen = memo(function TablaVolumen({ clientes, orden, onOrden, columnaBase, referencia, conVendedor, mes }: PropsTabla) {
  const angosto = useMedia('(max-width: 767px)')
  const ficha = useAbrirFicha('Volumen', `pestana=volumen${mes ? `&mesVol=${mes}` : ''}`)
  const lista = useMemo(() => ordenar(clientes, orden), [clientes, orden])

  if (angosto) {
    return (
      <ul className="cob-tarjetas">
        {lista.map((c) => (
          <TarjetaCliente key={c.idCliente} cliente={c} ficha={ficha} conVendedor={conVendedor}>
            <span className="vol-tarjeta-numeros">
              <strong>{formatoBultos(c.bultosActual)}</strong> bultos
              <span className="apagado"> · {c.bultosBase === null ? 'nuevo, sin base' : `${formatoBultos(c.bultosBase)} de ${columnaBase.toLowerCase()}`}</span>
            </span>
            <Avance porcentaje={c.porcentaje} referencia={referencia} />
          </TarjetaCliente>
        ))}
      </ul>
    )
  }

  const cabecera = { orden, onOrden }
  return (
    <div className="cob-tabla-scroll">
      <table className="cob-tabla vol-tabla">
        <thead>
          <tr>
            <CabeceraOrden {...cabecera} campo="codigo" texto="Cód. cliente" className="cob-col-codigo" />
            <CabeceraOrden {...cabecera} campo="nombre" texto="Razón social" />
            <CabeceraOrden {...cabecera} campo="actual" texto="Este mes" className="vol-col-num" />
            <th className="vol-col-num">{columnaBase}</th>
            <CabeceraOrden {...cabecera} campo="porcentaje" texto="Avance" className="vol-col-avance" />
          </tr>
        </thead>
        <tbody>
          {lista.map((c) => (
            <FilaCliente key={c.idCliente} cliente={c} ficha={ficha} conVendedor={conVendedor}>
              <td className="vol-col-num"><strong>{formatoBultos(c.bultosActual)}</strong></td>
              <td className="vol-col-num apagado">{c.bultosBase === null ? 'Nuevo' : formatoBultos(c.bultosBase)}</td>
              <td className="vol-col-avance"><Avance porcentaje={c.porcentaje} referencia={referencia} /></td>
            </FilaCliente>
          ))}
        </tbody>
      </table>
    </div>
  )
})
