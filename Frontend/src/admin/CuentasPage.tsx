import { useCallback, useMemo, useState } from 'react'
import { api } from '../api/client'
import type { AccesoUsuario, CuentaMadomi, Rol, VendedorChess } from '../api/types'
import { useConsulta } from '../api/useConsulta'
import { ErrorCarga } from '../components/ErrorCarga'
import { LoadingDefault } from '../components/loading/LoadingDefault'
import { nombrePropio } from '../cobertura/estados'
import { fechaUtc, formatoEntero, haceCuanto } from '../utils/formato'
import { ModalCuenta, type ModoCuenta } from './ModalCuenta'
import './admin.css'

type Filtro = 'todas' | Rol | 'sin'

const FILTROS: { clave: Filtro; texto: string }[] = [
  { clave: 'todas', texto: 'Todas' },
  { clave: 'operario', texto: 'Vendedores' },
  { clave: 'supervisor', texto: 'Supervisores' },
  { clave: 'admin', texto: 'Administradores' },
  { clave: 'sin', texto: 'Sin acceso' },
]

const NOMBRE_ROL: Record<Rol, string> = { admin: 'Administrador', supervisor: 'Supervisor', operario: 'Vendedor' }

const coincide = (c: CuentaMadomi, filtro: Filtro) => (filtro === 'todas' ? true : filtro === 'sin' ? c.rol === null : c.rol === filtro)
const sinTildes = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Un acceso de `/admin/usuarios` como una fila de la lista de cuentas (mientras la plataforma no liste cuentas). */
const cuentaDeAcceso = (a: AccesoUsuario): CuentaMadomi => ({
  idUsuario: `acceso-${a.idAcceso}`,
  usuario: a.email,
  nombre: a.nombre,
  cuentaActiva: true,
  ultimoIngreso: a.ultimoIngreso,
  rol: a.rol,
  idAcceso: a.idAcceso,
  idsPersonal: a.idsPersonal,
  accesoActivo: a.activo,
  version: a.version,
})

/**
 * Gestión de cuentas (`/admin/usuarios`, solo admin; pedido de Cesar del 29/10). Las cuentas de Madomi en la plataforma y
 * qué ve cada una acá: rol y vendedores de Chess (uno o más: si Chess renombra a un vendedor con otro id, la cuenta
 * suma el nuevo). Desde acá se crean las cuentas de los vendedores (operarios), se da acceso a una cuenta que ya
 * existe y se edita o se pausa. Los administradores salen del permiso de la plataforma: no se editan acá.
 *
 * Listar y crear cuentas (`/admin/cuentas`) **no tiene contrato**: la plataforma todavía no lo permite (lo decide Cesar).
 * Si la API responde 404, la pantalla muestra los accesos de `/admin/usuarios` (confirmado) y deja darlos por usuario
 * y editarlos; crear cuentas queda para cuando exista.
 */
