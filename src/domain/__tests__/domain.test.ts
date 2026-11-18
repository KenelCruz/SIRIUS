import { describe, expect, it } from 'vitest';
import type {
  Asignacion,
  Cuadrilla,
  EquipoGNSS,
  Personal,
  Ruta,
  Servicio,
  Vehiculo,
  Viatico,
} from '../../types/domain';
import { latLonToUtm19N } from '../../utils/geodesy';
import {
  calcularGastoPorProyecto,
  completarRepartoConSinAsignar,
  detectarConflictosAsignacion,
  expandirRangoFechas,
  filtrarRutasParaUsuario,
  obtenerRutasAsignadasAUsuario,
  puedeAprobarViatico,
  puedeCrearOEditarOperacion,
  puedeGestionarEmpresa,
  reconciliarColeccionLWW,
  validarDecisionViatico,
  validarRepartoViatico,
  validarResolucionConflictos,
  validarTransicionServicio,
} from '../index';

const baseRuta = (id: string, lat: number, lon: number, codigo: string): Ruta => ({
  id,
  empresaId: 'emp-aia',
  proyectoId: 'proy-1',
  nombre: `Ruta ${codigo}`,
  codigoParcela: codigo,
  ubicacion: 'La Altagracia',
  provincia: 'La Altagracia',
  fechaPrevista: '2026-11-20',
  kmzFileName: `${codigo}.kmz`,
  features: [],
  centroid: latLonToUtm19N(lat, lon, 15),
  totalAreaM2: 12000,
  totalPerimeterM: 480,
  version: 1,
  updatedAt: '2026-11-18T10:00:00.000Z',
  syncStatus: 'synced',
});

describe('Reglas de permisos y visibilidad por rol', () => {
  const personal: Personal[] = [
    { id: 'per-1', empresaId: 'emp-aia', usuarioId: 'usr-tec1', nombre: 'Carlos Méndez', cargo: 'jefe_brigada', activo: true },
    { id: 'per-2', empresaId: 'emp-aia', usuarioId: 'usr-tec2', nombre: 'Laura Ramírez', cargo: 'tecnico', activo: true },
  ];
  const cuadrillas: Cuadrilla[] = [
    { id: 'cua-1', empresaId: 'emp-aia', nombre: 'Brigada Este', jefeId: 'per-1', miembroIds: ['per-1'], activa: true },
    { id: 'cua-2', empresaId: 'emp-aia', nombre: 'Brigada Norte', jefeId: 'per-2', miembroIds: ['per-2'], activa: true },
  ];
  const asignaciones: Asignacion[] = [
    {
      id: 'asig-1',
      empresaId: 'emp-aia',
      rutaId: 'ruta-1',
      fechaInicio: '2026-11-20',
      fechaFin: '2026-11-22',
      cuadrillaId: 'cua-1',
      vehiculoIds: ['veh-1'],
      equipoIds: ['eq-1'],
      version: 1,
      updatedAt: '2026-11-18T10:00:00.000Z',
      syncStatus: 'synced',
    },
  ];
  const rutas = [
    baseRuta('ruta-1', 18.46, -69.3, 'P-01'),
    baseRuta('ruta-2', 19.48, -70.66, 'P-02'),
  ];

  it('Admin controla empresa; Coordinador crea/aprueba; Técnico solo ve rutas asignadas', () => {
    expect(puedeGestionarEmpresa('admin')).toBe(true);
    expect(puedeGestionarEmpresa('coordinador')).toBe(false);
    expect(puedeCrearOEditarOperacion('coordinador')).toBe(true);
    expect(puedeCrearOEditarOperacion('tecnico')).toBe(false);
    expect(puedeAprobarViatico('tecnico')).toBe(false);

    const asignadasTec1 = obtenerRutasAsignadasAUsuario({
      usuarioId: 'usr-tec1',
      personal,
      cuadrillas,
      asignaciones,
    });
    expect(asignadasTec1.has('ruta-1')).toBe(true);
    expect(asignadasTec1.has('ruta-2')).toBe(false);

    const visiblesTec1 = filtrarRutasParaUsuario('tecnico', rutas, asignadasTec1);
    expect(visiblesTec1.map((r) => r.id)).toEqual(['ruta-1']);

    const visiblesCoord = filtrarRutasParaUsuario('coordinador', rutas, asignadasTec1);
    expect(visiblesCoord).toHaveLength(2);
  });
});

