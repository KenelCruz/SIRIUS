import { describe, expect, it } from 'vitest';
import type { Asignacion, Ruta, Vehiculo, Viatico } from '../../types/domain';
import {
  calcularRendimientoFlota,
  crearConfiguracionInicialEmpresa,
  validarNuevaVigenciaRendimientoFlota,
} from '../index';

const FECHA_CALCULO = '2026-11-20';

function crearVehiculo(overrides?: Partial<Vehiculo>): Vehiculo {
  return {
    id: 'veh-test-1',
    empresaId: 'emp-test',
    etiqueta: 'Hilux 4x4 Prueba',
    placa: 'L-999001',
    tipoCombustible: 'Gasoil Regular',
    precioGalonRD: 221.6,
    kmPorGal: 30,
    mantenimientoPorKmRD: 9.5,
    estado: 'disponible',
    ...overrides,
  };
}

function crearRuta(id: string, distanceOneWayKm: number): Ruta {
  return {
    id,
    empresaId: 'emp-test',
    proyectoId: 'proy-1',
    nombre: `Ruta ${id}`,
    codigoParcela: `P-${id}`,
    ubicacion: 'Distrito Nacional, Santo Domingo',
    provincia: 'Santo Domingo',
    fechaPrevista: '2026-11-10',
    kmzFileName: `${id}.kmz`,
    totalAreaM2: 12000,
    totalPerimeterM: 450,
    centroid: { lat: 18.48, lon: -69.93, elev: 14, easting: 401800, northing: 2043600, zone: '19Q' },
    features: [],
    routeSummary: {
      routeName: `Ruta ${id}`,
      distanceOneWayKm,
      durationMin: 60,
      tollsRD: 0,
      fuelRD: 0,
      vehicleLabel: 'Hilux 4x4 Prueba',
    },
    version: 1,
    updatedAt: '2026-11-01T12:00:00Z',
    syncStatus: 'synced',
  };
}

function crearAsignacion(overrides: Partial<Asignacion> & { id: string; rutaId: string }): Asignacion {
  return {
    empresaId: 'emp-test',
    fechaInicio: '2026-11-10',
    fechaFin: '2026-11-12',
    cuadrillaId: 'cua-1',
    vehiculoIds: ['veh-test-1'],
    equipoIds: [],
    version: 1,
    updatedAt: '2026-11-10T10:00:00Z',
    syncStatus: 'synced',
    ...overrides,
  };
}

function crearCargaCombustible(
  id: string,
  fechaIso: string,
  galonesCargados: number,
  estadoAprobacion: Viatico['estadoAprobacion'] = 'aprobado',
  vehiculoId = 'veh-test-1'
): Viatico {
  const montoRD = galonesCargados * 221.6;
  return {
    id,
    empresaId: 'emp-test',
    creadoPorUsuarioId: 'usr-1',
    creadoPorNombre: 'Chofer Prueba',
    categoria: 'Combustible',
    comercio: 'Estación Prueba',
    fechaIso,
    timestampAST: `${fechaIso} 09:00:00 AST`,
    montoRD,
    itbisRD: 0,
    metodo: 'Manual',
    vehiculoId,
    galonesCargados,
    notas: 'Carga de prueba',
    estadoAprobacion,
    repartos: [{ proyectoId: 'proy-1', montoRD }],
    version: 1,
    updatedAt: `${fechaIso}T13:00:00Z`,
    syncStatus: 'synced',
  };
}

