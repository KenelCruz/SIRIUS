import { describe, expect, it } from 'vitest';
import { crearConfiguracionInicialEmpresa } from '../configuracion';
import {
  evaluarAlertaTopeCategoriaRecibo,
  normalizarResultadoAnalisisRecibo,
} from '../viaticos';

describe('normalizarResultadoAnalisisRecibo (análisis IA de recibos)', () => {
  it('extrae y redondea monto, subtotal, ITBIS, otros cargos y renglones válidos', () => {
    const res = normalizarResultadoAnalisisRecibo(
      {
        merchant: '  Estación Texaco Las Américas  ',
        amountRD: '2,450.556',
        subtotalRD: 2000,
        itbisRD: 360.555,
        otrosCargosRD: 90,
        cargos: [
          { descripcion: 'Gasolina Premium', montoRD: 2000 },
          { descripcion: 'ITBIS 18%', montoRD: '360.555' },
          { descripcion: 'Cargo por servicio', montoRD: 90 },
          { descripcion: '   ', montoRD: 100 },
          null,
        ],
        ncf: ' b0100004512 ',
        requiereNcf: true,
        category: 'combustible',
        dateIso: '2026-11-25',
        confidence: 'alta',
      },
      '2026-11-20'
    );

    expect(res.merchant).toBe('Estación Texaco Las Américas');
    expect(res.amountRD).toBe(2450.56);
    expect(res.subtotalRD).toBe(2000);
    expect(res.itbisRD).toBe(360.56);
    expect(res.otrosCargosRD).toBe(90);
    expect(res.cargos).toEqual([
      { descripcion: 'Gasolina Premium', montoRD: 2000 },
      { descripcion: 'ITBIS 18%', montoRD: 360.56 },
      { descripcion: 'Cargo por servicio', montoRD: 90 },
    ]);
    expect(res.ncf).toBe('B0100004512');
    expect(res.requiereNcf).toBe(true);
    expect(res.category).toBe('Combustible');
    expect(res.dateIso).toBe('2026-11-25');
    expect(res.confidence).toBe('alta');
    expect(res.notes).toContain('Gasolina Premium: RD$ 2000.00');
  });

  it('calcula amountRD desde subtotal + itbis + otrosCargos cuando amountRD falta o es 0', () => {
    const res = normalizarResultadoAnalisisRecibo({
      merchant: 'Comedor El Paso',
      amountRD: 0,
      subtotalRD: 850,
      itbisRD: 153,
      otrosCargosRD: 85,
      cargos: [{ descripcion: 'Almuerzo brigada', montoRD: 850 }],
      ncf: 'N/A',
      requiereNcf: false,
      category: 'Dieta',
      dateIso: '25/11/2026',
    });

    expect(res.amountRD).toBe(1088);
    expect(res.ncf).toBe('');
    expect(res.requiereNcf).toBe(false);
    expect(res.dateIso).toBe('2026-11-25');
  });

  it('limpia valores no válidos de NCF (N/A, No aplica, guiones) y marca requiereNcf en false', () => {
    for (const rawNcf of ['N/A', 'no aplica', 'Ninguno', '-', 'null', '']) {
      const res = normalizarResultadoAnalisisRecibo({
        merchant: 'Peaje Marbella',
        amountRD: 200,
        ncf: rawNcf,
        requiereNcf: false,
      });
      expect(res.ncf).toBe('');
      expect(res.requiereNcf).toBe(false);
    }
  });

  it('usa fallbackDateIso cuando la fecha viene malformada o fuera de rango', () => {
    const res = normalizarResultadoAnalisisRecibo(
      {
        merchant: 'Ferretería Norte',
        amountRD: 500,
        dateIso: '35/13/2026',
        category: 'Categoría Desconocida',
        confidence: 'invalida',
      },
      '2026-11-18'
    );

    expect(res.dateIso).toBe('2026-11-18');
    expect(res.category).toBe('Otro');
    expect(res.confidence).toBe('media');
  });

  it('normaliza categorías ignorando tildes y mayúsculas', () => {
    expect(normalizarResultadoAnalisisRecibo({ category: 'HOSPEDAJE' }).category).toBe('Hospedaje');
    expect(normalizarResultadoAnalisisRecibo({ category: 'peaje' }).category).toBe('Peaje');
    expect(normalizarResultadoAnalisisRecibo({ category: 'Materiales' }).category).toBe('Materiales');
  });
});

describe('evaluarAlertaTopeCategoriaRecibo (alerta por tope de categoría)', () => {
  it('detecta exceso usando topeDirecto sin depender de una misión activa', () => {
    const alerta = evaluarAlertaTopeCategoriaRecibo({
      categoria: 'Dieta',
      montoReciboRD: 2850,
      cargoCodigo: 'tecnico',
      topeDirecto: {
        montoMaximoPorMisionRD: 2200,
        vigenciaDesde: '2026-01-01',
        cargoCodigo: 'tecnico',
      },
    });

    expect(alerta.aplicaTope).toBe(true);
    expect(alerta.superaTope).toBe(true);
    expect(alerta.topePermitidoRD).toBe(2200);
    expect(alerta.excedenteReciboRD).toBe(650);
  });

  it('no marca alerta cuando el monto del recibo está dentro del tope en configuración', () => {
    const config = crearConfiguracionInicialEmpresa('emp-test');
    const alerta = evaluarAlertaTopeCategoriaRecibo({
      categoria: 'Combustible',
      montoReciboRD: 3500,
      cargoCodigo: 'tecnico',
      config,
      fechaCalculoIso: '2026-11-25',
    });

    expect(alerta.aplicaTope).toBe(true);
    expect(alerta.superaTope).toBe(false);
    expect(alerta.topePermitidoRD).toBe(4000);
    expect(alerta.excedenteReciboRD).toBe(0);
  });

  it('marca categoriaNoPermitida cuando el tope configurado es 0 y el recibo tiene monto > 0', () => {
    const alerta = evaluarAlertaTopeCategoriaRecibo({
      categoria: 'Otro',
      montoReciboRD: 450,
      cargoCodigo: 'tecnico',
      topeDirecto: {
        montoMaximoPorMisionRD: 0,
        vigenciaDesde: '2026-01-01',
        cargoCodigo: 'tecnico',
      },
    });

    expect(alerta.aplicaTope).toBe(true);
    expect(alerta.categoriaNoPermitida).toBe(true);
    expect(alerta.superaTope).toBe(true);
    expect(alerta.excedenteReciboRD).toBe(450);
  });
});

