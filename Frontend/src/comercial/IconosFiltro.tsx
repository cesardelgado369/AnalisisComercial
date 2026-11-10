import type { ReactNode } from 'react'

/**
 * Los íconos de la barra de filtros, dibujados para Madomi (Cesar, 10/11: nada de íconos de librería). Las formas salen
 * de su packaging (madomipastas.com): el paquete de pastas frescas con la banda arriba, el logo cruzado en cursiva y la
 * ventana; la nena; y el contorno blanco que rodea las letras de MADOMI, que acá además despega el dibujo de la banda
 * (negra, violeta lleno o el degradé del foco). Los colores, no: todo en el violeta de la app (Cesar, 10/11: estilizado
 * es que esté violeta, así es un paquete de Madomi). Rellenos claros y detalles oscuros, para que se lean también sobre
 * el violeta lleno del filtro en uso.
 */
// Los tokens de index.css (--piedra, --cabecera, --acento…): el atributo `fill` no lee variables de CSS
const PIEDRA = '#1d1630'
const CABECERA = '#3b1d74'
const ACENTO = '#7c3aed'
const ACENTO_CLARO = '#a78bfa'
const SUPERFICIE_MEDIA = '#ece4ff'
const SUPERFICIE_ALTA = '#e0d4ff'

function Lienzo({ children, giro = 0 }: { children: ReactNode; giro?: number }) {
  return (
    <svg className="icono-filtro" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <g transform={giro ? `rotate(${giro} 12 12)` : undefined}>{children}</g>
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

/**
 * El logo en chiquito: una franja en cursiva partida al medio como las letras de MADOMI (en la marca, verde arriba y
 * roja abajo; acá violeta oscuro arriba), con su borde blanco.
 */
function Logo({ franja, mitadDeArriba, abajo }: { franja: string; mitadDeArriba: string; abajo: string }) {
  return (
    <>
      <path d={franja} fill="#fff" stroke="#fff" strokeWidth={1.4} strokeLinejoin="round" />
      <path d={franja} fill={abajo} />
      <path d={mitadDeArriba} fill={CABECERA} />
    </>
  )
}

// El repartidor: busto con la camisa oscura, la gorra con el logo y la visera de costado, y un buen bigote
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
      <path d={TORSO} fill={CABECERA} />
      <path d={CUELLO} fill="#fff" />
      <path d={CARA} fill={SUPERFICIE_MEDIA} />
      <path d={COPA} fill={ACENTO_CLARO} />
      <path d={VISERA} fill={CABECERA} />
      <Logo franja="M9.3 9.2l.75-3h4.7l-.75 3z" mitadDeArriba="M9.67 7.7l.38-1.5h4.7l-.38 1.5z" abajo={ACENTO} />
      <circle cx="10.3" cy="12.9" r=".85" fill={PIEDRA} />
      <circle cx="13.7" cy="12.9" r=".85" fill={PIEDRA} />
      <path d={BIGOTE} fill={PIEDRA} />
    </Lienzo>
  )
}

// El almanaque de la visita, medio torcido como colgado en el mostrador, con el día de la visita marcado
const HOJA = { x: 3.5, y: 5, width: 17, height: 16.5, rx: 2.6 }
const ANILLOS = [6.6, 15]
const DIAS: [number, number][] = [[5.8, 12.4], [10.8, 12.4], [15.8, 12.4], [5.8, 16.6], [15.8, 16.6]]

export function IconoCalendario() {
  return (
    <Lienzo giro={-6}>
      <Contorno>
        <rect {...HOJA} />
        {ANILLOS.map((x) => <rect key={x} x={x} y="2.3" width="2.4" height="5.2" rx="1.2" />)}
      </Contorno>
      <rect {...HOJA} fill={SUPERFICIE_MEDIA} />
      <path d="M3.5 10.4V7.6A2.6 2.6 0 0 1 6.1 5h11.8a2.6 2.6 0 0 1 2.6 2.6v2.8z" fill={CABECERA} />
      {ANILLOS.map((x) => <rect key={x} x={x} y="2.3" width="2.4" height="5.2" rx="1.2" fill={ACENTO_CLARO} />)}
      {DIAS.map(([x, y]) => <rect key={`${x}-${y}`} x={x} y={y} width="2.4" height="2.4" rx=".6" fill={ACENTO_CLARO} />)}
      <rect x="10.3" y="16.1" width="3.4" height="3.4" rx=".9" fill={ACENTO} />
    </Lienzo>
  )
}

// El paquete de capelletis, apenas torcido: banda arriba, el logo cruzado, la ventana con la pasta a la vista, la nena
// abajo a la izquierda pisando la ventana y la franjita del pie
const CUERPO = { x: 4.6, y: 1.4, width: 14.8, height: 21.2, rx: 1.6 }
const LOGO = 'M4.4 10.4l.95-4h14.2l-.95 4z'
const CAPELLETIS: [number, number][] = [[9.6, 14.2], [13, 13.6], [15.6, 16]]

export function IconoPaquete() {
  return (
    <Lienzo giro={5}>
      <Contorno>
        <rect {...CUERPO} />
        <path d={LOGO} />
      </Contorno>
      <rect {...CUERPO} fill={SUPERFICIE_MEDIA} />
      <path d="M4.6 8.2V3a1.6 1.6 0 0 1 1.6-1.6h11.6A1.6 1.6 0 0 1 19.4 3v5.2z" fill={ACENTO} />
      <path d="M4.6 20.6h14.8V21a1.6 1.6 0 0 1-1.6 1.6H6.2A1.6 1.6 0 0 1 4.6 21z" fill={ACENTO_CLARO} />
      <rect x="6.2" y="11.6" width="11.6" height="6.6" rx="1.3" fill={CABECERA} />
      {CAPELLETIS.map(([x, y]) => (
        <g key={x}>
          <circle cx={x} cy={y} r="1.6" fill={SUPERFICIE_ALTA} />
          <circle cx={x + .15} cy={y + .1} r=".5" fill={ACENTO} />
        </g>
      ))}
      {/* La nena: la cofia, el pelo y la cara */}
      <circle cx="7.3" cy="18.4" r="2.3" fill="#fff" stroke={CABECERA} strokeWidth=".6" />
      <circle cx="7.5" cy="18.8" r="1.5" fill={ACENTO} />
      <circle cx="7.6" cy="19.3" r=".95" fill={SUPERFICIE_MEDIA} />
      <Logo franja={LOGO} mitadDeArriba="M4.87 8.4l.48-2h14.2l-.48 2z" abajo={ACENTO_CLARO} />
    </Lienzo>
  )
}

// El foco: la diana clara con un dardo oscuro clavado en el centro (clara para que se vea sobre el violeta lleno)
const AROS: [number, string][] = [[8.4, SUPERFICIE_MEDIA], [5.9, ACENTO], [3.5, SUPERFICIE_MEDIA], [1.3, CABECERA]]
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
      <path d={VARA} stroke={CABECERA} strokeWidth={1.6} strokeLinecap="round" />
      <path d={PLUMAS} fill={CABECERA} stroke={CABECERA} strokeWidth={.4} strokeLinejoin="round" />
    </Lienzo>
  )
}
