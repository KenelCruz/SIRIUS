import { describe, expect, it } from 'vitest';
import type {
  BitacoraEntrada,
  EstadoEmpresaSnapshot,
  EstadoSync,
  Servicio,
  Viatico,
} from '../../types/domain';
import { latLonToUtm19N } from '../../utils/geodesy';
import {
  calcularConteoPendientesPorTipo,
  obtenerAgendaSemanalTecnico,
  obtenerServiciosHoyTecnico,
  proyectarSnapshotParaRol,
  puedeEditarViatico,
  puedeEliminarViatico,
  reconciliarColeccionLWWConReporte,
  validarEdicionViaticoTecnico,
  validarEliminacionViaticoTecnico,
  validarTransicionServicio,
} from '../index';

function buildSnapshotBase(): EstadoEmpresaSnapshot {
  return {
    empresa: {
      id: 'emp-aia',
      nombre: 'AIA Services',
      rnc: '1-31-84920-4',
      direccionBase: 'Av. 27 de Febrero #340',
      baseLat: 18.4861,
      baseLon: -69.9312,
      planMensualRD: 14500,
      estadoSuscripcion: 'activa',
      zonaHoraria: 'America/Santo_Domingo',
      moneda: 'RD$',
      fechaAlta: '2026-01-15',
    },
    membresias: [
      { id: 'mem-1', usuarioId: 'usr-admin', empresaId: 'emp-aia', rol: 'admin', activo: true },
      { id: 'mem-2', usuarioId: 'usr-tec1', empresaId: 'emp-aia', rol: 'tecnico', personalId: 'per-1', activo: true },
    ],
    usuarios: [
      { id: 'usr-admin', email: 'admin@aiaservices.do', nombre: 'Admin', activo: true },
      { id: 'usr-tec1', email: 'carlos@aiaservices.do', nombre: 'Carlos Méndez', activo: true },
      { id: 'usr-tec2', email: 'laura@aiaservices.do', nombre: 'Laura Ramírez', activo: true },
    ],
    personal: [
      { id: 'per-1', empresaId: 'emp-aia', usuarioId: 'usr-tec1', nombre: 'Carlos Méndez', cargo: 'jefe_brigada', activo: true },
      { id: 'per-4', empresaId: 'emp-aia', nombre: 'Mateo Jiménez', cargo: 'chofer', activo: true },
      { id: 'per-2', empresaId: 'emp-aia', usuarioId: 'usr-tec2', nombre: 'Laura Ramírez', cargo: 'jefe_brigada', activo: true },
    ],
    vehiculos: [
      {
        id: 'veh-1',
        empresaId: 'emp-aia',
        etiqueta: 'Hilux 4x4',
        placa: 'L402819',
        tipoCombustible: 'Diésel',
        precioGalonRD: 239.1,
        kmPorGal: 32,
        mantenimientoPorKmRD: 15,
        estado: 'disponible',
      },
      {
        id: 'veh-2',
        empresaId: 'emp-aia',
        etiqueta: 'Ranger 4x4',
        placa: 'L418390',
        tipoCombustible: 'Diésel',
        precioGalonRD: 239.1,
        kmPorGal: 30,
        mantenimientoPorKmRD: 16,
        estado: 'disponible',
      },
    ],
    equipos: [
      { id: 'eq-1', empresaId: 'emp-aia', nombre: 'Trimble R12i', serial: 'TR-8842', estado: 'disponible' },
      { id: 'eq-2', empresaId: 'emp-aia', nombre: 'Leica GS18', serial: 'LC-3190', estado: 'disponible' },
    ],
    cuadrillas: [
      { id: 'cua-1', empresaId: 'emp-aia', nombre: 'Brigada Este', jefeId: 'per-1', miembroIds: ['per-1', 'per-4'], activa: true },
      { id: 'cua-2', empresaId: 'emp-aia', nombre: 'Brigada Cibao', jefeId: 'per-2', miembroIds: ['per-2'], activa: true },
    ],
    clientes: [
      { id: 'cli-1', empresaId: 'emp-aia', nombre: 'Cliente Este', rnc: '1-01-11111-1', contacto: 'Miguel' },
      { id: 'cli-2', empresaId: 'emp-aia', nombre: 'Cliente Cibao', rnc: '1-01-22222-2', contacto: 'Sofía' },
    ],
    proyectos: [
      {
        id: 'proy-1',
        empresaId: 'emp-aia',
        clienteId: 'cli-1',
        nombre: 'Proyecto Este',
        codigoContrato: 'AIA-2026-001',
        presupuestoViaticosRD: 25000,
        valorContratoRD: 350000,
        estado: 'en_campo',
        fechaCreacion: '2026-11-10',
        version: 1,
        updatedAt: '2026-11-18T10:00:00Z',
        syncStatus: 'synced',
      },
      {
        id: 'proy-2',
        empresaId: 'emp-aia',
        clienteId: 'cli-2',
        nombre: 'Proyecto Cibao',
        codigoContrato: 'AIA-2026-002',
        presupuestoViaticosRD: 18000,
        valorContratoRD: 220000,
        estado: 'programado',
        fechaCreacion: '2026-11-12',
        version: 1,
        updatedAt: '2026-11-18T10:00:00Z',
        syncStatus: 'pending',
      },
    ],
    rutas: [
      {
        id: 'ruta-1',
        empresaId: 'emp-aia',
        proyectoId: 'proy-1',
        nombre: 'Parcela Macorís',
        codigoParcela: 'DC-04-001',
        ubicacion: 'San Pedro',
        provincia: 'San Pedro de Macorís',
        fechaPrevista: '2026-11-18',
        kmzFileName: 'macoris.kmz',
        features: [],
        centroid: latLonToUtm19N(18.46, -69.3, 15),
        totalAreaM2: 10000,
        totalPerimeterM: 400,
        routeSummary: {
          routeName: 'Expreso Este',
          distanceOneWayKm: 70,
          durationMin: 60,
          tollsRD: 400,
          fuelRD: 1050,
          vehicleLabel: 'Hilux 4x4',
        },
        version: 1,
        updatedAt: '2026-11-18T10:00:00Z',
        syncStatus: 'synced',
      },
      {
        id: 'ruta-2',
        empresaId: 'emp-aia',
        proyectoId: 'proy-2',
        nombre: 'Parcela Gurabo',
        codigoParcela: 'DC-08-002',
        ubicacion: 'Santiago',
        provincia: 'Santiago',
        fechaPrevista: '2026-11-19',
        kmzFileName: 'gurabo.kmz',
        features: [],
        centroid: latLonToUtm19N(19.48, -70.66, 200),
        totalAreaM2: 8000,
        totalPerimeterM: 360,
        version: 1,
        updatedAt: '2026-11-18T10:00:00Z',
        syncStatus: 'pending',
      },
      {
        id: 'ruta-3',
        empresaId: 'emp-aia',
        proyectoId: 'proy-1',
        nombre: 'Parcela Yamasá (futura)',
        codigoParcela: 'DC-12-003',
        ubicacion: 'Yamasá',
        provincia: 'Monte Plata',
        fechaPrevista: '2026-11-24',
        kmzFileName: 'yamasa.kmz',
        features: [],
        centroid: latLonToUtm19N(18.77, -70.02, 70),
        totalAreaM2: 15000,
        totalPerimeterM: 500,
        version: 1,
        updatedAt: '2026-11-18T10:00:00Z',
        syncStatus: 'synced',
      },
    ],
    servicios: [
      {
        id: 'srv-1',
        empresaId: 'emp-aia',
        rutaId: 'ruta-1',
        tipoServicioId: 'deslinde',
        nombre: 'Deslinde Parcela Macorís',
        cotizacionRD: 95000,
        estado: 'programado',
        version: 1,
        updatedAt: '2026-11-18T10:00:00Z',
        syncStatus: 'synced',
      },
      {
        id: 'srv-2',
        empresaId: 'emp-aia',
        rutaId: 'ruta-2',
        tipoServicioId: 'rtk',
        nombre: 'RTK Gurabo',
        cotizacionRD: 45000,
        estado: 'programado',
        version: 1,
        updatedAt: '2026-11-18T10:00:00Z',
        syncStatus: 'pending',
      },
      {
        id: 'srv-3',
        empresaId: 'emp-aia',
        rutaId: 'ruta-3',
        tipoServicioId: 'rtk',
        nombre: 'RTK Yamasá',
        cotizacionRD: 55000,
        estado: 'programado',
        version: 1,
        updatedAt: '2026-11-18T10:00:00Z',
        syncStatus: 'synced',
      },
    ],
    bitacoras: [
      {
        id: 'bit-1',
        empresaId: 'emp-aia',
        servicioId: 'srv-1',
        rutaId: 'ruta-1',
        autorUsuarioId: 'usr-tec1',
        autorNombre: 'Carlos Méndez',
        fechaAST: '18/11/2026 08:30:00 AST',
        nota: 'Base RTK montada.',
        fotos: [],
        syncStatus: 'pending',
      },
      {
        id: 'bit-2',
        empresaId: 'emp-aia',
        servicioId: 'srv-2',
        rutaId: 'ruta-2',
        autorUsuarioId: 'usr-tec2',
        autorNombre: 'Laura Ramírez',
        fechaAST: '18/11/2026 09:00:00 AST',
        nota: 'Bitácora de otra brigada.',
        fotos: [],
        syncStatus: 'pending',
      },
    ],
    asignaciones: [
      {
        id: 'asig-1',
        empresaId: 'emp-aia',
        rutaId: 'ruta-1',
        fechaInicio: '2026-11-18',
        fechaFin: '2026-11-20',
        cuadrillaId: 'cua-1',
        vehiculoIds: ['veh-1'],
        equipoIds: ['eq-1'],
        version: 1,
        updatedAt: '2026-11-18T08:00:00Z',
        syncStatus: 'synced',
      },
      {
        id: 'asig-2',
        empresaId: 'emp-aia',
        rutaId: 'ruta-2',
        fechaInicio: '2026-11-18',
        fechaFin: '2026-11-21',
        cuadrillaId: 'cua-2',
        vehiculoIds: ['veh-2'],
        equipoIds: ['eq-2'],
        version: 1,
        updatedAt: '2026-11-18T08:00:00Z',
        syncStatus: 'pending',
      },
      {
        id: 'asig-3',
        empresaId: 'emp-aia',
        rutaId: 'ruta-3',
        fechaInicio: '2026-11-24',
        fechaFin: '2026-11-25',
        cuadrillaId: 'cua-1',
        vehiculoIds: ['veh-1'],
        equipoIds: ['eq-1'],
        version: 1,
        updatedAt: '2026-11-18T08:00:00Z',
        syncStatus: 'synced',
      },
    ],
    viaticos: [
      {
        id: 'via-1',
        empresaId: 'emp-aia',
        creadoPorUsuarioId: 'usr-tec1',
        creadoPorNombre: 'Carlos Méndez',
        rutaId: 'ruta-1',
        fechaIso: '2026-11-18',
        timestampAST: '18/11/2026 09:00:00 AST',
        categoria: 'Dieta',
        comercio: 'Comedor Este',
        montoRD: 2200,
        itbisRD: 0,
        metodo: 'Manual',
        estadoAprobacion: 'pendiente',
        repartos: [{ proyectoId: 'proy-1', montoRD: 2200 }],
        version: 1,
        updatedAt: '2026-11-18T09:00:00Z',
        syncStatus: 'pending',
      },
      {
        id: 'via-2',
        empresaId: 'emp-aia',
        creadoPorUsuarioId: 'usr-tec2',
        creadoPorNombre: 'Laura Ramírez',
        rutaId: 'ruta-2',
        fechaIso: '2026-11-18',
        timestampAST: '18/11/2026 10:00:00 AST',
        categoria: 'Combustible',
        comercio: 'Texaco Santiago',
        montoRD: 3500,
        itbisRD: 0,
        metodo: 'OCR Móvil',
        estadoAprobacion: 'pendiente',
        repartos: [{ proyectoId: 'proy-2', montoRD: 3500 }],
        version: 1,
        updatedAt: '2026-11-18T10:00:00Z',
        syncStatus: 'pending',
      },
    ],
    historial: [
      {
        id: 'hist-1',
        empresaId: 'emp-aia',
        entidadTipo: 'proyecto',
        entidadId: 'proy-1',
        accion: 'Creado',
        detalle: 'Contrato confidencial',
        usuarioId: 'usr-admin',
        usuarioNombre: 'Admin',
        fechaAST: '10/11/2026 10:00:00 AST',
      },
    ],
    misiones: [],
    rentas: [],
  };
}

