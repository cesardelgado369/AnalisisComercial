import { api } from './client'

/**
 * Varias consultas a la vez, como si fueran una (para `useConsulta`: caché, errores y recarga): las rutas van separadas
 * por un salto de línea y vuelven en el mismo orden. Si falla una, falla todo. La usan la vista por focos y el costado
 * de vendedores de Cobertura.
 */
export const enParalelo = {
  get: <R,>(rutas: string) => Promise.all(rutas.split('\n').map((r) => api.get<unknown>(r))) as Promise<R>,
}
