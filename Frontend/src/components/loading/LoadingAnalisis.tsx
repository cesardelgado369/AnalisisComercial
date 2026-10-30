import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import './loading.css'

interface Props {
  texto?: string
  /** Aclaración chica debajo, p. ej. «Suele tardar unos 30 segundos». */
  detalle?: string
  /** Muestra los segundos que lleva (solo en modo `siempre`). */
  contarSegundos?: boolean
  /**
   * `siempre`: carga larga, en bucle (ciclo de 6 s). `una-vez`: corre una vez y queda armada (el panel del login).
   * `quieta`: el dibujo terminado, sin animación.
   */
  modo?: 'siempre' | 'una-vez' | 'quieta'
  /** Colores para fondo oscuro (el panel violeta del login). */
  sobreOscuro?: boolean
}

// ---- La escena (unidades del viewBox): seis barras de ventas, la línea de tendencia y la lupa del analista
const BASE = 118
const ANCHO_BARRA = 28
const BARRAS = [
  { x: 58, alto: 34 },
  { x: 108, alto: 52 },
  { x: 158, alto: 44 },
  { x: 208, alto: 70 },
  { x: 258, alto: 62 },
  { x: 308, alto: 92 },
]
/** Un punto de la línea arriba de cada barra. El último (el mejor mes) es donde termina la lupa. */
const PUNTOS = BARRAS.map((b) => ({ x: b.x + ANCHO_BARRA / 2, y: BASE - b.alto - 8 }))
const FINAL = PUNTOS[PUNTOS.length - 1]
const LINEA = PUNTOS.map((p, i) => `${i ? 'L' : 'M'}${p.x} ${p.y}`).join(' ')
/** Chispas alrededor del hallazgo: hacia dónde salen desde el centro de la lupa. */
const CHISPAS = [
  { x: -34, y: -2 },
  { x: -24, y: -22 },
  { x: 26, y: -20 },
  { x: 36, y: 8 },
]
const ESTRELLA = 'M0 -6 L1.6 -1.6 L6 0 L1.6 1.6 L0 6 L-1.6 1.6 L-6 0 L-1.6 -1.6 Z'

const CICLO = 6000
const SALIDA = 'cubic-bezier(.2, .8, .3, 1)'

const lupaEn = (x: number, y: number, escala = 1, opacidad = 1) => ({ transform: `translate(${x}px, ${y}px) scale(${escala})`, opacity: opacidad })

/**
 * Línea de tiempo del ciclo (offsets de 0 a 1). Cada pieza tiene su propio momento, por eso va con la Web Animations
 * API y no con keyframes de CSS: todas arrancan juntas y quedan sincronizadas vuelta a vuelta.
 *   0–.40  las barras crecen de a una (con un rebote corto)
 *   .30–.65 la lupa entra y sigue a la línea de tendencia, que se dibuja punto por punto
 *   .66–.86 la lupa frena en el mejor mes: la barra se ilumina, sale la flecha de «crece» y saltan chispas
 *   .93–1  (solo en bucle) todo se desvanece y vuelve a empezar
 */
