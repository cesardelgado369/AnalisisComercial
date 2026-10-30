const entero = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 })

export const formatoEntero = (n: number) => entero.format(n)

/** «1 cliente», «246 clientes» (plural regular con «s» salvo que se pase otro). */
export const cantidad = (n: number, singular: string, plural = `${singular}s`) => `${entero.format(n)} ${n === 1 ? singular : plural}`

/** El porcentaje de la API viene de 0 a 100 con un decimal: se muestra redondo («66%»), como la web actual. */
export const formatoPorcentaje = (n: number) => `${Math.round(n)}%`

const conDecimal = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 })

/** Bultos (la API los manda con hasta 2 decimales): «1.413,5». */
export const formatoBultos = (n: number) => conDecimal.format(n)

/** Porcentajes chicos, donde el decimal importa (devoluciones: «2,4%»); null → «—». */
export const formatoPorcentajeDecimal = (n: number | null) => (n === null ? '—' : `${conDecimal.format(n)}%`)

/**
 * Hoy en hora local, como `yyyy-MM-dd` (lo usa el `Calendario` de De Ruta para marcar el día). Para lo que depende de
 * los datos, vale el `hoy` de `GET /api/sesion` (el de Argentina).
 */
export function hoyIso(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

/** `2026-10-21` → «21/10/2026». */
export const formatoFecha = (f: string) => `${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(0, 4)}`
/** `2026-10-21` → «21/10». */
export const formatoFechaCorta = (f: string) => `${f.slice(8, 10)}/${f.slice(5, 7)}`
/** `2026-10-01` → «octubre». */
export const nombreMes = (mes: string) => MESES[Number(mes.slice(5, 7)) - 1]
/** `2026-10-01` → «Octubre». */
export const nombreMesTitulo = (mes: string) => {
  const n = nombreMes(mes)
  return `${n[0].toUpperCase()}${n.slice(1)}`
}
/** `2026-10-01` → «oct» (columnas angostas y el celular). */
export const nombreMesCorto = (mes: string) => nombreMes(mes).slice(0, 3)

/** Los instantes viajan en ISO con zona (y a veces sin ella): sin zona, se toman como UTC. */
export function fechaUtc(texto: string): Date {
  return new Date(/[zZ]|[+-]\d\d:\d\d$/.test(texto) ? texto : `${texto}Z`)
}

/** Instante → «26/10/2026 05:00» (en la hora de quien mira). */
export function formatoInstante(iso: string) {
  const d = fechaUtc(iso)
  if (Number.isNaN(d.getTime())) return iso
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/** Horas desde un instante hasta ahora (para el aviso de datos viejos: más de 36 h). */
export const horasDesde = (iso: string, ahora = new Date()) => (ahora.getTime() - fechaUtc(iso).getTime()) / 3_600_000

/** "hace unos segundos", "hace 5 min", "hace 2 h", "hace 3 días". */
export function haceCuanto(fecha: Date, ahora = new Date()): string {
  const seg = Math.max(0, Math.round((ahora.getTime() - fecha.getTime()) / 1000))
  if (seg < 60) return 'hace unos segundos'
  const min = Math.round(seg / 60)
  if (min < 60) return `hace ${min} min`
  const h = Math.round(min / 60)
  if (h < 24) return `hace ${h} h`
  const d = Math.round(h / 24)
  return `hace ${d} ${d === 1 ? 'día' : 'días'}`
}

/** "Juan Pérez" → "JP" (avatar de la cabecera). Solo letras: "Dueño (demo)" → "DD", no "D(". */
export function iniciales(nombre: string) {
  return nombre
    .split(/\s+/)
    .map((p) => p.match(/\p{L}/u)?.[0])
    .filter(Boolean)
    .slice(0, 2)
    .map((l) => l!.toUpperCase())
    .join('')
}
