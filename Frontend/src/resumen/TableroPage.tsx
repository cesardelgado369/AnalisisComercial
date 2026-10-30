import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { Cobertura, KpiMes } from '../api/types'
import { useSesionApp } from '../auth/SesionApp'
import { ErrorCarga } from '../components/ErrorCarga'
import { LoadingDefault } from '../components/loading/LoadingDefault'
import { DIAS_VISITA, nombrePropio } from '../cobertura/estados'
import { SelectorMes } from '../comercial/filtros'
import { useMesReferencia } from '../comercial/mesReferencia'
import { formatoEntero, formatoFechaCorta, nombreMes } from '../utils/formato'
import './tablero.css'

/**
 * Tablero (`/resumen`, admin y supervisor): la foto macro en una grilla de 3×3 que entra en una pantalla.
 * - 11, 12, 21 y 22: el mes contra el anterior (cobertura, clientes con compra, cartera, dejaron de comprar). El mes es
 *   el en curso, o el que eligió el dueño en el filtro «Mes» (comercial/mesReferencia).
 * - 13 y 23: los días de visita (la cobertura de cada ruta y cómo viene contra el mes anterior).
 * - 31, 32 y 33: los vendedores (cobertura, variación y estado).
 * Los números son los de `GET /api/cobertura` (los arma la API), pedidos por día y por vendedor. Con `chip` la lista
 * de clientes viene corta; los KPI y los chips no cambian con el chip.
 * TODO testing: armado para la reunión del 29/10 sobre `/api/cobertura`; el contrato tiene `GET /api/resumen` para esto.
 */

interface Foto {
  actual: KpiMes | undefined
  anterior: KpiMes | undefined
  dejaron: number
}

interface Datos {
  general: Foto
  dejaronAntes: number
  dias: { codigo: number; nombre: string; foto: Foto }[]
  vendedores: { id: number; nombre: string; foto: Foto }[]
}

type Estado = 'bien' | 'atencion' | 'mal'

/** Los meses van como el primer día («2026-10-01»), igual que `sesion.mesEnCurso`. */
function mesAnterior(mes: string) {
  const anio = Number(mes.slice(0, 4))
  const m = Number(mes.slice(5, 7))
  return m === 1 ? `${anio - 1}-12-01` : `${anio}-${String(m - 1).padStart(2, '0')}-01`
}

const variacion = (f: Foto) => (f.actual && f.anterior ? f.actual.porcentaje - f.anterior.porcentaje : null)

/** TODO testing: el criterio del semáforo lo tiene que definir el negocio (y calcularlo la API). */
function estadoDe(delta: number | null): Estado {
  if (delta === null || delta >= -2) return 'bien'
  return delta >= -8 ? 'atencion' : 'mal'
}

const TEXTO_ESTADO: Record<Estado, string> = { bien: 'Viene bien', atencion: 'Atención', mal: 'Viene mal' }
const ICONO_ESTADO: Record<Estado, string> = { bien: 'check_circle', atencion: 'warning', mal: 'error' }