function lineaDeTiempo(svg: SVGSVGElement, bucle: boolean) {
  const q = <T extends Element>(sel: string) => [...svg.querySelectorAll<T>(sel)]
  const piezas: [Element, Keyframe[]][] = []

  if (bucle) {
    piezas.push([svg.querySelector('.la-escena')!, [
      { opacity: 0, offset: 0 },
      { opacity: 1, offset: 0.04 },
      { opacity: 1, offset: 0.93 },
      { opacity: 0, offset: 1 },
    ]])
  }

  q('.la-barra').forEach((barra, i) => {
    const s = 0.05 + 0.05 * i
    piezas.push([barra, [
      { transform: 'scaleY(0)', offset: 0 },
      { transform: 'scaleY(0)', offset: s, easing: SALIDA },
      { transform: 'scaleY(1.08)', offset: s + 0.07, easing: 'ease-in-out' },
      { transform: 'scaleY(1)', offset: s + 0.1 },
      { transform: 'scaleY(1)', offset: 1 },
    ]])
  })

  piezas.push([svg.querySelector('.la-linea')!, [
    { strokeDashoffset: 1, offset: 0 },
    { strokeDashoffset: 1, offset: 0.4, easing: 'ease-in-out' },
    { strokeDashoffset: 0, offset: 0.64 },
    { strokeDashoffset: 0, offset: 1 },
  ]])

  q('.la-punto').forEach((punto, i) => {
    const t = 0.4 + 0.048 * i
    piezas.push([punto, [
      { transform: 'scale(0)', offset: 0 },
      { transform: 'scale(0)', offset: t, easing: SALIDA },
      { transform: 'scale(1.5)', offset: t + 0.03, easing: 'ease-in-out' },
      { transform: 'scale(1)', offset: t + 0.06 },
      { transform: 'scale(1)', offset: 1 },
    ]])
  })

  piezas.push([svg.querySelector('.la-lupa')!, [
    { ...lupaEn(10, 90, 1, 0), offset: 0 },
    { ...lupaEn(10, 90, 1, 0), offset: 0.3, easing: 'ease-out' },
    { ...lupaEn(PUNTOS[0].x - 12, PUNTOS[0].y + 8), offset: 0.38, easing: 'ease-in-out' },
    ...PUNTOS.map((p, i) => ({ ...lupaEn(p.x, p.y), offset: 0.41 + 0.048 * i, easing: 'ease-in-out' })),
    { ...lupaEn(FINAL.x, FINAL.y, 1.18), offset: 0.7, easing: 'ease-in-out' },
    { ...lupaEn(FINAL.x, FINAL.y), offset: 0.76 },
    { ...lupaEn(FINAL.x, FINAL.y), offset: 1 },
  ]])

  piezas.push([svg.querySelector('.la-destacada')!, [
    { opacity: 0, offset: 0 },
    { opacity: 0, offset: 0.67, easing: 'ease-out' },
    { opacity: 1, offset: 0.73 },
    { opacity: 1, offset: 1 },
  ]])

  piezas.push([svg.querySelector('.la-insignia')!, [
    { transform: 'scale(0)', offset: 0 },
    { transform: 'scale(0)', offset: 0.72, easing: SALIDA },
    { transform: 'scale(1.25)', offset: 0.77, easing: 'ease-in-out' },
    { transform: 'scale(1)', offset: 0.8 },
    { transform: 'scale(1)', offset: 1 },
  ]])

  q('.la-chispa').forEach((chispa, j) => {
    const { x, y } = CHISPAS[j]
    const t = 0.72 + 0.015 * j
    const en = (f: number, escala: number, giro: number) => `translate(${x * f}px, ${y * f}px) scale(${escala}) rotate(${giro}deg)`
    piezas.push([chispa, [
      { transform: en(0.3, 0, 0), offset: 0 },
      { transform: en(0.3, 0, 0), offset: t, easing: SALIDA },
      { transform: en(1, 1, 90), offset: t + 0.07, easing: 'ease-in' },
      { transform: en(1.3, 0, 180), offset: t + 0.14 },
      { transform: en(1.3, 0, 180), offset: 1 },
    ]])
  })

  return piezas.map(([el, cuadros]) =>
    el.animate(cuadros, { duration: CICLO, iterations: bucle ? Infinity : 1, fill: bucle ? 'none' : 'both' }),
  )
}

const pideQuieto = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/**
 * La carga larga de Análisis Comercial (como la camioneta de De Ruta o el taller de Mantenimiento): las barras de
 * ventas crecen, la línea de tendencia se dibuja y la lupa del analista la recorre hasta el mejor mes, que se ilumina
 * con una flecha de «crece» y unas chispas. **Solo para esperas largas de verdad** (actualizar desde Chess, p. ej.):
 * para cargas comunes, `LoadingDefault` / `LoadingModal`. Respeta `prefers-reduced-motion` (queda el dibujo armado).
 * Sin animación, el SVG ya muestra la escena terminada: las animaciones solo la arman desde cero.
 */
