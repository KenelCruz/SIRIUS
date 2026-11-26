import { describe, expect, it } from 'vitest';
import type {
  EstadoEmpresaSnapshot,
  HistorialEvento,
  SnapshotTecnico,
} from '../../types/domain';
import { latLonToUtm19N } from '../../utils/geodesy';
import {
  clasificarEventoAuditoria,
  generarAlertasOperativasAdmin,
  generarAlertasOperativasTecnico,
  mapEntidadAModuloAuditoria,
  parseFechaAstToIso,
  parseFechaAstToTimestamp,
} from '../alertas';

function crearSnapshotAdminBase(): EstadoEmpresaSnapshot {
  const centroid = latLonToUtm19N(18.52, -69.85, 25);
  return {
    empresa: {
      id: 'emp-1',
      nombre: 'SIRIUS Demo',
      rnc: '1-31-00001-1',
      direccionBase: 'Santo Domingo',
      baseLat: 18.4861,
      baseLon: -69.9312,
      zonaHoraria: 'America/Santo_Domingo',
      moneda: 'RD$',
      planMensualRD: 14500,
      estadoSuscripcion: 'activa',
      fechaAlta: '2026-01-01',
    },
    membresias: [],
    usuarios: [],
    personal: [
      { id: 'per-1', empresaId: 'emp-1', usuarioId: 'usr-1', nombre: 'Carlos', cargo: 'jefe_brigada', activo: true },
    ],
    vehiculos: [
      {
        id: 'veh-1',
        empresaId: 'emp-1',
        etiqueta: 'Hilux 4x4',
        placa: 'L402819',
        tipoCombustible: 'Diésel',
        precioGalonRD: 239.1,
        kmPorGal: 40,
        mantenimientoPorKmRD: 6,
        estado: 'en_mantenimiento',
      },
    ],
    equipos: [
      { id: 'eq-1', empresaId: 'emp-1', nombre: 'Trimble R12i', serial: 'TR-100', estado: 'disponible' },
    ],
    cuadrillas: [
      { id: 'cua-1', empresaId: 'emp-1', nombre: 'Brigada Alpha', jefeId: 'per-1', miembroIds: [], activa: true },
    ],
    clientes: [
      { id: 'cli-1', empresaId: 'emp-1', nombre: 'Cliente Uno', rnc: '1-01-00001-1', contacto: 'Ana' },
    ],
    proyectos: [
      {
        id: 'proy-1',
        empresaId: 'emp-1',
        clienteId: 'cli-1',
        nombre: 'Deslinde Este',
        codigoContrato: 'PRY-001',
        presupuestoViaticosRD: 10000,
        valorContratoRD: 200000,
        estado: 'en_campo',
        fechaCreacion: '2026-10-01',
        version: 1,
        updatedAt: '2026-11-01T10:00:00Z',
        syncStatus: 'synced',
      },
      {
        id: 'proy-2',
        empresaId: 'emp-1',
        clienteId: 'cli-1',
        nombre: 'Catastro Sur',
        codigoContrato: 'PRY-002',
        presupuestoViaticosRD: 10000,
        valorContratoRD: 150000,
        estado: 'aprobado',
        fechaCreacion: '2026-10-10',
        version: 1,
        updatedAt: '2026-11-01T10:00:00Z',
        syncStatus: 'synced',
      },
    ],
    presupuestos: [
      {
        id: 'pre-1',
        empresaId: 'emp-1',
        proyectoId: 'proy-1',
        version: 1,
        vigenciaDesde: '2026-10-01',
        estado: 'aprobado',
        lineas: [
          { categoria: 'viaticos', montoPlanificadoRD: 5000 },
          { categoria: 'rentas', montoPlanificadoRD: 0 },
          { categoria: 'personal', montoPlanificadoRD: 0 },
          { categoria: 'vehiculos', montoPlanificadoRD: 0 },
          { categoria: 'equipos_gnss', montoPlanificadoRD: 0 },
          { categoria: 'otros', montoPlanificadoRD: 0 },
        ],
        totalPlanificadoRD: 5000,
        creadoPorUsuarioId: 'usr-admin',
        creadoPorNombre: 'Admin',
        updatedAt: '2026-10-01T10:00:00Z',
        syncStatus: 'synced',
      },
      {
        id: 'pre-2',
        empresaId: 'emp-1',
        proyectoId: 'proy-2',
        version: 1,
        vigenciaDesde: '2026-10-10',
        estado: 'aprobado',
        lineas: [
          { categoria: 'viaticos', montoPlanificadoRD: 10000 },
          { categoria: 'rentas', montoPlanificadoRD: 0 },
          { categoria: 'personal', montoPlanificadoRD: 0 },
          { categoria: 'vehiculos', montoPlanificadoRD: 0 },
          { categoria: 'equipos_gnss', montoPlanificadoRD: 0 },
          { categoria: 'otros', montoPlanificadoRD: 0 },
        ],
        totalPlanificadoRD: 10000,
        creadoPorUsuarioId: 'usr-admin',
        creadoPorNombre: 'Admin',
        updatedAt: '2026-10-10T10:00:00Z',
        syncStatus: 'synced',
      },
    ],
    rutas: [
      {
        id: 'rut-1',
        empresaId: 'emp-1',
        proyectoId: 'proy-1',
        nombre: 'Parcela Norte',
        codigoParcela: 'P-101',
        ubicacion: 'La Romana',
        provincia: 'La Romana',
        fechaPrevista: '2026-11-26',
        kmzFileName: 'p101.kmz',
        features: [],
        centroid,
        totalAreaM2: 12000,
        totalPerimeterM: 450,
        routeSummary: {
          routeName: 'Ruta Norte',
          distanceOneWayKm: 50,
          durationMin: 60,
          tollsRD: 200,
          fuelRD: 600,
          vehicleLabel: 'Hilux 4x4',
        },
        version: 1,
        updatedAt: '2026-11-20T10:00:00Z',
        syncStatus: 'synced',
      },
      {
        id: 'rut-2',
        empresaId: 'emp-1',
        proyectoId: 'proy-2',
        nombre: 'Parcela Sin Brigada',
        codigoParcela: 'P-202',
        ubicacion: 'Baní',
        provincia: 'Peravia',
        fechaPrevista: '2026-11-20',
        kmzFileName: 'p202.kmz',
        features: [],
        centroid,
        totalAreaM2: 9000,
        totalPerimeterM: 380,
        version: 1,
        updatedAt: '2026-11-18T10:00:00Z',
        syncStatus: 'synced',
      },
    ],
    servicios: [
      {
        id: 'srv-1',
        empresaId: 'emp-1',
        rutaId: 'rut-1',
        tipoServicioId: 'deslinde',
        nombre: 'Deslinde',
        cotizacionRD: 75000,
        estado: 'programado',
        version: 1,
        updatedAt: '2026-11-20T10:00:00Z',
        syncStatus: 'synced',
      },
      {
        id: 'srv-2',
        empresaId: 'emp-1',
        rutaId: 'rut-2',
        tipoServicioId: 'rtk',
        nombre: 'RTK',
        cotizacionRD: 20000,
        estado: 'aprobado',
        version: 1,
        updatedAt: '2026-11-18T10:00:00Z',
        syncStatus: 'synced',
      },
    ],
    bitacoras: [],
    asignaciones: [
      {
        id: 'asig-1',
        empresaId: 'emp-1',
        rutaId: 'rut-1',
        fechaInicio: '2026-11-25',
        fechaFin: '2026-11-28',
        cuadrillaId: 'cua-1',
        vehiculoIds: ['veh-1'],
        equipoIds: ['eq-1'],
        version: 1,
        updatedAt: '2026-11-24T10:00:00Z',
        syncStatus: 'synced',
      },
    ],
    viaticos: [
      // Combustible aprobado para disparar desviación de rendimiento (3 cargas, 30 gal para 100km -> 3.33 km/gal vs 40 km/gal)
      {
        id: 'via-fuel-1',
        empresaId: 'emp-1',
        creadoPorUsuarioId: 'usr-1',
        creadoPorNombre: 'Carlos',
        vehiculoId: 'veh-1',
        galonesCargados: 10,
        fechaIso: '2026-11-10',
        timestampAST: '10/11/2026 09:00:00 AST',
        categoria: 'Combustible',
        comercio: 'Shell',
        montoRD: 2391,
        itbisRD: 0,
        metodo: 'Manual',
        estadoAprobacion: 'aprobado',
        repartos: [{ proyectoId: 'proy-1', montoRD: 2391 }],
        version: 1,
        updatedAt: '2026-11-10T13:00:00Z',
        syncStatus: 'synced',
      },
      {
        id: 'via-fuel-2',
        empresaId: 'emp-1',
        creadoPorUsuarioId: 'usr-1',
        creadoPorNombre: 'Carlos',
        vehiculoId: 'veh-1',
        galonesCargados: 10,
        fechaIso: '2026-11-12',
        timestampAST: '12/11/2026 09:00:00 AST',
        categoria: 'Combustible',
        comercio: 'Texaco',
        montoRD: 2391,
        itbisRD: 0,
        metodo: 'Manual',
        estadoAprobacion: 'aprobado',
        repartos: [{ proyectoId: 'proy-1', montoRD: 2391 }],
        version: 1,
        updatedAt: '2026-11-12T13:00:00Z',
        syncStatus: 'synced',
      },
      {
        id: 'via-fuel-3',
        empresaId: 'emp-1',
        creadoPorUsuarioId: 'usr-1',
        creadoPorNombre: 'Carlos',
        vehiculoId: 'veh-1',
        galonesCargados: 10,
        fechaIso: '2026-11-15',
        timestampAST: '15/11/2026 09:00:00 AST',
        categoria: 'Combustible',
        comercio: 'Total',
        montoRD: 2391,
        itbisRD: 0,
        metodo: 'Manual',
        estadoAprobacion: 'aprobado',
        repartos: [{ proyectoId: 'proy-1', montoRD: 2391 }],
        version: 1,
        updatedAt: '2026-11-15T13:00:00Z',
        syncStatus: 'synced',
      },
      // Viático aprobado al 90% del presupuesto en proy-2
      {
        id: 'via-proy2',
        empresaId: 'emp-1',
        creadoPorUsuarioId: 'usr-1',
        creadoPorNombre: 'Carlos',
        fechaIso: '2026-11-19',
        timestampAST: '19/11/2026 11:00:00 AST',
        categoria: 'Hospedaje',
        comercio: 'Hotel Sur',
        montoRD: 9000,
        itbisRD: 0,
        metodo: 'Manual',
        estadoAprobacion: 'aprobado',
        repartos: [{ proyectoId: 'proy-2', montoRD: 9000 }],
        version: 1,
        updatedAt: '2026-11-19T15:00:00Z',
        syncStatus: 'synced',
      },
      // Viático con excedente pendiente
      {
        id: 'via-exc',
        empresaId: 'emp-1',
        creadoPorUsuarioId: 'usr-1',
        creadoPorNombre: 'Carlos',
        fechaIso: '2026-11-25',
        timestampAST: '25/11/2026 14:00:00 AST',
        categoria: 'Hospedaje',
        comercio: 'Hotel Central',
        montoRD: 6500,
        itbisRD: 0,
        metodo: 'OCR Móvil',
        estadoAprobacion: 'pendiente',
        excedenteRD: 2000,
        repartos: [{ proyectoId: 'proy-1', montoRD: 6500 }],
        version: 1,
        updatedAt: '2026-11-25T18:00:00Z',
        syncStatus: 'needs_ocr',
      },
    ],
    misiones: [],
    rentas: [
      {
        id: 'ren-1',
        empresaId: 'emp-1',
        recursoTipo: 'vehiculo',
        recursoId: 'veh-ext-1',
        recursoEtiqueta: 'Camioneta Rentada',
        proveedor: 'RentCar RD',
        fechaInicio: '2026-11-15',
        fechaFin: '2026-11-22',
        modalidadTarifa: 'por_dia',
        tarifaRD: 4500,
        cantidadEstimada: 8,
        incluyeItbis: true,
        itbisRD: 6480,
        costoTotalRD: 42480,
        estado: 'activa',
        repartos: [{ proyectoId: 'proy-1', montoRD: 42480 }],
        version: 1,
        updatedAt: '2026-11-15T10:00:00Z',
        syncStatus: 'synced',
      },
    ],
    historial: [
      {
        id: 'hist-1',
        empresaId: 'emp-1',
        entidadTipo: 'asignacion',
        entidadId: 'asig-1',
        accion: 'Asignación con override de conflicto',
        detalle: 'Se programó brigada con excepción autorizada.',
        usuarioId: 'usr-admin',
        usuarioNombre: 'Admin General',
        fechaAST: '25/11/2026 09:30:00 AST',
        metadata: {
          overrideMotivo: 'Urgencia de entrega catastral',
          overrideFecha: '25/11/2026 09:30:00 AST',
        },
      },
    ],
  };
}