describe('Aislamiento estricto y SnapshotTecnico (proyectarSnapshotParaRol)', () => {
  it('El técnico no recibe presupuestos, contratos, usuarios, membresías, personal ni recursos de otras cuadrillas', () => {
    const full = buildSnapshotBase();
    const proyeccion = proyectarSnapshotParaRol({
      snapshot: full,
      rol: 'tecnico',
      usuarioId: 'usr-tec1',
      personalIdMembresia: 'per-1',
    });

    expect(proyeccion.rol).toBe('tecnico');
    if (proyeccion.rol !== 'tecnico') return;

    const tecSnap = proyeccion.snapshot;

    // Sin colecciones prohibidas
    expect('usuarios' in tecSnap).toBe(false);
    expect('membresias' in tecSnap).toBe(false);
    expect('historial' in tecSnap).toBe(false);
    expect('planMensualRD' in tecSnap.empresa).toBe(false);

    // Solo su cuadrilla y sus integrantes
    expect(tecSnap.cuadrillas.map((c) => c.id)).toEqual(['cua-1']);
    expect(tecSnap.personal.map((p) => p.id).sort()).toEqual(['per-1', 'per-4']);

    // Solo sus asignaciones, rutas, servicios, clientes, vehículos, equipos y bitácoras
    expect(tecSnap.asignaciones.map((a) => a.id).sort()).toEqual(['asig-1', 'asig-3']);
    expect(tecSnap.rutas.map((r) => r.id).sort()).toEqual(['ruta-1', 'ruta-3']);
    expect(tecSnap.servicios.map((s) => s.id).sort()).toEqual(['srv-1', 'srv-3']);
    expect(tecSnap.proyectos.map((p) => p.id)).toEqual(['proy-1']);
    expect(tecSnap.clientes.map((c) => c.id)).toEqual(['cli-1']);
    expect(tecSnap.vehiculos.map((v) => v.id)).toEqual(['veh-1']);
    expect(tecSnap.equipos.map((e) => e.id)).toEqual(['eq-1']);
    expect(tecSnap.bitacoras.map((b) => b.id)).toEqual(['bit-1']);
    expect(tecSnap.viaticos.map((v) => v.id)).toEqual(['via-1']);

    // Sin datos financieros en proyectos, servicios, vehículos ni rutas
    expect('presupuestoViaticosRD' in tecSnap.proyectos[0]).toBe(false);
    expect('valorContratoRD' in tecSnap.proyectos[0]).toBe(false);
    expect('cotizacionRD' in tecSnap.servicios[0]).toBe(false);
    expect('montoCobradoRD' in tecSnap.servicios[0]).toBe(false);
    expect('precioGalonRD' in tecSnap.vehiculos[0]).toBe(false);
    expect('mantenimientoPorKmRD' in tecSnap.vehiculos[0]).toBe(false);
    expect(tecSnap.rutas[0].routeSummary).toBeDefined();
    expect('fuelRD' in (tecSnap.rutas[0].routeSummary ?? {})).toBe(false);
    expect('tollsRD' in (tecSnap.rutas[0].routeSummary ?? {})).toBe(false);

    // Cargos activos y reglas no financieras de captura para técnico
    expect(tecSnap.cargos.length).toBeGreaterThanOrEqual(4);
    expect(tecSnap.reglasCapturaViaticos.gpsRuta.minimoKm).toBe(12);
    expect(tecSnap.reglasCapturaViaticos.gpsRuta.tarifaPorKmRD).toBe(26.5);
    expect(tecSnap.reglasCapturaViaticos.gpsRuta.conceptoDistancia).toBe('ida_vuelta');
    expect('tarifaBaseRD' in tecSnap).toBe(false);
  });

  it('Admin y Coordinador reciben el snapshot completo sin recortes', () => {
    const full = buildSnapshotBase();
    const proyAdmin = proyectarSnapshotParaRol({
      snapshot: full,
      rol: 'admin',
      usuarioId: 'usr-admin',
    });
    expect(proyAdmin.rol).toBe('admin');
    if (proyAdmin.rol === 'admin') {
      expect(proyAdmin.snapshot.proyectos).toHaveLength(2);
      expect(proyAdmin.snapshot.usuarios).toHaveLength(3);
      expect(proyAdmin.snapshot.historial).toHaveLength(1);
    }
  });
});

