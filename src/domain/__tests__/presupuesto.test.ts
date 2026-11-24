import { beforeEach, describe, expect, it } from 'vitest';
import { LocalRepositorioOperacion } from '../../data/LocalRepositorioOperacion';
import {
  CATEGORIAS_PRESUPUESTO,
  TARIFAS_COSTO_OPERATIVO_PROVISIONAL,
  TARIFAS_VIATICOS_PROVISIONALES_PUESTO,
  asegurarPresupuestosProyectos,
  calcularEjecutadoProyectoDesdeFuentes,
  calcularEjecutadoProyectoDesdeSnapshot,
  calcularEstimadoViaticosPorPuesto,
  calcularReportePresupuestosDesdeSnapshot,
  compararPresupuestoProyecto,
  compararPresupuestoProyectoConSnapshot,
  compararVersionPresupuestoConSnapshot,
  crearConfiguracionInicialEmpresa,
  crearLineasBasePresupuesto,
  migrarProyectoAPresupuestoInicial,
  obtenerPresupuestoVigenteProyecto,
  validarEdicionPresupuesto,
  validarNuevoPresupuestoVersion,
  validarTransicionPresupuesto,
} from '../index';
import type { Proyecto } from '../../types/domain';

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

describe('Presupuesto de Proyecto: Versionado, Ejecución Live, Margen y Tarifas Provisionales', () => {
  let repo: LocalRepositorioOperacion;

  beforeEach(async () => {
    installMemoryLocalStorage();
    repo = new LocalRepositorioOperacion();
    await repo.iniciarSesion('admin@aiaservices.do', 'demo123');
  });

  it('1. Incluye las 7 filas provisionales exactas de la tabla de viáticos por puesto y estima correctamente', () => {
    expect(TARIFAS_VIATICOS_PROVISIONALES_PUESTO).toHaveLength(7);

    const esperado: Record<
      string,
      { desayuno: number; almuerzo: number; cena: number; alojamiento: number; total: number }
    > = {
      'Director Ejecutivo': { desayuno: 800, almuerzo: 1200, cena: 1000, alojamiento: 6000, total: 9000 },
      'Encargado de Departamento': { desayuno: 600, almuerzo: 900, cena: 800, alojamiento: 4500, total: 6800 },
      Analista: { desayuno: 450, almuerzo: 700, cena: 600, alojamiento: 3500, total: 5250 },
      Técnico: { desayuno: 400, almuerzo: 600, cena: 500, alojamiento: 3000, total: 4500 },
      Asistente: { desayuno: 350, almuerzo: 500, cena: 450, alojamiento: 2500, total: 3800 },
      Chofer: { desayuno: 350, almuerzo: 500, cena: 450, alojamiento: 2500, total: 3800 },
      'Consultor Externo': { desayuno: 500, almuerzo: 800, cena: 700, alojamiento: 4000, total: 6000 },
    };

    for (const row of TARIFAS_VIATICOS_PROVISIONALES_PUESTO) {
      const ref = esperado[row.puesto];
      expect(ref).toBeDefined();
      expect(row.desayunoRD).toBe(ref.desayuno);
      expect(row.almuerzoRD).toBe(ref.almuerzo);
      expect(row.cenaRD).toBe(ref.cena);
      expect(row.dietaTotalRD).toBe(ref.desayuno + ref.almuerzo + ref.cena);
      expect(row.alojamientoRD).toBe(ref.alojamiento);
      expect(row.montoViaticosRD).toBe(ref.total);
      expect(row.esProvisional).toBe(true);
    }

    const est = calcularEstimadoViaticosPorPuesto([
      { puesto: 'Técnico', dias: 2, personas: 2, incluirAlojamiento: true }, // 4500 * 2 * 2 = 18000
      { puesto: 'Chofer', dias: 2, personas: 1, incluirAlojamiento: false }, // 1300 * 2 * 1 = 2600
    ]);
    expect(est.totalEstimadoRD).toBe(20600);
    expect(est.esProvisional).toBe(true);
  });

  it('2. Migración simple: proyecto legacy con presupuestoViaticosRD crea versión 1 con las 6 categorías', () => {
    const proyectoLegacy: Proyecto = {
      id: 'proy-legacy',
      empresaId: 'emp-aia',
      clienteId: 'cli-1',
      nombre: 'Proyecto Legacy',
      codigoContrato: 'LEG-001',
      presupuestoViaticosRD: 22500,
      valorContratoRD: 150000,
      estado: 'en_campo',
      fechaCreacion: '2026-09-01',
      version: 1,
      updatedAt: '2026-09-01T10:00:00-04:00',
      syncStatus: 'synced',
    };

    const migrado = migrarProyectoAPresupuestoInicial(proyectoLegacy);
    expect(migrado.version).toBe(1);
    expect(migrado.estado).toBe('aprobado');
    expect(migrado.esMigracionInicial).toBe(true);
    expect(migrado.vigenciaDesde).toBe('2026-09-01');
    expect(migrado.lineas).toHaveLength(CATEGORIAS_PRESUPUESTO.length);
    expect(migrado.lineas.find((l) => l.categoria === 'viaticos')?.montoPlanificadoRD).toBe(22500);
    expect(migrado.totalPlanificadoRD).toBe(22500);

    const asegurados = asegurarPresupuestosProyectos('emp-aia', [proyectoLegacy], []);
    expect(asegurados).toHaveLength(1);
    expect(asegurados[0].proyectoId).toBe('proy-legacy');
  });

  it('3. Resolución por vigenciaDesde: selecciona la versión aprobada vigente a la fecha consultada e ignora borradores', () => {
    const v1 = migrarProyectoAPresupuestoInicial({
      id: 'proy-x',
      empresaId: 'emp-aia',
      presupuestoViaticosRD: 10000,
      fechaCreacion: '2026-01-01',
      updatedAt: '2026-01-01T08:00:00Z',
    });
    const v2 = {
      ...v1,
      id: 'pre-v2',
      version: 2,
      vigenciaDesde: '2026-06-01',
      totalPlanificadoRD: 25000,
      lineas: crearLineasBasePresupuesto({ viaticos: 15000, personal: 10000 }),
    };
    const v3Borrador = {
      ...v1,
      id: 'pre-v3',
      version: 3,
      vigenciaDesde: '2026-07-01',
      estado: 'borrador' as const,
      totalPlanificadoRD: 50000,
      lineas: crearLineasBasePresupuesto({ viaticos: 50000 }),
    };

    const vigenteMayo = obtenerPresupuestoVigenteProyecto(
      [v1, v2, v3Borrador],
      'proy-x',
      '2026-05-15'
    );
    expect(vigenteMayo?.version).toBe(1);

    const vigenteJulio = obtenerPresupuestoVigenteProyecto(
      [v1, v2, v3Borrador],
      'proy-x',
      '2026-07-15'
    );
    expect(vigenteJulio?.version).toBe(2);

    const conBorrador = obtenerPresupuestoVigenteProyecto(
      [v1, v2, v3Borrador],
      'proy-x',
      '2026-07-15',
      { incluirBorrador: true }
    );
    expect(conBorrador?.version).toBe(3);
  });

  it('4. Validaciones e inmutabilidad: rechaza negativos, traslapes de vigencia, segundo borrador, edición de aprobado/cerrado, y transiciones inválidas', () => {
    const v1 = migrarProyectoAPresupuestoInicial({
      id: 'proy-val',
      empresaId: 'emp-aia',
      presupuestoViaticosRD: 10000,
      fechaCreacion: '2026-10-01',
      updatedAt: '2026-10-01T08:00:00Z',
    });

    // Técnico no puede gestionar presupuestos
    expect(
      validarNuevoPresupuestoVersion({
        rol: 'tecnico',
        existentesProyecto: [v1],
        vigenciaDesde: '2026-11-01',
        lineas: crearLineasBasePresupuesto({ viaticos: 12000 }),
      }).valido
    ).toBe(false);

    // Traslape de vigenciaDesde
    expect(
      validarNuevoPresupuestoVersion({
        rol: 'admin',
        existentesProyecto: [v1],
        vigenciaDesde: '2026-10-01',
        lineas: crearLineasBasePresupuesto({ viaticos: 12000 }),
      }).valido
    ).toBe(false);

    // Montos negativos
    expect(
      validarNuevoPresupuestoVersion({
        rol: 'admin',
        existentesProyecto: [v1],
        vigenciaDesde: '2026-11-01',
        lineas: [{ categoria: 'viaticos', montoPlanificadoRD: -500 }],
      }).valido
    ).toBe(false);

    // Presupuesto aprobado es inmutable
    const editAprobado = validarEdicionPresupuesto({
      rol: 'admin',
      presupuesto: v1,
      existentesProyecto: [v1],
      lineas: crearLineasBasePresupuesto({ viaticos: 99999 }),
    });
    expect(editAprobado.valido).toBe(false);
    expect(editAprobado.error).toContain('inmutable');

    // No se puede devolver a borrador ni cerrar un borrador directo
    expect(
      validarTransicionPresupuesto({
        rol: 'admin',
        presupuesto: v1,
        nuevoEstado: 'borrador',
      }).valido
    ).toBe(false);

    expect(
      validarTransicionPresupuesto({
        rol: 'admin',
        presupuesto: { estado: 'borrador' },
        nuevoEstado: 'cerrado',
      }).valido
    ).toBe(false);

    // Segundo borrador bloqueado
    const borrador = { ...v1, id: 'b1', version: 2, estado: 'borrador' as const, vigenciaDesde: '2026-11-01' };
    expect(
      validarNuevoPresupuestoVersion({
        rol: 'coordinador',
        existentesProyecto: [v1, borrador],
        vigenciaDesde: '2026-12-01',
        lineas: crearLineasBasePresupuesto({ viaticos: 15000 }),
      }).valido
    ).toBe(false);
  });

  it('5. Cálculo en vivo de ejecutado desde fuentes y margen del proyecto (sin copiar datos)', () => {
    const config = crearConfiguracionInicialEmpresa('emp-aia');
    const ejecutado = calcularEjecutadoProyectoDesdeFuentes({
      proyectoId: 'proy-1',
      configuracion: config,
      rutas: [
        {
          id: 'r-1',
          empresaId: 'emp-aia',
          proyectoId: 'proy-1',
          nombre: 'Ruta Test',
          codigoParcela: 'P-1',
          ubicacion: 'Este',
          provincia: 'La Altagracia',
          fechaPrevista: '2026-11-10',
          kmzFileName: 'test.kmz',
          features: [],
          centroid: { lat: 18.5, lon: -69.3, easting: 0, northing: 0, zone: '19N', elev: 0 },
          totalAreaM2: 10000,
          totalPerimeterM: 400,
          routeSummary: {
            routeName: 'Autovía',
            distanceOneWayKm: 80, // ida y vuelta = 160 km
            durationMin: 60,
            tollsRD: 400,
            fuelRD: 1000,
            vehicleLabel: 'Hilux',
          },
          version: 1,
          updatedAt: '2026-11-10T08:00:00Z',
          syncStatus: 'synced',
        },
      ],
      asignaciones: [
        {
          id: 'a-1',
          empresaId: 'emp-aia',
          rutaId: 'r-1',
          fechaInicio: '2026-11-10',
          fechaFin: '2026-11-11', // 2 días
          cuadrillaId: 'c-1',
          vehiculoIds: ['v-1'],
          equipoIds: ['eq-1'],
          version: 1,
          updatedAt: '2026-11-10T08:00:00Z',
          syncStatus: 'synced',
        },
      ],
      cuadrillas: [
        {
          id: 'c-1',
          empresaId: 'emp-aia',
          nombre: 'Brigada A',
          jefeId: 'p-1',
          miembroIds: ['p-1', 'p-2'], // p-1 deduplicado + p-2
          activa: true,
        },
      ],
      personal: [
        { id: 'p-1', empresaId: 'emp-aia', nombre: 'Jefe', cargo: 'jefe_brigada', activo: true },
        { id: 'p-2', empresaId: 'emp-aia', nombre: 'Chofer', cargo: 'chofer', activo: true },
      ],
      vehiculos: [
        {
          id: 'v-1',
          empresaId: 'emp-aia',
          etiqueta: 'Hilux',
          placa: 'L1',
          tipoCombustible: 'Diésel',
          precioGalonRD: 240,
          kmPorGal: 32, // 160 / 32 = 5 gal * 240 = 1200
          mantenimientoPorKmRD: 15, // 160 * 15 = 2400 -> total veh = 3600
          estado: 'disponible',
        },
      ],
      viaticos: [
        {
          id: 'v-aprob',
          empresaId: 'emp-aia',
          creadoPorUsuarioId: 'u-1',
          creadoPorNombre: 'Jefe',
          fechaIso: '2026-11-10',
          timestampAST: '2026-11-10 09:00 AST',
          categoria: 'Dieta',
          comercio: 'Comedor',
          montoRD: 5000,
          itbisRD: 0,
          metodo: 'Manual',
          estadoAprobacion: 'aprobado',
          repartos: [
            { proyectoId: 'proy-1', montoRD: 3500 },
            { proyectoId: 'sin_asignar', montoRD: 1500 },
          ],
          version: 1,
          updatedAt: '2026-11-10T09:00:00Z',
          syncStatus: 'synced',
        },
        {
          id: 'v-pend',
          empresaId: 'emp-aia',
          creadoPorUsuarioId: 'u-1',
          creadoPorNombre: 'Jefe',
          fechaIso: '2026-11-10',
          timestampAST: '2026-11-10 10:00 AST',
          categoria: 'Peaje',
          comercio: 'RD Vial',
          montoRD: 400,
          itbisRD: 0,
          metodo: 'Manual',
          estadoAprobacion: 'pendiente',
          repartos: [{ proyectoId: 'proy-1', montoRD: 400 }],
          version: 1,
          updatedAt: '2026-11-10T10:00:00Z',
          syncStatus: 'synced',
        },
      ],
      rentas: [
        {
          id: 'rent-ok',
          empresaId: 'emp-aia',
          recursoTipo: 'equipo',
          recursoId: 'eq-2',
          proveedor: 'TopGeo',
          fechaInicio: '2026-11-10',
          fechaFin: '2026-11-11',
          modalidadTarifa: 'por_dia',
          tarifaRD: 3000,
          cantidadEstimada: 2,
          incluyeItbis: false,
          itbisRD: 0,
          costoTotalRD: 6000,
          estado: 'activa',
          repartos: [{ proyectoId: 'proy-1', montoRD: 6000 }],
          version: 1,
          updatedAt: '2026-11-10T08:00:00Z',
          syncStatus: 'synced',
        },
        {
          id: 'rent-canc',
          empresaId: 'emp-aia',
          recursoTipo: 'equipo',
          recursoId: 'eq-3',
          proveedor: 'Cancelada',
          fechaInicio: '2026-11-10',
          fechaFin: '2026-11-11',
          modalidadTarifa: 'por_dia',
          tarifaRD: 5000,
          cantidadEstimada: 1,
          incluyeItbis: false,
          itbisRD: 0,
          costoTotalRD: 5000,
          estado: 'cancelada',
          repartos: [{ proyectoId: 'proy-1', montoRD: 5000 }],
          version: 1,
          updatedAt: '2026-11-10T08:00:00Z',
          syncStatus: 'synced',
        },
      ],
    });

    const expectedPersonal =
      2 *
      (TARIFAS_COSTO_OPERATIVO_PROVISIONAL.tarifaDiariaPersonalPorCargoRD.jefe_brigada +
        TARIFAS_COSTO_OPERATIVO_PROVISIONAL.tarifaDiariaPersonalPorCargoRD.chofer);
    const expectedGnss = 2 * 1 * TARIFAS_COSTO_OPERATIVO_PROVISIONAL.tarifaDiariaEquipoGnssRD;

    expect(ejecutado.porCategoria.viaticos).toBe(3500);
    expect(ejecutado.viaticosPendientesRD).toBe(400);
    expect(ejecutado.porCategoria.rentas).toBe(6000);
    expect(ejecutado.porCategoria.vehiculos).toBe(3600);
    expect(ejecutado.porCategoria.personal).toBe(expectedPersonal);
    expect(ejecutado.porCategoria.equipos_gnss).toBe(expectedGnss);
    expect(ejecutado.porCategoria.otros).toBe(0);

    const presupuesto = {
      id: 'pre-test',
      empresaId: 'emp-aia',
      proyectoId: 'proy-1',
      version: 1,
      vigenciaDesde: '2026-11-01',
      estado: 'aprobado' as const,
      lineas: crearLineasBasePresupuesto({
        viaticos: 10000,
        rentas: 6000,
        personal: 20000,
        vehiculos: 5000,
        equipos_gnss: 5000,
        otros: 4000,
      }),
      totalPlanificadoRD: 50000,
      creadoPorUsuarioId: 'u-1',
      creadoPorNombre: 'Admin',
      updatedAt: '2026-11-01T08:00:00Z',
      syncStatus: 'synced' as const,
    };

    const comp = compararPresupuestoProyecto({
      proyecto: {
        id: 'proy-1',
        empresaId: 'emp-aia',
        codigoContrato: 'CON-1',
        nombre: 'Test',
        valorContratoRD: 200000,
        presupuestoViaticosRD: 10000,
        fechaCreacion: '2026-11-01',
        updatedAt: '2026-11-01T08:00:00Z',
      },
      presupuesto,
      ejecutado,
    });

    expect(comp.totalPlanificadoRD).toBe(50000);
    expect(comp.margenPlanificadoRD).toBe(150000);
    expect(comp.margenPlanificadoPct).toBe(75);
    expect(comp.margenRealRD).toBe(Number((200000 - comp.totalEjecutadoRD).toFixed(2)));
    expect(comp.excedidoTotal).toBe(false);
  });

  it('6. Repositorio: flujo completo de versiones (borrador -> editar -> aprobar -> nueva v2 -> cerrar) y aislamiento de técnico', async () => {
    const snapInicial = await repo.cargarSnapshotEmpresa('emp-aia');
    expect((snapInicial.presupuestos ?? []).length).toBeGreaterThanOrEqual(3);

    // proy-1 ya tiene v1 aprobado en el seed; editarlo directamente falla
    const v1Proy1 = snapInicial.presupuestos!.find((p) => p.proyectoId === 'proy-1')!;
    await expect(
      repo.editarBorradorPresupuestoProyecto({
        empresaId: 'emp-aia',
        presupuestoId: v1Proy1.id,
        lineas: crearLineasBasePresupuesto({ viaticos: 99000 }),
      })
    ).rejects.toThrow('inmutable');

    // Crear v2 como borrador
    const v2Borrador = await repo.crearVersionPresupuestoProyecto({
      empresaId: 'emp-aia',
      proyectoId: 'proy-1',
      vigenciaDesde: '2026-12-01',
      lineas: crearLineasBasePresupuesto({
        viaticos: 22000,
        personal: 42000,
        vehiculos: 15000,
        equipos_gnss: 9500,
        otros: 3500,
      }),
      motivoCambio: 'Ampliación de alcance en Yamasá',
    });
    expect(v2Borrador.version).toBe(2);
    expect(v2Borrador.estado).toBe('borrador');
    expect(v2Borrador.totalPlanificadoRD).toBe(92000);

    // Editar borrador v2
    const v2Editado = await repo.editarBorradorPresupuestoProyecto({
      empresaId: 'emp-aia',
      presupuestoId: v2Borrador.id,
      lineas: crearLineasBasePresupuesto({
        viaticos: 24000,
        personal: 42000,
        vehiculos: 15000,
        equipos_gnss: 9500,
        otros: 3500,
      }),
    });
    expect(v2Editado.totalPlanificadoRD).toBe(94000);

    // Aprobar v2 y luego cerrarlo
    const v2Aprobado = await repo.transicionarPresupuestoProyecto({
      empresaId: 'emp-aia',
      presupuestoId: v2Editado.id,
      nuevoEstado: 'aprobado',
    });
    expect(v2Aprobado.estado).toBe('aprobado');
    expect(v2Aprobado.aprobadoPorUsuarioId).toBe('usr-admin');

    const v2Cerrado = await repo.transicionarPresupuestoProyecto({
      empresaId: 'emp-aia',
      presupuestoId: v2Aprobado.id,
      nuevoEstado: 'cerrado',
    });
    expect(v2Cerrado.estado).toBe('cerrado');

    // Cerrado no admite nuevas versiones
    await expect(
      repo.crearVersionPresupuestoProyecto({
        empresaId: 'emp-aia',
        proyectoId: 'proy-1',
        vigenciaDesde: '2026-12-15',
        lineas: crearLineasBasePresupuesto({ viaticos: 30000 }),
      })
    ).rejects.toThrow('cerrado');

    // Auditoría registró eventos de presupuesto
    const snapFinal = await repo.cargarSnapshotEmpresa('emp-aia');
    expect(snapFinal.historial.some((h) => h.entidadTipo === 'presupuesto')).toBe(true);

    // Rol técnico nunca recibe presupuestos en SnapshotTecnico
    await repo.iniciarSesion('carlos@aiaservices.do', 'demo123');
    const proyeccionTecnico = await repo.cargarSnapshotParaRol({
      empresaId: 'emp-aia',
      rol: 'tecnico',
      usuarioId: 'usr-tec1',
      personalIdMembresia: 'per-1',
    });
    expect(proyeccionTecnico.rol).toBe('tecnico');
    expect('presupuestos' in proyeccionTecnico.snapshot).toBe(false);
  });

  it('7. Comparación directa contra snapshot: compara versiones específicas de PresupuestoProyecto frente a viáticos (excluyendo cargo_colaborador), rentas y asignaciones', async () => {
    const snap = await repo.cargarSnapshotEmpresa('emp-aia');
    const proyecto = snap.proyectos.find((p) => p.id === 'proy-1')!;
    const v1 = (snap.presupuestos ?? []).find((p) => p.proyectoId === 'proy-1' && p.version === 1)!;

    // Agregar un viático aprobado con excedente cargado al colaborador (no debe entrar en el costo de empresa)
    // y una renta finalizada + asignaciones existentes en el snapshot.
    const snapConExcedente = {
      ...snap,
      viaticos: [
        ...snap.viaticos,
        {
          id: 'via-exc-col',
          empresaId: 'emp-aia',
          creadoPorUsuarioId: 'usr-tec1',
          creadoPorNombre: 'Carlos',
          fechaIso: '2026-11-20',
          timestampAST: '2026-11-20 12:00 AST',
          categoria: 'Dieta' as const,
          comercio: 'Restaurante',
          montoRD: 4000,
          itbisRD: 0,
          metodo: 'Manual' as const,
          estadoAprobacion: 'aprobado' as const,
          excedenteRD: 1500,
          decisionExcedente: 'cargo_colaborador' as const,
          montoAprobadoEmpresaRD: 2500,
          montoCargoColaboradorRD: 1500,
          // Simulamos repartos sin escalar manualmente para probar la protección del dominio
          repartos: [{ proyectoId: 'proy-1', montoRD: 4000 }],
          version: 1,
          updatedAt: '2026-11-20T12:00:00Z',
          syncStatus: 'synced' as const,
        },
      ],
    };

    const ejecBase = calcularEjecutadoProyectoDesdeSnapshot(snap, 'proy-1');
    const ejecConExcedente = calcularEjecutadoProyectoDesdeSnapshot(snapConExcedente, 'proy-1');
    expect(ejecConExcedente.porCategoria.viaticos).toBe(
      Number((ejecBase.porCategoria.viaticos + 2500).toFixed(2))
    );

    // Crear v2 en memoria con mayor presupuesto planificado y comparar ambas versiones contra el mismo snapshot
    const v2 = {
      ...v1,
      id: 'pre-proy1-v2-mem',
      version: 2,
      vigenciaDesde: '2026-11-25',
      lineas: crearLineasBasePresupuesto({
        viaticos: 35000,
        rentas: 15000,
        personal: 60000,
        vehiculos: 20000,
        equipos_gnss: 15000,
        otros: 5000,
      }),
      totalPlanificadoRD: 150000,
    };

    const compV1 = compararVersionPresupuestoConSnapshot({
      presupuesto: v1,
      snapshot: snapConExcedente,
    });
    const compV2 = compararVersionPresupuestoConSnapshot({
      presupuesto: v2,
      snapshot: snapConExcedente,
    });

    expect(compV1.versionVigente).toBe(1);
    expect(compV2.versionVigente).toBe(2);
    expect(compV2.totalPlanificadoRD).toBe(150000);
    // Lo ejecutado real y el margen real son iguales en ambas porque provienen de las fuentes vivas del snapshot
    expect(compV1.totalEjecutadoRD).toBe(compV2.totalEjecutadoRD);
    expect(compV1.margenRealRD).toBe(compV2.margenRealRD);
    // El margen planificado cambia según la versión del presupuesto evaluada
    expect(compV2.margenPlanificadoRD).toBe(Number((proyecto.valorContratoRD - 150000).toFixed(2)));
    expect(compV2.variacionTotalPct).not.toBeNull();
    expect(compV2.porcentajeEjecucionTotalPct).not.toBeNull();

    // compararPresupuestoProyectoConSnapshot por proyectoId y versión explícita
    const compPorIdV1 = compararPresupuestoProyectoConSnapshot({
      proyectoId: 'proy-1',
      snapshot: snapConExcedente,
      version: 1,
    });
    expect(compPorIdV1.totalPlanificadoRD).toBe(compV1.totalPlanificadoRD);
    expect(compPorIdV1.totalEjecutadoRD).toBe(compV1.totalEjecutadoRD);

    expect(() =>
      compararPresupuestoProyectoConSnapshot({
        proyectoId: 'proy-1',
        snapshot: snapConExcedente,
        version: 99,
      })
    ).toThrow('v99');

    // Reporte consolidado de empresa directamente desde snapshot
    const reporteEmpresa = calcularReportePresupuestosDesdeSnapshot(snapConExcedente);
    expect(reporteEmpresa.comparaciones).toHaveLength(snapConExcedente.proyectos.length);
    expect(reporteEmpresa.totales.totalEjecutadoRD).toBeGreaterThan(0);
  });
});
