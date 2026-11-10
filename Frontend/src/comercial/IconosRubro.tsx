import type { ReactNode } from 'react'
import { Lienzo } from './IconosFiltro'
import { ACENTO, ACENTO_CLARO, CABECERA, PIEDRA, SUPERFICIE_ALTA, SUPERFICIE_MEDIA } from './paletaIconos'

/**
 * Un ícono por rubro de producto (la unidad de negocio de Chess; Cesar, 10/11), dibujado para Madomi en el violeta de
 * la app como los de la barra de filtros. Van chiquitos (16 px) al lado del nombre, sobre blanco o violeta muy claro:
 * en vez del contorno blanco de la barra llevan un trazo violeta oscuro, como las líneas de la nena del logo.
 */
const TRAZO = { stroke: CABECERA, strokeWidth: 1.4, strokeLinejoin: 'round', strokeLinecap: 'round' } as const

/** Un cuadrado con el borde festoneado, como el corte del raviol. */
function festoneado(cx: number, cy: number, lado: number, festones: number) {
  const paso = lado / festones
  const arco = (dx: number, dy: number) => ` a${paso / 2} ${paso / 2} 0 0 1 ${dx} ${dy}`
  return (
    `M${cx - lado / 2} ${cy - lado / 2}` +
    arco(paso, 0).repeat(festones) +
    arco(0, paso).repeat(festones) +
    arco(-paso, 0).repeat(festones) +
    arco(0, -paso).repeat(festones) +
    'z'
  )
}

// ATM: dos ravioles de la plancha en su bandeja de 1 kg
const RAVIOLES: [number, number, number][] = [[8, 10.4, -8], [15.8, 11.4, 10]]

function Bandeja() {
  return (
    <>
      <path d="M1.8 15.4h20.4l-1.6 5.2a1.4 1.4 0 0 1-1.3 1H4.7a1.4 1.4 0 0 1-1.3-1z" fill={ACENTO} {...TRAZO} />
      {RAVIOLES.map(([x, y, giro]) => (
        <g key={x} transform={`rotate(${giro} ${x} ${y})`}>
          <path d={festoneado(x, y, 9.4, 4)} fill={SUPERFICIE_MEDIA} {...TRAZO} strokeWidth={1.1} />
          <circle cx={x} cy={y} r="2.35" fill={SUPERFICIE_ALTA} stroke={ACENTO_CLARO} strokeWidth=".8" />
        </g>
      ))}
    </>
  )
}

/** El repulgue: la media luna de la empanada con el borde de festones chicos. */
function repulgue(cx: number, cy: number, radio: number, festones: number) {
  let d = `M${cx - radio} ${cy}`
  for (let i = 1; i <= festones; i++) {
    const angulo = Math.PI - (i / festones) * Math.PI
    d += ` A1.6 1.6 0 0 1 ${(cx + radio * Math.cos(angulo)).toFixed(2)} ${(cy - radio * Math.sin(angulo)).toFixed(2)}`
  }
  return d + 'z'
}

// Comidas congeladas: una empanada con el copo de frío
const COPO = [90, 150, 210].map((grados) => {
  const a = (grados * Math.PI) / 180
  const [dx, dy] = [2.7 * Math.cos(a), 2.7 * Math.sin(a)]
  return `M${(18.8 - dx).toFixed(2)} ${(5.6 - dy).toFixed(2)} ${(18.8 + dx).toFixed(2)} ${(5.6 + dy).toFixed(2)}`
}).join('')

function Empanada() {
  return (
    <>
      <g transform="rotate(-10 11.6 15)">
        <path d={repulgue(11.6, 18.4, 8.6, 9)} fill={ACENTO_CLARO} {...TRAZO} strokeWidth={1.2} />
        <path d="M5.2 18.4C5.2 14 8 11.4 11.6 11.4S18 14 18 18.4z" fill={SUPERFICIE_MEDIA} {...TRAZO} strokeWidth={1.2} />
      </g>
      <circle cx="18.8" cy="5.6" r="4.3" fill="#fff" {...TRAZO} />
      <path d={COPO} stroke={ACENTO} strokeWidth={1.3} strokeLinecap="round" />
    </>
  )
}

// Pan rallado: el pan y la montañita de pan rallado
const MIGAS: [number, number, number][] = [[10.4, 18.6, .8], [13.6, 19.3, .8], [16.6, 18.4, .8], [12.4, 17.4, .7], [18.9, 19.6, .7]]

