import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { consolidarViaticosMensual, type ConsolidadoViaticosMensual } from '../domain';
import type {
  CargoConfig,
  CategoriaViatico,
  EstadoAprobacionViatico,
  Mision,
  Proyecto,
  Viatico,
} from '../types/domain';
import { formatRD, formatSantoDomingoAST } from './geodesy';

type JsPdfWithAutoTable = jsPDF & {
  lastAutoTable?: {
    finalY?: number;
  };
};

export interface GenerarPdfViaticosParams {
  viaticos: Viatico[];
  proyectos: Array<Pick<Proyecto, 'id' | 'codigoContrato' | 'nombre'>>;
  misiones?: Mision[];
  cargos?: CargoConfig[];
  mesIso: string;
  filtroCategoria?: CategoriaViatico | 'ALL';
  filtroEstado?: EstadoAprobacionViatico | 'ALL';
  empresaNombre?: string;
  empresaRnc?: string;
  moneda?: string;
  fechaEmisionAST?: string;
  descargar?: boolean;
}

export interface ResultadoPdfViaticos {
  doc: jsPDF;
  fileName: string;
  consolidado: ConsolidadoViaticosMensual;
}

const COLOR_NAVY: [number, number, number] = [15, 41, 66];
const COLOR_BLUE: [number, number, number] = [2, 132, 199];
const COLOR_SLATE: [number, number, number] = [71, 85, 105];
const COLOR_DARK: [number, number, number] = [13, 28, 47];
const COLOR_BORDER: [number, number, number] = [226, 232, 240];
const COLOR_BG_SOFT: [number, number, number] = [248, 250, 252];
const COLOR_GREEN: [number, number, number] = [21, 128, 61];
const COLOR_AMBER: [number, number, number] = [217, 119, 6];
const COLOR_RED: [number, number, number] = [220, 38, 38];

const ETIQUETA_ESTADO: Record<EstadoAprobacionViatico, string> = {
  aprobado: 'Aprobado',
  pendiente: 'Pendiente',
  rechazado: 'Rechazado',
};

function getLastY(doc: jsPDF, fallback: number): number {
  const finalY = (doc as JsPdfWithAutoTable).lastAutoTable?.finalY;
  return typeof finalY === 'number' ? finalY : fallback;
}

function ensureSpace(doc: jsPDF, currentY: number, requiredHeight: number): number {
  const pageHeight = doc.internal.pageSize.getHeight();
  if (currentY + requiredHeight > pageHeight - 18) {
    doc.addPage();
    return 18;
  }
  return currentY;
}

function drawSectionHeading(doc: jsPDF, title: string, y: number): number {
  const nextY = ensureSpace(doc, y, 24);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(...COLOR_NAVY);
  doc.text(title, 14, nextY);
  doc.setDrawColor(...COLOR_BORDER);
  doc.setLineWidth(0.3);
  doc.line(14, nextY + 2, doc.internal.pageSize.getWidth() - 14, nextY + 2);
  return nextY + 5.5;
}