describe('Transiciones de Servicio y datos de cobro (F7-F9)', () => {
  const srvBase: Servicio = {
    id: 'srv-1',
    empresaId: 'emp-aia',
    rutaId: 'ruta-1',
    tipoServicioId: 'deslinde',
    nombre: 'Deslinde Catastral',
    cotizacionRD: 75000,
    estado: 'programado',
    version: 1,
    updatedAt: '2026-11-18T10:00:00.000Z',
    syncStatus: 'synced',
  };

  it('Técnico puede pasar programado -> en_campo -> procesando con fechas reales, pero no entregado/cobrado', () => {
    const rutasTec = new Set(['ruta-1']);
    const asignaciones: Asignacion[] = [
      {
        id: 'asig-t1',
        empresaId: 'emp-aia',
        rutaId: 'ruta-1',
        fechaInicio: '2026-11-20',
        fechaFin: '2026-11-22',
        cuadrillaId: 'cua-1',
        vehiculoIds: ['veh-1'],
        equipoIds: ['eq-1'],
        version: 1,
        updatedAt: '2026-11-18T10:00:00.000Z',
        syncStatus: 'synced',
      },
    ];
    const bitacoras = [
      {
        id: 'bit-t1',
        empresaId: 'emp-aia',
        servicioId: 'srv-1',
        rutaId: 'ruta-1',
        autorUsuarioId: 'usr-tec1',
        autorNombre: 'Carlos Méndez',
        fechaAST: '20/11/2026 10:00:00 AST',
        nota: 'Levantamiento ejecutado en linderos.',
        fotos: [],
        syncStatus: 'synced' as const,
      },
    ];

    const r1 = validarTransicionServicio({
      rol: 'tecnico',
      servicio: srvBase,
      nuevoEstado: 'en_campo',
      rutasAsignadasIds: rutasTec,
      asignaciones,
      cuadrillasUsuarioIds: new Set(['cua-1']),
      payload: { fechaRealInicio: '2026-11-20' },
    });
    expect(r1.valido).toBe(true);
    expect(r1.servicioActualizado?.estado).toBe('en_campo');
    expect(r1.servicioActualizado?.fechaRealInicio).toBe('2026-11-20');

    const r2 = validarTransicionServicio({
      rol: 'tecnico',
      servicio: r1.servicioActualizado!,
      nuevoEstado: 'procesando',
      rutasAsignadasIds: rutasTec,
      asignaciones,
      bitacoras,
      payload: { fechaRealFin: '2026-11-21' },
    });
    expect(r2.valido).toBe(true);
    expect(r2.servicioActualizado?.fechaRealFin).toBe('2026-11-21');

    const rForbidden = validarTransicionServicio({
      rol: 'tecnico',
      servicio: r2.servicioActualizado!,
      nuevoEstado: 'entregado',
      rutasAsignadasIds: rutasTec,
      asignaciones,
      bitacoras,
    });
    expect(rForbidden.valido).toBe(false);
  });

  it('Al pasar a cobrado exige montoCobradoRD > 0 y fechaPago', () => {
    const srvEntregado: Servicio = { ...srvBase, estado: 'entregado', version: 4 };

    const sinDatos = validarTransicionServicio({
      rol: 'coordinador',
      servicio: srvEntregado,
      nuevoEstado: 'cobrado',
      rutasAsignadasIds: new Set(),
      payload: { montoCobradoRD: 0, fechaPago: '' },
    });
    expect(sinDatos.valido).toBe(false);

    const conDatos = validarTransicionServicio({
      rol: 'coordinador',
      servicio: srvEntregado,
      nuevoEstado: 'cobrado',
      rutasAsignadasIds: new Set(),
      payload: { montoCobradoRD: 75000, fechaPago: '2026-11-25' },
    });
    expect(conDatos.valido).toBe(true);
    expect(conDatos.servicioActualizado?.montoCobradoRD).toBe(75000);
    expect(conDatos.servicioActualizado?.fechaPago).toBe('2026-11-25');
  });
});