function PanRallado() {
  return (
    <>
      <path
        d="M9.5 15.2c-1 .1-2.2 2.8-2.9 5.6h15.4c-.7-2.8-1.9-5.5-2.9-5.6-1.5-.2-2.7 1-4.8 1s-3.3-1.2-4.8-1z"
        fill={SUPERFICIE_ALTA} {...TRAZO} strokeWidth={1.2}
      />
      {MIGAS.map(([x, y, r]) => <circle key={x} cx={x} cy={y} r={r} fill={ACENTO} />)}
      <g transform="rotate(-38 9.5 9.5)">
        <rect x="1.2" y="6" width="16.6" height="7" rx="3.5" fill={ACENTO_CLARO} {...TRAZO} />
        <path d="M5.4 7.9 6.6 11.1M9.3 7.9l1.2 3.2M13.2 7.9l1.2 3.2" stroke={SUPERFICIE_MEDIA} strokeWidth={1.2} strokeLinecap="round" />
      </g>
    </>
  )
}

// Pastas frescas: tres ñoquis con su rayado
const NOQUIS: [number, number, number][] = [[7.8, 8.6, -20], [16.4, 10.4, 15], [11, 16.8, 5]]

function Noquis() {
  return (
    <>
      {NOQUIS.map(([x, y, giro]) => (
        <g key={x} transform={`rotate(${giro} ${x} ${y})`}>
          <rect x={x - 4.2} y={y - 2.8} width="8.4" height="5.6" rx="2.8" fill={SUPERFICIE_MEDIA} {...TRAZO} strokeWidth={1.2} />
          <path
            d={`M${x - 1.9} ${y - 1.7}c-.6 1.1-.6 2.3 0 3.4M${x} ${y - 1.9}c-.6 1.2-.6 2.6 0 3.8M${x + 1.9} ${y - 1.7}c-.6 1.1-.6 2.3 0 3.4`}
            fill="none" stroke={ACENTO} strokeWidth={.9} strokeLinecap="round"
          />
        </g>
      ))}
    </>
  )
}

// Sin unidad de negocio (dulce de leche, manteca, salsa…): el pote de dulce de leche, chorreado
function Pote() {
  return (
    <>
      <path d="M5 8.6h14l-1.3 11.6a1.6 1.6 0 0 1-1.6 1.4H7.9a1.6 1.6 0 0 1-1.6-1.4z" fill={SUPERFICIE_MEDIA} {...TRAZO} />
      <path d="M5.7 12.4h12.6l-.55 5H6.25z" fill={ACENTO_CLARO} {...TRAZO} strokeWidth={1} />
      <rect x="3.8" y="4.6" width="16.4" height="4.4" rx="1.8" fill={ACENTO} {...TRAZO} />
      <path d="M14.2 8.8c0 1.6.2 3.4 1.3 3.4s1.2-1.6 1.2-3.4" fill={ACENTO} {...TRAZO} strokeWidth={1} />
    </>
  )
}

// Tapas: la tapa recién cortada con el palote encima
function Tapa() {
  return (
    <>
      <ellipse cx="12" cy="15" rx="10.2" ry="5.6" fill={SUPERFICIE_MEDIA} {...TRAZO} />
      <ellipse cx="12" cy="15" rx="7.4" ry="3.6" fill="none" stroke={ACENTO_CLARO} strokeWidth=".8" strokeDasharray="1 1" />
      <g transform="rotate(-24 12 10)">
        <rect x=".6" y="8.6" width="3.6" height="2.6" rx="1.2" fill={ACENTO_CLARO} {...TRAZO} strokeWidth={1} />
        <rect x="19.8" y="8.6" width="3.6" height="2.6" rx="1.2" fill={ACENTO_CLARO} {...TRAZO} strokeWidth={1} />
        <rect x="4" y="7.4" width="16" height="5" rx="2.5" fill={ACENTO} {...TRAZO} />
      </g>
    </>
  )
}