export function generarPdfReporteViaticosMensual(
  params: GenerarPdfViaticosParams
): ResultadoPdfViaticos {
  const {
    viaticos,
    proyectos,
    misiones = [],
    cargos = [],
    mesIso,
    filtroCategoria = 'ALL',
    filtroEstado = 'ALL',
    empresaNombre = 'Sirius Agrimensura & Topografía',
    empresaRnc,
    moneda = 'RD$',
    fechaEmisionAST = formatSantoDomingoAST(new Date()),
    descargar = true,
  } = params;

  const consolidado = consolidarViaticosMensual({
    viaticos,
    proyectos,
    misiones,
    cargos,
    mesIso,
  });

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'letter',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 14;
  const contentWidth = pageWidth - marginX * 2;

  // Encabezado corporativo
  doc.setFillColor(...COLOR_NAVY);
  doc.rect(0, 0, pageWidth, 28, 'F');
  doc.setFillColor(...COLOR_BLUE);
  doc.rect(0, 28, pageWidth, 1.5, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13.5);
  doc.setTextColor(255, 255, 255);
  doc.text('REPORTE CONSOLIDADO DE VIÁTICOS', marginX, 11.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(226, 232, 240);
  const subtituloEmpresa = empresaRnc ? `${empresaNombre} · RNC ${empresaRnc}` : empresaNombre;
  doc.text(subtituloEmpresa, marginX, 17.5);
  doc.text(
    `Rendición administrativa · Período: ${consolidado.etiquetaPeriodo}`,
    marginX,
    22.5
  );

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(255, 255, 255);
  doc.text(`Emitido: ${fechaEmisionAST}`, pageWidth - marginX, 11.5, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(203, 213, 225);
  const textoFiltros = [
    `Categoría: ${filtroCategoria === 'ALL' ? 'Todas' : filtroCategoria}`,
    `Estado: ${filtroEstado === 'ALL' ? 'Todos' : ETIQUETA_ESTADO[filtroEstado]}`,
  ].join(' · ');
  doc.text(textoFiltros, pageWidth - marginX, 17.5, { align: 'right' });
  doc.text(
    `Comprobantes incluidos: ${consolidado.resumen.cantidadRegistros}`,
    pageWidth - marginX,
    22.5,
    { align: 'right' }
  );

  // Tarjetas resumen ejecutivas
  let cursorY = 35;
  const cardGap = 3.5;
  const cardW = (contentWidth - cardGap * 3) / 4;
  const cardH = 18;

  const kpis: Array<{
    label: string;
    value: string;
    sub: string;
    color: [number, number, number];
  }> = [
    {
      label: 'Aprobado empresa',
      value: formatRD(consolidado.resumen.aprobadoEmpresaRD, moneda),
      sub: `${consolidado.resumen.cantidadAprobados} comprobante(s)`,
      color: COLOR_GREEN,
    },
    {
      label: 'Pendiente revisión',
      value: formatRD(consolidado.resumen.pendienteRD, moneda),
      sub: `${consolidado.resumen.cantidadPendientes} comprobante(s)`,
      color: COLOR_AMBER,
    },
    {
      label: 'Cargo colab. / Rech.',
      value: formatRD(
        consolidado.resumen.cargoColaboradorRD + consolidado.resumen.rechazadoRD,
        moneda
      ),
      sub: `Colab: ${formatRD(consolidado.resumen.cargoColaboradorRD, moneda)}`,
      color: COLOR_RED,
    },
    {
      label: 'Total bruto + ITBIS',
      value: formatRD(consolidado.resumen.montoTotalRD, moneda),
      sub: `ITBIS: ${formatRD(consolidado.resumen.itbisTotalRD, moneda)}`,
      color: COLOR_NAVY,
    },
  ];

  kpis.forEach((kpi, idx) => {
    const x = marginX + idx * (cardW + cardGap);
    doc.setFillColor(...COLOR_BG_SOFT);
    doc.setDrawColor(...COLOR_BORDER);
    doc.setLineWidth(0.3);
    doc.roundedRect(x, cursorY, cardW, cardH, 1.5, 1.5, 'FD');

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...COLOR_SLATE);
    doc.text(kpi.label, x + 3, cursorY + 5);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(...kpi.color);
    doc.text(kpi.value, x + 3, cursorY + 11);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.8);
    doc.setTextColor(...COLOR_SLATE);
    doc.text(kpi.sub, x + 3, cursorY + 15.5);
  });

  cursorY += cardH + 8;

  // 1. Resumen por categoría
  cursorY = drawSectionHeading(doc, '1. Consolidado por categoría de gasto', cursorY);
  autoTable(doc, {
    startY: cursorY,
    margin: { left: marginX, right: marginX },
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: 8,
      cellPadding: 2.2,
      textColor: COLOR_DARK,
      lineColor: COLOR_BORDER,
      lineWidth: 0.2,
    },
    headStyles: {
      fillColor: COLOR_NAVY,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 7.8,
    },
    footStyles: {
      fillColor: COLOR_BG_SOFT,
      textColor: COLOR_NAVY,
      fontStyle: 'bold',
      fontSize: 8,
    },
    columnStyles: {
      0: { halign: 'left' },
      1: { halign: 'right' },
      2: { halign: 'right' },
      3: { halign: 'right' },
      4: { halign: 'right' },
      5: { halign: 'right' },
      6: { halign: 'right' },
    },
    head: [['Categoría', 'Reg.', 'ITBIS', 'Aprob. empresa', 'Pendiente', 'Rechazado', 'Total bruto']],
    body: consolidado.porCategoria.map((c) => [
      c.categoria,
      String(c.cantidad),
      formatRD(c.itbisRD, moneda),
      formatRD(c.aprobadoEmpresaRD, moneda),
      formatRD(c.pendienteRD, moneda),
      formatRD(c.rechazadoRD, moneda),
      formatRD(c.montoTotalRD, moneda),
    ]),
    foot: [
      [
        'Total general',
        String(consolidado.resumen.cantidadRegistros),
        formatRD(consolidado.resumen.itbisTotalRD, moneda),
        formatRD(consolidado.resumen.aprobadoEmpresaRD, moneda),
        formatRD(consolidado.resumen.pendienteRD, moneda),
        formatRD(consolidado.resumen.rechazadoRD, moneda),
        formatRD(consolidado.resumen.montoTotalRD, moneda),
      ],
    ],
  });
  cursorY = getLastY(doc, cursorY + 25) + 8;

  // 2. Imputación por proyecto
  if (consolidado.porProyecto.length > 0) {
    cursorY = drawSectionHeading(
      doc,
      '2. Imputación consolidada por proyecto (excluye rechazados)',
      cursorY
    );
    autoTable(doc, {
      startY: cursorY,
      margin: { left: marginX, right: marginX },
      theme: 'grid',
      styles: {
        font: 'helvetica',
        fontSize: 8,
        cellPadding: 2.2,
        textColor: COLOR_DARK,
        lineColor: COLOR_BORDER,
        lineWidth: 0.2,
      },
      headStyles: {
        fillColor: COLOR_NAVY,
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 7.8,
      },
      footStyles: {
        fillColor: COLOR_BG_SOFT,
        textColor: COLOR_NAVY,
        fontStyle: 'bold',
        fontSize: 8,
      },
      columnStyles: {
        0: { halign: 'left', cellWidth: 28 },
        1: { halign: 'left' },
        2: { halign: 'right' },
        3: { halign: 'right' },
        4: { halign: 'right' },
      },
      head: [['Contrato', 'Proyecto', 'Aprobado', 'Pendiente', 'Total imputado']],
      body: consolidado.porProyecto.map((p) => [
        p.codigoContrato,
        p.nombre,
        formatRD(p.aprobadoEmpresaRD, moneda),
        formatRD(p.pendienteRD, moneda),
        formatRD(p.totalImputadoRD, moneda),
      ]),
      foot: [
        [
          'Total',
          `${consolidado.porProyecto.length} proyecto(s) / partida(s)`,
          formatRD(
            consolidado.porProyecto.reduce((s, p) => s + p.aprobadoEmpresaRD, 0),
            moneda
          ),
          formatRD(
            consolidado.porProyecto.reduce((s, p) => s + p.pendienteRD, 0),
            moneda
          ),
          formatRD(
            consolidado.porProyecto.reduce((s, p) => s + p.totalImputadoRD, 0),
            moneda
          ),
        ],
      ],
    });
    cursorY = getLastY(doc, cursorY + 25) + 8;
  }

  // 3. Rendición por colaborador
  if (consolidado.porColaborador.length > 0) {
    cursorY = drawSectionHeading(doc, '3. Rendición por colaborador', cursorY);
    autoTable(doc, {
      startY: cursorY,
      margin: { left: marginX, right: marginX },
      theme: 'grid',
      styles: {
        font: 'helvetica',
        fontSize: 8,
        cellPadding: 2.2,
        textColor: COLOR_DARK,
        lineColor: COLOR_BORDER,
        lineWidth: 0.2,
      },
      headStyles: {
        fillColor: COLOR_NAVY,
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 7.8,
      },
      columnStyles: {
        0: { halign: 'left' },
        1: { halign: 'left' },
        2: { halign: 'right' },
        3: { halign: 'right' },
        4: { halign: 'right' },
        5: { halign: 'right' },
        6: { halign: 'right' },
      },
      head: [
        [
          'Colaborador',
          'Cargo',
          'Reg.',
          'Aprob. empresa',
          'Cargo colab.',
          'Pendiente',
          'Total reportado',
        ],
      ],
      body: consolidado.porColaborador.map((col) => [
        col.nombre,
        col.cargoEtiqueta,
        String(col.cantidad),
        formatRD(col.aprobadoEmpresaRD, moneda),
        formatRD(col.cargoColaboradorRD, moneda),
        formatRD(col.pendienteRD, moneda),
        formatRD(col.totalSolicitadoRD, moneda),
      ]),
    });
    cursorY = getLastY(doc, cursorY + 25) + 8;
  }

  // 4. Detalle cronológico de comprobantes
  cursorY = drawSectionHeading(doc, '4. Detalle cronológico de comprobantes', cursorY);
  autoTable(doc, {
    startY: cursorY,
    margin: { left: marginX, right: marginX },
    theme: 'striped',
    styles: {
      font: 'helvetica',
      fontSize: 7.2,
      cellPadding: 2,
      textColor: COLOR_DARK,
      lineColor: COLOR_BORDER,
      lineWidth: 0.15,
      overflow: 'linebreak',
    },
    headStyles: {
      fillColor: COLOR_NAVY,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 7.4,
    },
    alternateRowStyles: {
      fillColor: COLOR_BG_SOFT,
    },
    columnStyles: {
      0: { cellWidth: 19 },
      1: { cellWidth: 26 },
      2: { cellWidth: 33 },
      3: { cellWidth: 22 },
      4: { cellWidth: 33 },
      5: { halign: 'right', cellWidth: 18 },
      6: { halign: 'right', cellWidth: 20 },
      7: { cellWidth: 16 },
    },
    head: [['Fecha', 'Colaborador', 'Comercio / NCF', 'Categoría', 'Proyectos', 'ITBIS', 'Monto', 'Estado']],
    body: consolidado.detalle.map((d) => [
      d.fechaIso,
      `${d.creadoPorNombre}\n(${d.cargoEtiqueta})`,
      d.ncf !== '—' ? `${d.comercio}\nNCF: ${d.ncf}` : d.comercio,
      `${d.categoria}\n${d.metodo}`,
      d.misionNombre ? `${d.proyectosResumen}\nMisión: ${d.misionNombre}` : d.proyectosResumen,
      formatRD(d.itbisRD, moneda),
      formatRD(d.montoRD, moneda),
      ETIQUETA_ESTADO[d.estadoAprobacion],
    ]),
  });
  cursorY = getLastY(doc, cursorY + 30) + 12;

  // Bloque de firmas de rendición administrativa
  cursorY = ensureSpace(doc, cursorY, 26);
  const sigWidth = (contentWidth - 16) / 2;
  doc.setDrawColor(...COLOR_SLATE);
  doc.setLineWidth(0.3);
  doc.line(marginX, cursorY + 10, marginX + sigWidth, cursorY + 10);
  doc.line(marginX + sigWidth + 16, cursorY + 10, pageWidth - marginX, cursorY + 10);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...COLOR_NAVY);
  doc.text('Elaborado / Rendido por', marginX, cursorY + 14.5);
  doc.text('Revisado y aprobado por', marginX + sigWidth + 16, cursorY + 14.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.2);
  doc.setTextColor(...COLOR_SLATE);
  doc.text('Coordinación Operativa / Campo', marginX, cursorY + 18.5);
  doc.text('Administración y Contabilidad', marginX + sigWidth + 16, cursorY + 18.5);

  // Numeración de páginas en pie de página
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i += 1) {
    doc.setPage(i);
    doc.setDrawColor(...COLOR_BORDER);
    doc.setLineWidth(0.2);
    doc.line(marginX, pageHeight - 12, pageWidth - marginX, pageHeight - 12);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.2);
    doc.setTextColor(...COLOR_SLATE);
    doc.text(
      `${empresaNombre} · Consolidado mensual (${consolidado.etiquetaPeriodo})`,
      marginX,
      pageHeight - 8
    );
    doc.text(`Página ${i} de ${totalPages}`, pageWidth - marginX, pageHeight - 8, {
      align: 'right',
    });
  }

  const slugMes = mesIso && mesIso !== 'ALL' ? mesIso : 'todos_los_meses';
  const fileName = `reporte_consolidado_viaticos_${slugMes}.pdf`;

  if (descargar) {
    doc.save(fileName);
  }

  return { doc, fileName, consolidado };
}