describe('Motor de conflictos por rango de fechas, mantenimiento, 120m y overrideConflicto', () => {
  const personal: Personal[] = [
    { id: 'per-1', empresaId: 'emp-aia', nombre: 'Carlos Méndez', cargo: 'jefe_brigada', activo: true },
    { id: 'per-2', empresaId: 'emp-aia', nombre: 'Laura Ramírez', cargo: 'tecnico', activo: true },
  ];
  const cuadrillas: Cuadrilla[] = [
    { id: 'cua-1', empresaId: 'emp-aia', nombre: 'Brigada 1', jefeId: 'per-1', miembroIds: ['per-1'], activa: true },
    { id: 'cua-2', empresaId: 'emp-aia', nombre: 'Brigada 2', jefeId: 'per-2', miembroIds: ['per-1', 'per-2'], activa: true },
  ];
  const vehiculos: Vehiculo[] = [
    {
      id: 'veh-ok',
      empresaId: 'emp-aia',
      etiqueta: 'Hilux #1',
      placa: 'L402819',
      tipoCombustible: 'Diésel',
      precioGalonRD: 239.1,
      kmPorGal: 32,
      mantenimientoPorKmRD: 15,
      estado: 'disponible',
    },
    {
      id: 'veh-maint',
      empresaId: 'emp-aia',
      etiqueta: 'Pickup #2',
      placa: 'L409110',
      tipoCombustible: 'Gasolina',
      precioGalonRD: 272.5,
      kmPorGal: 36,
      mantenimientoPorKmRD: 12,
      estado: 'en_mantenimiento',
    },
  ];
  const equipos: EquipoGNSS[] = [
    { id: 'eq-1', empresaId: 'emp-aia', nombre: 'Trimble R12i', serial: 'TR-8842', estado: 'disponible' },
  ];
  const rutas: Ruta[] = [
    baseRuta('ruta-1', 18.4621, -69.2984, 'P-01'),
    baseRuta('ruta-2', 19.4852, -70.6682, 'P-02'),
    // < 120m from ruta-1
    baseRuta('ruta-cerca', 18.4624, -69.2985, 'P-03'),
  ];
  const asignacionesExistentes: Asignacion[] = [
    {
      id: 'asig-1',
      empresaId: 'emp-aia',
      rutaId: 'ruta-1',
      fechaInicio: '2026-11-20',
      fechaFin: '2026-11-23',
      cuadrillaId: 'cua-1',
      vehiculoIds: ['veh-ok'],
      equipoIds: ['eq-1'],
      version: 1,
      updatedAt: '2026-11-18T10:00:00.000Z',
      syncStatus: 'synced',
    },
  ];

  it('Expande rango de fechas completo y detecta solapamiento de técnico y vehículo', () => {
    expect(expandirRangoFechas('2026-11-20', '2026-11-22')).toEqual([
      '2026-11-20',
      '2026-11-21',
      '2026-11-22',
    ]);

    const conflictos = detectarConflictosAsignacion({
      candidata: {
        id: 'asig-nueva',
        rutaId: 'ruta-2',
        fechaInicio: '2026-11-22',
        fechaFin: '2026-11-24',
        cuadrillaId: 'cua-2', // comparte a per-1!
        vehiculoIds: ['veh-ok'],
        equipoIds: [],
      },
      asignacionesExistentes,
      rutas,
      cuadrillas,
      personal,
      vehiculos,
      equipos,
    });

    const tipos = conflictos.map((c) => c.type);
    expect(tipos).toContain('personal');
    expect(tipos).toContain('vehiculo');
    expect(conflictos.every((c) => c.severidad === 'bloqueante' && c.permiteOverride)).toBe(true);

    // Sin motivo falla validación; con overrideConflicto completo pasa
    expect(validarResolucionConflictos(conflictos).valido).toBe(false);
    expect(
      validarResolucionConflictos(conflictos, {
        motivo: 'Brigada apoya solo apertura en la tarde',
        usuarioId: 'usr-coord',
        usuarioNombre: 'Coordinador',
        fecha: '2026-11-18T12:00:00Z',
      }).valido
    ).toBe(true);
  });

  it('Bloquea sin override si el vehículo está en mantenimiento', () => {
    const conflictos = detectarConflictosAsignacion({
      candidata: {
        id: 'asig-maint',
        rutaId: 'ruta-2',
        fechaInicio: '2026-11-28',
        fechaFin: '2026-11-29',
        cuadrillaId: 'cua-1',
        vehiculoIds: ['veh-maint'],
        equipoIds: [],
      },
      asignacionesExistentes,
      rutas,
      cuadrillas,
      personal,
      vehiculos,
      equipos,
    });
    expect(conflictos[0].type).toBe('vehiculo_mantenimiento');
    expect(conflictos[0].severidad).toBe('bloqueante');
    expect(conflictos[0].permiteOverride).toBe(false);

    const res = validarResolucionConflictos(conflictos, {
      motivo: 'Intento de excepción',
      usuarioId: 'usr-admin',
      usuarioNombre: 'Admin',
      fecha: '2026-11-18T12:00:00Z',
    });
    expect(res.valido).toBe(false);
  });

  it('Marca proximidad espacial < 120m como advertencia (no bloqueante)', () => {
    const conflictos = detectarConflictosAsignacion({
      candidata: {
        id: 'asig-espacial',
        rutaId: 'ruta-cerca',
        fechaInicio: '2026-11-28',
        fechaFin: '2026-11-28',
        cuadrillaId: 'cua-1',
        vehiculoIds: ['veh-ok'],
        equipoIds: ['eq-1'],
      },
      asignacionesExistentes,
      rutas,
      cuadrillas,
      personal,
      vehiculos,
      equipos,
    });
    expect(conflictos).toHaveLength(1);
    expect(conflictos[0].type).toBe('spatial');
    expect(conflictos[0].severidad).toBe('advertencia');
    expect(validarResolucionConflictos(conflictos).valido).toBe(true);
  });
});

