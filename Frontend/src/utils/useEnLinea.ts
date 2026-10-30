import { useSyncExternalStore } from 'react'

function suscribir(avisar: () => void) {
  window.addEventListener('online', avisar)
  window.addEventListener('offline', avisar)
  return () => {
    window.removeEventListener('online', avisar)
    window.removeEventListener('offline', avisar)
  }
}

/**
 * Si el teléfono tiene conexión (el vendedor anda por la calle: entra y sale de la señal). El navegador solo sabe si
 * hay red, no si llega al servidor: «true» no garantiza que la API responda, pero «false» es seguro.
 */
export function useEnLinea() {
  return useSyncExternalStore(suscribir, () => navigator.onLine)
}
