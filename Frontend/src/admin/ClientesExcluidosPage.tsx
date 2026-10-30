import { useState } from 'react'
import { avisarCambio } from '../api/cambios'
import type { ClienteAdmin, ResumenClientesVendedor } from '../api/types'
import { useConsulta } from '../api/useConsulta'
import { ErrorCarga } from '../components/ErrorCarga'
import { LoadingDefault } from '../components/loading/LoadingDefault'
import { cantidad, fechaUtc, haceCuanto } from '../utils/formato'
import {
  BarraClientes,
  cambioVigente,
  GruposPorVendedor,
  ListaClientes,
  useGruposAbiertos,
  useTextoBuscado,
  type CambioLocal,
  type VistaFila,
} from './BaseClientes'
import { ModalExcluir, type CambioExclusion } from './ModalExcluir'

type Filtro = 'todos' | 'sugeridos' | 'solo' | 'sin'
/** Lo que dice la lista sola de cada filtro cuando no hay nadie. */
const VACIO: Record<Filtro, string> = {
  todos: 'No hay clientes.',
  sugeridos: 'No hay clientes sugeridos para excluir.',
  solo: 'No hay clientes excluidos.',
  sin: 'No hay clientes sin excluir.',
}

/**
 * Clientes excluidos (`/admin/exclusiones`, solo admin; pedido de Cesar del 29/10): toda la base de clientes que baja de
 * Chess, **agrupada por vendedor** (BaseClientes), para excluir los que no tienen que contar en ninguna cartera (p. ej.
 * CLIENTE TEST) o volver a incluirlos. Cada cliente muestra su **estadística rápida** (los últimos meses, la última
 * compra) y, si hace mucho que no compra, la **sugerencia** del backend («No compra hace 4 meses»). Excluir cambia la
 * Cobertura (se avisa para releerla).
 *
 * Todo confirmado en CONTRATO_API.md (29/10), incluidas la estadística y la sugerencia: la regla y los textos son del
 * backend (90 días sin comprar → excluir; 60 a 89, o dejó de comprar el último mes cerrado → revisar).
 */
