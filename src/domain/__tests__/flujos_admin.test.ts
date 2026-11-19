import { beforeEach, describe, expect, it } from 'vitest';
import { LocalRepositorioOperacion } from '../../data/LocalRepositorioOperacion';
import type { Proyecto, Viatico } from '../../types/domain';
import { parseGeoJsonText, parseKmzOrKmlFile } from '../../utils/kmzParser';
import {
  calcularCombustibleGpsRuta,
  calcularCotizacionServicioVigente,
  calcularReporteViaticosPorProyecto,
  detectarConflictosAsignacion,
  obtenerFactoresTerrenoVigentes,
  obtenerReglasViaticosVigentes,
  obtenerServiciosVigentes,
  proyectarSnapshotParaRol,
  validarResolucionConflictos,
} from '../index';

function installMemoryLocalStorage() {
  const store = new Map<string, string>();
  const mockStorage: Storage = {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
  };
  Object.defineProperty(globalThis, 'localStorage', {
    value: mockStorage,
    configurable: true,
    writable: true,
  });
}

describe('Flujos Admin y Coordinador (F2 a F16) — SIRIUS', () => {
  let repo: LocalRepositorioOperacion;

  beforeEach(async () => {
    installMemoryLocalStorage();
    repo = new LocalRepositorioOperacion();
    await repo.iniciarSesion('coordinador@aiaservices.do', 'demo123');
  });

  it('F2: Crea cliente y proyecto en estado cotizado con presupuesto y valor contrato ocultos al técnico', async () => {
    const cli = await repo.crearCliente('emp-aia', {
      nombre: 'Desarrollos Turísticos Bávaro SRL',
      rnc: '1-31-99887-2',
      contacto: 'Arq. Pablo Núñez',
      telefono: '809-555-7700',
    });

    const proy = await repo.crearProyecto('emp-aia', {
      clienteId: cli.id,
      nombre: 'Deslinde Parcela Costa Este',
      codigoContrato: 'AIA-2026-0999',
      presupuestoViaticosRD: 32500,
      valorContratoRD: 295000,
      notas: 'Proyecto piloto F2',
    });

    expect(proy.estado).toBe('cotizado');
    expect(proy.presupuestoViaticosRD).toBe(32500);
    expect(proy.valorContratoRD).toBe(295000);

    const snap = await repo.cargarSnapshotEmpresa('emp-aia');
    const proyCoord = proyectarSnapshotParaRol({
      snapshot: snap,
      rol: 'coordinador',
      usuarioId: 'usr-coord',
    });
    expect(proyCoord.rol).toBe('coordinador');
    if (proyCoord.rol === 'coordinador') {
      const encontrado = proyCoord.snapshot.proyectos.find((p) => p.id === proy.id);
      expect(encontrado?.presupuestoViaticosRD).toBe(32500);
      expect(encontrado?.valorContratoRD).toBe(295000);
    }

    const proyTec = proyectarSnapshotParaRol({
      snapshot: snap,
      rol: 'tecnico',
      usuarioId: 'usr-tec1',
      personalIdMembresia: 'per-1',
    });
    expect(proyTec.rol).toBe('tecnico');
    if (proyTec.rol === 'tecnico') {
      for (const p of proyTec.snapshot.proyectos) {
        expect('presupuestoViaticosRD' in p).toBe(false);
        expect('valorContratoRD' in p).toBe(false);
      }
    }
  });

  it('F3: Parsea GeoJSON válido en RD UTM 19N y rechaza archivos inválidos sin crear registros', async () => {
    const geojsonValido = JSON.stringify({
      type: 'FeatureCollection',
      name: 'Lotificación Bávaro Norte',
      features: [
        {
          type: 'Feature',
          properties: {
            nombre: 'Parcela 214-A',
            codigo: 'DC-10-PARC-2026-2140',
            provincia: 'La Altagracia',
            cliente: 'Inversiones Este SAS',
          },
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [-68.42185, 18.6341],
                [-68.4162, 18.63495],
                [-68.4151, 18.6304],
                [-68.42185, 18.6341],
              ],
            ],
          },
        },
      ],
    });

    const parsed = parseGeoJsonText(geojsonValido, 'bavaro_214a.geojson');
    expect(parsed.features).toHaveLength(1);
    expect(parsed.totalAreaM2).toBeGreaterThan(50000);
    expect(parsed.totalPerimeterM).toBeGreaterThan(1000);
    expect(parsed.autoMeta.parcelCode).toBe('DC-10-PARC-2026-2140');
    expect(parsed.autoMeta.province).toBe('La Altagracia');
    expect(parsed.estimatedViaticos.totalBudgetRD).toBeGreaterThan(0);

    // Casos inválidos
    expect(() => parseGeoJsonText('{ json roto', 'roto.geojson')).toThrow(/JSON válido/i);
    expect(() =>
      parseGeoJsonText(JSON.stringify({ type: 'FeatureCollection', features: [] }), 'vacio.geojson')
    ).toThrow(/FeatureCollection|geometría válida/i);
    expect(() =>
      parseGeoJsonText(
        JSON.stringify({ type: 'FeatureCollection', features: [{ type: 'Feature', geometry: null }] }),
        'sin_geom.geojson'
      )
    ).toThrow(/No se encontraron polígonos/i);

    const archivoInvalido = new File(['contenido invalido'], 'plano.txt', { type: 'text/plain' });
    await expect(parseKmzOrKmlFile(archivoInvalido)).rejects.toThrow(/Formato no soportado/i);

    const kmzCorrupto = new File(['no-es-un-zip'], 'corrupto.kmz', {
      type: 'application/vnd.google-earth.kmz',
    });
    await expect(parseKmzOrKmlFile(kmzCorrupto)).rejects.toThrow(/corrupto|ZIP válido/i);

    // El repositorio tampoco crea ruta si no hay geometrías válidas
    const antes = (await repo.cargarSnapshotEmpresa('emp-aia')).rutas.length;
    await expect(
      repo.crearRuta('emp-aia', {
        proyectoId: 'proy-1',
        nombre: 'Ruta vacía',
        codigoParcela: 'DC-01-0000',
        ubicacion: 'Santo Domingo',
        provincia: 'Distrito Nacional',
        fechaPrevista: '2026-11-28',
        kmzFileName: 'vacio.geojson',
        features: [],
        centroid: parsed.centroid,
        totalAreaM2: 0,
        totalPerimeterM: 0,
      })
    ).rejects.toThrow(/al menos una geometría/i);
    const despues = (await repo.cargarSnapshotEmpresa('emp-aia')).rutas.length;
    expect(despues).toBe(antes);
  });

  it('F4: Cotiza servicio en ruta, aprueba (cotizado -> aprobado) y actualiza presupuesto en proyecto', async () => {
    const snapInicial = await repo.cargarSnapshotEmpresa('emp-aia');
    const proy1 = snapInicial.proyectos.find((p) => p.id === 'proy-1')!;
    const presupAnterior = proy1.presupuestoViaticosRD;

    const srvCotizado = await repo.crearServicio('emp-aia', {
      rutaId: 'ruta-1',
      tipoServicioId: 'ingenieria',
      nombre: 'Ingeniería Vial y Nivelación',
      cotizacionRD: 62000,
      estado: 'cotizado',
      notas: 'Calculado desde calculadora de rutas',
    });
    expect(srvCotizado.estado).toBe('cotizado');

    const srvActualizado = await repo.actualizarServicio('emp-aia', {
      ...srvCotizado,
      cotizacionRD: 68500,
    });
    expect(srvActualizado.cotizacionRD).toBe(68500);

    const srvAprobado = await repo.transicionarServicio({
      empresaId: 'emp-aia',
      servicioId: srvCotizado.id,
      nuevoEstado: 'aprobado',
    });
    expect(srvAprobado.estado).toBe('aprobado');

    const proyActualizado = await repo.actualizarProyecto('emp-aia', {
      ...proy1,
      presupuestoViaticosRD: presupAnterior + 4500,
    });
    expect(proyActualizado.presupuestoViaticosRD).toBe(presupAnterior + 4500);

    const snapFinal = await repo.cargarSnapshotEmpresa('emp-aia');
    const eventos = snapFinal.historial.filter(
      (h) => h.entidadId === srvCotizado.id || h.entidadId === proy1.id
    );
    expect(eventos.some((e) => e.valorAnterior === 'cotizado' && e.valorNuevo === 'aprobado')).toBe(
      true
    );
    expect(
      eventos.some((e) => e.entidadId === proy1.id && e.valorAnterior && e.valorNuevo)
    ).toBe(true);
  });

  it('F5-F7: Reasignación excluye su propia asignación y valida conflictos multi-día + override auditado', async () => {
    const snap = await repo.cargarSnapshotEmpresa('emp-aia');
    const asig1 = snap.asignaciones.find((a) => a.id === 'asig-1')!; // ruta-1, cua-1, veh-1, eq-1

    // Reasignar la misma asignación extendiendo fechaFin 1 día (sin chocar con asig-3 en en5Dias..en6Dias)
    // no debe generar auto-conflicto consigo misma
    const autoConflictos = detectarConflictosAsignacion({
      candidata: {
        id: asig1.id,
        rutaId: asig1.rutaId,
        fechaInicio: asig1.fechaInicio,
        fechaFin: asig1.fechaFin,
        cuadrillaId: asig1.cuadrillaId,
        vehiculoIds: asig1.vehiculoIds,
        equipoIds: asig1.equipoIds,
      },
      asignacionesExistentes: snap.asignaciones,
      rutas: snap.rutas,
      cuadrillas: snap.cuadrillas,
      personal: snap.personal,
      vehiculos: snap.vehiculos,
      equipos: snap.equipos,
    });
    expect(autoConflictos).toHaveLength(0);

    // Intentar crear nueva asignación en ruta-4 solapando el rango de asig-1 con la misma cuadrilla y vehículo
    await expect(
      repo.guardarAsignacion('emp-aia', {
        rutaId: 'ruta-4',
        fechaInicio: asig1.fechaInicio,
        fechaFin: asig1.fechaFin,
        cuadrillaId: asig1.cuadrillaId,
        vehiculoIds: ['veh-1'],
        equipoIds: ['eq-1'],
      })
    ).rejects.toThrow(/motivo de excepción/i);

    // Con override completo sí permite y guarda auditoría con motivo
    const conOverride = await repo.guardarAsignacion('emp-aia', {
      rutaId: 'ruta-4',
      fechaInicio: asig1.fechaInicio,
      fechaFin: asig1.fechaFin,
      cuadrillaId: asig1.cuadrillaId,
      vehiculoIds: ['veh-1'],
      equipoIds: ['eq-1'],
      overrideConflicto: {
        motivo: 'Levantamiento exprés en horario vespertino aprobado por dirección',
        usuarioId: 'usr-coord',
        usuarioNombre: 'Lic. Patricia Vargas',
        fecha: new Date().toISOString(),
      },
    });
    expect(conOverride.overrideConflicto?.motivo).toContain('horario vespertino');

    // Reasignar esa asignación cambiándole de cuadrilla (a cua-2, en fechas libres +10/+11)
    const reasignada = await repo.guardarAsignacion('emp-aia', {
      id: conOverride.id,
      rutaId: 'ruta-4',
      fechaInicio: '2026-12-10',
      fechaFin: '2026-12-11',
      cuadrillaId: 'cua-2',
      vehiculoIds: ['veh-2'],
      equipoIds: ['eq-2'],
    });
    expect(reasignada.version).toBe(2);
    expect(reasignada.cuadrillaId).toBe('cua-2');

    const snapDespues = await repo.cargarSnapshotEmpresa('emp-aia');
    const histReasignacion = snapDespues.historial.find(
      (h) => h.entidadId === conOverride.id && h.accion.includes('reasignada')
    );
    expect(histReasignacion).toBeDefined();
    expect(histReasignacion?.valorAnterior).toContain('Brigada Este Alpha');
    expect(histReasignacion?.valorNuevo).toContain('Brigada Cibao Sur');
  });

  it('F9: Paso de entregado a cobrado exige montoCobradoRD > 0 y fechaPago y persiste en auditoría', async () => {
    await expect(
      repo.transicionarServicio({
        empresaId: 'emp-aia',
        servicioId: 'srv-5', // seed: estado 'entregado'
        nuevoEstado: 'cobrado',
        payload: { montoCobradoRD: 0, fechaPago: '' },
      })
    ).rejects.toThrow(/montoCobradoRD/i);

    const cobrado = await repo.transicionarServicio({
      empresaId: 'emp-aia',
      servicioId: 'srv-5',
      nuevoEstado: 'cobrado',
      payload: { montoCobradoRD: 115000, fechaPago: '2026-11-18' },
    });

    expect(cobrado.estado).toBe('cobrado');
    expect(cobrado.montoCobradoRD).toBe(115000);
    expect(cobrado.fechaPago).toBe('2026-11-18');

    const snap = await repo.cargarSnapshotEmpresa('emp-aia');
    const hist = snap.historial.find(
      (h) => h.entidadId === 'srv-5' && h.accion === 'Estado servicio -> cobrado'
    );
    expect(hist?.valorAnterior).toBe('entregado');
    expect(hist?.valorNuevo).toContain('115,000');
    expect(hist?.valorNuevo).toContain('2026-11-18');
  });

  it('F11-F13: Reparto exacto, aprobación con motivo y reporte general por proyecto (presupuesto, ejecutado, saldo)', async () => {
    const proyectos: Array<Pick<Proyecto, 'id' | 'codigoContrato' | 'nombre' | 'presupuestoViaticosRD'>> =
      [
        { id: 'p1', codigoContrato: 'C-01', nombre: 'Proyecto Uno', presupuestoViaticosRD: 10000 },
        { id: 'p2', codigoContrato: 'C-02', nombre: 'Proyecto Dos', presupuestoViaticosRD: 3000 },
      ];
    const viaticos: Viatico[] = [
      {
        id: 'v1',
        empresaId: 'emp-aia',
        creadoPorUsuarioId: 'usr-tec1',
        creadoPorNombre: 'Carlos',
        fechaIso: '2026-11-18',
        timestampAST: '18/11/2026 08:00:00 AST',
        categoria: 'Combustible',
        comercio: 'Texaco',
        montoRD: 6000,
        itbisRD: 0,
        metodo: 'OCR Móvil',
        estadoAprobacion: 'aprobado',
        motivoDecision: 'Verificado con odómetro',
        repartos: [
          { proyectoId: 'p1', montoRD: 4000 },
          { proyectoId: 'p2', montoRD: 1500 },
          { proyectoId: 'sin_asignar', montoRD: 500 },
        ],
        version: 1,
        updatedAt: '2026-11-18T10:00:00Z',
        syncStatus: 'synced',
      },
      {
        id: 'v2',
        empresaId: 'emp-aia',
        creadoPorUsuarioId: 'usr-tec1',
        creadoPorNombre: 'Carlos',
        fechaIso: '2026-11-18',
        timestampAST: '18/11/2026 09:00:00 AST',
        categoria: 'Dieta',
        comercio: 'Restaurante Sur',
        montoRD: 2000,
        itbisRD: 0,
        metodo: 'Manual',
        estadoAprobacion: 'pendiente',
        repartos: [{ proyectoId: 'p2', montoRD: 2000 }],
        version: 1,
        updatedAt: '2026-11-18T10:10:00Z',
        syncStatus: 'synced',
      },
      {
        id: 'v3',
        empresaId: 'emp-aia',
        creadoPorUsuarioId: 'usr-tec1',
        creadoPorNombre: 'Carlos',
        fechaIso: '2026-11-18',
        timestampAST: '18/11/2026 09:30:00 AST',
        categoria: 'Peaje',
        comercio: 'Peaje Duplicado',
        montoRD: 5000,
        itbisRD: 0,
        metodo: 'Manual',
        estadoAprobacion: 'rechazado',
        motivoRechazo: 'Duplicado',
        repartos: [{ proyectoId: 'p1', montoRD: 5000 }],
        version: 1,
        updatedAt: '2026-11-18T10:20:00Z',
        syncStatus: 'synced',
      },
    ];

    const rep = calcularReporteViaticosPorProyecto(proyectos, viaticos);
    const fila1 = rep.filas.find((f) => f.proyectoId === 'p1')!;
    const fila2 = rep.filas.find((f) => f.proyectoId === 'p2')!;

    expect(fila1).toMatchObject({
      presupuestoRD: 10000,
      aprobadoRD: 4000,
      pendienteRD: 0,
      ejecutadoRD: 4000,
      saldoRD: 6000,
      excedido: false,
    });
    expect(fila2).toMatchObject({
      presupuestoRD: 3000,
      aprobadoRD: 1500,
      pendienteRD: 2000,
      ejecutadoRD: 3500,
      saldoRD: -500,
      excedido: true,
    });
    expect(rep.sinAsignar).toEqual({ aprobadoRD: 500, pendienteRD: 0, ejecutadoRD: 500 });
    expect(rep.totales).toEqual({
      presupuestoRD: 13000,
      aprobadoRD: 6000,
      pendienteRD: 2000,
      ejecutadoRD: 8000,
      saldoRD: 5000,
    });

    // En repositorio: aprobar viático pendiente con motivoDecision y verificar auditoría
    const viaAprobado = await repo.decidirViatico({
      empresaId: 'emp-aia',
      viaticoId: 'via-3',
      nuevoEstado: 'aprobado',
      motivoDecision: 'Dieta validada contra bitácora de brigada',
    });
    expect(viaAprobado.estadoAprobacion).toBe('aprobado');
    expect(viaAprobado.motivoDecision).toBe('Dieta validada contra bitácora de brigada');

    // Redistribuir reparto en via-1 exige suma exacta (4500)
    await expect(
      repo.actualizarRepartoViatico('emp-aia', 'via-1', [{ proyectoId: 'proy-1', montoRD: 4000 }])
    ).rejects.toThrow(/igualar exactamente/i);

    const viaRepartido = await repo.actualizarRepartoViatico('emp-aia', 'via-1', [
      { proyectoId: 'proy-1', montoRD: 4200 },
      { proyectoId: 'sin_asignar', montoRD: 300 },
    ]);
    expect(viaRepartido.repartos).toHaveLength(2);
  });

  it('F14 y F16: Vehículo en mantenimiento y cuadrilla dada de baja bloquean asignación sin borrar historial', async () => {
    const snapAntes = await repo.cargarSnapshotEmpresa('emp-aia');
    const totalAsignacionesAntes = snapAntes.asignaciones.length;
    const totalBitacorasAntes = snapAntes.bitacoras.length;
    const totalViaticosAntes = snapAntes.viaticos.length;

    // 1. Vehículo veh-3 en seed está 'en_mantenimiento' -> bloquea sin override posible
    const conflictosMaint = detectarConflictosAsignacion({
      candidata: {
        id: 'asig-test-veh',
        rutaId: 'ruta-4',
        fechaInicio: '2026-12-20',
        fechaFin: '2026-12-20',
        cuadrillaId: 'cua-1',
        vehiculoIds: ['veh-3'],
        equipoIds: ['eq-3'],
      },
      asignacionesExistentes: snapAntes.asignaciones,
      rutas: snapAntes.rutas,
      cuadrillas: snapAntes.cuadrillas,
      personal: snapAntes.personal,
      vehiculos: snapAntes.vehiculos,
      equipos: snapAntes.equipos,
    });
    expect(conflictosMaint.some((c) => c.type === 'vehiculo_mantenimiento' && !c.permiteOverride)).toBe(
      true
    );
    expect(
      validarResolucionConflictos(conflictosMaint, {
        motivo: 'Intento forzado',
        usuarioId: 'usr-coord',
        usuarioNombre: 'Coord',
        fecha: new Date().toISOString(),
      }).valido
    ).toBe(false);

    await expect(
      repo.guardarAsignacion('emp-aia', {
        rutaId: 'ruta-4',
        fechaInicio: '2026-12-20',
        fechaFin: '2026-12-20',
        cuadrillaId: 'cua-1',
        vehiculoIds: ['veh-3'],
        equipoIds: ['eq-3'],
      })
    ).rejects.toThrow(/En mantenimiento/i);

    // 2. Dar de baja a un miembro del personal y a una cuadrilla no borra historial, bitácoras ni asignaciones
    const per3 = snapAntes.personal.find((p) => p.id === 'per-3')!;
    const perBaja = await repo.guardarPersonal('emp-aia', { ...per3, activo: false });
    expect(perBaja.activo).toBe(false);

    const cua2 = snapAntes.cuadrillas.find((c) => c.id === 'cua-2')!;
    const cuaBaja = await repo.guardarCuadrilla('emp-aia', { ...cua2, activa: false });
    expect(cuaBaja.activa).toBe(false);

    // Asignar cuadrilla dada de baja debe ser bloqueado de forma dura (sin override)
    await expect(
      repo.guardarAsignacion('emp-aia', {
        rutaId: 'ruta-4',
        fechaInicio: '2026-12-22',
        fechaFin: '2026-12-22',
        cuadrillaId: 'cua-2',
        vehiculoIds: ['veh-2'],
        equipoIds: ['eq-2'],
        overrideConflicto: {
          motivo: 'Intento de usar cuadrilla dada de baja',
          usuarioId: 'usr-coord',
          usuarioNombre: 'Coord',
          fecha: new Date().toISOString(),
        },
      })
    ).rejects.toThrow(/dada de baja/i);

    // Verifica que todo el historial y colecciones previas permanecen intactos + F16 trazabilidad
    const snapDespues = await repo.cargarSnapshotEmpresa('emp-aia');
    expect(snapDespues.asignaciones).toHaveLength(totalAsignacionesAntes);
    expect(snapDespues.bitacoras).toHaveLength(totalBitacorasAntes);
    expect(snapDespues.viaticos).toHaveLength(totalViaticosAntes);

    const histBajaPersonal = snapDespues.historial.find(
      (h) => h.entidadId === 'per-3' && h.accion === 'Personal dado de baja'
    );
    const histBajaCuadrilla = snapDespues.historial.find(
      (h) => h.entidadId === 'cua-2' && h.accion === 'Cuadrilla dada de baja'
    );
    expect(histBajaPersonal?.usuarioId).toBe('usr-coord');
    expect(histBajaPersonal?.valorAnterior).toContain('Activo');
    expect(histBajaPersonal?.valorNuevo).toContain('De baja');
    expect(histBajaCuadrilla?.usuarioId).toBe('usr-coord');
    expect(histBajaCuadrilla?.valorAnterior).toContain('Activa');
    expect(histBajaCuadrilla?.valorNuevo).toContain('De baja');
  });

  it('Configuración versionada: registros guardados con configVersion v1 no cambian al agregar vigencias v2 y plan/suscripción permanecen bloqueados', async () => {
    await repo.iniciarSesion('admin@aiaservices.do', 'demo123');
    const snapV1 = await repo.cargarSnapshotEmpresa('emp-aia');
    const configV1 = snapV1.configuracion!;

    // 1. Verificar bloqueo de planMensualRD y estadoSuscripcion desde cliente
    const empEditada = await repo.actualizarEmpresa({
      ...snapV1.empresa,
      nombre: 'AIA Services SRL Actualizada',
      planMensualRD: 0,
      estadoSuscripcion: 'suspendida',
    });
    expect(empEditada.nombre).toBe('AIA Services SRL Actualizada');
    expect(empEditada.planMensualRD).toBe(snapV1.empresa.planMensualRD);
    expect(empEditada.estadoSuscripcion).toBe(snapV1.empresa.estadoSuscripcion);

    // 2. Guardar servicio y viático usando tarifas vigentes v1 (2026-11-18)
    const deslindeV1 = obtenerServiciosVigentes(configV1, '2026-11-18').find(
      (s) => s.codigo === 'deslinde'
    )!;
    const terrenoV1 = obtenerFactoresTerrenoVigentes(configV1, '2026-11-18');
    const reglasV1 = obtenerReglasViaticosVigentes(configV1, '2026-11-18');

    const cotV1 = calcularCotizacionServicioVigente({
      servicio: deslindeV1,
      areaM2: 20000,
      corridorKm: 0,
      terrain: 'Llano',
      factoresTerreno: terrenoV1,
    });
    const gpsV1 = calcularCombustibleGpsRuta({
      distanciaOneWayKm: 20,
      regla: reglasV1.gpsRuta,
    });

    const srvHistorico = await repo.crearServicio('emp-aia', {
      rutaId: 'ruta-1',
      tipoServicioId: 'deslinde',
      nombre: 'Deslinde Histórico v1',
      cotizacionRD: cotV1.totalRD,
      configVersion: deslindeV1.version,
      tarifaBaseUsadaRD: deslindeV1.precioBaseRD,
      recargosUsadosRD: cotV1.areaSurchargeRD,
      estado: 'cotizado',
    });

    const viaHistorico = await repo.registrarViatico('emp-aia', {
      creadoPorUsuarioId: 'usr-admin',
      creadoPorNombre: 'Ing. Roberto Almonte',
      rutaId: 'ruta-1',
      fechaIso: '2026-11-18',
      timestampAST: '18/11/2026 11:00:00 AST',
      categoria: 'Combustible',
      comercio: 'GPS Ruta (v1)',
      montoRD: gpsV1.montoRD,
      itbisRD: 0,
      metodo: 'GPS Ruta',
      configVersion: reglasV1.version,
      tarifaUsadaRD: reglasV1.gpsRuta.tarifaPorKmRD,
      repartos: [{ proyectoId: 'proy-1', montoRD: gpsV1.montoRD }],
      syncStatus: 'synced',
    });

    // 3. Agregar nuevas vigencias v2 desde 2026-11-19 con precios mucho más altos
    await repo.agregarVigenciaServicio({
      empresaId: 'emp-aia',
      servicioCodigo: 'deslinde',
      tarifa: {
        vigenciaDesde: '2026-11-19',
        precioBaseRD: 150000,
        recargoCorredorPorKmRD: 0,
        recargoAreaPorHaExtraRD: 8000,
        umbralAreaBaseM2: 8000,
      },
    });
    await repo.agregarVigenciaReglasViaticos({
      empresaId: 'emp-aia',
      reglas: {
        ...reglasV1,
        vigenciaDesde: '2026-11-19',
        gpsRuta: {
          tarifaPorKmRD: 45,
          minimoKm: 16,
          conceptoDistancia: 'ida_vuelta',
        },
      },
    });

    // 4. Reinstanciar repositorio desde localStorage para verificar persistencia real
    const repoRecargado = new LocalRepositorioOperacion();
    await repoRecargado.iniciarSesion('admin@aiaservices.do', 'demo123');
    const snapDespues = await repoRecargado.cargarSnapshotEmpresa('emp-aia');

    const srvRecargado = snapDespues.servicios.find((s) => s.id === srvHistorico.id)!;
    const viaRecargado = snapDespues.viaticos.find((v) => v.id === viaHistorico.id)!;

    // Los registros guardados con v1 conservan exactamente sus montos, tarifas usadas y configVersion=1
    expect(srvRecargado.configVersion).toBe(1);
    expect(srvRecargado.tarifaBaseUsadaRD).toBe(75000);
    expect(srvRecargado.cotizacionRD).toBe(cotV1.totalRD);

    expect(viaRecargado.configVersion).toBe(1);
    expect(viaRecargado.tarifaUsadaRD).toBe(26.5);
    expect(viaRecargado.montoRD).toBe(gpsV1.montoRD);

    // Mientras tanto, nuevos cálculos para >= 2026-11-19 usan v2
    const deslindeV2 = obtenerServiciosVigentes(snapDespues.configuracion!, '2026-11-19').find(
      (s) => s.codigo === 'deslinde'
    )!;
    const reglasV2 = obtenerReglasViaticosVigentes(snapDespues.configuracion!, '2026-11-19');
    expect(deslindeV2.version).toBe(2);
    expect(deslindeV2.precioBaseRD).toBe(150000);
    expect(reglasV2.version).toBe(2);
    expect(reglasV2.gpsRuta.tarifaPorKmRD).toBe(45);
  });
});
