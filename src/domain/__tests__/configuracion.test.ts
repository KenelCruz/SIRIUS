import { describe, expect, it } from 'vitest';
import type { Personal, Servicio, TarifaCombustibleVersion } from '../../types/domain';
import {
  computeRouteViaticos,
  SERVICE_CATALOG,
  TERRAIN_MULTIPLIER,
  VEHICLE_CATALOG,
} from '../../utils/routingEngine';
import {
  calcularCombustibleGpsRuta,
  calcularCotizacionServicioVigente,
  crearConfiguracionInicialEmpresa,
  obtenerCombustiblesVigentes,
  obtenerFactoresTerrenoVigentes,
  obtenerReglasViaticosVigentes,
  obtenerServiciosVigentes,
  obtenerVersionVigente,
  puedeEditarConfiguracion,
  puedeVerConfiguracion,
  puedeVerSeccionConfiguracion,
  resolverEtiquetaCargo,
  validarCargoConfig,
  validarEliminarCargo,
  validarNuevaVigenciaCombustible,
  validarNuevaVigenciaReglasViaticos,
  validarNuevaVigenciaServicio,
  validarNuevaVigenciaTerreno,
  validarVehiculoConfig,
} from '../configuracion';

describe('Configuración y vigencias versionadas (A1)', () => {
  it('obtenerVersionVigente elige la versión más reciente no posterior a la fecha de cálculo sin alterar históricos', () => {
    const versiones: TarifaCombustibleVersion[] = [
      { version: 1, vigenciaDesde: '2026-01-01', precioGalonRD: 239.1 },
      { version: 2, vigenciaDesde: '2026-06-01', precioGalonRD: 255.0 },
      { version: 3, vigenciaDesde: '2026-12-01', precioGalonRD: 270.0 },
    ];

    expect(obtenerVersionVigente(versiones, '2026-05-31').version).toBe(1);
    expect(obtenerVersionVigente(versiones, '2026-06-01').version).toBe(2);
    expect(obtenerVersionVigente(versiones, '2026-11-18').precioGalonRD).toBe(255.0);
    expect(obtenerVersionVigente(versiones, '2026-12-15').version).toBe(3);

    // Un servicio histórico conserva su snapshot aunque cambie la configuración posterior
    const srvHistorico: Servicio = {
      id: 'srv-hist',
      empresaId: 'emp-aia',
      rutaId: 'ruta-1',
      tipoServicioId: 'deslinde',
      nombre: 'Deslinde histórico',
      cotizacionRD: 90000,
      configVersion: 1,
      tarifaBaseUsadaRD: 90000,
      recargosUsadosRD: 0,
      estado: 'cobrado',
      version: 1,
      updatedAt: '2026-02-01T10:00:00Z',
      syncStatus: 'synced',
    };
    const cfg = crearConfiguracionInicialEmpresa('emp-aia');
    const deslindeCfg = cfg.servicios.find((s) => s.codigo === 'deslinde')!;
    deslindeCfg.versiones.push({
      version: 2,
      vigenciaDesde: '2026-11-01',
      precioBaseRD: 120000,
      recargoCorredorPorKmRD: 0,
      recargoAreaPorHaExtraRD: 4500,
      umbralAreaBaseM2: 10000,
    });

    const srvVigenteNov = obtenerServiciosVigentes(cfg, '2026-11-18').find(
      (s) => s.codigo === 'deslinde'
    )!;
    expect(srvVigenteNov.precioBaseRD).toBe(120000);
    // El registro histórico nunca se recalcula con la v2
    expect(srvHistorico.cotizacionRD).toBe(90000);
    expect(srvHistorico.configVersion).toBe(1);
  });

  it('Aplica la regla oficial de GPS Ruta: mínimo 12 km, RD$ 26.5/km, ida y vuelta configurable', () => {
    const cfg = crearConfiguracionInicialEmpresa('emp-aia');
    const reglas = obtenerReglasViaticosVigentes(cfg, '2026-11-18');
    expect(reglas.gpsRuta).toEqual({
      tarifaPorKmRD: 26.5,
      minimoKm: 12,
      conceptoDistancia: 'ida_vuelta',
    });

    // 4 km lineales ida -> 8 km ida y vuelta (< mínimo 12 km) -> cobra 12 km * 26.5 = RD$ 318
    const corta = calcularCombustibleGpsRuta({
      distanciaOneWayKm: 4,
      regla: reglas.gpsRuta,
    });
    expect(corta.distanciaCalculadaKm).toBe(12);
    expect(corta.montoRD).toBe(318);

    // 20 km lineales ida -> 40 km ida y vuelta (> 12 km) -> 40 * 26.5 = RD$ 1,060
    const media = calcularCombustibleGpsRuta({
      distanciaOneWayKm: 20,
      regla: reglas.gpsRuta,
    });
    expect(media.distanciaCalculadaKm).toBe(40);
    expect(media.montoRD).toBe(1060);

    // Si se configura solo_ida en versión nueva
    const soloIda = calcularCombustibleGpsRuta({
      distanciaOneWayKm: 20,
      regla: { tarifaPorKmRD: 30, minimoKm: 10, conceptoDistancia: 'solo_ida' },
    });
    expect(soloIda.distanciaCalculadaKm).toBe(20);
    expect(soloIda.montoRD).toBe(600);
  });

  it('Rechaza valores negativos, fechas solapadas y borrar un cargo base o asignado', () => {
    const cfg = crearConfiguracionInicialEmpresa('emp-aia');

    // No valores negativos en combustible, servicios, terreno, reglas viáticos ni vehículos
    expect(
      validarNuevaVigenciaCombustible(cfg.combustibles[0].versiones, {
        vigenciaDesde: '2026-11-20',
        precioGalonRD: -10,
      }).valido
    ).toBe(false);

    expect(
      validarNuevaVigenciaServicio(cfg.servicios[0].versiones, {
        vigenciaDesde: '2026-11-20',
        precioBaseRD: -500,
        recargoCorredorPorKmRD: 0,
        recargoAreaPorHaExtraRD: 3500,
        umbralAreaBaseM2: 10000,
      }).valido
    ).toBe(false);

    expect(
      validarNuevaVigenciaTerreno(cfg.factoresTerreno, {
        vigenciaDesde: '2026-11-20',
        Llano: 1,
        Ondulado: 0,
        Montañoso: 1.5,
      }).valido
    ).toBe(false);

    const baseReglas = obtenerReglasViaticosVigentes(cfg);
    expect(
      validarNuevaVigenciaReglasViaticos(cfg.reglasViaticos, {
        ...baseReglas,
        vigenciaDesde: '2026-11-20',
        dietaCampoRD: -100,
      }).valido
    ).toBe(false);

    expect(
      validarVehiculoConfig({
        etiqueta: 'Hilux',
        placa: 'L123456',
        precioGalonRD: 239.1,
        kmPorGal: 0,
        mantenimientoPorKmRD: 15,
      }).valido
    ).toBe(false);

    // No solapar vigencias en la misma fecha para el mismo concepto
    expect(
      validarNuevaVigenciaCombustible(cfg.combustibles[0].versiones, {
        vigenciaDesde: '2026-01-01',
        precioGalonRD: 245,
      }).valido
    ).toBe(false);

    // Cargos extensibles: código estable y bloqueo de borrado si tiene personal asignado
    const valNuevoCargo = validarCargoConfig({
      codigo: 'Operador Dron RTK',
      etiqueta: 'Operador Dron RTK',
      existentes: cfg.cargos,
    });
    expect(valNuevoCargo.valido).toBe(true);
    expect(valNuevoCargo.codigoNormalizado).toBe('operador_dron_rtk');

    const cargosConCustom = [
      ...cfg.cargos,
      { codigo: 'operador_dron_rtk', etiqueta: 'Operador Dron RTK', esBase: false, activo: true },
    ];
    const personalMock: Personal[] = [
      {
        id: 'per-99',
        empresaId: 'emp-aia',
        nombre: 'Ana Polanco',
        cargo: 'operador_dron_rtk',
        activo: true,
      },
    ];
    expect(
      validarEliminarCargo({ codigo: 'tecnico', cargos: cargosConCustom, personal: [] }).valido
    ).toBe(false);
    expect(
      validarEliminarCargo({
        codigo: 'operador_dron_rtk',
        cargos: cargosConCustom,
        personal: personalMock,
      }).valido
    ).toBe(false);
    expect(
      validarEliminarCargo({
        codigo: 'operador_dron_rtk',
        cargos: cargosConCustom,
        personal: [],
      }).valido
    ).toBe(true);
    expect(resolverEtiquetaCargo('operador_dron_rtk', cargosConCustom)).toBe('Operador Dron RTK');
  });

  it('Control de acceso a Configuración: admin edita, coordinador solo lee servicios/flota/ayuda, técnico sin acceso', () => {
    expect(puedeVerConfiguracion('admin')).toBe(true);
    expect(puedeEditarConfiguracion('admin')).toBe(true);
    expect(puedeVerSeccionConfiguracion('admin', 'empresa')).toBe(true);
    expect(puedeVerSeccionConfiguracion('admin', 'usuarios')).toBe(true);

    expect(puedeVerConfiguracion('coordinador')).toBe(true);
    expect(puedeEditarConfiguracion('coordinador')).toBe(false);
    expect(puedeVerSeccionConfiguracion('coordinador', 'servicios')).toBe(true);
    expect(puedeVerSeccionConfiguracion('coordinador', 'flota')).toBe(true);
    expect(puedeVerSeccionConfiguracion('coordinador', 'ayuda')).toBe(true);
    expect(puedeVerSeccionConfiguracion('coordinador', 'empresa')).toBe(false);
    expect(puedeVerSeccionConfiguracion('coordinador', 'usuarios')).toBe(false);

    expect(puedeVerConfiguracion('tecnico')).toBe(false);
    expect(puedeEditarConfiguracion('tecnico')).toBe(false);
    expect(puedeVerSeccionConfiguracion('tecnico', 'servicios')).toBe(false);
  });

  it('La configuración inicial produce resultados idénticos a los valores demo previos', () => {
    const cfg = crearConfiguracionInicialEmpresa('emp-aia');
    const servicios = obtenerServiciosVigentes(cfg, '2026-01-01');
    const terreno = obtenerFactoresTerrenoVigentes(cfg, '2026-01-01');
    const combustibles = obtenerCombustiblesVigentes(cfg, '2026-01-01');
    const reglas = obtenerReglasViaticosVigentes(cfg, '2026-01-01');

    // Catálogo de 5 servicios y factores de terreno idénticos
    expect(servicios).toHaveLength(5);
    expect(SERVICE_CATALOG.map((s) => ({ id: s.id, base: s.basePriceRD }))).toEqual(
      servicios.map((s) => ({ id: s.codigo, base: s.precioBaseRD }))
    );
    expect(TERRAIN_MULTIPLIER).toEqual({
      Llano: terreno.Llano,
      Ondulado: terreno.Ondulado,
      Montañoso: terreno.Montañoso,
    });
    expect(combustibles.map((c) => c.precioGalonRD)).toEqual(
      VEHICLE_CATALOG.map((v) => v.fuelPricePerGalRD)
    );

    // Deslinde 25,000 m² en terreno Ondulado: (75,000 + ((25000-10000)/10000)*3500) * 1.2 = 96,300
    const deslinde = servicios.find((s) => s.codigo === 'deslinde')!;
    const cot = calcularCotizacionServicioVigente({
      servicio: deslinde,
      areaM2: 25000,
      corridorKm: 70,
      terrain: 'Ondulado',
      factoresTerreno: terreno,
    });
    expect(cot.totalRD).toBe(96300);

    // Ingeniería corredor vial 15 km en terreno Llano: 30,000 + 15 * 10,000 = 180,000
    const ingenieria = servicios.find((s) => s.codigo === 'ingenieria')!;
    const cotCorredor = calcularCotizacionServicioVigente({
      servicio: ingenieria,
      areaM2: 10000,
      corridorKm: 15,
      terrain: 'Llano',
      factoresTerreno: terreno,
    });
    expect(cotCorredor.totalRD).toBe(180000);

    // Viáticos de ruta con config inicial == cálculo por defecto (140 km > umbral hospedaje)
    const veh = VEHICLE_CATALOG[0];
    const breakdownConfig = computeRouteViaticos({
      distanceOneWayKm: 140,
      oneWayTollRD: 400,
      includeTolls: true,
      includeLodging: true,
      fuelPricePerGalRD: veh.fuelPricePerGalRD,
      kmPerGal: veh.kmPerGal,
      maintenancePerKmRD: veh.maintenancePerKmRD,
      areaM2: 18000,
      terrain: 'Llano',
      serviceCount: 1,
      reglasViaticos: reglas,
      factoresTerreno: terreno,
    });
    const breakdownDefault = computeRouteViaticos({
      distanceOneWayKm: 140,
      oneWayTollRD: 400,
      includeTolls: true,
      includeLodging: true,
      fuelPricePerGalRD: veh.fuelPricePerGalRD,
      kmPerGal: veh.kmPerGal,
      maintenancePerKmRD: veh.maintenancePerKmRD,
      areaM2: 18000,
      terrain: 'Llano',
      serviceCount: 1,
    });
    expect(breakdownConfig).toEqual(breakdownDefault);
    expect(breakdownConfig.fieldDays).toBe(1);
    expect(breakdownConfig.perDiemRD).toBe(2200);
    expect(breakdownConfig.lodgingRD).toBe(4800);
  });

  it('Rechaza umbralAreaBaseM2 <= 0 y usa el umbral configurado tal cual sin fallback silencioso a 10000', () => {
    const cfg = crearConfiguracionInicialEmpresa('emp-aia');

    // Umbral 0 o negativo se rechaza con mensaje claro en español
    const resCero = validarNuevaVigenciaServicio(cfg.servicios[0].versiones, {
      vigenciaDesde: '2026-11-25',
      precioBaseRD: 80000,
      recargoCorredorPorKmRD: 0,
      recargoAreaPorHaExtraRD: 3500,
      umbralAreaBaseM2: 0,
    });
    expect(resCero.valido).toBe(false);
    expect(resCero.error).toMatch(/umbral de área base/i);

    const resNeg = validarNuevaVigenciaServicio(cfg.servicios[0].versiones, {
      vigenciaDesde: '2026-11-25',
      precioBaseRD: 80000,
      recargoCorredorPorKmRD: 0,
      recargoAreaPorHaExtraRD: 3500,
      umbralAreaBaseM2: -500,
    });
    expect(resNeg.valido).toBe(false);
    expect(resNeg.error).toMatch(/umbral de área base/i);

    // Umbral válido distinto a 10,000 m² se aplica exactamente como se configuró
    const terreno = obtenerFactoresTerrenoVigentes(cfg, '2026-11-18');
    const deslinde5k = {
      ...obtenerServiciosVigentes(cfg, '2026-11-18').find((s) => s.codigo === 'deslinde')!,
      umbralAreaBaseM2: 5000,
      recargoAreaPorHaExtraRD: 4000,
      precioBaseRD: 75000,
    };
    // 15,000 m² con umbral 5,000 -> 10,000 m² extra (1 ha) -> 75,000 + 4,000 = 79,000
    const cot5k = calcularCotizacionServicioVigente({
      servicio: deslinde5k,
      areaM2: 15000,
      corridorKm: 0,
      terrain: 'Llano',
      factoresTerreno: terreno,
    });
    expect(cot5k.areaSurchargeRD).toBe(4000);
    expect(cot5k.totalRD).toBe(79000);

    // 12,000 m² con umbral 15,000 -> por debajo del umbral -> recargo 0
    const deslinde15k = { ...deslinde5k, umbralAreaBaseM2: 15000 };
    const cot15k = calcularCotizacionServicioVigente({
      servicio: deslinde15k,
      areaM2: 12000,
      corridorKm: 0,
      terrain: 'Llano',
      factoresTerreno: terreno,
    });
    expect(cot15k.areaSurchargeRD).toBe(0);
    expect(cot15k.totalRD).toBe(75000);
  });
});
