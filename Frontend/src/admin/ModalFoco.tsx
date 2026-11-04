import { useMemo, useState, type FormEvent } from 'react'
import { avisarCambio } from '../api/cambios'
import { ApiError, api } from '../api/client'
import type { ArticuloChess, Foco, FocoEnvio } from '../api/types'
import { useConsulta } from '../api/useConsulta'
import { ErrorCarga } from '../components/ErrorCarga'
import { LoadingDefault } from '../components/loading/LoadingDefault'
import { Modal } from '../components/Modal'
import { nombrePropio } from '../cobertura/estados'
import { cantidad } from '../utils/formato'

/** Los límites del backend (CONTRATO_API.md, «Focos del mes»). */
const MAXIMO_NOMBRE = 60
const MAXIMO_ARTICULOS = 50

const sinTildes = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/**
 * Crear o editar un foco del mes: el nombre que se ve en el filtro y sus artículos de Chess, agrupados por la DIVISION
 * de Chess y con cuántos clientes los compraron el mes pasado (para elegir las presentaciones que se venden). Los
 * anulados se ofrecen solo si se piden o si el foco ya los tiene. Editando, también se borra (con confirmación).
 */
export function ModalFoco({ foco, onCerrar, onGuardado }: { foco: Foco | null; onCerrar: () => void; onGuardado: (texto: string) => void }) {
  const articulos = useConsulta<ArticuloChess[]>('/admin/articulos', 'No pudimos leer los artículos de Chess.')
  const [nombre, setNombre] = useState(foco?.nombre ?? '')
  const [ids, setIds] = useState<number[]>(() => foco?.articulos.map((a) => a.idArticulo) ?? [])
  const [activo, setActivo] = useState(foco?.activo ?? true)
  const [texto, setTexto] = useState('')
  const [conAnulados, setConAnulados] = useState(false)
  const [errores, setErrores] = useState<Record<string, string>>({})
  const [general, setGeneral] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [borrando, setBorrando] = useState(false)

  const porId = useMemo(() => new Map((articulos.datos ?? []).map((a) => [a.idArticulo, a])), [articulos.datos])
  const buscado = sinTildes(texto.trim())
  /** Por división, en el orden de la API; los anulados solo si se piden o ya están elegidos. */
  const grupos = useMemo(() => {
    const mapa = new Map<string, ArticuloChess[]>()
    for (const a of articulos.datos ?? []) {
      if (a.anulado && !conAnulados && !ids.includes(a.idArticulo)) continue
      if (buscado && !sinTildes(a.descripcion).includes(buscado) && String(a.idArticulo) !== buscado) continue
      const clave = a.division ?? ''
      mapa.set(clave, [...(mapa.get(clave) ?? []), a])
    }
    return [...mapa.entries()]
  }, [articulos.datos, conAnulados, ids, buscado])
  const hayAnulados = articulos.datos?.some((a) => a.anulado) ?? false

  const alternar = (id: number) => {
    setIds((v) => (v.includes(id) ? v.filter((x) => x !== id) : [...v, id]))
    setErrores((e) => (e.idsArticulo ? { ...e, idsArticulo: '' } : e))
  }
  /** El nombre de un elegido: de la lista de Chess o, mientras llega, el que ya tenía el foco. */
  const descripcion = (id: number) => porId.get(id)?.descripcion ?? foco?.articulos.find((a) => a.idArticulo === id)?.descripcion ?? `Artículo #${id}`

  async function guardar(e: FormEvent) {
    e.preventDefault()
    if (guardando) return
    const faltan: Record<string, string> = {}
    if (!nombre.trim()) faltan.nombre = 'Poné el nombre del foco, como se va a ver en el filtro.'
    if (!ids.length) faltan.idsArticulo = 'Elegí al menos un artículo.'
    else if (ids.length > MAXIMO_ARTICULOS) faltan.idsArticulo = `Hasta ${MAXIMO_ARTICULOS} artículos por foco.`
    setErrores(faltan)
    setGeneral(null)
    if (Object.keys(faltan).length) return
    setGuardando(true)
    try {
      const cuerpo: FocoEnvio = { nombre: nombre.trim(), idsArticulo: ids, activo }
      const r = foco ? await api.put<Foco>(`/admin/focos/${foco.idFoco}`, cuerpo) : await api.post<Foco>('/admin/focos', cuerpo)
      avisarCambio()
      onGuardado(`${r.nombre}: ${foco ? 'guardado' : 'creado'}${r.activo ? ', y ya está en el filtro.' : ' (apagado: no aparece en el filtro).'}`)
    } catch (err) {
      if (!(err instanceof ApiError)) {
        setGeneral('No se pudo guardar. Probá de nuevo.')
        return
      }
      const porCampo = Object.fromEntries(Object.entries(err.errores).map(([k, v]) => [k.toLowerCase() === 'idsarticulo' ? 'idsArticulo' : k.toLowerCase(), v.join(' ')]))
      setErrores(porCampo)
      const sueltos = Object.entries(porCampo).filter(([k]) => k !== 'nombre' && k !== 'idsArticulo').map(([, v]) => v)
      if (sueltos.length || !Object.keys(porCampo).length) setGeneral([...sueltos, ...(Object.keys(porCampo).length ? [] : [err.message])].join(' '))
      // Otro lo borró en el medio: la lista se vuelve a leer
      if (err.status === 404) avisarCambio()
    } finally {
      setGuardando(false)
    }
  }

  async function borrar() {
    if (!foco) return
    setGuardando(true)
    setGeneral(null)
    try {
      await api.borrar(`/admin/focos/${foco.idFoco}`)
      avisarCambio()
      onGuardado(`${foco.nombre}: borrado.`)
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        // Ya no estaba: queda como se quería
        avisarCambio()
        onGuardado(`${foco.nombre}: ya estaba borrado.`)
        return
      }
      setGeneral(err instanceof ApiError ? err.mensajes.join(' ') : 'No se pudo borrar. Probá de nuevo.')
      setBorrando(false)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo={foco ? 'Editar foco' : 'Nuevo foco'}
      subtitulo={foco?.nombre}
      tamano="grande"
      cerrable={!guardando}
      pie={
        <>
          {general && (
            <p className="aviso-fila adm-error-general" role="alert">
              <span className="icono icono-chico" aria-hidden>error</span>
              {general}
            </p>
          )}
          {foco &&
            (borrando ? (
              <span className="foco-borrar">
                ¿Borrar «{foco.nombre}»?
                <button type="button" className="btn foco-btn-borrar" onClick={() => void borrar()} disabled={guardando}>Sí, borrarlo</button>
                <button type="button" className="btn" onClick={() => setBorrando(false)} disabled={guardando}>No</button>
              </span>
            ) : (
              <button type="button" className="btn foco-btn-borrar-abrir" onClick={() => setBorrando(true)} disabled={guardando}>
                <span className="icono icono-chico" aria-hidden>delete</span>
                Borrar
              </button>
            ))}
          <button type="button" className="btn" onClick={onCerrar} disabled={guardando}>Cancelar</button>
          <button type="submit" form="form-foco" className="btn btn-primario" disabled={guardando || borrando}>
            {guardando ? 'Guardando…' : foco ? 'Guardar' : 'Crear foco'}
          </button>
        </>
      }
    >
      <form id="form-foco" className="adm-form" onSubmit={(e) => void guardar(e)} noValidate autoComplete="off">
        <label>
          Nombre
          <input
            type="text"
            value={nombre}
            maxLength={MAXIMO_NOMBRE}
            placeholder="Manteca"
            onChange={(e) => {
              setNombre(e.target.value)
              setErrores((v) => (v.nombre ? { ...v, nombre: '' } : v))
            }}
            aria-invalid={!!errores.nombre}
            data-autofocus
          />
          <span className="campo-ayuda">Así se ve en el filtro «Foco del mes» de Cobertura, Volumen y Devoluciones.</span>
          {errores.nombre && <span className="campo-error">{errores.nombre}</span>}
        </label>

        <label className="check-linea">
          <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} />
          Prendido: aparece en el filtro este mes
        </label>

        <fieldset className="foco-articulos" aria-invalid={!!errores.idsArticulo}>
          <legend>Artículos</legend>
          <p className="campo-ayuda">
            Tildá todas las presentaciones que cuentan como una (por ejemplo, la manteca de 100 y de 200 gramos): un
            cliente compró el foco si compró cualquiera de ellas.
          </p>

          <div className="foco-elegidos" aria-live="polite">
            <span className="foco-elegidos-titulo">{ids.length ? cantidad(ids.length, 'elegido') : 'Ninguno elegido todavía'}</span>
            {ids.map((id) => (
              <button key={id} type="button" className="foco-elegido" onClick={() => alternar(id)} title="Sacarlo del foco">
                {nombrePropio(descripcion(id))}
                <span className="icono icono-chico" aria-label="Sacar">close</span>
              </button>
            ))}
          </div>
          {errores.idsArticulo && <span className="campo-error">{errores.idsArticulo}</span>}

          <div className="foco-buscar">
            <label className="buscador-pagina">
              <span className="sr-solo">Buscar un artículo</span>
              <span className="icono" aria-hidden>search</span>
              <input type="search" placeholder="Buscar por nombre o código" value={texto} onChange={(e) => setTexto(e.target.value)} />
            </label>
            {hayAnulados && (
              <label className="check-linea">
                <input type="checkbox" checked={conAnulados} onChange={(e) => setConAnulados(e.target.checked)} />
                Mostrar los anulados en Chess
              </label>
            )}
          </div>

          {articulos.errores.length > 0 ? (
            <ErrorCarga errores={articulos.errores} detalle="Sin la lista no se pueden elegir artículos." onReintentar={articulos.recargar} />
          ) : !articulos.datos ? (
            <LoadingDefault texto="Cargando los artículos de Chess…" />
          ) : grupos.length === 0 ? (
            <p className="vacio">{buscado ? 'Ningún artículo con ese nombre.' : 'Chess no mandó artículos.'}</p>
          ) : (
            <div className="foco-grupos">
              {grupos.map(([division, lista]) => (
                <section key={division || 'sin'} className="foco-grupo" aria-label={division ? nombrePropio(division) : 'Sin división'}>
                  <h3 className="adm-vendedores-titulo">
                    {division ? nombrePropio(division) : 'Sin división'} <span className="foco-grupo-cantidad">{lista.length}</span>
                  </h3>
                  <div className="foco-lista">
                    {lista.map((a) => (
                      <label key={a.idArticulo} className={ids.includes(a.idArticulo) ? 'adm-vendedor foco-articulo elegido' : 'adm-vendedor foco-articulo'}>
                        <input type="checkbox" checked={ids.includes(a.idArticulo)} onChange={() => alternar(a.idArticulo)} />
                        <span className="foco-articulo-textos">
                          <span className="adm-vendedor-nombre">{nombrePropio(a.descripcion)}</span>
                          <span className="foco-articulo-detalle">
                            {a.anulado ? 'Anulado en Chess' : `${cantidad(a.clientesMesAnterior, 'cliente')} el mes pasado`}
                          </span>
                        </span>
                        <span className="adm-vendedor-id">#{a.idArticulo}</span>
                      </label>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </fieldset>
      </form>
    </Modal>
  )
}