// Cualquier otro rubro: la nena de Madomi, con la cofia de ala para arriba, el flequillo y la sonrisa
function Nena() {
  return (
    <>
      <path
        d="M5.6 17.4 1.4 6.4c1.8.6 3.2.4 4.4-.6C7.6 4.2 10.2 3.2 13 3.2c4.6 0 8.2 3.8 8.2 8.4s-3.6 8.4-8.2 8.4c-2.9 0-5.6-1-7.4-2.6z"
        fill="#fff" {...TRAZO}
      />
      <path
        d="M7.4 13.2c0-4 2.5-6.8 5.6-6.8s5.6 2.8 5.6 6.8c0 .6-.1 1.2-.2 1.7-.6-2.4-2.6-4.3-5.4-4.3s-4.8 1.9-5.4 4.3c-.1-.5-.2-1.1-.2-1.7z"
        fill={ACENTO} {...TRAZO} strokeWidth={1.1}
      />
      <path d="M7.8 14.9c.6-2.4 2.6-4.3 5.2-4.3s4.6 1.9 5.2 4.3c-.4 2.6-2.6 4.6-5.2 4.6s-4.8-2-5.2-4.6z" fill={SUPERFICIE_MEDIA} {...TRAZO} strokeWidth={1} />
      <circle cx="11.6" cy="14.6" r=".75" fill={PIEDRA} />
      <circle cx="14.4" cy="14.6" r=".75" fill={PIEDRA} />
      <path d="M11.7 16.6c.8.7 2 .7 2.8 0" fill="none" stroke={PIEDRA} strokeWidth=".8" strokeLinecap="round" />
    </>
  )
}

// ---- Uno por clase de producto (Cesar, 10/11: ravioles, tallarines, ñoquis y sorrentinos son pastas frescas, pero son
// distintos)

/** Un círculo con el borde festoneado, como el corte del sorrentino. */
function circuloFestoneado(cx: number, cy: number, r: number, festones: number) {
  const paso = (2 * Math.PI) / festones
  const radio = (r * Math.sin(paso / 2)).toFixed(2)
  let d = `M${cx + r} ${cy}`
  for (let i = 1; i <= festones; i++) {
    d += ` A${radio} ${radio} 0 0 1 ${(cx + r * Math.cos(i * paso)).toFixed(2)} ${(cy + r * Math.sin(i * paso)).toFixed(2)}`
  }
  return d + 'z'
}

// Ravioles: la plancha de cuatro, con el borde picado y las líneas de corte
const RELLENOS_RAVIOL: [number, number][] = [[7.75, 7.75], [16.25, 7.75], [7.75, 16.25], [16.25, 16.25]]

function Ravioles() {
  return (
    <>
      <path d={festoneado(12, 12, 17, 5)} fill={SUPERFICIE_MEDIA} {...TRAZO} strokeWidth={1.2} />
      <path d="M12 3.5v17M3.5 12h17" stroke={ACENTO_CLARO} strokeWidth={1} strokeDasharray="1.2 1" />
      {RELLENOS_RAVIOL.map(([x, y]) => <circle key={`${x}-${y}`} cx={x} cy={y} r="2.4" fill={SUPERFICIE_ALTA} stroke={ACENTO} strokeWidth=".9" />)}
    </>
  )
}

// Sorrentinos: dos redondos y gorditos, de borde festoneado
const SORRENTINOS: [number, number, number][] = [[15.4, 8.8, 6], [8.8, 15.2, 6.6]]

function Sorrentinos() {
  return (
    <>
      {SORRENTINOS.map(([x, y, r]) => (
        <g key={x}>
          <path d={circuloFestoneado(x, y, r, 12)} fill={SUPERFICIE_MEDIA} {...TRAZO} strokeWidth={1.1} />
          <circle cx={x} cy={y} r={r * .6} fill={SUPERFICIE_ALTA} stroke={ACENTO} strokeWidth=".9" />
          <ellipse cx={x - r * .22} cy={y - r * .22} rx={r * .2} ry={r * .13} transform={`rotate(-40 ${x - r * .22} ${y - r * .22})`} fill="#fff" />
        </g>
      ))}
    </>
  )
}

// Tallarines y fideos: el nido, cuatro vueltas de cinta enredadas una arriba de la otra
const VUELTAS: [number, number, number, number, number][] = [
  [11, 13.6, 8.4, 4.6, -18],
  [13, 11.6, 7.6, 4.4, 24],
  [12.4, 14.2, 8, 3.6, 4],
  [11.2, 11.2, 6.6, 3.8, -40],
]