export function CuentasPage() {
  const cuentas = useConsulta<CuentaMadomi[]>('/admin/cuentas', 'No pudimos leer las cuentas. Probá de nuevo.')
  const soloAccesos = cuentas.estadoError === 404
  const accesos = useConsulta<AccesoUsuario[]>(soloAccesos ? '/admin/usuarios' : null, 'No pudimos leer los accesos. Probá de nuevo.')
  const vendedores = useConsulta<VendedorChess[]>('/admin/vendedores', 'No pudimos leer los vendedores de Chess.')
  const [filtroElegido, setFiltro] = useState<Filtro>('todas')
  const [texto, setTexto] = useState('')
  const [modal, setModal] = useState<ModoCuenta | null>(null)

  const porId = useMemo(() => new Map((vendedores.datos ?? []).map((v) => [v.id, v])), [vendedores.datos])
  const lista = useMemo(
    () => (soloAccesos ? (accesos.datos ?? []).map(cuentaDeAcceso) : (cuentas.datos ?? [])),
    [soloAccesos, accesos.datos, cuentas.datos],
  )
  const cargada = soloAccesos ? accesos.datos !== null : cuentas.datos !== null
  // Sin listado de cuentas no hay administradores ni cuentas sin acceso para mostrar
  const filtros = soloAccesos ? FILTROS.filter((f) => f.clave !== 'admin' && f.clave !== 'sin') : FILTROS
  const filtro: Filtro = filtros.some((f) => f.clave === filtroElegido) ? filtroElegido : 'todas'
  const buscado = sinTildes(texto.trim())
  const visibles = lista
    .filter((c) => coincide(c, filtro))
    .filter((c) => !buscado || sinTildes(`${c.nombre ?? ''} ${c.usuario}`).includes(buscado))
  const errores = [...(soloAccesos ? accesos.errores : cuentas.errores)]

  /** Para el 409 del modal: la lista de la fuente que se esté usando, recién leída. */
  const releer = useCallback(
    async () =>
      soloAccesos ? (await api.get<AccesoUsuario[]>('/admin/usuarios')).map(cuentaDeAcceso) : await api.get<CuentaMadomi[]>('/admin/cuentas'),
    [soloAccesos],
  )
  const recargar = () => (soloAccesos ? accesos.recargar() : cuentas.recargar())

  const abrir = (c: CuentaMadomi) => {
    if (c.rol === 'admin' || !vendedores.datos) return
    setModal(c.idAcceso === null ? { modo: 'acceso', cuenta: c } : { modo: 'editar', cuenta: c })
  }

  return (
    <section className="pagina adm">
      <header className="encabezado">
        <div className="encabezado-textos">
          <h1>Gestión de cuentas</h1>
          <p>Las cuentas de Madomi y qué clientes ve cada una en Análisis Comercial.</p>
        </div>
        {soloAccesos ? (
          <button type="button" className="btn btn-primario adm-nuevo" disabled={!vendedores.datos} onClick={() => setModal({ modo: 'acceso', cuenta: null })}>
            <span className="icono icono-chico" aria-hidden>key</span>
            Dar acceso a un usuario
          </button>
        ) : (
          <button type="button" className="btn btn-primario adm-nuevo" disabled={!vendedores.datos || !cuentas.datos} onClick={() => setModal({ modo: 'nueva' })}>
            <span className="icono icono-chico" aria-hidden>person_add</span>
            Nueva cuenta de vendedor
          </button>
        )}
      </header>

      {soloAccesos && (
        <p className="aviso aviso-alerta adm-aviso">
          <span className="icono icono-chico" aria-hidden>info</span>
          <span>
            Todavía no se pueden listar ni crear cuentas desde acá (falta que la plataforma lo permita): se ven los accesos
            cargados. Para sumar a alguien que ya tiene cuenta en la plataforma, usá «Dar acceso a un usuario».
          </span>
        </p>
      )}

      <div className="adm-barra">
        <div className="pestanas" role="group" aria-label="Qué cuentas mostrar">
          {filtros.map((f) => (
            <button key={f.clave} type="button" aria-pressed={filtro === f.clave} onClick={() => setFiltro(f.clave)}>
              {f.texto}
              {cargada && <span className="adm-cantidad">{formatoEntero(lista.filter((c) => coincide(c, f.clave)).length)}</span>}
            </button>
          ))}
        </div>
        <label className="buscador-pagina">
          <span className="sr-solo">Buscar una cuenta</span>
          <span className="icono" aria-hidden>search</span>
          <input type="search" placeholder="Buscar por nombre o usuario" value={texto} onChange={(e) => setTexto(e.target.value)} />
        </label>
      </div>

      {errores.length > 0 && (
        <ErrorCarga errores={errores} onReintentar={recargar} className="adm-error-carga" />
      )}
      {vendedores.errores.length > 0 && (
        <ErrorCarga
          errores={vendedores.errores}
          detalle="Sin la lista no se pueden dar ni editar accesos."
          onReintentar={vendedores.recargar}
          className="adm-error-carga"
        />
      )}

      <div className="tarjeta adm-tarjeta">
        {!cargada ? (
          errores.length ? null : <LoadingDefault texto="Cargando las cuentas…" />
        ) : visibles.length === 0 ? (
          <p className="vacio">{lista.length ? 'No hay cuentas con ese filtro.' : 'Todavía no hay accesos cargados.'}</p>
        ) : (
          <div className="adm-tabla-scroll">
            <table className="tabla adm-tabla">
              <thead>
                <tr>
                  <th>Cuenta</th>
                  <th>Rol</th>
                  <th>Vendedores de Chess</th>
                  <th>Estado</th>
                  <th className="adm-col-accion"><span className="sr-solo">Acción</span></th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((c) => (
                  <tr key={c.idUsuario ?? `acceso-${c.idAcceso}`} className={c.rol === 'admin' ? 'adm-fija' : 'cliqueable'} onClick={() => abrir(c)}>
                    <td>
                      <div className="celda-principal">{c.nombre ?? c.usuario}</div>
                      <div className="celda-secundaria">
                        {c.usuario}
                        {c.federada && ' · entra con De Ruta'}
                      </div>
                    </td>
                    <td>{c.rol ? NOMBRE_ROL[c.rol] : <span className="apagado">Sin acceso</span>}</td>
                    <td>
                      <VendedoresDeCuenta cuenta={c} porId={porId} />
                    </td>
                    <td>
                      <EstadoCuenta cuenta={c} />
                    </td>
                    <td className="adm-col-accion">
                      {c.rol === 'admin' ? (
                        <span className="celda-secundaria">Desde la plataforma</span>
                      ) : (
                        <button
                          type="button"
                          className="btn"
                          disabled={!vendedores.datos}
                          onClick={(e) => {
                            e.stopPropagation()
                            abrir(c)
                          }}
                        >
                          <span className="icono icono-chico" aria-hidden>{c.idAcceso === null ? 'key' : 'edit'}</span>
                          {c.idAcceso === null ? 'Dar acceso' : 'Editar'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal && vendedores.datos && (
        <ModalCuenta estado={modal} vendedores={vendedores.datos} onCerrar={() => setModal(null)} onGuardado={recargar} releer={releer} />
      )}
    </section>
  )
}

/** Los vendedores de la cuenta por nombre; uno dado de baja en Chess lo dice (sigue valiendo: es el caso del renombre). */
function VendedoresDeCuenta({ cuenta, porId }: { cuenta: CuentaMadomi; porId: Map<number, VendedorChess> }) {
  if (cuenta.rol === 'admin') return <span className="apagado">Todos</span>
  if (!cuenta.idsPersonal.length) return <span className="apagado">—</span>
  return (
    <ul className="adm-lista-vendedores">
      {cuenta.idsPersonal.map((id) => {
        const v = porId.get(id)
        return (
          <li key={id}>
            {v ? nombrePropio(v.nombre) : `Vendedor #${id}`}
            {v && !v.activo && <span className="adm-baja">baja en Chess</span>}
          </li>
        )
      })}
    </ul>
  )
}

/** Activa o pausada, y cuándo entró por última vez (o que nunca entró). */
function EstadoCuenta({ cuenta: c }: { cuenta: CuentaMadomi }) {
  const ingreso = c.ultimoIngreso ? `Entró ${haceCuanto(fechaUtc(c.ultimoIngreso))}` : 'Nunca entró'
  // Un acceso dado por email a alguien sin cuenta en la plataforma: no es una baja, todavía no puede entrar
  if (c.idUsuario === null) return <span className="celda-secundaria">Todavía sin cuenta en la plataforma</span>
  if (!c.cuentaActiva) return <span className="aviso-fila"><span className="icono icono-chico" aria-hidden>block</span>Dada de baja en la plataforma</span>
  if (c.rol === null) return <span className="celda-secundaria">{ingreso}</span>
  // El admin no tiene acceso en la app (sale del rol de la plataforma): con la cuenta activa, está activo
  const activa = c.rol === 'admin' || c.accesoActivo
  return (
    <>
      <div className={activa ? 'adm-estado' : 'adm-estado pausada'}>
        <span className="icono icono-chico" aria-hidden>{activa ? 'check_circle' : 'pause_circle'}</span>
        {activa ? 'Activa' : 'Pausada'}
      </div>
      <div className="celda-secundaria">{ingreso}</div>
    </>
  )
}
