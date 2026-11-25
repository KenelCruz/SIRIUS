import { describe, expect, it } from 'vitest';
import type { Mision, Proyecto, Viatico } from '../../types/domain';
import { CARGOS_BASE_INICIALES, generarCsvViaticosContable } from '../index';

describe('generarCsvViaticosContable (exportación contable de viáticos filtrados)', () => {
  const proyectos: Array<Pick<Proyecto, 'id' | 'codigoContrato' | 'nombre'>> = [
    { id: 'proy-1', codigoContrato: 'CT-2026-001', nombre: 'Deslinde Norte' },
    { id: 'proy-2', codigoContrato: 'CT-2026-002', nombre: 'Topografía Este' },
  ];

  const misiones: Mision[] = [
    {
      id: 'mis-1',
      empresaId: 'emp-1',
      nombre: 'Brigada Cibao Central',
      zona: 'Cibao',
      provincia: 'La Vega',
      fechaInicio: '2026-11-01',
      fechaFin: '2026-11-05',
      rutaIds: ['ruta-1'],
      version: 1,
      updatedAt: '2026-11-01T10:00:00Z',
      syncStatus: 'synced',
    },
  ];

  const viaticos: Viatico[] = [
    {
      id: 'via-2',
      empresaId: 'emp-1',
      misionId: 'mis-1',
      fechaIso: '2026-11-12',
      timestampAST: '2026-11-12 09:15 AST',
      creadoPorUsuarioId: 'usr-1',
      creadoPorNombre: 'Carlos Méndez',
      cargoUsado: 'tecnico',
      categoria: 'Combustible',
      comercio: 'Estación Texaco, Autopista Duarte',
      montoRD: 2360,
      itbisRD: 360,
      ncf: 'B0100004512',
      metodo: 'OCR Móvil',
      repartos: [
        { proyectoId: 'proy-1', montoRD: 1360 },
        { proyectoId: 'proy-2', montoRD: 1000 },
      ],
      estadoAprobacion: 'aprobado',
      montoAprobadoEmpresaRD: 2000,
      montoCargoColaboradorRD: 360,
      decisionExcedente: 'cargo_colaborador',
      motivoDecision: 'Excedente asumido por colaborador',
      version: 2,
      updatedAt: '2026-11-12T14:00:00Z',
      syncStatus: 'synced',
    },
    {
      id: 'via-1',
      empresaId: 'emp-1',
      fechaIso: '2026-11-05',
      timestampAST: '2026-11-05 13:00 AST',
      creadoPorUsuarioId: 'usr-2',
      creadoPorNombre: 'Ana Pérez',
      cargoUsado: 'ingeniero',
      categoria: 'Dieta',
      comercio: '=SUM(A1:A2)',
      montoRD: 1200,
      itbisRD: 0,
      metodo: 'Dieta Automática',
      repartos: [{ proyectoId: 'sin_asignar', montoRD: 1200 }],
      estadoAprobacion: 'pendiente',
      notas: '+Almuerzo brigada',
      version: 1,
      updatedAt: '2026-11-05T17:00:00Z',
      syncStatus: 'synced',
    },
  ];

  it('ordena cronológicamente, desglosa cada reparto por proyecto y calcula montos contables', () => {
    const res = generarCsvViaticosContable({
      viaticos,
      proyectos,
      misiones,
      cargos: CARGOS_BASE_INICIALES,
    });

    expect(res.cantidadComprobantes).toBe(2);
    expect(res.cantidadLineas).toBe(3);

    const lineas = res.csv.split('\n');
    expect(lineas).toHaveLength(4);
    expect(lineas[0]).toContain('Viatico_ID,Fecha,Hora_AST');
    expect(lineas[0]).toContain('Subtotal_Gravado_RD,ITBIS_RD,Monto_Total_Viatico_RD');
    expect(lineas[0]).toContain('Monto_Aprobado_Empresa_RD,Monto_Cargo_Colaborador_RD');

    // Primera fila cronológica debe ser via-1 (2026-11-05), estado pendiente -> aprobado empresa 0.00
    expect(lineas[1]).toContain('via-1,2026-11-05');
    expect(lineas[1]).toContain('SIN_ASIGNAR,Sin asignar a proyecto,1200.00');
    expect(lineas[1]).toContain(',1200.00,0.00,1200.00,0.00,0.00,');

    // Siguientes 2 filas corresponden al reparto de via-2 (2026-11-12)
    expect(lineas[2]).toContain('via-2,2026-11-12');
    expect(lineas[2]).toContain('CT-2026-001,Deslinde Norte,1360.00');
    expect(lineas[2]).toContain('2000.00,360.00,2360.00,2000.00,360.00');
    expect(lineas[2]).toContain('Brigada Cibao Central');

    expect(lineas[3]).toContain('CT-2026-002,Topografía Este,1000.00');
  });

  it('neutraliza prefijos de inyección de fórmulas en cadenas y escapa comas correctamente', () => {
    const res = generarCsvViaticosContable({
      viaticos,
      proyectos,
      misiones,
      cargos: CARGOS_BASE_INICIALES,
    });

    expect(res.csv).toContain("'=SUM(A1:A2)");
    expect(res.csv).toContain("'+Almuerzo brigada");
    expect(res.csv).toContain('"Estación Texaco, Autopista Duarte"');
  });
});