function Nido() {
  return (
    <>
      {VUELTAS.map(([cx, cy, rx, ry, giro]) => (
        <g key={giro} transform={`rotate(${giro} ${cx} ${cy})`} fill="none">
          <ellipse cx={cx} cy={cy} rx={rx} ry={ry} stroke={CABECERA} strokeWidth={3.4} />
          <ellipse cx={cx} cy={cy} rx={rx} ry={ry} stroke={SUPERFICIE_MEDIA} strokeWidth={1.8} />
        </g>
      ))}
    </>
  )
}

// Capelettis: dos sombreritos (eso quiere decir capeletti), con el ala y la copa rellena
const CAPELETTIS: [number, number, number][] = [[7.8, 15, -10], [16.2, 8.4, 12]]

function Capelettis() {
  return (
    <>
      {CAPELETTIS.map(([x, y, giro]) => (
        <g key={x} transform={`rotate(${giro} ${x} ${y})`}>
          <ellipse cx={x} cy={y + 2.2} rx="6.4" ry="2.9" fill={SUPERFICIE_MEDIA} {...TRAZO} strokeWidth={1.2} />
          <path d={`M${x - 3.6} ${y + 2}c0-3.2 1.6-5.6 3.6-5.6s3.6 2.4 3.6 5.6c-1.2.7-2.4 1-3.6 1s-2.4-.3-3.6-1z`} fill={SUPERFICIE_ALTA} {...TRAZO} strokeWidth={1.2} />
          <path d={`M${x - 1.4} ${y - 1.6}c.5-.8 1-1.1 1.6-1.2`} fill="none" stroke="#fff" strokeWidth="1" strokeLinecap="round" />
        </g>
      ))}
    </>
  )
}

// Canelones: dos rollos acostados, con el relleno a la vista y la salsa por arriba
function Canelones() {
  return (
    <>
      {[16.4, 9.4].map((y) => (
        <g key={y}>
          <rect x="2.6" y={y - 3.2} width="18.8" height="6.4" rx="3.2" fill={SUPERFICIE_MEDIA} {...TRAZO} strokeWidth={1.2} />
          <ellipse cx="5.4" cy={y} rx="1.8" ry="2.4" fill={ACENTO_CLARO} {...TRAZO} strokeWidth={1} />
        </g>
      ))}
      <path d="M8.6 6.4c1.6 1.4 2.8-1 4.4.4s2.8-1 4.4.4 2.2-.4 3 .4" fill="none" stroke={ACENTO} strokeWidth={2.2} strokeLinecap="round" />
    </>
  )
}

// Lasagna: la porción, con las capas de masa y relleno y la salsa arriba
function Lasagna() {
  return (
    <>
      <path d="M17.4 10.4 21.4 6.8v9.6l-4 3.8z" fill={SUPERFICIE_ALTA} {...TRAZO} strokeWidth={1.2} />
      <rect x="2.6" y="10.4" width="14.8" height="9.8" fill={SUPERFICIE_MEDIA} {...TRAZO} strokeWidth={1.2} />
      <path d="M2.6 13h14.8v1.7H2.6zM2.6 16.4h14.8v1.7H2.6z" fill={ACENTO_CLARO} />
      <path d="M2.6 10.4 6.6 6.8h14.8l-4 3.6z" fill={ACENTO} {...TRAZO} strokeWidth={1.2} />
      <path d="M2.6 10.4h14.8v.8c-.8.2-1 1.4-1.8 1.4s-.8-1-1.6-1-.9 1.6-1.8 1.6-.9-1.6-1.8-1.6-.8 1.2-1.6 1.2-1-1.2-1.8-1.2-.9 1.6-1.8 1.6-.8-1.2-1.6-1.2z" fill={ACENTO} />
    </>
  )
}

// Empanada (las de comidas): una sola, gordita, con el repulgue
function EmpanadaSola() {
  return (
    <g transform="rotate(-8 12 15)">
      <path d={repulgue(12, 18.6, 9.8, 10)} fill={ACENTO_CLARO} {...TRAZO} strokeWidth={1.2} />
      <path d="M5 18.6C5 13.8 8.2 10.8 12 10.8s7 3 7 7.8z" fill={SUPERFICIE_MEDIA} {...TRAZO} strokeWidth={1.2} />
    </g>
  )
}