describe('Rendimiento de Flota (correcciones de dominio y validación)', () => {
  it('1. Vehículo con 3 cargas aprobadas y 0 km => datos_insuficientes sin alerta', () => {
    const veh = crearVehiculo({ kmPorGal: 30 });
    const viaticos = [
      crearCargaCombustible('c1', '2026-11-01', 10),
      crearCargaCombustible('c2', '2026-11-05', 10),
      crearCargaCombustible('c3', '2026-11-10', 10),
    ];

    const [res] = calcularRendimientoFlota({
      vehiculos: [veh],
      viaticos,
      asignaciones: [],
      rutas: [crearRuta('r1', 100)],
      bitacoras: [],
      fechaCalculoIso: FECHA_CALCULO,
    });

    expect(res.cantidadCargas).toBe(3);
    expect(res.totalGalones).toBe(30);
    expect(res.kmRecorridos).toBe(0);
    expect(res.rendimientoRealKmGal).toBeNull();
    expect(res.desviacionPct).toBeNull();
    expect(res.estado).toBe('datos_insuficientes');
    expect(res.alerta).toBe(false);
  });

  it('2. Cargas fuera de la ventana de 90 días quedan excluidas del conteo y galones', () => {
    const veh = crearVehiculo({ kmPorGal: 30 });
    const rutas = [crearRuta('r1', 150)]; // ida_vuelta = 300 km
    const asignaciones = [crearAsignacion({ id: 'a1', rutaId: 'r1' })];
    // Ventana para 2026-11-20 inicia el 2026-08-22
    const viaticos = [
      crearCargaCombustible('c-old-1', '2026-08-21', 15), // fuera (-91 días)
      crearCargaCombustible('c-old-2', '2026-06-01', 20), // fuera
      crearCargaCombustible('c-in-1', '2026-08-22', 5), // justo en el límite
      crearCargaCombustible('c-in-2', '2026-10-15', 5),
      crearCargaCombustible('c-in-3', '2026-11-18', 5),
    ];

    const [res] = calcularRendimientoFlota({
      vehiculos: [veh],
      viaticos,
      asignaciones,
      rutas,
      bitacoras: [],
      fechaCalculoIso: FECHA_CALCULO,
    });

    expect(res.fechaInicioVentana).toBe('2026-08-22');
    expect(res.fechaFinVentana).toBe('2026-11-20');
    expect(res.cantidadCargas).toBe(3);
    expect(res.totalGalones).toBe(15);
    expect(res.kmRecorridos).toBe(300);
    expect(res.rendimientoRealKmGal).toBe(20);
  });

  it('3. Asignación que no se solapa con la ventana de 90 días no aporta kilómetros', () => {
    const veh = crearVehiculo({ kmPorGal: 30 });
    const rutas = [crearRuta('r-old', 200), crearRuta('r-in', 150)];
    const asignaciones = [
      // Fuera de la ventana [2026-08-22, 2026-11-20]
      crearAsignacion({
        id: 'a-old',
        rutaId: 'r-old',
        fechaInicio: '2026-08-10',
        fechaFin: '2026-08-21',
      }),
      // Se solapa parcialmente con el inicio de la ventana
      crearAsignacion({
        id: 'a-in',
        rutaId: 'r-in',
        fechaInicio: '2026-08-20',
        fechaFin: '2026-08-23',
      }),
    ];
    const viaticos = [
      crearCargaCombustible('c1', '2026-09-01', 5),
      crearCargaCombustible('c2', '2026-10-01', 5),
      crearCargaCombustible('c3', '2026-11-01', 5),
    ];

    const [res] = calcularRendimientoFlota({
      vehiculos: [veh],
      viaticos,
      asignaciones,
      rutas,
      bitacoras: [],
      conceptoDistancia: 'ida_vuelta',
      fechaCalculoIso: FECHA_CALCULO,
    });

    expect(res.kmRecorridos).toBe(300); // solo r-in (150 * 2), r-old ignorada
  });

  it('4. Misma ruta asignada varias veces al mismo vehículo cuenta una sola vez', () => {
    const veh = crearVehiculo({ kmPorGal: 30 });
    const rutas = [crearRuta('r-dup', 150)]; // 300 km ida_vuelta
    const asignaciones = [
      crearAsignacion({
        id: 'a1',
        rutaId: 'r-dup',
        fechaInicio: '2026-10-01',
        fechaFin: '2026-10-05',
      }),
      crearAsignacion({
        id: 'a2',
        rutaId: 'r-dup',
        fechaInicio: '2026-11-01',
        fechaFin: '2026-11-04',
      }),
    ];
    const viaticos = [
      crearCargaCombustible('c1', '2026-10-02', 4),
      crearCargaCombustible('c2', '2026-10-20', 3),
      crearCargaCombustible('c3', '2026-11-03', 3),
    ];

    const [res] = calcularRendimientoFlota({
      vehiculos: [veh],
      viaticos,
      asignaciones,
      rutas,
      bitacoras: [],
      fechaCalculoIso: FECHA_CALCULO,
    });

    expect(res.kmRecorridos).toBe(300); // no 600 ni multiplicado por días
    expect(res.rendimientoRealKmGal).toBe(30);
    expect(res.estado).toBe('normal');
  });

  it('5. conceptoDistancia solo_ida vs ida_vuelta toma la regla vigente de GPS Ruta', () => {
    const veh = crearVehiculo({ kmPorGal: 30 });
    const rutas = [crearRuta('r1', 150)];
    const asignaciones = [crearAsignacion({ id: 'a1', rutaId: 'r1' })];
    const viaticos = [
      crearCargaCombustible('c1', '2026-11-01', 5),
      crearCargaCombustible('c2', '2026-11-05', 5),
      crearCargaCombustible('c3', '2026-11-10', 5),
    ];

    const configIdaVuelta = crearConfiguracionInicialEmpresa('emp-test');
    const [resIdaVuelta] = calcularRendimientoFlota({
      vehiculos: [veh],
      viaticos,
      asignaciones,
      rutas,
      bitacoras: [],
      config: configIdaVuelta,
      fechaCalculoIso: FECHA_CALCULO,
    });

    const configSoloIda = {
      ...configIdaVuelta,
      reglasViaticos: [
        {
          ...configIdaVuelta.reglasViaticos[0],
          gpsRuta: {
            ...configIdaVuelta.reglasViaticos[0].gpsRuta,
            conceptoDistancia: 'solo_ida' as const,
          },
        },
      ],
    };
    const [resSoloIda] = calcularRendimientoFlota({
      vehiculos: [veh],
      viaticos,
      asignaciones,
      rutas,
      bitacoras: [],
      config: configSoloIda,
      fechaCalculoIso: FECHA_CALCULO,
    });

    expect(resIdaVuelta.conceptoDistancia).toBe('ida_vuelta');
    expect(resIdaVuelta.kmRecorridos).toBe(300);
    expect(resIdaVuelta.rendimientoRealKmGal).toBe(20);

    expect(resSoloIda.conceptoDistancia).toBe('solo_ida');
    expect(resSoloIda.kmRecorridos).toBe(150);
    expect(resSoloIda.rendimientoRealKmGal).toBe(10);
  });

  it('6. Rendimiento 20% peor que el teórico (umbral 15%) => alerta_desviacion y alerta=true', () => {
    const veh = crearVehiculo({ kmPorGal: 30 });
    const rutas = [crearRuta('r1', 120)]; // 240 km ida_vuelta
    const asignaciones = [crearAsignacion({ id: 'a1', rutaId: 'r1' })];
    // 240 km / 10 gal = 24 km/gal => -20% vs 30 km/gal
    const viaticos = [
      crearCargaCombustible('c1', '2026-11-01', 3),
      crearCargaCombustible('c2', '2026-11-05', 3),
      crearCargaCombustible('c3', '2026-11-10', 4),
    ];

    const [res] = calcularRendimientoFlota({
      vehiculos: [veh],
      viaticos,
      asignaciones,
      rutas,
      bitacoras: [],
      umbralAlertaPct: 15,
      fechaCalculoIso: FECHA_CALCULO,
    });

    expect(res.rendimientoRealKmGal).toBe(24);
    expect(res.desviacionPct).toBe(-20);
    expect(res.estado).toBe('alerta_desviacion');
    expect(res.alerta).toBe(true);
  });

  it('7. Rendimiento 20% mejor que el teórico => mejor_que_esperado y alerta=false', () => {
    const veh = crearVehiculo({ kmPorGal: 30 });
    const rutas = [crearRuta('r1', 180)]; // 360 km ida_vuelta
    const asignaciones = [crearAsignacion({ id: 'a1', rutaId: 'r1' })];
    // 360 km / 10 gal = 36 km/gal => +20% vs 30 km/gal
    const viaticos = [
      crearCargaCombustible('c1', '2026-11-01', 3),
      crearCargaCombustible('c2', '2026-11-05', 3),
      crearCargaCombustible('c3', '2026-11-10', 4),
    ];

    const [res] = calcularRendimientoFlota({
      vehiculos: [veh],
      viaticos,
      asignaciones,
      rutas,
      bitacoras: [],
      umbralAlertaPct: 15,
      fechaCalculoIso: FECHA_CALCULO,
    });

    expect(res.rendimientoRealKmGal).toBe(36);
    expect(res.desviacionPct).toBe(20);
    expect(res.estado).toBe('mejor_que_esperado');
    expect(res.alerta).toBe(false);
  });

  it('8. Menos de 3 cargas aprobadas => datos_insuficientes sin alerta aunque haya km > 0', () => {
    const veh = crearVehiculo({ kmPorGal: 30 });
    const rutas = [crearRuta('r1', 150)];
    const asignaciones = [crearAsignacion({ id: 'a1', rutaId: 'r1' })];
    const viaticos = [
      crearCargaCombustible('c1', '2026-11-01', 10, 'aprobado'),
      crearCargaCombustible('c2', '2026-11-05', 10, 'aprobado'),
      crearCargaCombustible('c3', '2026-11-10', 10, 'pendiente'),
    ];

    const [res] = calcularRendimientoFlota({
      vehiculos: [veh],
      viaticos,
      asignaciones,
      rutas,
      bitacoras: [],
      fechaCalculoIso: FECHA_CALCULO,
    });

    expect(res.cantidadCargas).toBe(2);
    expect(res.kmRecorridos).toBe(300);
    expect(res.rendimientoRealKmGal).toBeNull();
    expect(res.estado).toBe('datos_insuficientes');
    expect(res.alerta).toBe(false);
  });

  it('9. validarNuevaVigenciaRendimientoFlota rechaza bitacora y manual con mensaje específico y acepta ruta_asignada', () => {
    const config = crearConfiguracionInicialEmpresa('emp-test');

    const resBitacora = validarNuevaVigenciaRendimientoFlota(config.rendimientoFlota, {
      vigenciaDesde: '2026-11-20',
      fuenteKm: 'bitacora',
      umbralAlertaPct: 15,
      umbralCercaniaRentaKm: 30,
    });
    expect(resBitacora.valido).toBe(false);
    expect(resBitacora.error).toBe('Esta fuente de kilómetros estará disponible próximamente.');

    const resManual = validarNuevaVigenciaRendimientoFlota(config.rendimientoFlota, {
      vigenciaDesde: '2026-11-20',
      fuenteKm: 'manual',
      umbralAlertaPct: 15,
      umbralCercaniaRentaKm: 30,
    });
    expect(resManual.valido).toBe(false);
    expect(resManual.error).toBe('Esta fuente de kilómetros estará disponible próximamente.');

    const resRuta = validarNuevaVigenciaRendimientoFlota(config.rendimientoFlota, {
      vigenciaDesde: '2026-11-20',
      fuenteKm: 'ruta_asignada',
      umbralAlertaPct: 15,
      umbralCercaniaRentaKm: 30,
    });
    expect(resRuta.valido).toBe(true);
  });
});
