import { describe, expect, it } from 'vitest';
import type { Empresa, Personal, Proyecto, Vehiculo } from '../../types/domain';
import { crearConfiguracionInicialEmpresa } from '../configuracion';
import {
  asegurarEstadoOnboarding,
  completarPasoOnboarding,
  crearEstadoOnboardingInicial,
  detectarEstadoPasoDesdeDatos,
  obtenerPasosOnboardingVisibles,
  obtenerResumenOnboarding,
  ocultarTarjetaOnboarding,
  reiniciarOnboarding,
  saltarPasoOnboarding,
  seleccionarPasoOnboarding,
} from '../onboarding';

const empresaValida: Empresa = {
  id: 'emp-nueva',
  nombre: 'GeoTop RD SRL',
  rnc: '1-32-55441-9',
  direccionBase: 'Av. Winston Churchill #40, Santo Domingo',
  baseLat: 18.47,
  baseLon: -69.94,
  zonaHoraria: 'America/Santo_Domingo',
  moneda: 'RD$',
  planMensualRD: 9500,
  estadoSuscripcion: 'prueba',
  fechaAlta: '2026-11-18',
};

const personalMock: Personal[] = [
  {
    id: 'per-1',
    empresaId: 'emp-nueva',
    nombre: 'Carlos Méndez',
    cargo: 'tecnico',
    activo: true,
  },
];

const vehiculoMock: Vehiculo[] = [
  {
    id: 'veh-1',
    empresaId: 'emp-nueva',
    etiqueta: 'Toyota Hilux 4x4',
    placa: 'L409812',
    tipoCombustibleId: 'diesel_optimo',
    tipoCombustible: 'Diésel Óptimo',
    precioGalonRD: 239.1,
    kmPorGal: 34,
    mantenimientoPorKmRD: 15,
    estado: 'disponible',
  },
];

const proyectoMock: Proyecto[] = [
  {
    id: 'proy-1',
    empresaId: 'emp-nueva',
    clienteId: 'cli-1',
    nombre: 'Deslinde Parcela Norte',
    codigoContrato: 'GEO-2026-001',
    estado: 'cotizado',
    presupuestoViaticosRD: 15000,
    valorContratoRD: 95000,
    fechaCreacion: '2026-11-18',
    updatedAt: '2026-11-18T10:00:00Z',
    version: 1,
    syncStatus: 'synced',
  },
];

