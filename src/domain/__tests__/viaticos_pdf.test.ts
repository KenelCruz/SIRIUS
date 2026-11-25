import { describe, expect, it } from 'vitest';
import type { CargoConfig, Mision, Proyecto, Viatico } from '../../types/domain';
import { generarPdfReporteViaticosMensual } from '../../utils/viaticosPdf';
import {
  consolidarViaticosMensual,
  extraerMesesDisponiblesViaticos,
  filtrarViaticosPorMes,
  formatearMesIso,
} from '../viaticos';

const proyectos: Array<Pick<Proyecto, 'id' | 'codigoContrato' | 'nombre'>> = [
  { id: 'proy-1', codigoContrato: 'CTR-001', nombre: 'Deslinde Bávaro' },
  { id: 'proy-2', codigoContrato: 'CTR-002', nombre: 'Subdivisión Santiago' },
];

const misiones: Mision[] = [
  {
    id: 'mis-1',
    empresaId: 'emp-1',
    nombre: 'Misión Este Noviembre',
    zona: 'Este',
    provincia: 'La Altagracia',
    fechaInicio: '2026-11-10',
    fechaFin: '2026-11-12',
    rutaIds: [],
    version: 1,
    updatedAt: '2026-11-10T08:00:00.000Z',
    syncStatus: 'synced',
  },
];

const cargos: CargoConfig[] = [
  { codigo: 'jefe_brigada', etiqueta: 'Jefe de Brigada', esBase: true, activo: true },
  { codigo: 'tecnico', etiqueta: 'Técnico de Campo', esBase: true, activo: true },
];

const viaticos: Viatico[] = [
  {
    id: 'via-nov-1',
    empresaId: 'emp-1',
    creadoPorUsuarioId: 'usr-1',
    creadoPorNombre: 'Carlos Méndez',
    personalId: 'per-1',
    cargoUsado: 'jefe_brigada',
    misionId: 'mis-1',
    fechaIso: '2026-11-10',
    timestampAST: '10/11/2026 08:30:00 AST',
    categoria: 'Combustible',
    comercio: 'Estación Texaco Este',
    montoRD: 4500,
    itbisRD: 0,
    ncf: 'B0100000101',
    metodo: 'GPS Ruta',
    estadoAprobacion: 'aprobado',
    repartos: [
      { proyectoId: 'proy-1', montoRD: 3000 },
      { proyectoId: 'proy-2', montoRD: 1500 },
    ],
    version: 1,
    updatedAt: '2026-11-10T12:30:00.000Z',
    syncStatus: 'synced',
  },
  {
    id: 'via-nov-2',
    empresaId: 'emp-1',
    creadoPorUsuarioId: 'usr-2',
    creadoPorNombre: 'Laura Ramírez',
    personalId: 'per-2',
    cargoUsado: 'tecnico',
    misionId: 'mis-1',
    fechaIso: '2026-11-11',
    timestampAST: '11/11/2026 14:15:00 AST',
    categoria: 'Dieta',
    comercio: 'Comedor El Paso',
    montoRD: 2500,
    itbisRD: 381.36,
    ncf: 'B0100000202',
    metodo: 'OCR Móvil',
    estadoAprobacion: 'aprobado',
    decisionExcedente: 'cargo_colaborador',
    excedenteRD: 500,
    montoAprobadoEmpresaRD: 2000,
    montoCargoColaboradorRD: 500,
    repartos: [{ proyectoId: 'proy-1', montoRD: 2000 }],
    version: 1,
    updatedAt: '2026-11-11T18:15:00.000Z',
    syncStatus: 'synced',
  },
  {
    id: 'via-nov-3',
    empresaId: 'emp-1',
    creadoPorUsuarioId: 'usr-2',
    creadoPorNombre: 'Laura Ramírez',
    personalId: 'per-2',
    cargoUsado: 'tecnico',
    fechaIso: '2026-11-15',
    timestampAST: '15/11/2026 09:00:00 AST',
    categoria: 'Peaje',
    comercio: 'Peaje Coral',
    montoRD: 600,
    itbisRD: 0,
    metodo: 'Manual',
    estadoAprobacion: 'pendiente',
    repartos: [{ proyectoId: 'sin_asignar', montoRD: 600 }],
    version: 1,
    updatedAt: '2026-11-15T13:00:00.000Z',
    syncStatus: 'synced',
  },
  {
    id: 'via-nov-4',
    empresaId: 'emp-1',
    creadoPorUsuarioId: 'usr-1',
    creadoPorNombre: 'Carlos Méndez',
    personalId: 'per-1',
    cargoUsado: 'jefe_brigada',
    fechaIso: '2026-11-18',
    timestampAST: '18/11/2026 16:00:00 AST',
    categoria: 'Otro',
    comercio: 'Gasto Duplicado',
    montoRD: 1200,
    itbisRD: 183.05,
    metodo: 'Manual',
    estadoAprobacion: 'rechazado',
    motivoRechazo: 'Comprobante duplicado en registro previo',
    repartos: [{ proyectoId: 'proy-2', montoRD: 1200 }],
    version: 1,
    updatedAt: '2026-11-18T20:00:00.000Z',
    syncStatus: 'synced',
  },
  {
    id: 'via-oct-1',
    empresaId: 'emp-1',
    creadoPorUsuarioId: 'usr-1',
    creadoPorNombre: 'Carlos Méndez',
    personalId: 'per-1',
    cargoUsado: 'jefe_brigada',
    fechaIso: '2026-10-22',
    timestampAST: '22/10/2026 11:00:00 AST',
    categoria: 'Hospedaje',
    comercio: 'Hotel Norte',
    montoRD: 5000,
    itbisRD: 762.71,
    metodo: 'Manual',
    estadoAprobacion: 'aprobado',
    repartos: [{ proyectoId: 'proy-2', montoRD: 5000 }],
    version: 1,
    updatedAt: '2026-10-22T15:00:00.000Z',
    syncStatus: 'synced',
  },
];