/** Una elipse con el borde festoneado: el repulgue de la tarta vista de arriba. */
function elipseFestoneada(cx: number, cy: number, rx: number, ry: number, festones: number) {
  const punto = (i: number) => [cx + rx * Math.cos((i / festones) * 2 * Math.PI), cy + ry * Math.sin((i / festones) * 2 * Math.PI)]
  let d = `M${cx + rx} ${cy}`
  for (let i = 1; i <= festones; i++) {
    const [x0, y0] = punto(i - 1)
    const [x1, y1] = punto(i)
    const radio = (Math.hypot(x1 - x0, y1 - y0) / 2).toFixed(2)
    d += ` A${radio} ${radio} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`
  }
  return d + 'z'
}

// Pascualina: la tarta entera, baja, con el repulgue alrededor y las hojitas cortadas arriba
function Pascualina() {
  return (
    <>
      <path d="M2.2 12.6v2.6c0 3.2 4.4 5.6 9.8 5.6s9.8-2.4 9.8-5.6v-2.6z" fill={ACENTO_CLARO} {...TRAZO} strokeWidth={1.2} />
      <path d={elipseFestoneada(12, 12.4, 9.4, 5.2, 16)} fill={ACENTO_CLARO} {...TRAZO} strokeWidth={1.1} />
      <ellipse cx="12" cy="12.4" rx="7.4" ry="3.7" fill={SUPERFICIE_MEDIA} {...TRAZO} strokeWidth={1} />
      <path d="M9.2 12.6c.8-1.2 2-1.4 2.8-1.2M12 11.4c.8-.4 2-.2 2.8 1M12 11.4V13" fill="none" stroke={ACENTO} strokeWidth={1} strokeLinecap="round" />
    </>
  )
}

// Manteca: el pan de manteca envuelto, con su faja y un rulo arriba
function Manteca() {
  return (
    <>
      <path d="M16 12.4l4.6-3.8v7.6L16 20z" fill={ACENTO_CLARO} {...TRAZO} strokeWidth={1.2} />
      <rect x="2.4" y="12.4" width="13.6" height="7.6" fill={SUPERFICIE_ALTA} {...TRAZO} strokeWidth={1.2} />
      <path d="M2.4 15.2H16v2H2.4z" fill={ACENTO} />
      <path d="M2.4 12.4 7 8.6h13.6L16 12.4z" fill={SUPERFICIE_MEDIA} {...TRAZO} strokeWidth={1.2} />
      <ellipse cx="11.4" cy="7.4" rx="4" ry="2.4" fill="#fff" {...TRAZO} strokeWidth={1.1} />
      <path d="M8.4 7.4c.8-1 2.4-1.4 3.8-1M9.8 8.6c1.2-.6 2.8-.8 4.2-.6" fill="none" stroke={ACENTO_CLARO} strokeWidth=".9" strokeLinecap="round" />
    </>
  )
}

// Masa para tacos: el taco armado de costado, la tortilla doblada (con sus pintitas de tostado), la lechuga y el
// relleno asomando arriba
function Taco() {
  return (
    <g transform="rotate(-10 12 14)">
      <path d="M3 11.6c.4-1.6 1.6-2.4 2.8-1.6.4-1.6 2.2-2.2 3.2-.8.8-1.4 2.8-1.4 3.4 0 1-1.2 2.8-.8 3 .8 1.2-.8 2.8 0 2.8 1.6z" fill={ACENTO} {...TRAZO} strokeWidth={1.1} />
      <circle cx="8.6" cy="9.8" r="1.1" fill={ACENTO_CLARO} {...TRAZO} strokeWidth={.9} />
      <circle cx="14.6" cy="9.6" r="1.1" fill={ACENTO_CLARO} {...TRAZO} strokeWidth={.9} />
      <path d="M2.4 11.6h19.2c0 5.2-4.3 9.2-9.6 9.2s-9.6-4-9.6-9.2z" fill={SUPERFICIE_MEDIA} {...TRAZO} strokeWidth={1.2} />
      {[[7.4, 14.6], [11.6, 17.4], [15.8, 14.8], [12.4, 13.8]].map(([x, y]) => <circle key={`${x}-${y}`} cx={x} cy={y} r=".8" fill={ACENTO_CLARO} />)}
    </g>
  )
}