export function LoadingAnalisis({ texto, detalle, contarSegundos = true, modo = 'siempre', sobreOscuro = false }: Props) {
  const svg = useRef<SVGSVGElement>(null)
  const [segundos, setSegundos] = useState(0)
  const bucle = modo === 'siempre'

  // Antes de pintar: así no se ve un cuadro de la escena armada antes de que arranque desde cero.
  useLayoutEffect(() => {
    if (modo === 'quieta' || !svg.current || !svg.current.animate || pideQuieto()) return
    const animaciones = lineaDeTiempo(svg.current, bucle)
    return () => animaciones.forEach((a) => a.cancel())
  }, [modo, bucle])

  useEffect(() => {
    if (!bucle || !contarSegundos) return
    const t = setInterval(() => setSegundos((s) => s + 1), 1000)
    return () => clearInterval(t)
  }, [bucle, contarSegundos])

  const clases = ['loading-analisis', sobreOscuro && 'sobre-oscuro'].filter(Boolean).join(' ')
  return (
    <div className={clases} role={texto ? 'status' : undefined} aria-live={texto ? 'polite' : undefined}>
      <svg ref={svg} className="la-dibujo" viewBox="0 -14 400 142" aria-hidden>
        <g className="la-escena">
          {/* Grilla y suelo del gráfico */}
          {[40, 66, 92].map((y) => (
            <line key={y} className="la-grilla" x1="36" y1={y} x2="364" y2={y} />
          ))}
          <line className="la-suelo" x1="30" y1={BASE} x2="370" y2={BASE} />

          {BARRAS.map((b) => (
            <rect key={b.x} className="la-barra" x={b.x} y={BASE - b.alto} width={ANCHO_BARRA} height={b.alto} rx="4" />
          ))}
          {/* El mejor mes, iluminado cuando la lupa lo encuentra */}
          <rect
            className="la-destacada"
            x={BARRAS[5].x}
            y={BASE - BARRAS[5].alto}
            width={ANCHO_BARRA}
            height={BARRAS[5].alto}
            rx="4"
          />

          <path className="la-linea" d={LINEA} pathLength={1} />
          {PUNTOS.map((p) => (
            <circle key={p.x} className="la-punto" cx={p.x} cy={p.y} r="4.5" />
          ))}

          <g transform={`translate(${FINAL.x} ${FINAL.y})`}>
            {CHISPAS.map((_, j) => (
              <path key={j} className="la-chispa" d={ESTRELLA} />
            ))}
          </g>

          {/* Flecha de «crece», arriba a la derecha del hallazgo */}
          <g transform={`translate(${FINAL.x + 48} ${FINAL.y - 14})`}>
            <g className="la-insignia">
              <circle r="13" />
              <path d="M-6.5 4.5 L-1.5 -0.5 L1.5 2.5 L6.5 -3.5 M2 -3.5 H6.5 V1" />
            </g>
          </g>

          {/* La lupa: vidrio, reflejo, aro y mango (dibujada en 0,0; la mueve la animación) */}
          <g className="la-lupa" style={{ transform: `translate(${FINAL.x}px, ${FINAL.y}px)` }}>
            <circle className="la-vidrio" r="17" />
            <path className="la-reflejo" d="M-9 -5 A10 10 0 0 1 -3 -10.5" />
            <line className="la-mango" x1="12.5" y1="12.5" x2="25" y2="25" />
            <circle className="la-aro" r="17" />
          </g>
        </g>
      </svg>

      {texto && (
        <div className="loading-analisis-texto">
          <strong>
            {texto}
            {bucle && contarSegundos && <span className="loading-analisis-segundos"> {segundos} s</span>}
          </strong>
          {detalle && <span>{detalle}</span>}
        </div>
      )}
    </div>
  )
}
