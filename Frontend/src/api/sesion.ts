import type { LoginResponse } from './types'

// Sesión guardada en el navegador. Con "Recordarme" va a localStorage (sobrevive a cerrar el navegador);
// sin él, a sessionStorage (se pierde al cerrarlo). Si el almacenamiento falla (modo privado, bloqueado),
// la sesión vive solo en memoria hasta recargar.
const CLAVE = 'analisis.sesion'
let enMemoria: LoginResponse | null = null
/** Dónde está guardada la sesión actual: los refresh la vuelven a guardar en el mismo lugar. */
let recordada = true

const almacen = (persistente: boolean) => (persistente ? localStorage : sessionStorage)

export function leerSesion(): LoginResponse | null {
  if (enMemoria) return enMemoria
  for (const persistente of [true, false]) {
    try {
      const crudo = almacen(persistente).getItem(CLAVE)
      if (crudo) {
        enMemoria = JSON.parse(crudo) as LoginResponse
        recordada = persistente
        return enMemoria
      }
    } catch {
      /* sin almacenamiento: se sigue con el otro */
    }
  }
  return null
}

/** `recordar` solo se pasa al ingresar; en los refresh se omite y se respeta lo elegido. */
export function guardarSesion(sesion: LoginResponse | null, recordar?: boolean) {
  enMemoria = sesion
  if (recordar !== undefined) recordada = recordar
  for (const persistente of [true, false]) {
    try {
      if (sesion && persistente === recordada) almacen(persistente).setItem(CLAVE, JSON.stringify(sesion))
      else almacen(persistente).removeItem(CLAVE)
    } catch {
      /* sin almacenamiento: queda en memoria */
    }
  }
}

/** Marca de "recién ingresó", para la animación de entrada del layout. Dura lo que la pestaña. */
const CLAVE_ENTRADA = 'analisis.recienIngreso'

/** La pone el login. */
export function marcarIngreso() {
  try {
    sessionStorage.setItem(CLAVE_ENTRADA, '1')
  } catch {
    /* sin almacenamiento: se entra sin animación */
  }
}

/** La lee y la borra: la animación corre una sola vez, no en cada recarga ni al navegar. */
export function tomarIngreso(): boolean {
  try {
    const recien = sessionStorage.getItem(CLAVE_ENTRADA) === '1'
    if (recien) sessionStorage.removeItem(CLAVE_ENTRADA)
    return recien
  } catch {
    return false
  }
}

/** Email que se precarga en el login (solo con "Recordarme"). */
const CLAVE_EMAIL = 'analisis.email'

export function emailRecordado() {
  try {
    return localStorage.getItem(CLAVE_EMAIL) ?? ''
  } catch {
    return ''
  }
}

export function recordarEmail(email: string | null) {
  try {
    if (email) localStorage.setItem(CLAVE_EMAIL, email)
    else localStorage.removeItem(CLAVE_EMAIL)
  } catch {
    /* sin almacenamiento: no se recuerda */
  }
}