// Pionono: el arrollado acostado, con el espiral del relleno en la punta
function Pionono() {
  return (
    <>
      <path d="M6.6 6.6h12.2c1.6 0 2.8 2.6 2.8 5.8s-1.2 5.8-2.8 5.8H6.6z" fill={SUPERFICIE_ALTA} {...TRAZO} strokeWidth={1.2} />
      <ellipse cx="6.6" cy="12.4" rx="3.8" ry="5.8" fill={SUPERFICIE_MEDIA} {...TRAZO} strokeWidth={1.2} />
      <path d="M6.8 12.6c.7 0 .9 1 .2 1.4-1 .6-2.1-.4-1.9-1.6.2-1.8 2.6-2.6 3.4-.6.8 2.2-.6 4.8-2.6 4.6" fill="none" stroke={ACENTO} strokeWidth={1.1} strokeLinecap="round" />
      <path d="M11 9.4h1M14.4 8.8h1M17.2 10.2h1M12.6 12.2h1" stroke={ACENTO_CLARO} strokeWidth={1} strokeLinecap="round" />
    </>
  )
}

// Queso: la cuña con sus agujeros
function Queso() {
  return (
    <>
      <path d="M21 9.6v7.8l-4.4-4.2V5.4z" fill={ACENTO_CLARO} {...TRAZO} strokeWidth={1.2} />
      <path d="M3 12.8 21 9.6v7.8L3 20.6z" fill={SUPERFICIE_ALTA} {...TRAZO} strokeWidth={1.2} />
      <path d="M3 12.8 16.6 5.4 21 9.6z" fill={SUPERFICIE_MEDIA} {...TRAZO} strokeWidth={1.2} />
      <circle cx="8" cy="16.4" r="1.6" fill={ACENTO_CLARO} {...TRAZO} strokeWidth={.8} />
      <circle cx="14" cy="15.6" r="1.2" fill={ACENTO_CLARO} {...TRAZO} strokeWidth={.8} />
      <circle cx="17.6" cy="13.6" r=".8" fill={ACENTO_CLARO} {...TRAZO} strokeWidth={.8} />
      <circle cx="13.6" cy="9.4" r="1" fill={ACENTO_CLARO} {...TRAZO} strokeWidth={.8} />
    </>
  )
}

// Salsa: el tomate, con su estrellita de hojas
function Tomate() {
  return (
    <>
      <circle cx="12" cy="13.6" r="8" fill={ACENTO_CLARO} {...TRAZO} />
      <ellipse cx="8.4" cy="11.6" rx="1.4" ry="2.4" transform="rotate(30 8.4 11.6)" fill={SUPERFICIE_MEDIA} />
      <path d="M12 4.4l1.1 2 2.5-.6-1.5 1.9 1.9 1.3-2.5.2-1.5 2-1.5-2-2.5-.2 1.9-1.3-1.5-1.9 2.5.6z" fill={ACENTO} {...TRAZO} strokeWidth={.9} />
      <path d="M12 4.6V2.2" stroke={CABECERA} strokeWidth={1.4} strokeLinecap="round" />
    </>
  )
}

// Hamburguesas: pan con semillas, lechuga, la medallón y el pan de abajo
const SEMILLAS: [number, number][] = [[8.4, 7.8], [12, 6.6], [15.6, 7.8], [10.2, 9.6], [13.8, 9.6]]

function Hamburguesa() {
  return (
    <>
      <path d="M3.4 16.8h17.2v1a2.6 2.6 0 0 1-2.6 2.6H6a2.6 2.6 0 0 1-2.6-2.6z" fill={SUPERFICIE_MEDIA} {...TRAZO} strokeWidth={1.2} />
      <rect x="2.6" y="12.8" width="18.8" height="4" rx="2" fill={ACENTO} {...TRAZO} strokeWidth={1.2} />
      <path d="M3 12.2c1 .9 2 .9 3 0s2 .9 3 0 2 .9 3 0 2 .9 3 0 2 .9 3 0 2 .9 3 0" fill="none" stroke={ACENTO_CLARO} strokeWidth={1.6} strokeLinecap="round" />
      <path d="M3 11.2C3 6.8 7 4 12 4s9 2.8 9 7.2z" fill={SUPERFICIE_MEDIA} {...TRAZO} strokeWidth={1.2} />
      {SEMILLAS.map(([x, y]) => <ellipse key={`${x}-${y}`} cx={x} cy={y} rx=".7" ry=".45" fill={ACENTO} />)}
    </>
  )
}