describe('Consolidado mensual y generación PDF de viáticos', () => {
  it('extrae meses ordenados descendentemente y formatea etiquetas en español', () => {
    expect(extraerMesesDisponiblesViaticos(viaticos)).toEqual(['2026-11', '2026-10']);
    expect(formatearMesIso('2026-11')).toBe('Noviembre 2026');
    expect(formatearMesIso('ALL')).toBe('Todos los meses');
    expect(filtrarViaticosPorMes(viaticos, '2026-10')).toHaveLength(1);
  });

  it('consolida montos mensuales separando aprobado empresa, cargo colaborador, pendientes y rechazados', () => {
    const consolidado = consolidarViaticosMensual({
      viaticos,
      proyectos,
      misiones,
      cargos,
      mesIso: '2026-11',
    });

    expect(consolidado.etiquetaPeriodo).toBe('Noviembre 2026');
    expect(consolidado.resumen).toEqual({
      cantidadRegistros: 4,
      cantidadAprobados: 2,
      cantidadPendientes: 1,
      cantidadRechazados: 1,
      montoTotalRD: 8800,
      itbisTotalRD: 564.41,
      aprobadoEmpresaRD: 6500,
      cargoColaboradorRD: 500,
      pendienteRD: 600,
      rechazadoRD: 1200,
    });

    // Imputación a proyectos excluye el viático rechazado de proy-2 (1200) y octubre (5000)
    const proy1 = consolidado.porProyecto.find((p) => p.proyectoId === 'proy-1');
    const proy2 = consolidado.porProyecto.find((p) => p.proyectoId === 'proy-2');
    const sinAsignar = consolidado.porProyecto.find((p) => p.proyectoId === 'sin_asignar');

    expect(proy1?.aprobadoEmpresaRD).toBe(5000);
    expect(proy2?.aprobadoEmpresaRD).toBe(1500);
    expect(sinAsignar?.pendienteRD).toBe(600);

    const laura = consolidado.porColaborador.find((c) => c.nombre === 'Laura Ramírez');
    expect(laura).toMatchObject({
      cargoEtiqueta: 'Técnico de Campo',
      cantidad: 2,
      aprobadoEmpresaRD: 2000,
      cargoColaboradorRD: 500,
      pendienteRD: 600,
      totalSolicitadoRD: 3100,
    });
  });

  it('genera un documento PDF binario válido para el mes filtrado', () => {
    const { doc, fileName, consolidado } = generarPdfReporteViaticosMensual({
      viaticos,
      proyectos,
      misiones,
      cargos,
      mesIso: '2026-11',
      empresaNombre: 'Sirius Agrimensura SRL',
      empresaRnc: '1-31-99999-1',
      descargar: false,
    });

    expect(fileName).toBe('reporte_consolidado_viaticos_2026-11.pdf');
    expect(consolidado.resumen.cantidadRegistros).toBe(4);
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1);

    const buffer = doc.output('arraybuffer');
    const header = new TextDecoder().decode(new Uint8Array(buffer.slice(0, 5)));
    expect(header).toBe('%PDF-');
    expect(buffer.byteLength).toBeGreaterThan(2000);
  });
});
