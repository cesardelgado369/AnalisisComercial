import { useState } from 'react'
import { ApiError, api } from '../api/client'
import type { ClienteAdmin, MarcaVital, ResumenClientesVendedor } from '../api/types'
import { useConsulta } from '../api/useConsulta'
import { useAuth } from '../auth/AuthContext'
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

type Filtro = 'todos' | 'solo' | 'sin'
const VACIO: Record<Filtro, string> = {
  todos: 'No hay clientes.',
  solo: 'Todavía no hay clientes Vitales.',
  sin: 'Todos los clientes están marcados como Vitales.',
}

const Estrella = ({ llena = true }: { llena?: boolean }) => (
  <span className={llena ? 'icono icono-chico icono-lleno' : 'icono icono-chico'} aria-hidden>star</span>
)

/**
 * Clasificación de clientes (`/admin/clasificacion`, solo admin; pedido de Cesar del 30/10): la misma base de clientes
 * de Chess que Clientes excluidos (BaseClientes), para marcar con **un click** los clientes **Vitales**. La estrella
 * cambia al toque y, si la API no lo guarda, vuelve como estaba. Por ahora es solo una marca del dueño: no cambia la
 * cobertura ni ningún número, y el vendedor no la ve (CONTRATO_API.md, «Clasificación de clientes: Vital»).
 */
export function ClasificacionClientesPage() {
  const { usuario } = useAuth()
  const resumen = useConsulta<ResumenClientesVendedor[]>('/admin/clientes/resumen', 'No pudimos leer los vendedores.')
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const { texto, setTexto, busqueda } = useTextoBuscado()
  const { abiertos, alternar } = useGruposAbiertos('analisis.clasificacion.abiertos')
  const [cambiados, setCambiados] = useState<Record<number, CambioLocal>>({})
  /** Los que se están guardando: el botón espera a la API (dos clicks seguidos no se pisan). */
  const [guardando, setGuardando] = useState<number[]>([])
  const [error, setError] = useState<string | null>(null)
  /** Para lectores de pantalla: qué pasó con el último cambio. */
  const [aviso, setAviso] = useState('')

  const anotar = (fila: ClienteAdmin) => setCambiados((c) => ({ ...c, [fila.idCliente]: { fila, en: Date.now() } }))

  async function alternarVital(c: ClienteAdmin) {
    const vital = !c.vital
    setError(null)
    setGuardando((g) => [...g, c.idCliente])
    anotar({ ...c, vital, vitalPor: vital ? (usuario?.email ?? null) : null, vitalEn: vital ? new Date().toISOString() : null })
    try {
      if (vital) {
        const marca = await api.put<MarcaVital>(`/admin/clientes/${c.idCliente}/vital`)
        anotar({ ...c, vital: true, vitalPor: marca.marcadoPor, vitalEn: marca.marcadoEn })
      } else {
        await api.borrar(`/admin/clientes/${c.idCliente}/vital`)
      }
      setAviso(`${c.razonSocial}: ${vital ? 'marcado como Vital' : 'ya no es Vital'}.`)
      resumen.recargar()
    } catch (err) {
      anotar(c)
      setError(
        `No pudimos ${vital ? 'marcar' : 'desmarcar'} a ${c.razonSocial}. ${err instanceof ApiError ? err.mensajes.join(' ') : 'Probá de nuevo.'}`,
      )
    } finally {
      setGuardando((g) => g.filter((x) => x !== c.idCliente))
    }
  }

  const filtros = (extra: Record<string, string>) => {
    const p = new URLSearchParams(extra)
    if (filtro !== 'todos') p.set('vitales', filtro)
    return p
  }
  const totalVitales = resumen.datos?.reduce((s, r) => s + r.vitales, 0)

  // La fila no desaparece al desmarcarla en «Vitales»: se puede volver a marcar al toque si fue sin querer
  const vista = (f: ClienteAdmin, recibidoEn: number): VistaFila => {
    const cambio = cambioVigente(cambiados, f, recibidoEn)
    const c = cambio ? { ...f, vital: cambio.vital, vitalPor: cambio.vitalPor, vitalEn: cambio.vitalEn } : f
    return {
      cliente: c,
      clase: c.vital ? 'adm-vital' : undefined,
      estado: c.vital ? (
        <>
          <div className="adm-marca-vital">
            <Estrella />
            Vital
          </div>
          {(c.vitalPor || c.vitalEn) && (
            <div className="celda-secundaria">
              {[c.vitalPor, c.vitalEn ? haceCuanto(fechaUtc(c.vitalEn)) : null].filter(Boolean).join(' · ')}
            </div>
          )}
        </>
      ) : (
        <span className="apagado">{c.excluido ? 'Excluido' : 'Sin clasificar'}</span>
      ),
      accion: (
        <button
          type="button"
          className={c.vital ? 'btn adm-boton-vital activo' : 'btn adm-boton-vital'}
          aria-pressed={c.vital}
          aria-label={`Vital: ${c.razonSocial}`}
          title={c.vital ? 'Quitar la marca de Vital' : 'Marcar como Vital'}
          disabled={guardando.includes(c.idCliente)}
          onClick={() => void alternarVital(c)}
        >
          <Estrella llena={c.vital} />
          Vital
        </button>
      ),
    }
  }
  const lista = (extra: Record<string, string>, vacio: string, conVendedor = false) => (
    <ListaClientes filtros={filtros(extra)} conVendedor={conVendedor} cambios={0} vacio={vacio} fila={vista} />
  )

  return (
    <section className="pagina adm">
      <header className="encabezado">
        <div className="encabezado-textos">
          <h1>Clasificación de clientes</h1>
          <p>
            Marcá con un click los clientes Vitales{totalVitales !== undefined && ` (hoy ${cantidad(totalVitales, 'Vital', 'Vitales')})`}. Por
            ahora es solo una marca para vos: no cambia ningún número y los vendedores no la ven.
          </p>
        </div>
      </header>
      <p className="sr-solo" role="status" aria-live="polite">{aviso}</p>

      <BarraClientes
        pestanas={[
          { clave: 'todos', texto: 'Todos' },
          { clave: 'solo', texto: 'Vitales', icono: <Estrella />, cantidad: totalVitales },
          { clave: 'sin', texto: 'Sin clasificar' },
        ]}
        filtro={filtro}
        onFiltro={setFiltro}
        texto={texto}
        onTexto={setTexto}
      />

      {error && (
        <p className="aviso-bloque adm-error-carga" role="alert">
          <span className="icono icono-chico" aria-hidden>error</span>
          {error}
        </p>
      )}
      {resumen.errores.length > 0 && (
        <ErrorCarga errores={resumen.errores} onReintentar={resumen.recargar} className="adm-error-carga" />
      )}

      {busqueda || filtro !== 'todos' ? (
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
          cuenta={(r) =>
            r.vitales > 0 && (
              <span className="adm-grupo-vitales">
                <Estrella />
                {cantidad(r.vitales, 'Vital', 'Vitales')}
              </span>
            )
          }
          lista={(vendedor) => lista({ vendedor }, 'Este vendedor no tiene clientes.')}
        />
      )}
    </section>
  )
}