// Milanesas: la milanesa empanada, con su pan rallado y una rodajita de limón
const MIGAS_MILANESA: [number, number][] = [[8, 11.4], [11.4, 9.6], [14.8, 11.8], [9.6, 15.2], [13.2, 14.8], [17, 14.2], [6.4, 14.4]]

function Milanesa() {
  return (
    <>
      <path
        d="M3.6 14.8c-1.2-3.6 1.6-7.6 6.2-8.4 3.4-.6 5.6.8 8.2.4 2.6-.4 3.8 2 2.8 4.6-1 2.4-.2 4.4-2.4 6.4-2.6 2.4-7.2 2.4-10.4 1.4-2.2-.6-3.8-2.4-4.4-4.4z"
        fill={ACENTO_CLARO} {...TRAZO}
      />
      {MIGAS_MILANESA.map(([x, y]) => <circle key={`${x}-${y}`} cx={x} cy={y} r=".65" fill={SUPERFICIE_MEDIA} />)}
      <path d="M15.4 4.6a3.8 3.8 0 0 0 7.2 1.6z" fill="#fff" {...TRAZO} strokeWidth={1.1} />
      <path d="M19 5.4l-.8 2.4M19 5.4l2 1.4" stroke={ACENTO_CLARO} strokeWidth=".8" strokeLinecap="round" />
    </>
  )
}

/**
 * Las palabras de la descripción (sin tildes, en mayúscula) y su dibujo; gana la primera que aparece. Por eso van antes
 * PASCUALINA y TAPA que EMPANADA (Tapas de empanada) y las pastas antes que QUESO (Sorrentinos jamón y queso).
 */
const POR_PALABRA: [string[], () => ReactNode][] = [
  [['PASCUALINA'], Pascualina],
  [['TAPA'], Tapa],
  [['EMPANADA'], EmpanadaSola],
  [['SORRENTINO'], Sorrentinos],
  [['RAVIOL'], Ravioles],
  [['CAPELETI', 'CAPELETTI', 'CAPELLETI', 'CAPELETINI'], Capelettis],
  [['CANELON'], Canelones],
  [['LASAGNA', 'LASANA'], Lasagna],
  [['NOQUI'], Noquis],
  [['TALLARIN', 'FIDEO', 'CINTA'], Nido],
  [['PAN RALLADO', 'REBOZADOR'], PanRallado],
  [['DULCE DE LECHE'], Pote],
  [['MANTECA'], Manteca],
  [['TACO'], Taco],
  [['PIONONO'], Pionono],
  [['HAMBURGUESA'], Hamburguesa],
  [['MILANESA'], Milanesa],
  [['SALSA'], Tomate],
  [['QUESO'], Queso],
]

/** El ícono de un artículo según su descripción; si no es de ninguna clase conocida, el de su rubro. */
export function IconoProducto({ descripcion, unidad }: { descripcion: string; unidad: string | null }) {
  const texto = descripcion.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
  const Dibujo = POR_PALABRA.find(([palabras]) => palabras.some((p) => texto.includes(p)))?.[1]
  if (!Dibujo) return <IconoRubro unidad={unidad} />
  return (
    <Lienzo clase="icono-rubro">
      <Dibujo />
    </Lienzo>
  )
}

/** Los rubros como los manda Chess (con o sin el «124 - » de la web vieja, como `unidadVisible`). */
const POR_RUBRO: Record<string, () => ReactNode> = {
  ATM: Bandeja,
  'COMIDAS CONGELADAS': Empanada,
  'PAN RALLADO1': PanRallado,
  'PASTAS FRESCAS': Noquis,
  'SIN UNIDAD DE NEGOCIO': Pote,
  TAPAS: Tapa,
}

/** El ícono del rubro de un artículo; para uno que no conocemos (o sin rubro), la nena. */
export function IconoRubro({ unidad }: { unidad: string | null }) {
  const clave = (unidad ?? '').replace(/^\d+\s*-\s*/, '').trim().toUpperCase()
  const Dibujo = POR_RUBRO[clave] ?? Nena
  return (
    <Lienzo clase="icono-rubro">
      <Dibujo />
    </Lienzo>
  )
}
