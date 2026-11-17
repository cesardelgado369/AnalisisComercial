import { api } from '../api/client'
import type { ClienteCobertura, Cobertura, Foco, OpcionVendedor, Volumen } from '../api/types'
import { nombrePropio } from '../cobertura/estados'
import logoMadomi from '../images/madomi-color.png'
import { formatoBultos, formatoEntero, formatoFechaCorta, nombreMes, nombreMesTitulo } from '../utils/formato'

// Se imprime en blanco y negro (Cesar, 17/11): todo en grises, nada que dependa del color
const MARGEN = 12
const GRIS = 110
const LINEA = 170
const NEGRO = 20
const FONDO_TITULOS = 228

/** Lo que hace falta para el PDF: los focos del mes, los filtros de la pantalla y a qué vendedores. */
export interface PedidoPdfFocos {
  mes: string
  focos: Foco[]
  /** Los filtros de la pantalla (vendedor, tipo de producto), sin foco, búsqueda ni categoría, y el día elegido. */
  consulta: URLSearchParams
  /** Una hoja (o más) por cada uno: el elegido, o todos los que ve la persona sin la casa. */
  vendedores: OpcionVendedor[]
  /** El día de visita que se eligió al bajarlo (Cesar, 17/11: «no todos los clientes de golpe»); null, toda la semana. */
  dia: string | null
  /**
   * Con bultos (dueño y supervisor): los VOL dicen, por cliente, cuántos bultos de más o de menos lleva contra el mes
   * anterior (Cesar, 17/11). Sin bultos, como en la pantalla del vendedor: si compró o no.
   */
  conBultos: boolean
  /** Contra qué se comparan los VOL: la Comparativa de la pantalla. */
  comparacion: 'parcial' | 'acumulado'
  /** «Pastas frescas», si la pantalla está filtrada; null si no. */
  filtrosTexto: string | null
}

/** No hay ningún cliente de esos vendedores con estos filtros (o ese día): no se arma un PDF vacío. */
export class SinClientesPdf extends Error {
  name = 'SinClientesPdf'
}

/** El logo como PNG achicado (lado mayor `maxPx`), con su proporción (como las hojas de ruta de De Ruta). */
async function logoParaPdf(url: string, maxPx = 480): Promise<{ datos: string; proporcion: number }> {
  const img = new Image()
  img.src = url
  await img.decode()
  const escala = Math.min(1, maxPx / Math.max(img.naturalWidth, img.naturalHeight))
  const lienzo = document.createElement('canvas')
  lienzo.width = Math.round(img.naturalWidth * escala)
  lienzo.height = Math.round(img.naturalHeight * escala)
  lienzo.getContext('2d')!.drawImage(img, 0, 0, lienzo.width, lienzo.height)
  return { datos: lienzo.toDataURL('image/png'), proporcion: img.naturalWidth / img.naturalHeight }
}

const nombreArchivo = (t: string) =>
  t.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w-]+/g, '-').replace(/-+/g, '-').toLowerCase()

/**
 * Los focos del mes en PDF, **una hoja por vendedor** (Cesar, 17/11: Checho dice que la app es compleja para los
 * choferes; como las hojas de ruta de De Ruta). Arriba, vendedor, mes, hasta cuándo hay datos y sus clientes; después
 * cómo va cada foco (cuántos compraron, a lo ancho) y la lista de sus clientes, por zona, con un círculo
 * por foco: lleno si ya compró algún artículo, vacío si todavía no. Sin bultos: los VOL también cuentan clientes que
 * compraron (como los ve el vendedor). Una consulta por foco (`/cobertura?foco=` del mes, como la sección), sin la
 * búsqueda. jsPDF se carga recién acá.
 */
