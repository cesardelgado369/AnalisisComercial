import { api } from '../api/client'
import type { ClienteCobertura, Cobertura, Foco, OpcionVendedor } from '../api/types'
import { nombrePropio } from '../cobertura/estados'
import logoMadomi from '../images/madomi-color.png'
import { formatoEntero, formatoFechaCorta, formatoPorcentaje, nombreMes, nombreMesTitulo } from '../utils/formato'

const MARGEN = 12
const GRIS = 110
const LINEA = 187
const VIOLETA: [number, number, number] = [124, 58, 237]
const VERDE: [number, number, number] = [5, 150, 105]

/** Lo que hace falta para el PDF: los focos del mes, los filtros de la pantalla y a qué vendedores. */
export interface PedidoPdfFocos {
  mes: string
  focos: Foco[]
  /** Los filtros de la pantalla (vendedor, día, tipo de producto, categoría), sin foco ni búsqueda. */
  consulta: URLSearchParams
  /** Una hoja (o más) por cada uno: el elegido, o todos los que ve la persona sin la casa. */
  vendedores: OpcionVendedor[]
  /** «Lunes · Pastas frescas», si la pantalla está filtrada; null si no. */
  filtrosTexto: string | null
}

/** No hay ningún cliente de esos vendedores con estos filtros: no se arma un PDF vacío. */
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
 * cómo va cada foco (compraron, meta, objetivo y cuántos le faltan) y la lista de sus clientes, por zona, con un círculo
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

  porVendedor.forEach(({ v, clientes }, iv) => {
    if (iv > 0) doc.addPage()
    const nombre = nombrePropio(v.nombre)
    let y = MARGEN + 2

    // Título y logo
    doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(GRIS)
    doc.text(`FOCOS DEL MES · MADOMI PASTAS`, MARGEN, y + 3)
    if (logo) {
      const altoLogo = Math.min(15, 38 / logo.proporcion)
      const anchoLogo = altoLogo * logo.proporcion
      doc.addImage(logo.datos, 'PNG', ancho - MARGEN - anchoLogo, MARGEN - 4, anchoLogo, altoLogo, 'logo-madomi')
    }
    y += 12

    // Cabecera: vendedor, mes, hasta cuándo, clientes
    const datos: [string, string][] = [
      ['VENDEDOR', nombre],
      ['MES', mesTexto],
      ['DATOS AL', corteAl ? formatoFechaCorta(corteAl) : 'mes cerrado'],
      ['CLIENTES', formatoEntero(clientes.length)],
    ]
    const anchos = [0.4, 0.24, 0.18, 0.18].map((f) => f * (ancho - 2 * MARGEN))
    doc.setDrawColor(LINEA)
    let x = MARGEN
    datos.forEach(([titulo, valor], k) => {
      doc.rect(x, y, anchos[k], 14)
      doc.setFont('helvetica', 'normal').setFontSize(7).setTextColor(GRIS).text(titulo, x + 3, y + 4.5)
      doc.setFont('helvetica', 'bold').setFontSize(12).setTextColor(20)
      doc.text(doc.splitTextToSize(valor, anchos[k] - 6)[0] ?? '', x + 3, y + 10.5)
      x += anchos[k]
    })
    doc.setFont('helvetica', 'normal')
    y += 19
    if (p.filtrosTexto) {
      doc.setFontSize(8.5).setTextColor(70).text(`Solo: ${p.filtrosTexto}`, MARGEN, y)
      y += 5
    }

    // Cómo va cada foco
    doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor(20).text('Cómo va cada foco', MARGEN, y + 2)
    doc.setFont('helvetica', 'normal')
    const resumen = p.focos.map((f, i) => {
      const compraron = clientes.filter((c) => compro[i].get(c.idCliente)).length
      const pct = clientes.length ? (compraron / clientes.length) * 100 : 0
      // La meta de un CCC es un porcentaje de la cartera; la de un VOL es de bultos del foco entero: acá no va
      const metaClientes = f.medida === 'ccc' && f.meta !== null ? Math.ceil((f.meta * clientes.length) / 100) : null
      const objetivo = f.objetivos?.find((o) => o.idPersonal === v.id)?.clientes ?? null
      const meta = objetivo ?? metaClientes
      const faltan = meta === null ? null : Math.max(0, meta - compraron)
      return [
        f.nombre,
        `${formatoEntero(compraron)} de ${formatoEntero(clientes.length)}`,
        formatoPorcentaje(pct),
        metaClientes === null ? '—' : `${formatoEntero(f.meta!)} % (${formatoEntero(metaClientes)} clientes)`,
        objetivo === null ? '—' : `${formatoEntero(objetivo)} clientes`,
        faltan === null ? '—' : faltan === 0 ? 'Cumplido' : `${formatoEntero(faltan)} ${faltan === 1 ? 'cliente' : 'clientes'}`,
      ]
    })
    autoTable(doc, {
      startY: y + 5,
      margin: { left: MARGEN, right: MARGEN, top: MARGEN + 8, bottom: 16 },
      head: [['Foco', 'Compraron', '%', 'Meta', 'Objetivo', 'Le faltan']],
      body: resumen,
      theme: 'grid',
      styles: { font: 'helvetica', fontSize: 9, cellPadding: 1.8, lineColor: LINEA, lineWidth: 0.2, textColor: 20 },
      headStyles: { fillColor: VIOLETA, textColor: 255, fontStyle: 'bold' },
      columnStyles: { 0: { fontStyle: 'bold' }, 2: { halign: 'right' }, 5: { fontStyle: 'bold' } },
      didParseCell: (d) => {
        if (d.section === 'body' && d.column.index === 5 && d.cell.raw === 'Cumplido') d.cell.styles.textColor = VERDE
      },
    })
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 9

    // Sus clientes: un círculo por foco (lleno, ya compró; vacío, todavía no)
    doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor(20).text('Sus clientes', MARGEN, y)
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
      margin: { left: MARGEN, right: MARGEN, top: MARGEN + 8, bottom: 16 },
      // En las hojas que siguen, arriba dice de qué vendedor es
      didDrawPage: (d) => {
        if (d.pageNumber === 1) return
        doc.setFont('helvetica', 'bold').setFontSize(10).setTextColor(20)
        doc.text(`${nombre} (continuación)`, MARGEN, MARGEN + 4)
        doc.setFont('helvetica', 'normal')
      },
      head: [['#', 'Cliente', 'Cód.', ...p.focos.map((f) => f.nombre), 'Le faltan']],
      body: clientes.map((c: ClienteCobertura, k) => {
        const faltan = marcas.get(String(c.idCliente))!.filter((m) => !m).length
        return [
          String(k + 1),
          c.ruta ? `${c.razonSocial}\n${nombrePropio(c.ruta)}` : c.razonSocial,
          String(c.idCliente),
          ...p.focos.map(() => ''),
          faltan === 0 ? 'Ninguno' : String(faltan),
        ]
      }),
      theme: 'grid',
      styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 1.6, lineColor: LINEA, lineWidth: 0.2, textColor: 20, valign: 'middle', minCellHeight: 8 },
      headStyles: { fillColor: [240, 240, 240], textColor: 20, fontStyle: 'bold', fontSize: 7.5, halign: 'center', valign: 'middle' },
      columnStyles: {
        0: { cellWidth: 8, halign: 'center' },
        1: { cellWidth: 'auto' },
        2: { cellWidth: 14, halign: 'center' },
        ...Object.fromEntries(p.focos.map((_, i) => [i + 3, { cellWidth: anchoFoco, halign: 'center' as const }])),
        [p.focos.length + 3]: { cellWidth: 16, halign: 'center', fontStyle: 'bold' },
      },
      didParseCell: (d) => {
        if (d.section === 'body' && d.column.index === 1) d.cell.styles.fontStyle = 'bold'
        if (d.section === 'body' && d.column.index === p.focos.length + 3 && d.cell.raw === 'Ninguno') d.cell.styles.textColor = VERDE
      },
      didDrawCell: (d) => {
        const i = d.column.index - 3
        if (d.section !== 'body' || i < 0 || i >= p.focos.length) return
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
    doc.text(`${vendedorDePagina[n - 1] ?? ''} · Focos de ${nombreMes(p.mes)}${corteAl ? ` al ${formatoFechaCorta(corteAl)}` : ''}`, MARGEN, alto - 8)
    doc.text(`Página ${n} de ${total}`, ancho - MARGEN, alto - 8, { align: 'right' })
  }

  const quien = porVendedor.length === 1 ? nombreArchivo(porVendedor[0].v.nombre) : 'por-vendedor'
  doc.save(`focos_${p.mes.slice(0, 7)}_${quien}.pdf`)
}

/** El círculo de un foco: lleno (verde, con el tilde) si compró; vacío si todavía no. */
function circulo(doc: import('jspdf').jsPDF, cx: number, cy: number, lleno: boolean) {
  const r = 2.1
  if (lleno) {
    doc.setFillColor(...VERDE).circle(cx, cy, r, 'F')
    doc.setDrawColor(255).setLineWidth(0.45)
    doc.line(cx - 1, cy + 0.05, cx - 0.25, cy + 0.85)
    doc.line(cx - 0.25, cy + 0.85, cx + 1.1, cy - 0.75)
  } else {
    doc.setDrawColor(150).setLineWidth(0.3).circle(cx, cy, r, 'S')
  }
  doc.setDrawColor(LINEA).setLineWidth(0.2)
}
