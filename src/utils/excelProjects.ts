import * as XLSX from 'xlsx';
import { PROGRESO_POR_ESTADO } from '../domain/estados';
import type { EstadoServicio } from '../types/domain';

export interface ParsedExcelProjectRow {
  rowNumber: number;
  nombre: string;
  codigoContrato: string;
  clienteNombre: string;
  clienteRnc: string;
  valorContratoRD: number;
  presupuestoViaticosRD: number;
  estado: EstadoServicio;
  progresoPct: number;
  notas?: string;
  errors: string[];
  isValid: boolean;
}

export interface ExcelProjectImportResult {
  sheetName: string;
  rows: ParsedExcelProjectRow[];
  warnings: string[];
}

function normalizeHeader(raw: string): string {
  return raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function normalizeStatusText(raw: string): EstadoServicio | null {
  const clean = normalizeHeader(raw).replace(/\s+/g, '_');
  if (!clean) return null;

  const aliases: Record<string, EstadoServicio> = {
    cotizado: 'cotizado',
    cotizacion: 'cotizado',
    borrador: 'cotizado',
    nuevo: 'cotizado',
    aprobado: 'aprobado',
    aprobacion: 'aprobado',
    programado: 'programado',
    agenda: 'programado',
    agendado: 'programado',
    planificado: 'programado',
    en_campo: 'en_campo',
    campo: 'en_campo',
    en_proceso: 'procesando',
    procesando: 'procesando',
    gabinete: 'procesando',
    en_gabinete: 'procesando',
    entregado: 'entregado',
    completado: 'entregado',
    finalizado: 'entregado',
    cobrado: 'cobrado',
    pagado: 'cobrado',
    facturado: 'cobrado',
  };

  return aliases[clean] ?? null;
}

function parseMoneyNumber(val: unknown): number {
  if (typeof val === 'number') {
    return Number.isFinite(val) ? Math.max(0, Math.round(val * 100) / 100) : 0;
  }
  if (typeof val !== 'string') return 0;
  const cleaned = val
    .replace(/RD\$|US\$|\$/gi, '')
    .replace(/\s+/g, '')
    .replace(/,(?=\d{3}(\D|$))/g, '')
    .replace(',', '.');
  const num = Number(cleaned);
  return Number.isFinite(num) ? Math.max(0, Math.round(num * 100) / 100) : 0;
}

function parsePercentCell(
  rawVal: unknown,
  formattedText: string | undefined,
  numberFormat: string | undefined,
  fallbackEstado: EstadoServicio
): { value: number; warning?: string } {
  if (rawVal === undefined || rawVal === null || String(rawVal).trim() === '') {
    return { value: PROGRESO_POR_ESTADO[fallbackEstado] ?? 10 };
  }

  const fmt = formattedText?.trim() || '';
  const hasPctFmt = Boolean(numberFormat?.includes('%') || fmt.includes('%'));

  if (typeof rawVal === 'number' && Number.isFinite(rawVal)) {
    let pct = rawVal;
    if (hasPctFmt && rawVal <= 1) {
      pct = rawVal * 100;
    } else if (!hasPctFmt && rawVal > 0 && rawVal < 1) {
      pct = rawVal * 100;
    }
    return { value: Math.max(0, Math.min(100, Math.round(pct))) };
  }

  const text = String(rawVal).trim().replace('%', '').replace(',', '.');
  const parsed = Number(text);
  if (!Number.isFinite(parsed)) {
    return {
      value: PROGRESO_POR_ESTADO[fallbackEstado] ?? 10,
      warning: `Porcentaje inválido "${String(rawVal)}"; se asignó ${PROGRESO_POR_ESTADO[fallbackEstado]}%.`,
    };
  }
  const scaled = !String(rawVal).includes('%') && parsed > 0 && parsed < 1 ? parsed * 100 : parsed;
  return { value: Math.max(0, Math.min(100, Math.round(scaled))) };
}

type ColumnRole =
  | 'nombre'
  | 'codigoContrato'
  | 'clienteNombre'
  | 'clienteRnc'
  | 'valorContratoRD'
  | 'presupuestoViaticosRD'
  | 'estado'
  | 'progresoPct'
  | 'notas';

function detectColumnRole(header: string): ColumnRole | null {
  const h = normalizeHeader(header);
  if (!h) return null;

  if (
    h === 'nombre' ||
    h === 'proyecto' ||
    h === 'nombre proyecto' ||
    h === 'nombre del proyecto' ||
    h === 'project' ||
    h === 'titulo'
  ) {
    return 'nombre';
  }
  if (
    h === 'codigo' ||
    h === 'codigo contrato' ||
    h === 'codigo de contrato' ||
    h === 'contrato' ||
    h === 'cod contrato' ||
    h === 'contract'
  ) {
    return 'codigoContrato';
  }
  if (
    h === 'cliente' ||
    h === 'nombre cliente' ||
    h === 'cliente nombre' ||
    h === 'razon social' ||
    h === 'empresa cliente' ||
    h === 'client'
  ) {
    return 'clienteNombre';
  }
  if (h === 'rnc' || h === 'cliente rnc' || h === 'rnc cliente' || h === 'cedula') {
    return 'clienteRnc';
  }
  if (
    h.includes('valor contrato') ||
    h === 'valor' ||
    h === 'monto contrato' ||
    h === 'contrato rd' ||
    h === 'monto' ||
    h === 'total contrato'
  ) {
    return 'valorContratoRD';
  }
  if (
    h.includes('viatico') ||
    h.includes('presupuesto') ||
    h === 'budget'
  ) {
    return 'presupuestoViaticosRD';
  }
  if (h === 'estado' || h === 'estatus' || h === 'status' || h === 'fase') {
    return 'estado';
  }
  if (
    h.includes('progreso') ||
    h.includes('avance') ||
    h.includes('porcentaje') ||
    h === 'progress' ||
    h === 'pct'
  ) {
    return 'progresoPct';
  }
  if (h === 'notas' || h === 'nota' || h === 'observaciones' || h === 'comentario' || h === 'notes') {
    return 'notas';
  }
  return null;
}

export function parseProjectsFromExcelBuffer(buffer: ArrayBuffer): ExcelProjectImportResult {
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error('El archivo Excel no contiene hojas de cálculo.');
  }

  const sheet = workbook.Sheets[sheetName];
  if (!sheet || !sheet['!ref']) {
    throw new Error('La hoja principal está vacía.');
  }

  const range = XLSX.utils.decode_range(sheet['!ref']);
  const warnings: string[] = [];

  // Map header columns from the first non-empty row
  let headerRowIdx = range.s.r;
  const colToRole = new Map<number, ColumnRole>();

  for (let r = range.s.r; r <= Math.min(range.e.r, range.s.r + 4); r++) {
    const candidateMap = new Map<number, ColumnRole>();
    for (let c = range.s.c; c <= range.e.c; c++) {
      const addr = XLSX.utils.encode_cell({ r, c });
      const cell = sheet[addr];
      const headerText = cell ? String(cell.w ?? cell.v ?? '').trim() : '';
      const role = detectColumnRole(headerText);
      if (role && !Array.from(candidateMap.values()).includes(role)) {
        candidateMap.set(c, role);
      }
    }
    if (candidateMap.size >= 2) {
      headerRowIdx = r;
      candidateMap.forEach((v, k) => colToRole.set(k, v));
      break;
    }
  }

  if (!Array.from(colToRole.values()).includes('nombre')) {
    throw new Error(
      'No se encontró la columna requerida "Nombre" (o "Proyecto") en la fila de encabezados.'
    );
  }

  const rows: ParsedExcelProjectRow[] = [];
  const year = new Date().getFullYear();

  for (let r = headerRowIdx + 1; r <= range.e.r; r++) {
    const rawValues: Partial<Record<ColumnRole, { v: unknown; w?: string; z?: string }>> = {};
    let hasAnyValue = false;

    colToRole.forEach((role, colIdx) => {
      const addr = XLSX.utils.encode_cell({ r, c: colIdx });
      const cell = sheet[addr];
      if (cell && cell.v !== undefined && cell.v !== null && String(cell.v).trim() !== '') {
        hasAnyValue = true;
        rawValues[role] = {
          v: cell.v,
          w: cell.w,
          z: typeof cell.z === 'string' ? cell.z : undefined,
        };
      }
    });

    if (!hasAnyValue) continue;

    const errors: string[] = [];
    const nombre = String(rawValues.nombre?.w ?? rawValues.nombre?.v ?? '').trim();
    if (!nombre) {
      errors.push('Falta el nombre del proyecto.');
    }

    const fallbackCode = `AIA-${year}-${String(rows.length + 101).padStart(3, '0')}`;
    const codigoContrato =
      String(rawValues.codigoContrato?.w ?? rawValues.codigoContrato?.v ?? '').trim() ||
      fallbackCode;

    const clienteNombre = String(
      rawValues.clienteNombre?.w ?? rawValues.clienteNombre?.v ?? ''
    ).trim();
    const clienteRnc = String(rawValues.clienteRnc?.w ?? rawValues.clienteRnc?.v ?? '').trim();

    const valorContratoRD = parseMoneyNumber(rawValues.valorContratoRD?.v);
    const presupuestoViaticosRD = parseMoneyNumber(rawValues.presupuestoViaticosRD?.v);

    const rawEstado = String(rawValues.estado?.w ?? rawValues.estado?.v ?? '').trim();
    let estado: EstadoServicio = 'cotizado';
    if (rawEstado) {
      const normalized = normalizeStatusText(rawEstado);
      if (normalized) {
        estado = normalized;
      } else {
        warnings.push(
          `Fila ${r + 1}: estado "${rawEstado}" no reconocido; se asignó "Cotizado".`
        );
      }
    }

    const pctParsed = parsePercentCell(
      rawValues.progresoPct?.v,
      rawValues.progresoPct?.w,
      rawValues.progresoPct?.z,
      estado
    );
    if (pctParsed.warning) {
      warnings.push(`Fila ${r + 1}: ${pctParsed.warning}`);
    }

    const notas = rawValues.notas
      ? String(rawValues.notas.w ?? rawValues.notas.v ?? '').trim() || undefined
      : undefined;

    rows.push({
      rowNumber: r + 1,
      nombre,
      codigoContrato,
      clienteNombre,
      clienteRnc,
      valorContratoRD,
      presupuestoViaticosRD,
      estado,
      progresoPct: pctParsed.value,
      notas,
      errors,
      isValid: errors.length === 0,
    });
  }

  if (rows.length === 0) {
    throw new Error('No se encontraron filas de proyectos debajo de los encabezados.');
  }

  return { sheetName, rows, warnings };
}

