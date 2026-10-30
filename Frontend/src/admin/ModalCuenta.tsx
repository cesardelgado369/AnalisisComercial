import { useRef, useState, type FormEvent } from 'react'
import { ApiError, api } from '../api/client'
import type { AccesoUsuarioEnvio, CuentaMadomi, NuevaCuentaOperario, VendedorChess } from '../api/types'
import { Modal } from '../components/Modal'
import { SelectorVendedores } from './SelectorVendedores'

/**
 * `nueva`: crear la cuenta de un operario · `acceso`: darle acceso a una cuenta (con `cuenta: null`, a un usuario que
 * se escribe: es lo que se puede hacer con la API real mientras la plataforma no liste cuentas) · `editar`: cambiarlo.
 */
export type ModoCuenta =
  | { modo: 'nueva' }
  | { modo: 'acceso'; cuenta: CuentaMadomi | null }
  | { modo: 'editar'; cuenta: CuentaMadomi }

interface Props {
  estado: ModoCuenta
  vendedores: VendedorChess[]
  onCerrar: () => void
  /** Se guardó: la lista se vuelve a leer. */
  onGuardado: () => void
  /** Vuelve a leer las cuentas (después de un 409, para tomar la versión nueva sin perder lo editado). */
  releer: () => Promise<CuentaMadomi[]>
}

const LETRAS = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789'

/** Una contraseña inicial fácil de dictar (sin 0/O ni 1/l/I), de 10 caracteres. */
function generarPassword() {
  const azar = new Uint32Array(10)
  crypto.getRandomValues(azar)
  return Array.from(azar, (n) => LETRAS[n % LETRAS.length]).join('')
}

/** Los campos que dibuja cada modo: un error de otro campo (p. ej. `version`) va arriba del pie, nunca se pierde. */
const CAMPOS: Record<ModoCuenta['modo'], string[]> = {
  nueva: ['nombre', 'usuario', 'password', 'idspersonal', 'idpersonal'],
  acceso: ['email', 'idspersonal', 'idpersonal'],
  editar: ['idspersonal', 'idpersonal'],
}

/**
 * Alta y edición de cuentas (Gestión de cuentas). Crear una cuenta de operario la da de alta en la plataforma con una
 * contraseña inicial y le asigna sus vendedores de Chess en un solo paso; al terminar se muestran el usuario y la
 * contraseña para pasárselos (la persona la cambia desde «Mi perfil»). Los errores de la API van debajo de cada campo;
 * los de un campo que el formulario no muestra, arriba del pie. Si otro guardó en el medio (409), se toma la versión
 * nueva y se puede guardar de nuevo sin perder lo elegido.
 */
/** Los usuarios de Madomi terminan en @madomi (Cesar, 30/10): el campo lo pone solo y se escribe solo el nombre. */
const DOMINIO = '@madomi'
/** Lo escrito con @madomi al final, salvo que ya traiga su propio @ (otro dominio). */
const conDominio = (u: string) => {
  const t = u.trim()
  return !t || t.includes('@') ? t : `${t}${DOMINIO}`
}

/** El usuario con «@madomi» fijo a la derecha; si se escribe un @, va tal cual y el sufijo se va. */
function CampoUsuario(props: { nombre: string; valor: string; onCambio: (v: string) => void; invalido: boolean; autoFoco?: boolean }) {
  const { nombre, valor, onCambio, invalido, autoFoco = false } = props
  const propio = valor.includes('@')
  return (
    <span className={propio ? 'adm-campo-sufijo propio' : 'adm-campo-sufijo'}>
      <input
        type="text"
        name={nombre}
        value={valor}
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        placeholder="nicolas.cordoba"
        onChange={(e) => onCambio(e.target.value)}
        aria-invalid={invalido}
        data-autofocus={autoFoco || undefined}
      />
      {!propio && <span className="adm-sufijo" aria-hidden>{DOMINIO}</span>}
    </span>
  )
}

/** «Con esto entra: nicolas.cordoba@madomi.» */
const ayudaUsuario = (usuario: string) => `Con esto entra: ${conDominio(usuario) || `nicolas.cordoba${DOMINIO}`}. Sin espacios; si es de otro dominio, escribilo completo.`

