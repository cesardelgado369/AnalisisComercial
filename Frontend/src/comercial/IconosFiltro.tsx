import type { ReactNode } from 'react'

/**
 * Los íconos de la barra de filtros, dibujados para Madomi (Cesar, 10/11: nada de íconos de librería). Salen de su
 * packaging (madomipastas.com): el rojo y el verde del logo, el crema de las bolsas y el contorno blanco que rodea las
 * letras de MADOMI, que acá además despega el dibujo de la banda (negra, violeta o el degradé del foco).
 */
const ROJO = '#e3151d'
const ROJO_LUZ = '#f04438'
const ROJO_SOMBRA = '#a50f16'
const VERDE = '#0a8a3e'
const CREMA = '#fffaf0'
/** Ojos, bigote y días: el negro violáceo de la banda (`--piedra`), que en el atributo `fill` no se puede leer. */
const TINTA = '#1d1630'

function Lienzo({ children }: { children: ReactNode }) {
  return (
    <svg className="icono-filtro" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {children}
    </svg>
  )
}

/** El contorno blanco: las mismas formas en blanco y con trazo, debajo del dibujo. */
function Contorno({ children, ancho = 2.2 }: { children: ReactNode; ancho?: number }) {
  return (
    <g fill="#fff" stroke="#fff" strokeWidth={ancho} strokeLinejoin="round" strokeLinecap="round">
      {children}
    </g>
  )
}

/** El logo en chiquito: una franja en cursiva, verde arriba y roja abajo como las letras de MADOMI, con su borde blanco. */
function Logo({ franja, mitadDeArriba }: { franja: string; mitadDeArriba: string }) {
  return (
    <>
      <path d={franja} fill="#fff" stroke="#fff" strokeWidth={1.4} strokeLinejoin="round" />
      <path d={franja} fill={ROJO} />
      <path d={mitadDeArriba} fill={VERDE} />
    </>
  )
}

// El repartidor: busto con la camisa verde, la gorra roja con el logo y la visera de costado, y un buen bigote
const TORSO = 'M2.5 24c.5-4 4.3-6.3 9.5-6.3s9 2.3 9.5 6.3z'
const CUELLO = 'M10.4 14.5h3.2v4.2h-3.2zM9.2 17.8 12 21.2l2.8-3.4z'
const CARA = 'M7.5 12.4a4.5 4.5 0 1 0 9 0 4.5 4.5 0 1 0-9 0z'
const COPA = 'M7.1 10.9C6.9 7.1 9.1 4.5 12 4.5s5 2.4 5.1 6.1z'
const VISERA = 'M15.4 9.3c1.9-.3 3.9-.2 5.6.3.9.3.9 1.4 0 1.6-1.8.4-3.8.5-5.8.3z'
const BIGOTE = 'M12 14.7c-1-.8-2.7-.6-3.5.9 1.1.4 2.7.3 3.5-.4.8.7 2.4.8 3.5.4-.8-1.5-2.5-1.7-3.5-.9z'

export function IconoVendedor() {
  return (
    <Lienzo>
      <Contorno>
        <path d={TORSO} />
        <path d={CUELLO} />
        <path d={CARA} />
        <path d={COPA} />
        <path d={VISERA} />
      </Contorno>
      <path d={TORSO} fill={VERDE} />
      <path d={CUELLO} fill={CREMA} />
      <path d={CARA} fill={CREMA} />
      <path d={COPA} fill={ROJO} />
      <path d={VISERA} fill={VERDE} />
      <Logo franja="M9.3 9.2l.75-3h4.7l-.75 3z" mitadDeArriba="M9.67 7.7l.38-1.5h4.7l-.38 1.5z" />
      <circle cx="10.3" cy="12.9" r=".85" fill={TINTA} />
      <circle cx="13.7" cy="12.9" r=".85" fill={TINTA} />
      <path d={BIGOTE} fill={TINTA} />
    </Lienzo>
  )
}

// El almanaque de la visita, medio torcido como colgado en el mostrador: la cabecera roja de las bolsas, los anillos
// verdes y el día de la visita marcado en verde
const HOJA = { x: 3.5, y: 5, width: 17, height: 16.5, rx: 2.6 }
const ANILLOS = [6.6, 15]
const DIAS: [number, number][] = [[5.8, 12.4], [10.8, 12.4], [15.8, 12.4], [5.8, 16.6], [15.8, 16.6]]

export function IconoCalendario() {
  return (
    <Lienzo>
      <g transform="rotate(-6 12 13)">
        <Contorno>
          <rect {...HOJA} />
          {ANILLOS.map((x) => <rect key={x} x={x} y="2.3" width="2.4" height="5.2" rx="1.2" />)}
        </Contorno>
        <rect {...HOJA} fill={CREMA} />
        <path d="M3.5 10.4V7.6A2.6 2.6 0 0 1 6.1 5h11.8a2.6 2.6 0 0 1 2.6 2.6v2.8z" fill={ROJO} />
        {ANILLOS.map((x) => <rect key={x} x={x} y="2.3" width="2.4" height="5.2" rx="1.2" fill={VERDE} />)}
        {DIAS.map(([x, y]) => <rect key={`${x}-${y}`} x={x} y={y} width="2.4" height="2.4" rx=".6" fill={TINTA} opacity=".28" />)}
        <rect x="10.3" y="16.1" width="3.4" height="3.4" rx=".9" fill={VERDE} />
      </g>
    </Lienzo>
  )
}

// La caja: el rojo de las bandejas de pastas frescas, con la ventana crema y el logo cruzado arriba de la ventana
const TAPA = 'M2.5 9 6 5.5h15.5L17 9z'
const FRENTE = 'M2.5 9H17v13H2.5z'
const COSTADO = 'M17 9l4.5-3.5v13L17 22z'

export function IconoCaja() {
  return (
    <Lienzo>
      <Contorno>
        <path d={TAPA} />
        <path d={FRENTE} />
        <path d={COSTADO} />
      </Contorno>
      <path d={TAPA} fill={ROJO_LUZ} />
      <path d={FRENTE} fill={ROJO} />
      <path d={COSTADO} fill={ROJO_SOMBRA} />
      <rect x="4.6" y="14.2" width="10.3" height="5.8" rx="1" fill={CREMA} />
      <Logo franja="M4 15l1.1-4.6h11.2L15.2 15z" mitadDeArriba="M4.55 12.7 5.1 10.4h11.2l-.55 2.3z" />
    </Lienzo>
  )
}

// El foco: la diana en rojo y crema con un dardo verde clavado en el centro
const AROS: [number, string][] = [[8.4, ROJO], [5.9, CREMA], [3.5, ROJO], [1.3, CREMA]]
const VARA = 'M10.3 13.7 18.8 5.2'
const PLUMAS = 'M16.96 7.04H19.5l1-1-1.7-.85zM16.96 7.04V4.5l1-1 .85 1.7z'

export function IconoFoco() {
  return (
    <Lienzo>
      <circle cx="10.3" cy="13.7" r="8.4" fill="#fff" stroke="#fff" strokeWidth={2.2} />
      {AROS.map(([r, color]) => <circle key={r} cx="10.3" cy="13.7" r={r} fill={color} />)}
      <Contorno ancho={2}>
        <path d={VARA} strokeWidth={3.6} />
        <path d={PLUMAS} />
      </Contorno>
      <path d={VARA} stroke={VERDE} strokeWidth={1.6} strokeLinecap="round" />
      <path d={PLUMAS} fill={VERDE} stroke={VERDE} strokeWidth={.4} strokeLinejoin="round" />
    </Lienzo>
  )
}
