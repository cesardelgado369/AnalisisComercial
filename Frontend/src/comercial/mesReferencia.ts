import { useSyncExternalStore } from 'react'
import { useSesionApp } from '../auth/SesionApp'
import { mesesDisponibles, ventanaDe } from '../cobertura/estados'

/**
 * El mes en el que se para la app (Cesar, 30/10): todo muestra ese mes y los tres anteriores (`ventana`). Para el
 * vendedor y el supervisor es siempre el mes en curso, así que cada mes nuevo corre la ventana sola. El dueño puede
 * pararse en otro (el filtro «Mes») y cambia toda la interfaz: Cobertura, Volumen, Devoluciones, la ficha y el Tablero.
 * Lo elegido sigue al pasar de una sección a otra y dura lo que la pestaña del navegador (sessionStorage).
 */
const CLAVE = 'analisis.mesReferencia'

const leer = () => {
  try {
    return sessionStorage.getItem(CLAVE)
  } catch {
    return null
  }
}

let elegido = leer()
const oyentes = new Set<() => void>()
const suscribir = (avisar: () => void) => {
  oyentes.add(avisar)
  return () => oyentes.delete(avisar)
}

/** null vuelve al mes en curso. Sin storage (modo privado), queda elegido igual hasta recargar. */
function elegir(mes: string | null) {
  elegido = mes
  try {
    if (mes) sessionStorage.setItem(CLAVE, mes)
    else sessionStorage.removeItem(CLAVE)
  } catch {
    // sin storage: vale para esta carga
  }
  oyentes.forEach((avisar) => avisar())
}

export function useMesReferencia() {
  const { rol, mesEnCurso } = useSesionApp()
  const guardado = useSyncExternalStore(suscribir, () => elegido)
  const puedeElegir = rol === 'admin'
  /** Los que puede elegir el dueño: desde el primero con datos hasta el en curso. */
  const opciones = mesesDisponibles(mesEnCurso)
  const mes = puedeElegir && guardado && opciones.includes(guardado) ? guardado : mesEnCurso
  return { mes, enCurso: mes === mesEnCurso, ventana: ventanaDe(mes), puedeElegir, opciones, elegir }
}

export type MesReferencia = ReturnType<typeof useMesReferencia>
