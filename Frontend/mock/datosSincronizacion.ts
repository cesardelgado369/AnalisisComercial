/**
 * TODO testing — Sincronización con Chess fake para `npm run dev:mock` (CONTRATO_API.md, «Sincronización con Chess»):
 * la corrida de las 5 de hoy, la de ayer con un paso que falló, y «Actualizar ahora», que la toma a los 4 s y avanza un
 * paso cada 2 s. Todo en memoria: reiniciar el servidor de prueba vuelve al estado inicial.
 */
import { ErrorMock, hoyArgentina } from './datosCobertura.ts'

const PASOS = ['personalComercial/', 'rutasVenta/', 'clientes/', 'articulos/', 'ventas/', 'compras-mes', 'cartera-mes']
const REGISTROS = [6, 41, 1315, 214, 2097, 1290, 5260]
const TOMA_MS = 4000
const PASO_MS = 2000

interface Paso {
  idCorrida: string
  inicio: string
  fin: string | null
  endpoint: string
  desde: string | null
  hasta: string | null
  registros: number
  ok: boolean
  error: string | null
}

const iso = (ms: number) => new Date(ms).toISOString()

/** Una corrida entera desde `inicio` (ms); con `falla`, ese paso termina con error. */
function corrida(id: string, inicio: number, falla?: string): Paso[] {
  return PASOS.map((endpoint, i) => ({
    idCorrida: id,
    inicio: iso(inicio + i * 9000),
    fin: iso(inicio + (i + 1) * 9000 - 500),
    endpoint,
    desde: endpoint === 'ventas/' ? `${hoyArgentina().slice(0, 7)}-01` : null,
    hasta: endpoint === 'ventas/' ? hoyArgentina() : null,
    registros: endpoint === falla ? 0 : REGISTROS[i],
    ok: endpoint !== falla,
    error: endpoint === falla ? 'Chess no respondió a tiempo (timeout de 100 s).' : null,
  }))
}

const cincoDeHoy = Date.parse(`${hoyArgentina()}T05:00:00-03:00`)
/** Del más viejo al más nuevo (se dan vuelta al responder). */
let pasos: Paso[] = [...corrida('ayer', cincoDeHoy - 86_400_000, 'ventas/'), ...corrida('hoy', cincoDeHoy)]
let pendiente: { solicitadoPor: string; solicitadoEn: string; en: number } | null = null
let enCurso: { id: string; empezo: number } | null = null

/** Avanza lo pedido según el reloj: la toma, los pasos y el final. */
function avanzar() {
  const ahora = Date.now()
  if (pendiente && !enCurso && ahora - pendiente.en >= TOMA_MS) {
    enCurso = { id: `manual-${ahora}`, empezo: ahora }
    pendiente = null
  }
  if (!enCurso) return
  const { id, empezo } = enCurso
  const hechos = Math.floor((ahora - empezo) / PASO_MS)
  pasos = pasos.filter((p) => p.idCorrida !== id)
  for (let i = 0; i <= Math.min(hechos, PASOS.length - 1); i++) {
    const termino = i < hechos
    pasos.push({
      idCorrida: id,
      inicio: iso(empezo + i * PASO_MS),
      fin: termino ? iso(empezo + (i + 1) * PASO_MS - 100) : null,
      endpoint: PASOS[i],
      desde: PASOS[i] === 'ventas/' ? `${hoyArgentina().slice(0, 7)}-01` : null,
      hasta: PASOS[i] === 'ventas/' ? hoyArgentina() : null,
      registros: termino ? REGISTROS[i] : 0,
      ok: termino,
      error: null,
    })
  }
  if (hechos >= PASOS.length) enCurso = null
}

/** Una corrida es OK si todos sus pasos terminaron bien (como el backend). */
function ultimaOk() {
  const conProblemas = new Set(pasos.filter((p) => !p.ok || p.fin === null).map((p) => p.idCorrida))
  const fines = pasos.filter((p) => !conProblemas.has(p.idCorrida) && p.fin).map((p) => p.fin!)
  return fines.length ? fines.reduce((a, b) => (a > b ? a : b)) : null
}

/** `GET /api/sincronizacion/estado`. */
export function estado(ventasHasta: string) {
  avanzar()
  return { ultimaOk: ultimaOk(), ventasHasta }
}

/** `GET /api/admin/sincronizaciones?cantidad=`. */
export function listar(cantidad: number) {
  avanzar()
  const { solicitadoPor, solicitadoEn } = pendiente ?? {}
  return {
    pendiente: pendiente ? { solicitadoPor, solicitadoEn } : null,
    pasos: [...pasos].reverse().slice(0, Math.min(200, Math.max(1, cantidad))),
  }
}

/** `POST /api/admin/sincronizaciones` → 202, o 409 si ya hay una pedida sin tomar. */
export function pedir(por: string) {
  avanzar()
  if (pendiente) throw new ErrorMock(409, 'Ya hay una actualización pedida: arranca en menos de un minuto.')
  const ahora = Date.now()
  pendiente = { solicitadoPor: por, solicitadoEn: iso(ahora), en: ahora }
  return { solicitadoEn: pendiente.solicitadoEn }
}