describe('Viáticos, reparto exacto a proyectos y LWW sync', () => {
  it('Exige suma exacta en RD$ y envía excedente a sin_asignar', () => {
    const repartos = completarRepartoConSinAsignar(5000, [
      { proyectoId: 'proy-1', montoRD: 3200 },
    ]);
    expect(repartos).toEqual([
      { proyectoId: 'proy-1', montoRD: 3200 },
      { proyectoId: 'sin_asignar', montoRD: 1800 },
    ]);
    expect(validarRepartoViatico(5000, repartos).valido).toBe(true);

    const invalido = validarRepartoViatico(5000, [{ proyectoId: 'proy-1', montoRD: 4500 }]);
    expect(invalido.valido).toBe(false);
  });

  it('Exige motivo al rechazar un viático y excluye rechazados del gasto real', () => {
    expect(
      validarDecisionViatico({ rol: 'coordinador', nuevoEstado: 'rechazado', motivoRechazo: '' })
        .valido
    ).toBe(false);
    expect(
      validarDecisionViatico({
        rol: 'coordinador',
        nuevoEstado: 'rechazado',
        motivoRechazo: 'Factura duplicada sin NCF',
      }).valido
    ).toBe(true);

    const viaticos: Viatico[] = [
      {
        id: 'v-1',
        empresaId: 'emp-aia',
        creadoPorUsuarioId: 'u1',
        creadoPorNombre: 'Carlos',
        fechaIso: '2026-11-18',
        timestampAST: '18/11/2026 09:00:00 AST',
        categoria: 'Combustible',
        comercio: 'Texaco',
        montoRD: 4000,
        itbisRD: 0,
        metodo: 'GPS Ruta',
        distanceKm: 80,
        estadoAprobacion: 'aprobado',
        repartos: [
          { proyectoId: 'proy-1', montoRD: 2500 },
          { proyectoId: 'sin_asignar', montoRD: 1500 },
        ],
        version: 1,
        updatedAt: '2026-11-18T10:00:00Z',
        syncStatus: 'synced',
      },
      {
        id: 'v-2',
        empresaId: 'emp-aia',
        creadoPorUsuarioId: 'u1',
        creadoPorNombre: 'Carlos',
        fechaIso: '2026-11-18',
        timestampAST: '18/11/2026 10:00:00 AST',
        categoria: 'Dieta',
        comercio: 'Comedor',
        montoRD: 1200,
        itbisRD: 0,
        metodo: 'Manual',
        estadoAprobacion: 'rechazado',
        motivoRechazo: 'Sin comprobante',
        repartos: [{ proyectoId: 'proy-1', montoRD: 1200 }],
        version: 1,
        updatedAt: '2026-11-18T10:05:00Z',
        syncStatus: 'synced',
      },
    ];

    const gastos = calcularGastoPorProyecto(viaticos);
    expect(gastos['proy-1'].aprobadoRD).toBe(2500);
    expect(gastos['proy-1'].totalEjecutadoRD).toBe(2500);
    expect(gastos['sin_asignar'].aprobadoRD).toBe(1500);
  });

  it('Reconcilia colecciones con LWW por versión y updatedAt', () => {
    const merged = reconciliarColeccionLWW(
      [{ id: 'a', version: 2, updatedAt: '2026-11-18T10:00:00Z', val: 'local' }],
      [{ id: 'a', version: 1, updatedAt: '2026-11-18T12:00:00Z', val: 'remoto' }]
    );
    expect(merged[0].val).toBe('local');
  });
});