describe('Reglas de transición del técnico: iniciar campo y cerrar servicio', () => {
  const full = buildSnapshotBase();

  it('Bloquea iniciar campo si fechaRealInicio está fuera del rango de asignación de su cuadrilla (sin override)', () => {
    const srv = full.servicios[0]; // ruta-1, asig-1 es 2026-11-18 al 2026-11-20

    const antesDeRango = validarTransicionServicio({
      rol: 'tecnico',
      servicio: srv,
      nuevoEstado: 'en_campo',
      rutasAsignadasIds: new Set(['ruta-1', 'ruta-3']),
      asignaciones: full.asignaciones,
      cuadrillasUsuarioIds: new Set(['cua-1']),
      payload: { fechaRealInicio: '2026-11-17' },
    });
    expect(antesDeRango.valido).toBe(false);
    expect(antesDeRango.error).toContain('fuera del rango asignado');

    const despuesDeRango = validarTransicionServicio({
      rol: 'tecnico',
      servicio: srv,
      nuevoEstado: 'en_campo',
      rutasAsignadasIds: new Set(['ruta-1', 'ruta-3']),
      asignaciones: full.asignaciones,
      cuadrillasUsuarioIds: new Set(['cua-1']),
      payload: { fechaRealInicio: '2026-11-21' },
    });
    expect(despuesDeRango.valido).toBe(false);

    // Asignación perteneciente a otra cuadrilla no autoriza iniciar campo
    const otraCuadrilla = validarTransicionServicio({
      rol: 'tecnico',
      servicio: full.servicios[1], // ruta-2 (cua-2)
      nuevoEstado: 'en_campo',
      rutasAsignadasIds: new Set(['ruta-2']),
      asignaciones: full.asignaciones,
      cuadrillasUsuarioIds: new Set(['cua-1']),
      payload: { fechaRealInicio: '2026-11-19' },
    });
    expect(otraCuadrilla.valido).toBe(false);

    // Dentro del rango sí permite iniciar campo
    const dentroDeRango = validarTransicionServicio({
      rol: 'tecnico',
      servicio: srv,
      nuevoEstado: 'en_campo',
      rutasAsignadasIds: new Set(['ruta-1', 'ruta-3']),
      asignaciones: full.asignaciones,
      cuadrillasUsuarioIds: new Set(['cua-1']),
      payload: { fechaRealInicio: '2026-11-19' },
    });
    expect(dentroDeRango.valido).toBe(true);
    expect(dentroDeRango.servicioActualizado?.estado).toBe('en_campo');
    expect(dentroDeRango.servicioActualizado?.fechaRealInicio).toBe('2026-11-19');
  });

  it('Bloquea cerrar servicio a procesando si no existe al menos una entrada en bitácora', () => {
    const srvEnCampo: Servicio = {
      ...full.servicios[0],
      estado: 'en_campo',
      fechaRealInicio: '2026-11-18',
      version: 2,
    };

    const sinBitacora = validarTransicionServicio({
      rol: 'tecnico',
      servicio: srvEnCampo,
      nuevoEstado: 'procesando',
      rutasAsignadasIds: new Set(['ruta-1']),
      asignaciones: full.asignaciones,
      bitacoras: [],
      payload: { fechaRealFin: '2026-11-19' },
    });
    expect(sinBitacora.valido).toBe(false);
    expect(sinBitacora.error).toContain('bitácora');

    // Con bitácora de otro servicio tampoco permite cerrar este servicio
    const bitacoraOtroServicio: BitacoraEntrada[] = [full.bitacoras[1]];
    const conBitacoraAjena = validarTransicionServicio({
      rol: 'tecnico',
      servicio: srvEnCampo,
      nuevoEstado: 'procesando',
      rutasAsignadasIds: new Set(['ruta-1']),
      asignaciones: full.asignaciones,
      bitacoras: bitacoraOtroServicio,
      payload: { fechaRealFin: '2026-11-19' },
    });
    expect(conBitacoraAjena.valido).toBe(false);

    // Con fechaRealFin < fechaRealInicio también bloquea
    const fechaInvalida = validarTransicionServicio({
      rol: 'tecnico',
      servicio: srvEnCampo,
      nuevoEstado: 'procesando',
      rutasAsignadasIds: new Set(['ruta-1']),
      asignaciones: full.asignaciones,
      bitacoras: full.bitacoras,
      payload: { fechaRealFin: '2026-11-17' },
    });
    expect(fechaInvalida.valido).toBe(false);

    // Con al menos 1 bitácora del servicio y fecha válida sí cierra a procesando
    const cierreOk = validarTransicionServicio({
      rol: 'tecnico',
      servicio: srvEnCampo,
      nuevoEstado: 'procesando',
      rutasAsignadasIds: new Set(['ruta-1']),
      asignaciones: full.asignaciones,
      bitacoras: full.bitacoras,
      payload: { fechaRealFin: '2026-11-19' },
    });
    expect(cierreOk.valido).toBe(true);
    expect(cierreOk.servicioActualizado?.estado).toBe('procesando');
    expect(cierreOk.servicioActualizado?.fechaRealFin).toBe('2026-11-19');
  });
});

