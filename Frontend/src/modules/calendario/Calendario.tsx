import type { ReactNode } from 'react'
import { hoyIso } from '../../utils/formato'
import './calendario.css'

const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const nombreMes = new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric', timeZone: 'UTC' })

interface Props {
  /** Mes que se muestra, `yyyy-MM`. */
  mes: string
  onMes: (mes: string) => void
  /** Contenido de cada día, por fecha `yyyy-MM-dd`. Los días sin entrada quedan vacíos. */
  dias: Record<string, ReactNode>
  /** Días a resaltar (p. ej. los que tienen pedidos). */
  marcados?: Set<string>
}

/** Calendario mensual genérico (semana de lunes a domingo). El contenido de cada día lo decide quien lo usa. */
export function Calendario({ mes, onMes, dias, marcados }: Props) {
  const [anio, m] = mes.split('-').map(Number)
  const primero = new Date(Date.UTC(anio, m - 1, 1))
  const diasDelMes = new Date(Date.UTC(anio, m, 0)).getUTCDate()
  const corrimiento = (primero.getUTCDay() + 6) % 7 // lunes = 0
  const hoy = hoyIso()

  const celdas: (string | null)[] = [
    ...Array<null>(corrimiento).fill(null),
    ...Array.from({ length: diasDelMes }, (_, i) => `${mes}-${String(i + 1).padStart(2, '0')}`),
  ]
  while (celdas.length % 7) celdas.push(null)

  return (
    <div className="calendario">
      <header className="calendario-cabecera">
        <button className="btn" onClick={() => onMes(moverMes(mes, -1))} aria-label="Mes anterior">
          <span className="icono icono-chico" aria-hidden>chevron_left</span>
        </button>
        <h3>{nombreMes.format(primero)}</h3>
        <button className="btn" onClick={() => onMes(moverMes(mes, 1))} aria-label="Mes siguiente">
          <span className="icono icono-chico" aria-hidden>chevron_right</span>
        </button>
        {mes !== hoy.slice(0, 7) && (
          <button className="btn btn-texto calendario-hoy" onClick={() => onMes(hoy.slice(0, 7))}>
            Hoy
          </button>
        )}
      </header>

      <div className="calendario-grilla" role="grid">
        {DIAS.map((d) => (
          <div key={d} className="calendario-dia-semana" role="columnheader">{d}</div>
        ))}
        {celdas.map((fecha, i) =>
          fecha ? (
            <div
              key={fecha}
              role="gridcell"
              className={[
                'calendario-celda',
                fecha === hoy && 'es-hoy',
                marcados?.has(fecha) && 'marcada',
              ].filter(Boolean).join(' ')}
            >
              <span className="calendario-numero">{Number(fecha.slice(8))}</span>
              {dias[fecha]}
            </div>
          ) : (
            <div key={`vacio-${i}`} className="calendario-celda vacia" aria-hidden />
          ),
        )}
      </div>
    </div>
  )
}

/** `2026-09` + 1 → `2026-10`. */
export function moverMes(mes: string, delta: number): string {
  const [a, m] = mes.split('-').map(Number)
  const f = new Date(Date.UTC(a, m - 1 + delta, 1))
  return f.toISOString().slice(0, 7)
}

/** Primer y último día de un mes `yyyy-MM`. */
export function rangoMes(mes: string): { desde: string; hasta: string } {
  const [a, m] = mes.split('-').map(Number)
  const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate()
  return { desde: `${mes}-01`, hasta: `${mes}-${String(ultimo).padStart(2, '0')}` }
}
