import { useMemo } from 'react'
import { enParalelo } from '../api/enParalelo'
import type { Cobertura } from '../api/types'
import { useConsulta } from '../api/useConsulta'
import type { Filtros } from '../comercial/filtros'
import { IconoVendedor } from '../comercial/IconosFiltro'
import { formatoEntero, formatoPorcentaje, nombreMes } from '../utils/formato'
import { nombrePropio } from './estados'

/**
 * Al costado de los indicadores de Cobertura, con Todos los vendedores (Cesar, 10/11): cada vendedor con su cobertura
 * del mes, del mejor al peor, y tocarlo lo elige en el filtro. Son las consultas de siempre (`GET /api/cobertura` de un
 * vendedor y un mes, una por vendedor, con los mismos filtros): los números los arma la API. Sin la casa.
 */
export function PorVendedor({ filtros, mes }: { filtros: Filtros; mes: string }) {
  const vendedores = filtros.sesion.vendedores.filter((v) => !v.esCasa)
  const rutas = useMemo(() => {
    if (vendedores.length < 2) return null
    const base = new URLSearchParams(filtros.consulta)
    base.set('mesDesde', mes)
    base.set('mesHasta', mes)
    return vendedores
      .map((v) => {
        const p = new URLSearchParams(base)
        p.set('vendedor', String(v.id))
        return `/cobertura?${p}`
      })
      .join('\n')
    // Los vendedores salen de la sesión: cambian solo al entrar
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtros.consulta, mes, vendedores.length])
  const consulta = useConsulta<Cobertura[]>(rutas, 'No pudimos leer la cobertura de cada vendedor.', enParalelo)
  if (!rutas) return null

  const filas = consulta.datos?.length === vendedores.length
    ? vendedores
        .map((v, i) => ({ ...v, k: consulta.datos![i].kpis[consulta.datos![i].kpis.length - 1] }))
        .filter((v) => v.k && v.k.clientesCartera > 0)
        .sort((a, b) => b.k.porcentaje - a.k.porcentaje)
    : null

  return (
    <section className="cob-por-vendedor" aria-label={`Cobertura de cada vendedor en ${nombreMes(mes)}`}>
      <h2 className="cob-por-vendedor-titulo">Por vendedor · {nombreMes(mes)}</h2>
      {consulta.errores.length > 0 ? (
        <p className="cob-por-vendedor-aviso">{consulta.errores[0]}</p>
      ) : !filas ? (
        <p className="cob-por-vendedor-aviso">Calculando…</p>
      ) : (
        <ul className="cob-por-vendedor-lista">
          {filas.map((v) => (
            <li key={v.id}>
              <button
                type="button"
                className="cob-por-vendedor-fila"
                onClick={() => filtros.cambiar('vendedor', String(v.id))}
                title={`Ver los clientes de ${nombrePropio(v.nombre)}`}
              >
                <span className="cob-por-vendedor-avatar" aria-hidden>
                  <IconoVendedor />
                </span>
                <span className="cob-por-vendedor-nombre">{nombrePropio(v.nombre)}</span>
                <span className="cob-por-vendedor-numeros">
                  <strong>{formatoPorcentaje(v.k.porcentaje)}</strong>
                  <span>
                    {formatoEntero(v.k.clientesConCompra)} de {formatoEntero(v.k.clientesCartera)}
                  </span>
                </span>
                <span className="cob-por-vendedor-barra" aria-hidden>
                  <span style={{ width: `${Math.min(100, Math.max(0, v.k.porcentaje))}%` }} />
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
