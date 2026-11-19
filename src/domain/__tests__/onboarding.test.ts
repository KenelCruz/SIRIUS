import { describe, expect, it } from 'vitest';
import {
  asegurarEstadoOnboarding,
  cerrarTarjetaOnboardingEnHoy,
  completarPasoOnboarding,
  crearEstadoOnboardingInicial,
  obtenerPasosOnboardingVisibles,
  obtenerResumenOnboarding,
  reiniciarOnboarding,
  saltarPasoOnboarding,
  seleccionarPasoOnboarding,
} from '../onboarding';

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

  it('Ocultar tarjeta en Hoy la desactiva y reiniciar el asistente la vuelve a mostrar en 0%', () => {
    let estado = crearEstadoOnboardingInicial('emp-aia');
    estado = cerrarTarjetaOnboardingEnHoy(estado);
    expect(obtenerResumenOnboarding(estado, true).debeMostrarTarjetaHoy).toBe(false);

    const reiniciado = reiniciarOnboarding('emp-aia');
    const resumen = obtenerResumenOnboarding(reiniciado, true);
    expect(resumen.porcentajeResuelto).toBe(0);
    expect(resumen.debeMostrarTarjetaHoy).toBe(true);
    expect(reiniciado.pasoActual).toBe('empresa');
  });
});