const pts = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : '±'}${Math.abs(Math.round(n))} pts`
const pct = (n: number | undefined) => (n === undefined ? '—' : `${Math.round(n)}%`)

export function TableroPage() {
  const sesion = useSesionApp()
  const referencia = useMesReferencia()
  const mes = referencia.mes
  const ant = mesAnterior(mes)
  const [datos, setDatos] = useState<Datos | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [vuelta, setVuelta] = useState(0)

  useEffect(() => {
    let vigente = true
    const foto = (c: Cobertura): Foto => ({
      actual: c.kpis.find((k) => k.mes.slice(0, 7) === mes.slice(0, 7)),
      anterior: c.kpis.find((k) => k.mes.slice(0, 7) === ant.slice(0, 7)),
      dejaron: c.chips.dejaronDeComprar,
    })
    const pedir = (qs: string, hasta = mes) => api.get<Cobertura>(`/cobertura?chip=dejaronDeComprar&mesHasta=${hasta}${qs}`)
    const vendedores = sesion.vendedores.filter((v) => !v.esCasa)
    Promise.all([
      pedir(''),
      pedir('', ant),
      Promise.all(DIAS_VISITA.map((d) => pedir(`&dia=${d.codigo}`))),
      Promise.all(vendedores.map((v) => pedir(`&vendedor=${v.id}`))),
    ])
      .then(([general, generalAnt, dias, porVendedor]) => {
        if (!vigente) return
        setDatos({
          general: foto(general),
          dejaronAntes: generalAnt.chips.dejaronDeComprar,
          dias: DIAS_VISITA.map((d, i) => ({ codigo: d.codigo, nombre: d.nombre, foto: foto(dias[i]) })),
          vendedores: vendedores.map((v, i) => ({ id: v.id, nombre: nombrePropio(v.nombre), foto: foto(porVendedor[i]) })),
        })
        setError(null)
      })
      .catch(() => vigente && setError('No pudimos armar el tablero. Probá de nuevo.'))
    return () => {
      vigente = false
    }
  }, [mes, ant, sesion.vendedores, vuelta])

  const corte = datos?.general.actual?.corteAl
  const mesTxt = nombreMes(mes)
  const antTxt = nombreMes(ant)

  return (
    <section className="pagina tablero">
      <header className="tablero-cabecera">
        <h1>Tablero comercial</h1>
        <p>
          <span className="tablero-mes">{mesTxt}</span>
          {corte ? ` al ${formatoFechaCorta(corte)} (en curso)` : ''} contra {antTxt} completo
        </p>
        {referencia.puedeElegir && (
          <div className="tablero-mes-filtro">
            <SelectorMes referencia={referencia} />
          </div>
        )}
      </header>

      {error ? (
        <ErrorCarga errores={[error]} onReintentar={() => setVuelta((v) => v + 1)} className="adm-error-carga" />
      ) : !datos ? (
        <LoadingDefault texto="Armando el tablero…" />
      ) : (
        <Grilla datos={datos} mesTxt={mesTxt} antTxt={antTxt} />
      )}
    </section>
  )
}

function Grilla({ datos, mesTxt, antTxt }: { datos: Datos; mesTxt: string; antTxt: string }) {
  const { actual, anterior } = datos.general
  const vendedores = [...datos.vendedores].sort((a, b) => (b.foto.actual?.porcentaje ?? 0) - (a.foto.actual?.porcentaje ?? 0))
  const maxDejaron = Math.max(1, ...datos.vendedores.map((v) => v.foto.dejaron))

  return (
    <div className="tablero-grilla">
      {/* 11 */}
      <Tarjeta titulo="Cobertura del mes" icono="donut_large">
        <Metrica
          valor={pct(actual?.porcentaje)}
          delta={actual && anterior ? actual.porcentaje - anterior.porcentaje : null}
          formato={pts}
          antes={`${pct(anterior?.porcentaje)} en ${antTxt}`}
        />
      </Tarjeta>

      {/* 12 */}
      <Tarjeta titulo="Clientes que compraron" icono="shopping_bag">
        <Metrica
          valor={actual ? formatoEntero(actual.clientesConCompra) : '—'}
          delta={actual && anterior ? actual.clientesConCompra - anterior.clientesConCompra : null}
          formato={(n) => `${n > 0 ? '+' : n < 0 ? '−' : '±'}${formatoEntero(Math.abs(n))}`}
          antes={`${anterior ? formatoEntero(anterior.clientesConCompra) : '—'} en ${antTxt}`}
        />
      </Tarjeta>

      {/* 13 */}
      <Tarjeta titulo="Cobertura por día de visita" icono="calendar_view_week" clase="tablero-dias">
        <Leyenda mesTxt={mesTxt} antTxt={antTxt} />
        <ul className="tablero-barras">
          {datos.dias.map((d) => (
            <Barra key={d.codigo} nombre={d.nombre.slice(0, 3)} titulo={d.nombre} foto={d.foto} antTxt={antTxt} />
          ))}
        </ul>
      </Tarjeta>

      {/* 21 */}
      <Tarjeta titulo="Clientes en cartera" icono="groups">
        <Metrica
          valor={actual ? formatoEntero(actual.clientesCartera) : '—'}
          delta={actual && anterior ? actual.clientesCartera - anterior.clientesCartera : null}
          formato={(n) => `${n > 0 ? '+' : n < 0 ? '−' : '±'}${formatoEntero(Math.abs(n))}`}
          antes={`${anterior ? formatoEntero(anterior.clientesCartera) : '—'} en ${antTxt}`}
          neutro
        />
      </Tarjeta>

      {/* 22 */}
      <Tarjeta titulo="Dejaron de comprar" icono="person_remove">
        <Metrica
          valor={formatoEntero(datos.general.dejaron)}
          delta={datos.general.dejaron - datos.dejaronAntes}
          formato={(n) => `${n > 0 ? '+' : n < 0 ? '−' : '±'}${formatoEntero(Math.abs(n))}`}
          antes={`${formatoEntero(datos.dejaronAntes)} al cierre de ${antTxt}`}
          menosEsMejor
        />
      </Tarjeta>

      {/* 23 */}
      <Tarjeta titulo="¿Cómo vienen las rutas?" icono="route">
        <ul className="tablero-lista">
          {datos.dias.map((d) => {
            const delta = variacion(d.foto)
            const estado = estadoDe(delta)
            return (
              <li key={d.codigo}>
                <span className="tablero-lista-nombre">{d.nombre}</span>
                <span className="tablero-lista-dato">{delta === null ? '—' : pts(delta)}</span>
                <span className="tablero-lista-dato tablero-secundario">{formatoEntero(d.foto.dejaron)} dejaron</span>
                <Semaforo estado={estado} />
              </li>
            )
          })}
        </ul>
      </Tarjeta>

      {/* 31 */}
      <Tarjeta titulo="Cobertura por vendedor" icono="leaderboard">
        <Leyenda mesTxt={mesTxt} antTxt={antTxt} />
        <ul className="tablero-barras horizontal">
          {vendedores.map((v) => (
            <Barra key={v.id} nombre={v.nombre} titulo={v.nombre} foto={v.foto} antTxt={antTxt} horizontal />
          ))}
        </ul>
      </Tarjeta>

      {/* 32 */}
      <Tarjeta titulo={`Variación contra ${antTxt}`} icono="trending_up">
        <ul className="tablero-variaciones">
          {vendedores.map((v) => {
            const delta = variacion(v.foto)
            const ancho = delta === null ? 0 : Math.min(50, Math.abs(delta) * 2.5)
            return (
              <li key={v.id} title={`${v.nombre}: ${delta === null ? 'sin datos' : pts(delta)}`}>
                <span className="tablero-lista-nombre">{v.nombre}</span>
                <span className="tablero-divergente">
                  <span className="tablero-eje" />
                  {delta !== null && (
                    <span
                      className={delta < 0 ? 'tablero-delta baja' : 'tablero-delta sube'}
                      style={delta < 0 ? { right: '50%', width: `${ancho}%` } : { left: '50%', width: `${ancho}%` }}
                    />
                  )}
                </span>
                <span className="tablero-lista-dato">{delta === null ? '—' : pts(delta)}</span>
              </li>
            )
          })}
        </ul>
      </Tarjeta>

      {/* 33 */}
      <Tarjeta titulo="Estado de los vendedores" icono="assignment_ind">
        <ul className="tablero-lista">
          {vendedores.map((v) => {
            const estado = estadoDe(variacion(v.foto))
            return (
              <li key={v.id}>
                <span className="tablero-lista-nombre">{v.nombre}</span>
                <span className="tablero-dejaron" title={`${v.foto.dejaron} clientes dejaron de comprar`}>
                  <span className="tablero-dejaron-pista">
                    <span className="tablero-dejaron-barra" style={{ width: `${(v.foto.dejaron / maxDejaron) * 100}%` }} />
                  </span>
                  <span className="tablero-secundario">{formatoEntero(v.foto.dejaron)} dejaron</span>
                </span>
                <Semaforo estado={estado} />
              </li>
            )
          })}
        </ul>
      </Tarjeta>
    </div>
  )
}

function Tarjeta({ titulo, icono, clase, children }: { titulo: string; icono: string; clase?: string; children: React.ReactNode }) {
  return (
    <article className={`tarjeta tablero-tarjeta ${clase ?? ''}`}>
      <h2>
        <span className="icono icono-chico" aria-hidden>{icono}</span>
        {titulo}
      </h2>
      <div className="tablero-cuerpo">{children}</div>
    </article>
  )
}

function Metrica(props: {
  valor: string
  delta: number | null
  formato: (n: number) => string
  antes: string
  menosEsMejor?: boolean
  neutro?: boolean
}) {
  const { valor, delta, formato, antes, menosEsMejor, neutro } = props
  const bueno = delta === null || delta === 0 || neutro ? null : (delta > 0) !== Boolean(menosEsMejor)
  return (
    <div className="tablero-metrica">
      <strong className="tablero-valor">{valor}</strong>
      {delta !== null && (
        <span className={`tablero-cambio ${bueno === null ? '' : bueno ? 'bueno' : 'malo'}`}>
          <span className="icono icono-chico" aria-hidden>{delta > 0 ? 'arrow_upward' : delta < 0 ? 'arrow_downward' : 'remove'}</span>
          {formato(delta)}
        </span>
      )}
      <span className="tablero-secundario">{antes}</span>
    </div>
  )
}

function Barra({ nombre, titulo, foto, antTxt, horizontal }: { nombre: string; titulo: string; foto: Foto; antTxt: string; horizontal?: boolean }) {
  const actual = foto.actual?.porcentaje ?? 0
  const anterior = foto.anterior?.porcentaje
  const eje = horizontal ? 'width' : 'height'
  const marca = horizontal ? 'left' : 'bottom'
  return (
    <li title={`${titulo}: ${pct(foto.actual?.porcentaje)} (${pct(anterior)} en ${antTxt})`}>
      <span className="tablero-barra-nombre">{nombre}</span>
      <span className="tablero-barra-pista">
        <span className="tablero-barra" style={{ [eje]: `${actual}%` }} />
        {anterior !== undefined && <span className="tablero-barra-anterior" style={{ [marca]: `${anterior}%` }} />}
      </span>
      <span className="tablero-barra-valor">{pct(foto.actual?.porcentaje)}</span>
    </li>
  )
}

function Leyenda({ mesTxt, antTxt }: { mesTxt: string; antTxt: string }) {
  return (
    <div className="tablero-leyenda" aria-hidden>
      <span><i className="tablero-muestra" /> {mesTxt}</span>
      <span><i className="tablero-muestra anterior" /> {antTxt}</span>
    </div>
  )
}

function Semaforo({ estado }: { estado: Estado }) {
  return (
    <span className={`tablero-estado ${estado}`}>
      <span className="icono icono-chico" aria-hidden>{ICONO_ESTADO[estado]}</span>
      {TEXTO_ESTADO[estado]}
    </span>
  )
}