describe('Onboarding opcional por empresa (A2)', () => {
  it('Incluye 6 pasos en modo demo y oculta el KMZ de prueba en producción', () => {
    const pasosDemo = obtenerPasosOnboardingVisibles(true);
    const pasosProd = obtenerPasosOnboardingVisibles(false);

    expect(pasosDemo).toHaveLength(6);
    expect(pasosDemo.some((p) => p.id === 'kmz_demo')).toBe(true);

    expect(pasosProd).toHaveLength(5);
    expect(pasosProd.some((p) => p.id === 'kmz_demo')).toBe(false);
  });

  it('Permite completar o saltar cada paso y reanudar ("Terminar después") manteniendo progreso', () => {
    let estado = crearEstadoOnboardingInicial('emp-nueva', '2026-11-18T10:00:00Z');
    expect(estado.tarjetaOcultada).toBe(false);
    expect(obtenerResumenOnboarding(estado, false).porcentajeResuelto).toBe(0);
    expect(obtenerResumenOnboarding(estado, false).debeMostrarTarjetaHoy).toBe(true);

    estado = completarPasoOnboarding(estado, 'empresa', false, '2026-11-18T10:05:00Z');
    expect(estado.pasos.empresa).toBe('completo');
    expect(estado.pasoActual).toBe('personal_cargos');

    estado = saltarPasoOnboarding(estado, 'personal_cargos', false, '2026-11-18T10:06:00Z');
    expect(estado.pasos.personal_cargos).toBe('saltado');
    expect(estado.pasoActual).toBe('flota');

    // Al salir con "Terminar después" y reingresar desde snapshot guardado, conserva el paso activo
    const rehidratado = asegurarEstadoOnboarding('emp-nueva', estado);
    expect(rehidratado.pasoActual).toBe('flota');
    expect(obtenerResumenOnboarding(rehidratado, false).porcentajeResuelto).toBe(40); // 2/5 en prod

    // Seleccionar paso manual y completar los restantes desaparece la tarjeta en Hoy
    estado = seleccionarPasoOnboarding(estado, 'cliente_proyecto');
    expect(estado.pasoActual).toBe('cliente_proyecto');

    estado = completarPasoOnboarding(estado, 'flota', false);
    estado = saltarPasoOnboarding(estado, 'servicios', false);
    estado = completarPasoOnboarding(estado, 'cliente_proyecto', false);

    const resumenFinal = obtenerResumenOnboarding(estado, false);
    expect(resumenFinal.estaFinalizado).toBe(true);
    expect(resumenFinal.porcentajeResuelto).toBe(100);
    expect(resumenFinal.debeMostrarTarjetaHoy).toBe(false);
  });

  it('detectarEstadoPasoDesdeDatos valida los datos mínimos de los 6 pasos', () => {
    const config = crearConfiguracionInicialEmpresa('emp-nueva');
    const configSinActivos = {
      ...config,
      servicios: config.servicios.map((s) => ({ ...s, activo: false })),
    };

    // 1. empresa
    expect(
      detectarEstadoPasoDesdeDatos('empresa', {
        empresa: { nombre: 'Sin RNC', rnc: '', direccionBase: 'Av. 27' },
      })
    ).toBe('pendiente');
    expect(detectarEstadoPasoDesdeDatos('empresa', { empresa: empresaValida })).toBe('completo');

    // 2. personal_cargos
    expect(detectarEstadoPasoDesdeDatos('personal_cargos', { personal: [] })).toBe('pendiente');
    expect(detectarEstadoPasoDesdeDatos('personal_cargos', { personal: personalMock })).toBe(
      'completo'
    );

    // 3. flota
    expect(detectarEstadoPasoDesdeDatos('flota', { vehiculos: [] })).toBe('pendiente');
    expect(detectarEstadoPasoDesdeDatos('flota', { vehiculos: vehiculoMock })).toBe('completo');

    // 4. servicios
    expect(
      detectarEstadoPasoDesdeDatos('servicios', { serviciosConfig: configSinActivos.servicios })
    ).toBe('pendiente');
    expect(
      detectarEstadoPasoDesdeDatos('servicios', { serviciosConfig: config.servicios })
    ).toBe('completo');

    // 5. cliente_proyecto
    expect(detectarEstadoPasoDesdeDatos('cliente_proyecto', { proyectos: [] })).toBe('pendiente');
    expect(detectarEstadoPasoDesdeDatos('cliente_proyecto', { proyectos: proyectoMock })).toBe(
      'completo'
    );

    // 6. kmz_demo (solo en demo con proyecto de prueba)
    expect(
      detectarEstadoPasoDesdeDatos('kmz_demo', { esDemo: false, proyectos: proyectoMock })
    ).toBe('pendiente');
    expect(detectarEstadoPasoDesdeDatos('kmz_demo', { esDemo: true, proyectos: [] })).toBe(
      'pendiente'
    );
    expect(
      detectarEstadoPasoDesdeDatos('kmz_demo', { esDemo: true, proyectos: proyectoMock })
    ).toBe('completo');
  });

  it('Marcar como completado sin datos figura como "completado manualmente" y no como completado real', () => {
    let estado = crearEstadoOnboardingInicial('emp-nueva');
    estado = completarPasoOnboarding(estado, 'flota', false);
    estado = completarPasoOnboarding(estado, 'cliente_proyecto', false);

    // Sin vehículos ni proyectos reales: ambos figuran como completo_manual ("completado manualmente")
    const resumenSinDatos = obtenerResumenOnboarding(estado, false, {
      empresa: empresaValida,
      personal: [],
      vehiculos: [],
      serviciosConfig: [],
      proyectos: [],
      esDemo: false,
    });

    expect(resumenSinDatos.estadoPorPaso.empresa).toBe('completo');
    expect(resumenSinDatos.estadoPorPaso.flota).toBe('completo_manual');
    expect(resumenSinDatos.estadoPorPaso.cliente_proyecto).toBe('completo_manual');

    expect(resumenSinDatos.pasosCompletados.map((p) => p.id)).toEqual(['empresa']);
    expect(resumenSinDatos.pasosCompletadosManuales.map((p) => p.id)).toEqual([
      'flota',
      'cliente_proyecto',
    ]);
    const detalleFlota = resumenSinDatos.detallePasos.find((d) => d.paso.id === 'flota')!;
    expect(detalleFlota.completoReal).toBe(false);
    expect(detalleFlota.etiquetaEstado).toBe('completado manualmente');

    // Al agregar el vehículo real, pasa a completado real
    const resumenConVehiculo = obtenerResumenOnboarding(estado, false, {
      empresa: empresaValida,
      personal: [],
      vehiculos: vehiculoMock,
      serviciosConfig: [],
      proyectos: [],
      esDemo: false,
    });
    expect(resumenConVehiculo.estadoPorPaso.flota).toBe('completo');
    expect(resumenConVehiculo.pasosCompletados.map((p) => p.id)).toEqual(['empresa', 'flota']);
    expect(resumenConVehiculo.pasosCompletadosManuales.map((p) => p.id)).toEqual([
      'cliente_proyecto',
    ]);
  });

  it('Ocultar tarjeta de forma permanente (tarjetaOcultada) y migrar cerradoEnHoy legado; reiniciar vuelve a 0%', () => {
    let estado = crearEstadoOnboardingInicial('emp-aia');
    estado = ocultarTarjetaOnboarding(estado);
    expect(estado.tarjetaOcultada).toBe(true);
    expect(obtenerResumenOnboarding(estado, true).debeMostrarTarjetaHoy).toBe(false);

    // Compatibilidad hacia atrás si un snapshot guardado aún tenía cerradoEnHoy sin tarjetaOcultada
    const { tarjetaOcultada: _omitted, ...baseSinNuevoCampo } = crearEstadoOnboardingInicial('emp-aia');
    const legado = {
      ...baseSinNuevoCampo,
      cerradoEnHoy: true,
    } as unknown as ReturnType<typeof crearEstadoOnboardingInicial>;
    const migrado = asegurarEstadoOnboarding('emp-aia', legado);
    expect(migrado.tarjetaOcultada).toBe(true);
    expect('cerradoEnHoy' in migrado).toBe(false);

    const reiniciado = reiniciarOnboarding('emp-aia');
    const resumen = obtenerResumenOnboarding(reiniciado, true);
    expect(resumen.porcentajeResuelto).toBe(0);
    expect(resumen.debeMostrarTarjetaHoy).toBe(true);
    expect(reiniciado.tarjetaOcultada).toBe(false);
    expect(reiniciado.pasoActual).toBe('empresa');
  });
});