export async function descargarFocosPdf(p: PedidoPdfFocos) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  const respuestas = await Promise.all(
    p.focos.map((f) => {
      const q = new URLSearchParams(p.consulta)
      q.set('foco', String(f.idFoco))
      q.set('mesDesde', p.mes)
      q.set('mesHasta', p.mes)
      return api.get<Cobertura>(`/cobertura?${q}`)
    }),
  )
  const compro = respuestas.map((r) => new Map(r.clientes.map((c) => [c.idCliente, c.meses[c.meses.length - 1] === 'compro'])))
  // Los bultos de cada cliente en los VOL (`/volumen?foco=`, con la misma Comparativa que la pantalla)
  const volumenes = await Promise.all(
    p.focos.map((f) => {
      if (!p.conBultos || f.medida !== 'vol') return null
      const q = new URLSearchParams(p.consulta)
      q.set('foco', String(f.idFoco))
      q.set('mes', p.mes)
      if (p.comparacion === 'acumulado') q.set('comparacion', 'acumulado')
      return api.get<Volumen>(`/volumen?${q}`)
    }),
  )
  const bultos = volumenes.map((r) => (r ? new Map(r.clientes.map((c) => [c.idCliente, c.bultosActual - (c.bultosBase ?? 0)])) : null))
  const comparacionVol = volumenes.find(Boolean)?.comparacion ?? null
  const corteAl = respuestas[0]?.kpis.at(-1)?.corteAl ?? null
  const porVendedor = p.vendedores
    .map((v) => ({
      v,
      clientes: (respuestas[0]?.clientes ?? [])
        .filter((c) => c.idPersonal === v.id)
        .sort((a, b) => (a.ruta ?? '').localeCompare(b.ruta ?? '', 'es') || a.razonSocial.localeCompare(b.razonSocial, 'es')),
    }))
    .filter((x) => x.clientes.length > 0)
  if (!porVendedor.length) throw new SinClientesPdf()

  const logo = await logoParaPdf(logoMadomi).catch(() => null)
  // Con más de 5 focos, apaisado: cada foco es una columna
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: p.focos.length > 5 ? 'landscape' : 'portrait' })
  const ancho = doc.internal.pageSize.getWidth()
  const alto = doc.internal.pageSize.getHeight()
  const mesTexto = `${nombreMesTitulo(p.mes)} ${p.mes.slice(0, 4)}`
  doc.setProperties({ title: `Focos de ${nombreMes(p.mes)} ${p.mes.slice(0, 4)}`, creator: 'Madomi Pastas' })
  /** El vendedor de cada página (para el pie): uno con muchos clientes ocupa más de una hoja. */
  const vendedorDePagina: string[] = []
  /** La primera hoja de cada vendedor: ahí va la nota de los VOL. */
  const primerasHojas = new Set<number>()
  // Los VOL con bultos llevan un asterisco y su nota al pie (Cesar, 17/11)
  const notaVol = comparacionVol
    ? `* ${p.focos.filter((_, i) => bultos[i]).map((f) => f.nombre).join(', ')}: bultos de más (+) o de menos (–) que compró cada cliente contra ${
        comparacionVol.tipo === 'mismoDiaHabil' ? `${nombreMes(comparacionVol.mesBase)} al mismo día` : `todo ${nombreMes(comparacionVol.mesBase)}`
      }.`
    : null

  porVendedor.forEach(({ v, clientes }, iv) => {
    if (iv > 0) doc.addPage()
    primerasHojas.add(doc.getNumberOfPages())
    const nombre = nombrePropio(v.nombre)
    let y = MARGEN + 2

    // Título y logo, chicos (Cesar, 17/11: «achicá el header»)
    doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(GRIS)
    doc.text(`FOCOS DEL MES · MADOMI PASTAS`, MARGEN, y + 2)
    if (logo) {
      const altoLogo = 7
      const anchoLogo = altoLogo * logo.proporcion
      doc.addImage(logo.datos, 'PNG', ancho - MARGEN - anchoLogo, MARGEN - 4, anchoLogo, altoLogo, 'logo-madomi')
    }
    y += 5

    // Cabecera: vendedor, el día (si se eligió uno), mes, hasta cuándo, clientes
    const datos: [string, string][] = [
      ['VENDEDOR', nombre],
      ...(p.dia ? [['DÍA', p.dia] as [string, string]] : []),
      ['MES', mesTexto],
      ['DATOS AL', corteAl ? formatoFechaCorta(corteAl) : 'mes cerrado'],
      [p.dia ? 'CLIENTES DEL DÍA' : 'CLIENTES', formatoEntero(clientes.length)],
    ]
    const anchos = (p.dia ? [0.3, 0.14, 0.24, 0.14, 0.18] : [0.4, 0.24, 0.18, 0.18]).map((f) => f * (ancho - 2 * MARGEN))
    doc.setDrawColor(LINEA)
    let x = MARGEN
    datos.forEach(([titulo, valor], k) => {
      doc.rect(x, y, anchos[k], 10.5)
      doc.setFont('helvetica', 'normal').setFontSize(6.5).setTextColor(GRIS).text(titulo, x + 2.5, y + 3.6)
      doc.setFont('helvetica', 'bold').setFontSize(10.5).setTextColor(NEGRO)
      doc.text(doc.splitTextToSize(valor, anchos[k] - 5)[0] ?? '', x + 2.5, y + 8.2)
      x += anchos[k]
    })
    doc.setFont('helvetica', 'normal')
    y += 15
    if (p.filtrosTexto) {
      doc.setFontSize(8.5).setTextColor(70).text(`Solo: ${p.filtrosTexto}`, MARGEN, y)
      y += 5
    }

    // Cómo va cada foco
    doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor(20).text('Cómo va cada foco', MARGEN, y + 2)
    doc.setFont('helvetica', 'normal')
    // A lo ancho, solo cuántos compraron (Cesar, 17/11): una columna por foco
    autoTable(doc, {
      startY: y + 5,
      margin: { left: MARGEN, right: MARGEN, top: MARGEN + 8, bottom: 19 },
      head: [['Foco', ...p.focos.map((f) => f.nombre)]],
      body: [
        [
          'Compraron',
          ...p.focos.map((_, i) => `${formatoEntero(clientes.filter((c) => compro[i].get(c.idCliente)).length)} de ${formatoEntero(clientes.length)}`),
        ],
      ],
      theme: 'grid',
      styles: { font: 'helvetica', fontSize: 9.5, cellPadding: 1.8, lineColor: LINEA, lineWidth: 0.2, textColor: NEGRO, halign: 'center', valign: 'middle' },
      headStyles: { fillColor: FONDO_TITULOS, textColor: NEGRO, fontStyle: 'bold', fontSize: 8.5 },
      columnStyles: { 0: { cellWidth: 24, halign: 'left', fontStyle: 'bold' } },
    })
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8

    // Sus clientes: un círculo por foco (lleno, ya compró; vacío, todavía no); en los VOL con bultos, los de más o de
    // menos (con asterisco: qué son, en la nota al pie)
    doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor(NEGRO).text('Sus clientes', MARGEN, y)
    doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(70)
    const xLeyenda = MARGEN + 28
    circulo(doc, xLeyenda, y - 1.2, true)
    doc.text('ya compró algún artículo del foco', xLeyenda + 3.5, y)
    circulo(doc, xLeyenda + 52, y - 1.2, false)
    doc.text('todavía no compró', xLeyenda + 55.5, y)

    // Las marcas de cada cliente, por su código (la tercera columna): así no dependen del orden de las filas
    const marcas = new Map(clientes.map((c) => [String(c.idCliente), p.focos.map((_, i) => !!compro[i].get(c.idCliente))]))
    const anchoFoco = p.focos.length > 5 ? 20 : 17
    autoTable(doc, {
      startY: y + 3,
      margin: { left: MARGEN, right: MARGEN, top: MARGEN + 8, bottom: 19 },
      // En las hojas que siguen, arriba dice de qué vendedor es
      didDrawPage: (d) => {
        if (d.pageNumber === 1) return
        doc.setFont('helvetica', 'bold').setFontSize(10).setTextColor(20)
        doc.text(`${nombre} (continuación)`, MARGEN, MARGEN + 4)
        doc.setFont('helvetica', 'normal')
      },
      // Sin la columna Le faltan (Cesar, 17/11: innecesaria)
      head: [['#', 'Cliente', 'Cód.', ...p.focos.map((f, i) => (bultos[i] ? `${f.nombre}*` : f.nombre))]],
      body: clientes.map((c: ClienteCobertura, k) => {
        return [
          String(k + 1),
          c.ruta ? `${c.razonSocial}\n${nombrePropio(c.ruta)}` : c.razonSocial,
          String(c.idCliente),
          // VOL con bultos: la diferencia con el mes anterior, con signo (en blanco y negro se lee igual)
          ...p.focos.map((_, i) => {
            const dif = bultos[i]?.get(c.idCliente)
            if (!bultos[i]) return ''
            const n = dif ?? 0
            return n > 0 ? `+${formatoBultos(n)}` : n < 0 ? `–${formatoBultos(-n)}` : '0'
          }),
        ]
      }),
      theme: 'grid',
      styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 1.6, lineColor: LINEA, lineWidth: 0.2, textColor: NEGRO, valign: 'middle', minCellHeight: 8 },
      headStyles: { fillColor: FONDO_TITULOS, textColor: NEGRO, fontStyle: 'bold', fontSize: 7.5, halign: 'center', valign: 'middle' },
      columnStyles: {
        0: { cellWidth: 8, halign: 'center' },
        1: { cellWidth: 'auto' },
        2: { cellWidth: 14, halign: 'center' },
        ...Object.fromEntries(p.focos.map((_, i) => [i + 3, { cellWidth: anchoFoco, halign: 'center' as const }])),
      },
      didParseCell: (d) => {
        if (d.section !== 'body') return
        if (d.column.index === 1) d.cell.styles.fontStyle = 'bold'
        // Los bultos de menos, en negrita: se ven aunque se imprima en blanco y negro
        if (String(d.cell.raw).startsWith('–')) d.cell.styles.fontStyle = 'bold'
      },
      didDrawCell: (d) => {
        const i = d.column.index - 3
        if (d.section !== 'body' || i < 0 || i >= p.focos.length || bultos[i]) return
        const fila = marcas.get(String((d.row.raw as string[])[2]))
        if (fila) circulo(doc, d.cell.x + d.cell.width / 2, d.cell.y + d.cell.height / 2, fila[i])
      },
    })
    while (vendedorDePagina.length < doc.getNumberOfPages()) vendedorDePagina.push(nombre)
  })

  // Pie en todas las páginas: vendedor, mes y «Página n de N»
  const total = doc.getNumberOfPages()
  for (let n = 1; n <= total; n++) {
    doc.setPage(n)
    doc.setFontSize(7.5).setTextColor(GRIS)
    doc.text(
      `${vendedorDePagina[n - 1] ?? ''}${p.dia ? ` · Clientes del ${p.dia.toLowerCase()}` : ''} · Focos de ${nombreMes(p.mes)}${corteAl ? ` al ${formatoFechaCorta(corteAl)}` : ''}`,
      MARGEN,
      alto - 8,
    )
    doc.text(`Página ${n} de ${total}`, ancho - MARGEN, alto - 8, { align: 'right' })
    if (notaVol && primerasHojas.has(n)) {
      doc.setFontSize(8).setTextColor(60)
      doc.text(doc.splitTextToSize(notaVol, ancho - 2 * MARGEN)[0] ?? '', MARGEN, alto - 13)
    }
  }

  const quien = porVendedor.length === 1 ? nombreArchivo(porVendedor[0].v.nombre) : 'por-vendedor'
  doc.save(`focos_${p.mes.slice(0, 7)}_${p.dia ? `${nombreArchivo(p.dia)}_` : ''}${quien}.pdf`)
}

/** El círculo de un foco: lleno (negro, con el tilde) si compró; vacío si todavía no. */
function circulo(doc: import('jspdf').jsPDF, cx: number, cy: number, lleno: boolean) {
  const r = 2.1
  if (lleno) {
    doc.setFillColor(35, 35, 35).circle(cx, cy, r, 'F')
    doc.setDrawColor(255).setLineWidth(0.45)
    doc.line(cx - 1, cy + 0.05, cx - 0.25, cy + 0.85)
    doc.line(cx - 0.25, cy + 0.85, cx + 1.1, cy - 0.75)
  } else {
    doc.setDrawColor(110).setLineWidth(0.3).circle(cx, cy, r, 'S')
  }
  doc.setDrawColor(LINEA).setLineWidth(0.2)
}