export function downloadProjectsExcelTemplate(): void {
  const sampleData = [
    {
      'Código Contrato': 'AIA-2026-201',
      Nombre: 'Deslinde y Subdivisión Parcela 18',
      Cliente: 'Constructora Cibao Norte SRL',
      RNC: '131-45892-1',
      'Valor Contrato (RD$)': 240000,
      'Presupuesto Viáticos (RD$)': 32000,
      Estado: 'programado',
      'Progreso (%)': 40,
      Notas: 'Levantamiento GNSS + replanteo de linderos',
    },
    {
      'Código Contrato': 'AIA-2026-202',
      Nombre: 'Levantamiento Fotogramétrico LiDAR Costa Este',
      Cliente: 'Grupo Inmobiliario Bávaro',
      RNC: '130-88412-5',
      'Valor Contrato (RD$)': 485000,
      'Presupuesto Viáticos (RD$)': 65000,
      Estado: 'en_campo',
      'Progreso (%)': 60,
      Notas: 'Cobertura de 42 hectáreas con RTK',
    },
  ];

  const ws = XLSX.utils.json_to_sheet(sampleData);
  ws['!cols'] = [
    { wch: 16 },
    { wch: 38 },
    { wch: 28 },
    { wch: 15 },
    { wch: 20 },
    { wch: 24 },
    { wch: 14 },
    { wch: 14 },
    { wch: 36 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Proyectos');
  XLSX.writeFile(wb, `plantilla_proyectos_sirius_${new Date().toISOString().slice(0, 10)}.xlsx`);
}