export function ModalCuenta({ estado, vendedores, onCerrar, onGuardado, releer }: Props) {
  const cuenta = estado.modo === 'nueva' ? null : estado.cuenta
  const escribeUsuario = estado.modo === 'nueva' || (estado.modo === 'acceso' && !estado.cuenta)
  const [nombre, setNombre] = useState(cuenta?.nombre ?? '')
  const [usuario, setUsuario] = useState(cuenta?.usuario ?? '')
  const [password, setPassword] = useState(generarPassword)
  const [verPassword, setVerPassword] = useState(true)
  const [rol, setRol] = useState<'operario' | 'supervisor'>(cuenta?.rol === 'supervisor' ? 'supervisor' : 'operario')
  const [ids, setIds] = useState<number[]>(cuenta?.idsPersonal ?? [])
  const [activo, setActivo] = useState(cuenta?.accesoActivo ?? true)
  const [version, setVersion] = useState(cuenta?.version ?? null)
  const [errores, setErrores] = useState<Record<string, string>>({})
  const [general, setGeneral] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [creada, setCreada] = useState<{ usuario: string; password: string } | null>(null)
  const [copiado, setCopiado] = useState(false)
  const formulario = useRef<HTMLFormElement>(null)

  const titulo = estado.modo === 'nueva' ? 'Nueva cuenta de vendedor' : estado.modo === 'acceso' ? 'Dar acceso' : 'Editar acceso'
  const errorDe = (campo: string) => errores[campo] ?? errores[campo.toLowerCase()]
  /** Al corregir un campo, su error se va. */
  const limpiar = (...campos: string[]) =>
    setErrores((e) => (campos.some((c) => c in e) ? Object.fromEntries(Object.entries(e).filter(([k]) => !campos.includes(k))) : e))
  /** El foco va al primer campo con error (en el celular, si no, parece que no pasó nada). */
  const enfocarError = () =>
    requestAnimationFrame(() => formulario.current?.querySelector<HTMLElement>('input[aria-invalid="true"], [aria-invalid="true"] input')?.focus())

  async function guardar(e: FormEvent) {
    e.preventDefault()
    if (guardando) return
    const faltan: Record<string, string> = {}
    if (estado.modo === 'nueva') {
      if (!nombre.trim()) faltan.nombre = 'Poné el nombre de la persona.'
      if (password.length < 8) faltan.password = 'La contraseña tiene que tener al menos 8 caracteres.'
    }
    if (escribeUsuario && !usuario.trim()) faltan[estado.modo === 'nueva' ? 'usuario' : 'email'] = 'Poné el usuario o el email con el que entra.'
    if (!ids.length) faltan.idsPersonal = 'Elegí al menos un vendedor de Chess.'
    setErrores(faltan)
    setGeneral(null)
    if (Object.keys(faltan).length) {
      enfocarError()
      return
    }

    setGuardando(true)
    try {
      if (estado.modo === 'nueva') {
        const cuerpo: NuevaCuentaOperario = { usuario: conDominio(usuario), nombre: nombre.trim(), password, rol: 'operario', idsPersonal: ids }
        await api.post<CuentaMadomi>('/admin/cuentas', cuerpo)
        setCreada({ usuario: conDominio(usuario).toLowerCase(), password })
        onGuardado()
        return
      }
      const cuerpo: AccesoUsuarioEnvio = {
        email: cuenta ? cuenta.usuario : conDominio(usuario),
        nombre: cuenta ? cuenta.nombre : null,
        rol,
        idsPersonal: ids,
      }
      if (estado.modo === 'acceso') await api.post('/admin/usuarios', cuerpo)
      else await api.put(`/admin/usuarios/${estado.cuenta.idAcceso}`, { ...cuerpo, activo, version })
      onGuardado()
      onCerrar()
    } catch (err) {
      if (!(err instanceof ApiError)) {
        setGeneral('No se pudo guardar. Probá de nuevo.')
        return
      }
      const porCampo = Object.fromEntries(Object.entries(err.errores).map(([k, v]) => [k, v.join(' ')]))
      setErrores(porCampo)
      const sueltos = Object.entries(porCampo)
        .filter(([k]) => !CAMPOS[estado.modo].includes(k.toLowerCase()))
        .map(([, v]) => v)
      if (err.status === 409 && estado.modo === 'editar') {
        // Otro guardó en el medio: se toma su versión y se deja guardar de nuevo con lo que se eligió acá
        // (el `title` del 409 ya viene redactado por el backend: se muestra tal cual)
        onGuardado()
        setGeneral(err.message)
        try {
          const nueva = (await releer()).find((c) => c.idAcceso === estado.cuenta.idAcceso)
          if (nueva) setVersion(nueva.version)
        } catch {
          /* si no se pudo releer, el próximo «Guardar» vuelve a avisar */
        }
      } else if (sueltos.length || !Object.keys(porCampo).length) setGeneral([...sueltos, ...(Object.keys(porCampo).length ? [] : [err.message])].join(' '))
      else enfocarError()
    } finally {
      setGuardando(false)
    }
  }

  async function copiar() {
    if (!creada) return
    try {
      await navigator.clipboard.writeText(`Usuario: ${creada.usuario}\nContraseña: ${creada.password}`)
      setCopiado(true)
    } catch {
      /* sin portapapeles: quedan a la vista para copiarlos a mano */
    }
  }

  if (creada) {
    // Sin X ni Esc: la contraseña no se vuelve a mostrar, se cierra solo con «Listo» (después de pasarla)
    return (
      <Modal
        abierto
        onCerrar={onCerrar}
        cerrable={false}
        titulo="Cuenta creada"
        tamano="chico"
        pie={<button className="btn btn-primario" onClick={onCerrar}>Listo, ya la pasé</button>}
      >
        <div className="adm-creada" role="status">
          <p className="adm-creada-ok">
            <span className="icono" aria-hidden>check_circle</span>
            {nombre.trim()} ya puede entrar a Análisis Comercial.
          </p>
          <p>Pasale estos datos. Al entrar puede cambiar la contraseña desde «Mi perfil».</p>
          <dl className="adm-credenciales">
            <dt>Usuario</dt>
            <dd>{creada.usuario}</dd>
            <dt>Contraseña</dt>
            <dd className="adm-password">{creada.password}</dd>
          </dl>
          <button type="button" className="btn" onClick={() => void copiar()} data-autofocus>
            <span className="icono icono-chico" aria-hidden>{copiado ? 'check' : 'content_copy'}</span>
            {copiado ? 'Copiado' : 'Copiar los datos'}
          </button>
          <p className="campo-ayuda">La contraseña no se vuelve a mostrar.</p>
        </div>
      </Modal>
    )
  }

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo={titulo}
      subtitulo={cuenta ? (cuenta.nombre ? `${cuenta.nombre} · ${cuenta.usuario}` : cuenta.usuario) : undefined}
      tamano="mediano"
      cerrable={!guardando}
      pie={
        <>
          {general && (
            <p className="aviso-fila adm-error-general" role="alert">
              <span className="icono icono-chico" aria-hidden>error</span>
              {general}
            </p>
          )}
          <button type="button" className="btn" onClick={onCerrar} disabled={guardando}>Cancelar</button>
          <button type="submit" form="form-cuenta" className="btn btn-primario" disabled={guardando}>
            {guardando ? 'Guardando…' : estado.modo === 'nueva' ? 'Crear cuenta' : estado.modo === 'acceso' ? 'Dar acceso' : 'Guardar'}
          </button>
        </>
      }
    >
      {/* autoComplete off: que el navegador no lo tome como un registro (ni ofrezca el login del admin ni guarde la clave) */}
      <form id="form-cuenta" ref={formulario} className="adm-form" onSubmit={(e) => void guardar(e)} noValidate autoComplete="off">
        {estado.modo === 'nueva' && (
          <div className="adm-form-grilla">
            <label>
              Nombre y apellido
              <input
                type="text"
                value={nombre}
                maxLength={100}
                autoComplete="off"
                onChange={(e) => {
                  setNombre(e.target.value)
                  limpiar('nombre')
                }}
                aria-invalid={!!errorDe('nombre')}
                data-autofocus
              />
              {errorDe('nombre') && <span className="campo-error">{errorDe('nombre')}</span>}
            </label>
            <label>
              Usuario
              <CampoUsuario
                nombre="usuario-nuevo"
                valor={usuario}
                onCambio={(v) => {
                  setUsuario(v)
                  limpiar('usuario')
                }}
                invalido={!!errorDe('usuario')}
              />
              <span className="campo-ayuda">{ayudaUsuario(usuario)}</span>
              {errorDe('usuario') && <span className="campo-error">{errorDe('usuario')}</span>}
            </label>
            <label className="adm-form-doble">
              Contraseña inicial
              <span className="adm-password-campo">
                <input
                  type={verPassword ? 'text' : 'password'}
                  name="password-nueva"
                  value={password}
                  autoComplete="new-password"
                  spellCheck={false}
                  onChange={(e) => {
                    setPassword(e.target.value)
                    limpiar('password')
                  }}
                  aria-invalid={!!errorDe('password')}
                />
                <button type="button" className="btn" title={verPassword ? 'Ocultar' : 'Mostrar'} aria-label={verPassword ? 'Ocultar la contraseña' : 'Mostrar la contraseña'} onClick={() => setVerPassword((v) => !v)}>
                  <span className="icono icono-chico" aria-hidden>{verPassword ? 'visibility_off' : 'visibility'}</span>
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    setPassword(generarPassword())
                    limpiar('password')
                  }}
                >
                  <span className="icono icono-chico" aria-hidden>autorenew</span>
                  Generar otra
                </button>
              </span>
              <span className="campo-ayuda">Mínimo 8 caracteres. La persona la cambia después desde «Mi perfil».</span>
              {errorDe('password') && <span className="campo-error">{errorDe('password')}</span>}
            </label>
          </div>
        )}

        {estado.modo === 'acceso' && !estado.cuenta && (
          <label>
            Usuario
            <CampoUsuario
              nombre="usuario-acceso"
              valor={usuario}
              onCambio={(v) => {
                setUsuario(v)
                limpiar('email')
              }}
              invalido={!!errorDe('email')}
              autoFoco
            />
            <span className="campo-ayuda">
              {ayudaUsuario(usuario)} Es el que usa para entrar a la plataforma de Vignoli: el acceso queda enlazado a su
              cuenta la primera vez que entra.
            </span>
            {errorDe('email') && <span className="campo-error">{errorDe('email')}</span>}
          </label>
        )}

        {estado.modo !== 'nueva' && (
          <div className="adm-campo">
            <span className="adm-campo-titulo" id="rol-cuenta">Rol</span>
            <div className="segmentado" role="group" aria-labelledby="rol-cuenta">
              <button type="button" aria-pressed={rol === 'operario'} onClick={() => setRol('operario')}>Vendedor (operario)</button>
              <button type="button" aria-pressed={rol === 'supervisor'} onClick={() => setRol('supervisor')}>Supervisor</button>
            </div>
            <span className="campo-ayuda">
              {rol === 'operario' ? 'Ve solo los clientes de sus vendedores.' : 'Ve los clientes de los vendedores que tenga a cargo y el resumen.'}
            </span>
          </div>
        )}

        <SelectorVendedores
          vendedores={vendedores}
          elegidos={ids}
          onCambio={(nuevos) => {
            setIds(nuevos)
            limpiar('idsPersonal', 'idPersonal')
          }}
          error={errorDe('idsPersonal') ?? errorDe('idPersonal')}
        />

        {estado.modo === 'editar' && (
          <label className="check-linea adm-activo">
            <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} />
            Puede entrar a Análisis Comercial
            {!activo && <span className="campo-ayuda"> (pausado: deja de entrar en su próximo click)</span>}
          </label>
        )}
      </form>
    </Modal>
  )
}
