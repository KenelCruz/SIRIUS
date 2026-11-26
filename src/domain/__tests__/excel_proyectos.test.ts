import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { calcularProgresoProyecto } from '../estados';
import { parseProjectsFromExcelBuffer } from '../../utils/excelProjects';

function buildXlsxBuffer(rows: Array<Record<string, unknown>>): ArrayBuffer {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Proyectos');
  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer | Uint8Array;
  return out instanceof ArrayBuffer ? out : new Uint8Array(out).buffer;
}

describe('Importación Excel de proyectos y cálculo de progreso', () => {
  it('parsea filas de Excel con columnas en español, estados y porcentajes', () => {
    const buffer = buildXlsxBuffer([
      {
        'Código Contrato': 'AIA-2026-501',
        Nombre: 'Deslinde Parcela La Romana',
        Cliente: 'Inmobiliaria del Este',
        RNC: '130-11223-4',
        'Valor Contrato (RD$)': 'RD$ 350,000',
        'Presupuesto Viáticos (RD$)': 45000,
        Estado: 'En Campo',
        'Progreso (%)': '65%',
        Notas: 'Parcela costera',
      },
      {
        'Código Contrato': 'AIA-2026-502',
        Nombre: 'Topografía Vial Santiago',
        Cliente: 'Obras Cibao',
        RNC: '131-99887-2',
        'Valor Contrato (RD$)': 180000,
        'Presupuesto Viáticos (RD$)': 22000,
        Estado: 'Entregado',
        'Progreso (%)': 0.9,
      },
      {
        'Código Contrato': 'AIA-2026-503',
        Nombre: 'Mensura Nueva Sin Porcentaje',
        Cliente: 'Cliente Nuevo',
        Estado: 'Aprobado',
      },
    ]);

    const res = parseProjectsFromExcelBuffer(buffer);
    expect(res.rows).toHaveLength(3);
    expect(res.rows[0]).toMatchObject({
      codigoContrato: 'AIA-2026-501',
      nombre: 'Deslinde Parcela La Romana',
      clienteNombre: 'Inmobiliaria del Este',
      clienteRnc: '130-11223-4',
      valorContratoRD: 350000,
      presupuestoViaticosRD: 45000,
      estado: 'en_campo',
      progresoPct: 65,
      notas: 'Parcela costera',
      isValid: true,
    });
    expect(res.rows[1].estado).toBe('entregado');
    expect(res.rows[1].progresoPct).toBe(90);
    expect(res.rows[2].estado).toBe('aprobado');
    expect(res.rows[2].progresoPct).toBe(25);
  });

  it('marca filas inválidas cuando falta el nombre del proyecto', () => {
    const buffer = buildXlsxBuffer([
      {
        'Código Contrato': 'AIA-2026-999',
        Nombre: '',
        Cliente: 'Constructora X',
      },
    ]);

    const res = parseProjectsFromExcelBuffer(buffer);
    expect(res.rows[0].isValid).toBe(false);
    expect(res.rows[0].errors[0]).toContain('nombre');
  });

  it('calcula progreso del proyecto desde servicios o fallback del proyecto', () => {
    expect(
      calcularProgresoProyecto(
        [{ estado: 'cotizado' }, { estado: 'cobrado' }],
        { estado: 'cotizado', progresoPct: 10 }
      )
    ).toBe(55);

    expect(
      calcularProgresoProyecto([], { estado: 'programado', progresoPct: 72 })
    ).toBe(72);

    expect(calcularProgresoProyecto([], { estado: 'en_campo' })).toBe(60);
  });
});