describe('Viáticos del técnico: solo editables y eliminables en estado pendiente', () => {
  const baseViatico: Viatico = {
    id: 'via-x',
    empresaId: 'emp-aia',
    creadoPorUsuarioId: 'usr-tec1',
    creadoPorNombre: 'Carlos Méndez',
    rutaId: 'ruta-1',
    fechaIso: '2026-11-18',
    timestampAST: '18/11/2026 09:00:00 AST',
    categoria: 'Combustible',
    comercio: 'Texaco',
    montoRD: 2500,
    itbisRD: 0,
    metodo: 'Manual',
    estadoAprobacion: 'pendiente',
    repartos: [{ proyectoId: 'proy-1', montoRD: 2500 }],
    version: 1,
    updatedAt: '2026-11-18T09:00:00Z',
    syncStatus: 'synced',
  };

  it('Permite editar y eliminar si es propio y está pendiente', () => {
    expect(puedeEditarViatico('tecnico', baseViatico, 'usr-tec1')).toBe(true);
    expect(puedeEliminarViatico('tecnico', baseViatico, 'usr-tec1')).toBe(true);
    expect(validarEdicionViaticoTecnico(baseViatico, 'usr-tec1').valido).toBe(true);
    expect(validarEliminacionViaticoTecnico(baseViatico, 'usr-tec1').valido).toBe(true);
  });

  it('Bloquea edición y eliminación cuando el viático está aprobado, rechazado o es de otro técnico', () => {
    const aprobado: Viatico = { ...baseViatico, estadoAprobacion: 'aprobado' };
    const rechazado: Viatico = { ...baseViatico, estadoAprobacion: 'rechazado', motivoRechazo: 'NCF ilegible' };

    expect(puedeEditarViatico('tecnico', aprobado, 'usr-tec1')).toBe(false);
    expect(puedeEliminarViatico('tecnico', aprobado, 'usr-tec1')).toBe(false);
    expect(validarEdicionViaticoTecnico(aprobado, 'usr-tec1').valido).toBe(false);

    expect(puedeEditarViatico('tecnico', rechazado, 'usr-tec1')).toBe(false);
    expect(puedeEliminarViatico('tecnico', rechazado, 'usr-tec1')).toBe(false);
    expect(validarEliminacionViaticoTecnico(rechazado, 'usr-tec1').valido).toBe(false);

    expect(puedeEditarViatico('tecnico', baseViatico, 'usr-tec2')).toBe(false);
    expect(puedeEliminarViatico('tecnico', baseViatico, 'usr-tec2')).toBe(false);
  });
});

