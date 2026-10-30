/**
 * Logo de la aplicación: la lupa sobre dos barras + «Análisis Comercial» en itálica gruesa, en la línea de los logos de
 * De Ruta, Mantenimiento y CashFlow.
 * TODO testing: logo de texto hasta que haya uno diseñado (entonces va como PNG, igual que `deRuta.png`).
 * `oscuro`: para fondo claro (login, sin acceso); por defecto, en blanco para la cabecera.
 */
export function LogoApp({ oscuro = false, className }: { oscuro?: boolean; className?: string }) {
  const tinta = oscuro ? 'var(--cabecera)' : '#fff'
  const barras = oscuro ? 'var(--acento-claro)' : 'var(--cabecera-claro)'
  return (
    <svg className={className} viewBox="0 0 300 40" role="img" aria-label="Análisis Comercial">
      <rect x="3" y="22" width="7" height="14" rx="1.5" fill={barras} />
      <rect x="14" y="14" width="7" height="22" rx="1.5" fill={barras} />
      <circle cx="28" cy="14" r="8.5" fill="none" stroke={tinta} strokeWidth="3.2" />
      <line x1="34.2" y1="20.2" x2="40" y2="26" stroke={tinta} strokeWidth="4" strokeLinecap="round" />
      <text
        x="50"
        y="28"
        fill={tinta}
        fontFamily="'Plus Jakarta Sans', sans-serif"
        fontSize="23"
        fontStyle="italic"
        fontWeight="800"
        letterSpacing="-0.5"
      >
        Análisis Comercial
      </text>
    </svg>
  )
}