export function ClientesExcluidosPage() {
  const resumen = useConsulta<ResumenClientesVendedor[]>('/admin/clientes/resumen', 'No pudimos leer los vendedores.')
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const { texto, setTexto, busqueda } = useTextoBuscado()
  const { abiertos, alternar } = useGruposAbiertos('analisis.clientes.abiertos')
  const [accion, setAccion] = useState<CambioExclusion | null>(null)
  const [cambiados, setCambiados] = useState<Record<number, CambioLocal>>({})
  /** Para lectores de pantalla: qué pasó con el último cambio. */
  const [aviso, setAviso] = useState('')
  const [cambios, setCambios] = useState(0)

  function alCambiar(fila: ClienteAdmin) {
    setCambiados((c) => ({ ...c, [fila.idCliente]: { fila, en: Date.now() } }))
    setAccion(null)
    setAviso(`${fila.razonSocial}: ${fila.excluido ? 'excluido' : 'vuelve a contar en las carteras'}.`)
    setCambios((n) => n + 1)
    resumen.recargar()
    avisarCambio() // Cobertura y lo demás se vuelven a leer
  }

  const filtros = (extra: Record<string, string>) => {
    const p = new URLSearchParams(extra)
    if (filtro === 'sugeridos') p.set('sugerencia', 'excluir')
    else if (filtro !== 'todos') p.set('excluidos', filtro)
    return p
  }
  const totalExcluidos = resumen.datos?.reduce((s, r) => s + r.excluidos, 0)
  const totalSugeridos = resumen.datos?.reduce((s, r) => s + r.sugeridos, 0)

  const vista = (f: ClienteAdmin, recibidoEn: number): VistaFila => {
    // Lo cambiado acá pisa solo la exclusión
    const cambio = cambioVigente(cambiados, f, recibidoEn)
    const c = cambio ? { ...f, excluido: cambio.excluido, motivo: cambio.motivo, excluidoPor: cambio.excluidoPor, excluidoEn: cambio.excluidoEn } : f
    // Un excluido nunca trae sugerencia; recién excluido desde acá, se apaga sin esperar a la API
    const sugerencia = c.excluido ? null : c.sugerencia
    return {
      cliente: c,
      clase: c.excluido ? 'adm-excluido' : sugerencia === 'excluir' ? 'adm-sugerido' : undefined,
      estado: c.excluido ? (
        <>
          <div className="adm-marca-excluido">
            <span className="icono icono-chico" aria-hidden>person_off</span>
            Excluido{c.motivo ? `: ${c.motivo}` : ''}
          </div>
          {(c.excluidoPor || c.excluidoEn) && (
            <div className="celda-secundaria">
              {[c.excluidoPor, c.excluidoEn ? haceCuanto(fechaUtc(c.excluidoEn)) : null].filter(Boolean).join(' · ')}
            </div>
          )}
        </>
      ) : sugerencia ? (
        <div className={`adm-sugerencia-estado ${sugerencia}`}>
          <span className="icono icono-chico" aria-hidden>{sugerencia === 'excluir' ? 'lightbulb' : 'visibility'}</span>
          <span>
            <strong>{sugerencia === 'excluir' ? 'Sugerido excluir' : 'Para revisar'}</strong>
            {c.motivoSugerencia && <span className="celda-secundaria">{c.motivoSugerencia}</span>}
          </span>
        </div>
      ) : (
        <span className="apagado">Cliente normal</span>
      ),
      accion: (
        <button
          type="button"
          className={sugerencia === 'excluir' ? 'btn btn-acento' : 'btn'}
          onClick={() => setAccion({ tipo: c.excluido ? 'incluir' : 'excluir', cliente: c })}
        >
          <span className="icono icono-chico" aria-hidden>{c.excluido ? 'person_add' : 'person_off'}</span>
          {c.excluido ? 'Volver a incluir' : 'Excluir'}
        </button>
      ),
    }
  }
  const lista = (extra: Record<string, string>, vacio: string, conVendedor = false) => (
    <ListaClientes filtros={filtros(extra)} conVendedor={conVendedor} cambios={cambios} vacio={vacio} fila={vista} />
  )

  return (
    <section className="pagina adm">
      <header className="encabezado">
        <div className="encabezado-textos">
          <h1>Clientes excluidos</h1>
          <p>
            La base de clientes de Chess, por vendedor. Un cliente excluido no cuenta en ninguna cartera
            {totalExcluidos !== undefined &&
              ` (hoy ${cantidad(totalExcluidos, 'excluido')}${totalSugeridos ? ` y ${cantidad(totalSugeridos, 'sugerido')} para excluir` : ''})`}
            .
          </p>
        </div>
      </header>
      <p className="sr-solo" role="status" aria-live="polite">{aviso}</p>

      <BarraClientes
        pestanas={[
          { clave: 'todos', texto: 'Todos' },
          {
            clave: 'sugeridos',
            texto: 'Sugeridos para excluir',
            icono: <span className="icono icono-chico adm-ic-sugerencia" aria-hidden>lightbulb</span>,
            cantidad: totalSugeridos,
          },
          { clave: 'solo', texto: 'Excluidos', cantidad: totalExcluidos },
          { clave: 'sin', texto: 'Sin excluir' },
        ]}
        filtro={filtro}
        onFiltro={setFiltro}
        texto={texto}
        onTexto={setTexto}
      />

      {resumen.errores.length > 0 && (
        <ErrorCarga errores={resumen.errores} onReintentar={resumen.recargar} className="adm-error-carga" />
      )}

      {busqueda || filtro !== 'todos' ? (
        // Un filtro o una búsqueda: una sola lista con el vendedor en cada fila (se ve el cambio al toque, sin abrir grupos)
        <div className="tarjeta adm-tarjeta">
          {lista(busqueda ? { texto: busqueda } : {}, busqueda ? 'Ningún cliente coincide con la búsqueda.' : VACIO[filtro], true)}
        </div>
      ) : !resumen.datos ? (
        resumen.errores.length ? null : <LoadingDefault texto="Cargando los vendedores…" />
      ) : (
        <GruposPorVendedor
          resumen={resumen.datos}
          abiertos={abiertos}
          onAlternar={alternar}
          cuenta={(r) => (
            <>
              {r.sugeridos > 0 && (
                <span className="adm-grupo-sugeridos">
                  <span className="icono icono-chico adm-ic-sugerencia" aria-hidden>lightbulb</span>
                  {cantidad(r.sugeridos, 'sugerido')} para excluir
                </span>
              )}
              {r.excluidos > 0 && (
                <span className="adm-grupo-excluidos">
                  <span className="icono icono-chico" aria-hidden>person_off</span>
                  {cantidad(r.excluidos, 'excluido')}
                </span>
              )}
            </>
          )}
          lista={(vendedor) => lista({ vendedor }, 'Este vendedor no tiene clientes.')}
        />
      )}

      {accion && <ModalExcluir cambio={accion} onCerrar={() => setAccion(null)} onHecho={alCambiar} />}
    </section>
  )
}