describe('Hoy, Mi Agenda semanal, Conteo por tipo y Aviso LWW', () => {
  it('Hoy muestra solo servicios en ventana hoy + 3 días; Mi agenda respeta semana y estado', () => {
    const full = buildSnapshotBase();
    const proy = proyectarSnapshotParaRol({
      snapshot: full,
      rol: 'tecnico',
      usuarioId: 'usr-tec1',
      personalIdMembresia: 'per-1',
    });
    if (proy.rol !== 'tecnico') throw new Error('Esperaba rol tecnico');

    // Hoy = 2026-11-18 -> ventana hasta 2026-11-21: incluye srv-1 (asig-1: 18..20), excluye srv-3 (asig-3: 24..25)
    const hoyItems = obtenerServiciosHoyTecnico(proy.snapshot, '2026-11-18');
    expect(hoyItems.map((i) => i.servicio.id)).toEqual(['srv-1']);
    expect(hoyItems[0].cliente?.nombre).toBe('Cliente Este');
    expect(hoyItems[0].cuadrilla?.nombre).toBe('Brigada Este');

    // Semana del lunes 2026-11-16..2026-11-22 muestra asig-1 en 18, 19 y 20
    const semana1 = obtenerAgendaSemanalTecnico(proy.snapshot, '2026-11-16');
    const diasConActividad = semana1.filter((d) => d.items.length > 0).map((d) => d.fechaIso);
    expect(diasConActividad).toEqual(['2026-11-18', '2026-11-19', '2026-11-20']);

    // Semana siguiente 2026-11-23..2026-11-29 muestra asig-3 en 24 y 25
    const semana2 = obtenerAgendaSemanalTecnico(proy.snapshot, '2026-11-23');
    const diasSemana2 = semana2.filter((d) => d.items.length > 0).map((d) => d.fechaIso);
    expect(diasSemana2).toEqual(['2026-11-24', '2026-11-25']);
  });

  it('pendingCount del técnico cuenta solo sus propios cambios desglosados por tipo', () => {
    const full = buildSnapshotBase();
    // full tiene pending en proy-2, ruta-2, srv-2, bit-1, bit-2, asig-2, via-1, via-2 (muchos ajenos)
    const proyTec = proyectarSnapshotParaRol({
      snapshot: full,
      rol: 'tecnico',
      usuarioId: 'usr-tec1',
      personalIdMembresia: 'per-1',
    });

    const conteoTec = calcularConteoPendientesPorTipo(proyTec);
    // Para Carlos solo deben contar bit-1 y via-1 (total = 2, 0 proyectos, 0 rutas, 0 asignaciones)
    expect(conteoTec).toEqual({
      servicios: 0,
      bitacoras: 1,
      viaticos: 1,
      proyectos: 0,
      rutas: 0,
      asignaciones: 0,
      total: 2,
    });
  });

  it('reconciliarColeccionLWWConReporte informa cuando el servidor sobrescribe un cambio local pendiente', () => {
    const locales: Array<{
      id: string;
      version: number;
      updatedAt: string;
      syncStatus: EstadoSync;
      monto: number;
    }> = [
      {
        id: 'via-1',
        version: 1,
        updatedAt: '2026-11-18T10:00:00Z',
        syncStatus: 'pending',
        monto: 1000,
      },
    ];
    const remotos: Array<{
      id: string;
      version: number;
      updatedAt: string;
      syncStatus: EstadoSync;
      monto: number;
    }> = [
      {
        id: 'via-1',
        version: 2,
        updatedAt: '2026-11-18T11:00:00Z',
        syncStatus: 'synced',
        monto: 1500,
      },
    ];

    const res = reconciliarColeccionLWWConReporte(locales, remotos);
    expect(res.items[0].monto).toBe(1500);
    expect(res.sobrescritosLocales).toHaveLength(1);
    expect(res.sobrescritosLocales[0].id).toBe('via-1');
  });
});