describe('Auditoría y Alertas Operativas', () => {
  it('parsea fechas AST a ISO YYYY-MM-DD y timestamp ordenable', () => {
    expect(parseFechaAstToIso('26/11/2026 10:15:30 AST')).toBe('2026-11-26');
    expect(parseFechaAstToIso('2026-11-26T10:00:00Z')).toBe('2026-11-26');
    expect(parseFechaAstToIso('')).toBe('');

    const t1 = parseFechaAstToTimestamp('25/11/2026 09:00:00 AST');
    const t2 = parseFechaAstToTimestamp('26/11/2026 09:00:00 AST');
    expect(t2).toBeGreaterThan(t1);
  });

  it('clasifica correctamente módulos y categorías de eventos de auditoría', () => {
    expect(mapEntidadAModuloAuditoria('presupuesto')).toBe('presupuestos');
    expect(mapEntidadAModuloAuditoria('renta')).toBe('flota_rentas');
    expect(mapEntidadAModuloAuditoria('mision')).toBe('agenda_misiones');

    const evOverride: HistorialEvento = {
      id: 'h-1',
      empresaId: 'emp-1',
      entidadTipo: 'asignacion',
      entidadId: 'asig-1',
      accion: 'Asignación con override de conflicto',
      detalle: 'Excepción',
      usuarioId: 'u-1',
      usuarioNombre: 'Ana',
      fechaAST: '26/11/2026 10:00:00 AST',
      metadata: { overrideMotivo: 'Prioridad cliente' },
    };
    const clasifOv = clasificarEventoAuditoria(evOverride);
    expect(clasifOv.modulo).toBe('agenda_misiones');
    expect(clasifOv.categoria).toBe('overrides');
    expect(clasifOv.esOverride).toBe(true);

    const evRechazo: HistorialEvento = {
      id: 'h-2',
      empresaId: 'emp-1',
      entidadTipo: 'viatico',
      entidadId: 'v-1',
      accion: 'Viático rechazado',
      detalle: 'Recibo ilegible',
      usuarioId: 'u-1',
      usuarioNombre: 'Ana',
      fechaAST: '26/11/2026 11:00:00 AST',
    };
    const clasifRech = clasificarEventoAuditoria(evRechazo);
    expect(clasifRech.modulo).toBe('viaticos');
    expect(clasifRech.categoria).toBe('rechazos_alertas');
    expect(clasifRech.esRechazoOAlerta).toBe(true);
  });

  it('genera alertas operativas completas para Admin/Coordinador ordenadas por severidad', () => {
    const snapshot = crearSnapshotAdminBase();
    const alertas = generarAlertasOperativasAdmin({
      snapshot,
      hoyIso: '2026-11-26',
      pendingCount: 2,
      hasConflict: false,
    });

    const ids = alertas.map((a) => a.id);
    expect(ids.some((id) => id.startsWith('renta-vencida-ren-1'))).toBe(true);
    expect(ids.some((id) => id.startsWith('rendimiento-alerta-veh-1'))).toBe(true);
    expect(ids.some((id) => id.startsWith('presupuesto-excedido-proy-1'))).toBe(true);
    expect(ids.some((id) => id.startsWith('presupuesto-umbral-proy-2'))).toBe(true);
    expect(ids.some((id) => id === 'viatico-excedente-via-exc')).toBe(true);
    expect(ids.some((id) => id === 'viatico-ocr-via-exc')).toBe(true);
    expect(ids.some((id) => id === 'agenda-recurso-inactivo-asig-1')).toBe(true);
    expect(ids.some((id) => id.startsWith('ruta-sin-brigada-rut-2'))).toBe(true);
    expect(ids.some((id) => id === 'auditoria-override-hist-1')).toBe(true);
    expect(ids.some((id) => id === 'sync-pendiente-admin-2')).toBe(true);

    // Críticas deben aparecer primero que advertencias e informativas
    const firstWarnIdx = alertas.findIndex((a) => a.severidad === 'advertencia');
    const lastCritIdx = alertas.map((a) => a.severidad).lastIndexOf('critica');
    expect(lastCritIdx).toBeLessThan(firstWarnIdx);
  });

  it('genera alertas exclusivas para Técnico sin filtrar presupuestos ni flota financiera', () => {
    const centroid = latLonToUtm19N(18.52, -69.85, 25);
    const snapTecnico: SnapshotTecnico = {
      empresa: {
        id: 'emp-1',
        nombre: 'SIRIUS Demo',
        rnc: '1-31-00001-1',
        direccionBase: 'Santo Domingo',
        baseLat: 18.4861,
        baseLon: -69.9312,
        zonaHoraria: 'America/Santo_Domingo',
        moneda: 'RD$',
      },
      personal: [],
      cargos: [],
      vehiculos: [{ id: 'veh-1', empresaId: 'emp-1', etiqueta: 'Hilux', placa: 'L40', estado: 'disponible' }],
      equipos: [],
      cuadrillas: [],
      clientes: [],
      proyectos: [],
      rutas: [
        {
          id: 'rut-1',
          empresaId: 'emp-1',
          proyectoId: 'proy-1',
          nombre: 'Parcela Activa',
          codigoParcela: 'P-101',
          ubicacion: 'San Cristóbal',
          provincia: 'San Cristóbal',
          fechaPrevista: '2026-11-26',
          kmzFileName: 'p101.kmz',
          features: [],
          centroid,
          totalAreaM2: 5000,
          totalPerimeterM: 300,
          version: 1,
          updatedAt: '2026-11-26T08:00:00Z',
          syncStatus: 'synced',
        },
      ],
      servicios: [
        {
          id: 'srv-campo-1',
          empresaId: 'emp-1',
          rutaId: 'rut-1',
          tipoServicioId: 'rtk',
          nombre: 'Levantamiento RTK',
          estado: 'en_campo',
          version: 1,
          updatedAt: '2026-11-26T08:00:00Z',
          syncStatus: 'synced',
        },
      ],
      bitacoras: [],
      asignaciones: [
        {
          id: 'asig-tec-1',
          empresaId: 'emp-1',
          rutaId: 'rut-1',
          fechaInicio: '2026-11-26',
          fechaFin: '2026-11-26',
          cuadrillaId: 'cua-1',
          vehiculoIds: ['veh-1'],
          equipoIds: [],
          version: 1,
          updatedAt: '2026-11-25T10:00:00Z',
          syncStatus: 'synced',
        },
      ],
      viaticos: [
        {
          id: 'v-tec-rej',
          empresaId: 'emp-1',
          creadoPorUsuarioId: 'usr-tec',
          creadoPorNombre: 'Carlos',
          fechaIso: '2026-11-25',
          timestampAST: '25/11/2026 12:00:00 AST',
          categoria: 'Dieta',
          comercio: 'Comedor',
          montoRD: 1200,
          itbisRD: 0,
          metodo: 'Manual',
          estadoAprobacion: 'rechazado',
          motivoRechazo: 'Falta comprobante',
          repartos: [],
          version: 1,
          updatedAt: '2026-11-25T16:00:00Z',
          syncStatus: 'synced',
        },
      ],
      misiones: [],
      reglasCapturaViaticos: {
        version: 1,
        vigenciaDesde: '2026-01-01',
        gpsRuta: { tarifaPorKmRD: 25, minimoKm: 10, conceptoDistancia: 'ida_vuelta' },
        presetsRapidos: [],
        categoriasViatico: ['Dieta'],
      },
    };

    const alertas = generarAlertasOperativasTecnico({
      snapshot: snapTecnico,
      usuarioId: 'usr-tec',
      hoyIso: '2026-11-26',
      pendingCount: 0,
      hasConflict: false,
    });

    expect(alertas.some((a) => a.id === 'tec-viatico-rechazado-v-tec-rej')).toBe(true);
    expect(alertas.some((a) => a.id === 'tec-bitacora-faltante-srv-campo-1')).toBe(true);
    expect(alertas.some((a) => a.id.startsWith('tec-ruta-hoy-asig-tec-1'))).toBe(true);
    expect(alertas.every((a) => a.modulo !== 'presupuestos')).toBe(true);
  });
});
