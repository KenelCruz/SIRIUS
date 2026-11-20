import { beforeEach, describe, expect, it } from 'vitest';
import { LocalRepositorioOperacion } from '../../data/LocalRepositorioOperacion';
import {
  CARGOS_BASE_INICIALES,
  CATEGORIAS_VIATICO,
  ERROR_TECNICO_SIN_PERSONAL,
  UMBRAL_ALERTA_RENDIMIENTO_PCT_DEFAULT,
  UMBRAL_CERCANIA_RENTA_KM_DEFAULT,
  calcularRendimientoFlota,
  calcularReporteViaticosPorMision,
  calcularReporteViaticosPorProyecto,
  calcularTotalesRenta,
  crearConfiguracionInicialEmpresa,
  detectarConflictosAsignacion,
  detectarConflictosRenta,
  evaluarTopeViaticoEnMision,
  generarCsvReporteMisiones,
  obtenerRentasVencidasSinDevolucion,
  obtenerTopeViaticoParaCargoCategoria,
  puedeEditarViatico,
  resolverPersonalYCargoUsuario,
  validarEdicionViatico,
  validarEliminarCargo,
  validarNuevaVigenciaTopeViatico,
  validarRenta,
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

describe('Fase B (B1–B5): Topes, Cargo Administrativo, Misiones, Rentas y Rendimiento', () => {
  let repo: LocalRepositorioOperacion;

  beforeEach(async () => {
    installMemoryLocalStorage();
    repo = new LocalRepositorioOperacion();
    await repo.iniciarSesion('admin@aiaservices.do', 'demo123');
  });

  it('B1: Incluye cargo base "administrativo" no eliminable y topes provisionales con los mismos montos iniciales que jefe_brigada', () => {
    const adminCargo = CARGOS_BASE_INICIALES.find((c) => c.codigo === 'administrativo');
    expect(adminCargo).toBeDefined();
    expect(adminCargo?.etiqueta).toBe('Administrativo');
    expect(adminCargo?.esBase).toBe(true);

    const config = crearConfiguracionInicialEmpresa('emp-aia');
    const delCheck = validarEliminarCargo({
      codigo: 'administrativo',
      cargos: config.cargos,
      personal: [],
    });
    expect(delCheck.valido).toBe(false);

    for (const cat of CATEGORIAS_VIATICO) {
      const topeAdmin = obtenerTopeViaticoParaCargoCategoria({
        config,
        cargoCodigo: 'administrativo',
        categoria: cat,
      });
      const topeJefe = obtenerTopeViaticoParaCargoCategoria({
        config,
        cargoCodigo: 'jefe_brigada',
        categoria: cat,
      });
      expect(topeAdmin).toBeDefined();
      expect(topeAdmin?.esEjemploPendienteConfirmar).toBe(true);
      expect(topeAdmin?.montoMaximoPorMisionRD).toBe(topeJefe?.montoMaximoPorMisionRD);
    }

    const topeTecnicoDieta = config.topesViatico.find(
      (t) => t.cargoCodigo === 'tecnico' && t.categoria === 'Dieta'
    )!;
    expect(
      validarNuevaVigenciaTopeViatico(topeTecnicoDieta.versiones, {
        vigenciaDesde: '2026-01-01',
        montoMaximoPorMisionRD: 1000,
      }).valido
    ).toBe(false);

    expect(
      validarNuevaVigenciaTopeViatico(topeTecnicoDieta.versiones, {
        vigenciaDesde: '2026-12-01',
        montoMaximoPorMisionRD: -50,
      }).valido
    ).toBe(false);

    const topeHosp0 = validarNuevaVigenciaTopeViatico(topeTecnicoDieta.versiones, {
      vigenciaDesde: '2026-12-01',
      montoMaximoPorMisionRD: 0,
    });
    expect(topeHosp0.valido).toBe(true);
    expect(topeHosp0.advertencia).toBeTruthy();
  });

  it('B2: Gasto sin misión no valida topes ni genera excedente incluso si supera cualquier tope de ejemplo', async () => {
    const snap = await repo.cargarSnapshotEmpresa('emp-aia');
    const config = snap.configuracion!;

    const evalSinMision = evaluarTopeViaticoEnMision({
      misionId: undefined,
      categoria: 'Dieta',
      montoRD: 99000,
      cargoCodigo: 'tecnico',
      usuarioId: 'usr-admin',
      viaticosExistentes: snap.viaticos,
      config,
    });
    expect(evalSinMision.superaTope).toBe(false);
    expect(evalSinMision.excedenteRD).toBe(0);
    expect(evalSinMision.motivoExcedenteRequerido).toBe(false);

    const registrado = await repo.registrarViatico('emp-aia', {
      creadoPorUsuarioId: 'usr-admin',
      creadoPorNombre: 'Ing. Roberto Almonte (Admin)',
      rutaId: 'ruta-1',
      fechaIso: '2026-11-20',
      timestampAST: '2026-11-20 10:00:00 AST',
      categoria: 'Dieta',
      comercio: 'Almuerzo Oficina Central',
      montoRD: 25000,
      itbisRD: 0,
      metodo: 'Manual',
      repartos: [{ proyectoId: 'proy-1', montoRD: 25000 }],
      syncStatus: 'pending',
    });

    expect(registrado.misionId).toBeUndefined();
    expect(registrado.excedenteRD).toBeUndefined();
    expect(registrado.motivoExcedente).toBeUndefined();
    expect(registrado.cargoUsado).toBe('administrativo');
  });

  it('B2: Técnico sin personalId no puede registrar viático de campo; admin/coordinador sin personalId usan cargo administrativo', async () => {
    await repo.guardarMembresiaUsuario({
      empresaId: 'emp-aia',
      email: 'sinpersonal@aiaservices.do',
      nombre: 'Técnico Sin Vínculo',
      rol: 'tecnico',
      personalId: undefined,
      activo: true,
    });

    const snapAntes = await repo.cargarSnapshotEmpresa('emp-aia');
    const resAdmin = resolverPersonalYCargoUsuario({
      usuarioId: 'usr-admin',
      rol: 'admin',
      personalIdMembresia: undefined,
      personal: snapAntes.personal,
    });
    expect(resAdmin.error).toBeUndefined();
    expect(resAdmin.cargoCodigo).toBe('administrativo');

    await repo.iniciarSesion('sinpersonal@aiaservices.do', 'demo123');
    await expect(
      repo.registrarViatico('emp-aia', {
        creadoPorUsuarioId: snapAntes.usuarios.find(
          (u) => u.email === 'sinpersonal@aiaservices.do'
        )!.id,
        creadoPorNombre: 'Técnico Sin Vínculo',
        rutaId: 'ruta-1',
        fechaIso: '2026-11-20',
        timestampAST: '2026-11-20 11:00:00 AST',
        categoria: 'Dieta',
        comercio: 'Comedor Campo',
        montoRD: 500,
        itbisRD: 0,
        metodo: 'Manual',
        repartos: [{ proyectoId: 'proy-1', montoRD: 500 }],
        syncStatus: 'pending',
      })
    ).rejects.toThrow(ERROR_TECNICO_SIN_PERSONAL);
  });

  it('B2: Excedente acumulado en misión requiere motivo; cargo_colaborador descuenta el excedente de proyectos y reportes', async () => {
    await repo.iniciarSesion('carlos@aiaservices.do', 'demo123');

    // via-3 en mis-1 ya tiene Dieta por 4400 (pendiente) del jefe_brigada per-1 (tope Dieta jefe_brigada = 2800).
    // Si registra otro gasto de Dieta de 1000 en mis-1 sin motivoExcedente debe fallar.
    await expect(
      repo.registrarViatico('emp-aia', {
        creadoPorUsuarioId: 'usr-tec1',
        creadoPorNombre: 'Ing. Carlos Méndez',
        misionId: 'mis-1',
        rutaId: 'ruta-1',
        fechaIso: '2026-11-20',
        timestampAST: '2026-11-20 13:00:00 AST',
        categoria: 'Dieta',
        comercio: 'Cena Brigada',
        montoRD: 1000,
        itbisRD: 0,
        metodo: 'Manual',
        repartos: [{ proyectoId: 'proy-1', montoRD: 1000 }],
        syncStatus: 'pending',
      })
    ).rejects.toThrow();

    // Tope 0 en Hospedaje para cargo personalizado debe avisar y exigir motivo
    await repo.iniciarSesion('admin@aiaservices.do', 'demo123');
    await repo.agregarVigenciaTopeViatico({
      empresaId: 'emp-aia',
      cargoCodigo: 'jefe_brigada',
      categoria: 'Otro',
      vigenciaDesde: '2026-11-19',
      montoMaximoPorMisionRD: 0,
    });
    const snapTope0 = await repo.cargarSnapshotEmpresa('emp-aia');
    const evalTope0 = evaluarTopeViaticoEnMision({
      misionId: 'mis-1',
      categoria: 'Otro',
      montoRD: 300,
      cargoCodigo: 'jefe_brigada',
      usuarioId: 'usr-tec1',
      personalId: 'per-1',
      viaticosExistentes: snapTope0.viaticos,
      config: snapTope0.configuracion!,
      fechaCalculoIso: '2026-11-20',
    });
    expect(evalTope0.categoriaNoPermitida).toBe(true);
    expect(evalTope0.motivoExcedenteRequerido).toBe(true);
    expect(evalTope0.excedenteRD).toBe(300);

    // Ahora probamos la decisión con cargo al colaborador sobre via-3 (monto 4400, tope 2800, excedente 1600)
    await repo.iniciarSesion('coordinador@aiaservices.do', 'demo123');
    await expect(
      repo.decidirViatico({
        empresaId: 'emp-aia',
        viaticoId: 'via-3',
        nuevoEstado: 'aprobado',
      })
    ).rejects.toThrow();

    const aprobadoCargoColab = await repo.decidirViatico({
      empresaId: 'emp-aia',
      viaticoId: 'via-3',
      nuevoEstado: 'aprobado',
      decisionExcedente: 'cargo_colaborador',
      motivoDecision: 'Excedente fuera de política asumido por colaborador',
    });

    expect(aprobadoCargoColab.estadoAprobacion).toBe('aprobado');
    expect(aprobadoCargoColab.montoCargoColaboradorRD).toBe(1600);
    expect(aprobadoCargoColab.montoAprobadoEmpresaRD).toBe(2800);
    expect(aprobadoCargoColab.repartos.reduce((s, r) => s + r.montoRD, 0)).toBe(2800);

    const snapPost = await repo.cargarSnapshotEmpresa('emp-aia');
    const reporteProy = calcularReporteViaticosPorProyecto(snapPost.proyectos, snapPost.viaticos);
    const proy1 = reporteProy.filas.find((p) => p.proyectoId === 'proy-1')!;
    // via-1 (3850 proy-1) + via-2 (400 proy-1) + via-3 empresa (2800 proy-1) = 7050
    expect(proy1.aprobadoRD).toBe(7050);

    // Bloqueo universal de edición una vez aprobado (aplica a técnico, coordinador Y admin)
    expect(puedeEditarViatico('admin', aprobadoCargoColab, 'usr-admin')).toBe(false);
    expect(puedeEditarViatico('coordinador', aprobadoCargoColab, 'usr-coord')).toBe(false);
    expect(puedeEditarViatico('tecnico', aprobadoCargoColab, 'usr-tec1')).toBe(false);
    expect(
      validarEdicionViatico({ viatico: aprobadoCargoColab, rol: 'admin', usuarioId: 'usr-admin' })
        .valido
    ).toBe(false);

    await repo.iniciarSesion('admin@aiaservices.do', 'demo123');
    await expect(
      repo.editarViatico('emp-aia', 'via-3', {
        misionId: aprobadoCargoColab.misionId,
        rutaId: aprobadoCargoColab.rutaId,
        fechaIso: aprobadoCargoColab.fechaIso,
        timestampAST: aprobadoCargoColab.timestampAST,
        categoria: aprobadoCargoColab.categoria,
        comercio: 'Editado después de aprobar',
        montoRD: 2800,
        itbisRD: 0,
        metodo: aprobadoCargoColab.metodo,
        repartos: [{ proyectoId: 'proy-1', montoRD: 2800 }],
        syncStatus: 'pending',
      })
    ).rejects.toThrow();
  });

  it('B3: Rentas bloquean solapamiento entre rentas, permiten cercanía < 30 km con motivo, bloquean >= 30 km y liberan al devolver', async () => {
    const totales = calcularTotalesRenta({
      tarifaRD: 5000,
      cantidadEstimada: 2,
      incluyeItbis: true,
    });
    expect(totales).toEqual({ subtotalRD: 10000, itbisRD: 1800, costoTotalRD: 11800 });

    const validacionOk = validarRenta({
      recursoTipo: 'vehiculo',
      recursoId: 'veh-2',
      proveedor: 'Rent-A-Car Norte',
      fechaInicio: '2026-12-01',
      fechaFin: '2026-12-03',
      modalidadTarifa: 'por_dia',
      tarifaRD: 5000,
      cantidadEstimada: 2,
      costoTotalRD: 11800,
      repartos: [{ proyectoId: 'proy-1', montoRD: 11800 }],
    });
    expect(validacionOk.valido).toBe(true);

    const snap = await repo.cargarSnapshotEmpresa('emp-aia');
    expect(snap.configuracion).toBeDefined();
    expect(UMBRAL_CERCANIA_RENTA_KM_DEFAULT).toBe(30);

    // veh-1 está asignado a ruta-1 (Bávaro) en fechaInicio..fechaFin = hoy..pasadoManana
    const hoy = snap.asignaciones[0].fechaInicio;
    const fin = snap.asignaciones[0].fechaFin;

    // Ruta cercana a ~3 km de ruta-1 (< 30 km) -> permite override con motivo
    const rutaCercana = {
      ...snap.rutas[0],
      id: 'ruta-cercana-test',
      codigoParcela: 'DC-04-CERCA',
      nombre: 'Anexo Cercano SPM',
      centroid: {
        ...snap.rutas[0].centroid,
        lat: snap.rutas[0].centroid.lat + 0.02,
        lon: snap.rutas[0].centroid.lon + 0.01,
      },
    };
    const confCercana = detectarConflictosRenta({
      candidata: {
        id: 'rent-cerca',
        recursoTipo: 'vehiculo',
        recursoId: 'veh-1',
        rutaId: 'ruta-cercana-test',
        fechaInicio: hoy,
        fechaFin: fin,
        estado: 'activa',
      },
      rentasExistentes: [],
      asignacionesExistentes: snap.asignaciones,
      rutas: [...snap.rutas, rutaCercana],
      misiones: snap.misiones,
      vehiculos: snap.vehiculos,
      equipos: snap.equipos,
      umbralCercaniaKm: 30,
    });
    expect(confCercana.some((c) => c.type === 'renta_cercana' && c.permiteOverride)).toBe(true);

    // ruta-4 está en San Cristóbal (~190 km de ruta-1 Bávaro >= 30 km) -> bloqueo duro
    const confLejana = detectarConflictosRenta({
      candidata: {
        id: 'rent-lejos',
        recursoTipo: 'vehiculo',
        recursoId: 'veh-1',
        rutaId: 'ruta-4',
        fechaInicio: hoy,
        fechaFin: fin,
        estado: 'activa',
      },
      rentasExistentes: [],
      asignacionesExistentes: snap.asignaciones,
      rutas: snap.rutas,
      misiones: snap.misiones,
      vehiculos: snap.vehiculos,
      equipos: snap.equipos,
      umbralCercaniaKm: 30,
    });
    expect(confLejana.some((c) => c.type === 'renta_lejana' && !c.permiteOverride)).toBe(true);

    // Guardar renta activa en veh-2 y probar bloqueo duro de segunda renta solapada + liberación al devolver
    const renta1 = await repo.guardarRenta('emp-aia', {
      recursoTipo: 'vehiculo',
      recursoId: 'veh-2',
      proveedor: 'Flota Este SRL',
      misionId: 'mis-3',
      rutaId: 'ruta-4',
      fechaInicio: '2026-12-10',
      fechaFin: '2026-12-12',
      modalidadTarifa: 'por_dia',
      tarifaRD: 4000,
      cantidadEstimada: 3,
      incluyeItbis: false,
      itbisRD: 0,
      costoTotalRD: 12000,
      estado: 'activa',
      repartos: [{ proyectoId: 'proy-3', montoRD: 12000 }],
    });

    await expect(
      repo.guardarRenta('emp-aia', {
        recursoTipo: 'vehiculo',
        recursoId: 'veh-2',
        proveedor: 'Otra Rentadora',
        fechaInicio: '2026-12-11',
        fechaFin: '2026-12-13',
        modalidadTarifa: 'por_dia',
        tarifaRD: 4000,
        cantidadEstimada: 2,
        incluyeItbis: false,
        itbisRD: 0,
        costoTotalRD: 8000,
        estado: 'reservada',
        repartos: [{ proyectoId: 'proy-3', montoRD: 8000 }],
      })
    ).rejects.toThrow();

    // Detectar renta vencida sin devolución
    const snapConRenta = await repo.cargarSnapshotEmpresa('emp-aia');
    expect(obtenerRentasVencidasSinDevolucion(snapConRenta.rentas, '2026-12-15').some((r) => r.id === renta1.id)).toBe(true);

    // Devolver renta libera el recurso
    const devuelta = await repo.devolverRenta({
      empresaId: 'emp-aia',
      rentaId: renta1.id,
      fechaDevolucion: '2026-12-12',
    });
    expect(devuelta.estado).toBe('finalizada');

    const renta2 = await repo.guardarRenta('emp-aia', {
      recursoTipo: 'vehiculo',
      recursoId: 'veh-2',
      proveedor: 'Otra Rentadora',
      fechaInicio: '2026-12-11',
      fechaFin: '2026-12-13',
      modalidadTarifa: 'por_dia',
      tarifaRD: 4000,
      cantidadEstimada: 2,
      incluyeItbis: false,
      itbisRD: 0,
      costoTotalRD: 8000,
      estado: 'reservada',
      repartos: [{ proyectoId: 'proy-3', montoRD: 8000 }],
    });
    expect(renta2.id).toBeDefined();

    // Vehículo propio (sin renta activa) mantiene override permitido en asignaciones solapadas
    const confPropio = detectarConflictosAsignacion({
      candidata: {
        id: 'asig-test-propio',
        rutaId: 'ruta-4',
        fechaInicio: hoy,
        fechaFin: fin,
        cuadrillaId: 'cua-2',
        vehiculoIds: ['veh-1'],
        equipoIds: [],
      },
      asignacionesExistentes: snap.asignaciones,
      rutas: snap.rutas,
      cuadrillas: snap.cuadrillas,
      personal: snap.personal,
      vehiculos: snap.vehiculos,
      equipos: snap.equipos,
      rentasExistentes: [],
      misiones: snap.misiones,
      umbralCercaniaRentaKm: 30,
    });
    const confVeh = confPropio.find((c) => c.type === 'vehiculo');
    expect(confVeh?.permiteOverride).toBe(true);
  });

  it('B4: Rendimiento de flota exige >= 3 cargas aprobadas y detecta desviaciones > umbral (15% por defecto)', async () => {
    expect(UMBRAL_ALERTA_RENDIMIENTO_PCT_DEFAULT).toBe(15);
    const snap = await repo.cargarSnapshotEmpresa('emp-aia');
    const veh = snap.vehiculos[0]; // veh-1, kmPorGal = 32

    // Con < 3 cargas aprobadas => Datos insuficientes sin alerta
    const resInsuf = calcularRendimientoFlota({
      vehiculos: [veh],
      viaticos: [
        { ...snap.viaticos[0], vehiculoId: veh.id, galonesCargados: 10, estadoAprobacion: 'aprobado' },
        { ...snap.viaticos[0], id: 'v-a2', vehiculoId: veh.id, galonesCargados: 10, estadoAprobacion: 'aprobado' },
        { ...snap.viaticos[0], id: 'v-pend', vehiculoId: veh.id, galonesCargados: 10, estadoAprobacion: 'pendiente' },
      ],
      asignaciones: snap.asignaciones,
      rutas: snap.rutas,
      bitacoras: snap.bitacoras,
      fuenteKm: 'manual',
      kmManualPorVehiculo: { [veh.id]: 640 },
    });
    expect(resInsuf[0].cantidadCargas).toBe(2);
    expect(resInsuf[0].estado).toBe('datos_insuficientes');
    expect(resInsuf[0].etiqueta).toBe('Datos insuficientes');
    expect(resInsuf[0].alerta).toBe(false);

    // Con 3 cargas aprobadas (30 gal) y 960 km manuales => 32 km/gal (0% desviación -> normal)
    const cargas3 = [
      { ...snap.viaticos[0], id: 'c1', vehiculoId: veh.id, galonesCargados: 10, estadoAprobacion: 'aprobado' as const },
      { ...snap.viaticos[0], id: 'c2', vehiculoId: veh.id, galonesCargados: 10, estadoAprobacion: 'aprobado' as const },
      { ...snap.viaticos[0], id: 'c3', vehiculoId: veh.id, galonesCargados: 10, estadoAprobacion: 'aprobado' as const },
    ];
    const resNormal = calcularRendimientoFlota({
      vehiculos: [veh],
      viaticos: cargas3,
      asignaciones: snap.asignaciones,
      rutas: snap.rutas,
      bitacoras: snap.bitacoras,
      fuenteKm: 'manual',
      kmManualPorVehiculo: { [veh.id]: 960 },
      umbralAlertaPct: 15,
    });
    expect(resNormal[0].estado).toBe('normal');
    expect(resNormal[0].alerta).toBe(false);
    expect(resNormal[0].rendimientoRealKmGal).toBe(32);

    // Usando bitácora con km bajos (300 km / 30 gal = 10 km/gal vs 32 teórico -> -68.8% -> alerta)
    const asigs = [{ ...snap.asignaciones[0], vehiculoIds: [veh.id] }];
    const bits = [
      { ...snap.bitacoras[0], rutaId: asigs[0].rutaId, kmRecorridos: 300 },
    ];
    const resAlerta = calcularRendimientoFlota({
      vehiculos: [veh],
      viaticos: cargas3,
      asignaciones: asigs,
      rutas: snap.rutas,
      bitacoras: bits,
      fuenteKm: 'bitacora',
      umbralAlertaPct: 15,
    });
    expect(resAlerta[0].estado).toBe('alerta_desviacion');
    expect(resAlerta[0].alerta).toBe(true);
    expect(resAlerta[0].kmRecorridos).toBe(300);
  });

  it('B5: Reporte de viáticos por misión consolida gasto empresa, cargo colaborador, rentas y genera CSV', async () => {
    const snap = await repo.cargarSnapshotEmpresa('emp-aia');
    const reporte = calcularReporteViaticosPorMision({
      misiones: snap.misiones,
      viaticos: snap.viaticos,
      rentas: snap.rentas,
      cargos: snap.configuracion!.cargos,
      config: snap.configuracion!,
    });

    expect(reporte.misiones.length).toBeGreaterThan(0);
    const mis1 = reporte.misiones.find((m) => m.misionId === 'mis-1')!;
    expect(mis1.aprobadoEmpresaRD).toBe(4900); // via-1 (4500) + via-2 (400)
    expect(mis1.pendienteRD).toBe(4400); // via-3 pendiente
    expect(mis1.desglose.length).toBeGreaterThan(0);

    const csv = generarCsvReporteMisiones(reporte);
    expect(csv.startsWith('Mision,Zona,Provincia,Fecha Inicio,Fecha Fin')).toBe(true);
    expect(csv).toContain(mis1.nombre);
  });
});
