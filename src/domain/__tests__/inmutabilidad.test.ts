import { beforeEach, describe, expect, it } from 'vitest';
import { LocalRepositorioOperacion } from '../../data/LocalRepositorioOperacion';

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

describe('Inmutabilidad de viáticos decididos y rentas cerradas', () => {
  let repo: LocalRepositorioOperacion;

  beforeEach(async () => {
    installMemoryLocalStorage();
    repo = new LocalRepositorioOperacion();
    await repo.iniciarSesion('admin@aiaservices.do', 'demo123');
  });

  it('1. Decidir un viático aprobado falla, para admin y coordinador', async () => {
    await expect(
      repo.decidirViatico({
        empresaId: 'emp-aia',
        viaticoId: 'via-1',
        nuevoEstado: 'rechazado',
        motivoRechazo: 'Intento de revertir aprobado por admin',
      })
    ).rejects.toThrow('Este viático ya fue revisado y no puede decidirse de nuevo.');

    await repo.iniciarSesion('coordinador@aiaservices.do', 'demo123');
    await expect(
      repo.decidirViatico({
        empresaId: 'emp-aia',
        viaticoId: 'via-1',
        nuevoEstado: 'aprobado',
        motivoDecision: 'Intento de re-aprobar por coordinador',
      })
    ).rejects.toThrow('Este viático ya fue revisado y no puede decidirse de nuevo.');
  });

  it('2. Decidir un viático rechazado falla', async () => {
    await expect(
      repo.decidirViatico({
        empresaId: 'emp-aia',
        viaticoId: 'via-5',
        nuevoEstado: 'aprobado',
        motivoDecision: 'Intento de aprobar un viático ya rechazado',
      })
    ).rejects.toThrow('Este viático ya fue revisado y no puede decidirse de nuevo.');
  });

  it('3. Decidir un viático pendiente como pendiente falla', async () => {
    await expect(
      repo.decidirViatico({
        empresaId: 'emp-aia',
        viaticoId: 'via-3',
        nuevoEstado: 'pendiente',
        motivoDecision: 'Intento de dejar en pendiente',
      })
    ).rejects.toThrow(
      'Un viático no puede devolverse a pendiente. Si hubo un error, regístralo como ajuste.'
    );
  });

  it('4. Aprobar un viático pendiente con excedente al colaborador escala los repartos a la parte de la empresa y una segunda decisión falla', async () => {
    // via-3: montoRD 4400, excedenteRD 1600, repartos [{ proy-1: 4400 }]
    const aprobado = await repo.decidirViatico({
      empresaId: 'emp-aia',
      viaticoId: 'via-3',
      nuevoEstado: 'aprobado',
      decisionExcedente: 'cargo_colaborador',
      motivoDecision: 'Tope excedido asumido por el colaborador',
    });

    expect(aprobado.estadoAprobacion).toBe('aprobado');
    expect(aprobado.montoAprobadoEmpresaRD).toBe(2800);
    expect(aprobado.montoCargoColaboradorRD).toBe(1600);
    expect(aprobado.repartos).toEqual([{ proyectoId: 'proy-1', montoRD: 2800 }]);

    await expect(
      repo.decidirViatico({
        empresaId: 'emp-aia',
        viaticoId: 'via-3',
        nuevoEstado: 'rechazado',
        motivoRechazo: 'Segunda decisión no permitida',
      })
    ).rejects.toThrow('Este viático ya fue revisado y no puede decidirse de nuevo.');
  });

  it('5. Redistribuir un viático aprobado falla', async () => {
    await expect(
      repo.actualizarRepartoViatico('emp-aia', 'via-1', [
        { proyectoId: 'proy-1', montoRD: 4000 },
        { proyectoId: 'sin_asignar', montoRD: 500 },
      ])
    ).rejects.toThrow('Este viático ya fue revisado y su reparto no puede modificarse.');
  });

  it('6. Eliminar un viático aprobado falla, para admin y coordinador', async () => {
    await expect(repo.eliminarViatico('emp-aia', 'via-1')).rejects.toThrow(
      'Un viático aprobado o rechazado no puede eliminarse. Si fue un error, regístralo como ajuste.'
    );

    await repo.iniciarSesion('coordinador@aiaservices.do', 'demo123');
    await expect(repo.eliminarViatico('emp-aia', 'via-1')).rejects.toThrow(
      'Un viático aprobado o rechazado no puede eliminarse. Si fue un error, regístralo como ajuste.'
    );
  });

  it('7. Eliminar un viático rechazado falla', async () => {
    await expect(repo.eliminarViatico('emp-aia', 'via-5')).rejects.toThrow(
      'Un viático aprobado o rechazado no puede eliminarse. Si fue un error, regístralo como ajuste.'
    );
  });

  it('8. Eliminar un viático pendiente sigue funcionando', async () => {
    await repo.eliminarViatico('emp-aia', 'via-3');
    const snap = await repo.cargarSnapshotEmpresa('emp-aia');
    expect(snap.viaticos.some((v) => v.id === 'via-3')).toBe(false);
  });

  it('9. Editar una renta finalizada falla', async () => {
    const renta = await repo.guardarRenta('emp-aia', {
      recursoTipo: 'vehiculo',
      recursoId: 'veh-2',
      proveedor: 'Rentadora Cibao',
      fechaInicio: '2026-12-10',
      fechaFin: '2026-12-12',
      modalidadTarifa: 'por_dia',
      tarifaRD: 4500,
      cantidadEstimada: 2,
      incluyeItbis: false,
      itbisRD: 0,
      costoTotalRD: 9000,
      estado: 'activa',
      repartos: [{ proyectoId: 'proy-3', montoRD: 9000 }],
    });

    const finalizada = await repo.devolverRenta({
      empresaId: 'emp-aia',
      rentaId: renta.id,
      fechaDevolucion: '2026-12-12',
    });
    expect(finalizada.estado).toBe('finalizada');

    await expect(
      repo.guardarRenta('emp-aia', {
        id: finalizada.id,
        recursoTipo: finalizada.recursoTipo,
        recursoId: finalizada.recursoId,
        proveedor: 'Rentadora Modificada',
        fechaInicio: finalizada.fechaInicio,
        fechaFin: finalizada.fechaFin,
        modalidadTarifa: finalizada.modalidadTarifa,
        tarifaRD: 5000,
        cantidadEstimada: 2,
        incluyeItbis: false,
        itbisRD: 0,
        costoTotalRD: 10000,
        estado: 'activa',
        repartos: [{ proyectoId: 'proy-3', montoRD: 10000 }],
      })
    ).rejects.toThrow('Una renta finalizada o cancelada no puede modificarse.');
  });

  it('10. Editar una renta cancelada falla', async () => {
    const cancelada = await repo.guardarRenta('emp-aia', {
      recursoTipo: 'equipo',
      recursoId: 'eq-2',
      proveedor: 'Geosistemas RD',
      fechaInicio: '2026-12-14',
      fechaFin: '2026-12-15',
      modalidadTarifa: 'por_dia',
      tarifaRD: 3000,
      cantidadEstimada: 1,
      incluyeItbis: false,
      itbisRD: 0,
      costoTotalRD: 3000,
      estado: 'cancelada',
      repartos: [{ proyectoId: 'proy-3', montoRD: 3000 }],
    });

    await expect(
      repo.guardarRenta('emp-aia', {
        id: cancelada.id,
        recursoTipo: cancelada.recursoTipo,
        recursoId: cancelada.recursoId,
        proveedor: 'Geosistemas Editada',
        fechaInicio: cancelada.fechaInicio,
        fechaFin: cancelada.fechaFin,
        modalidadTarifa: cancelada.modalidadTarifa,
        tarifaRD: 3500,
        cantidadEstimada: 1,
        incluyeItbis: false,
        itbisRD: 0,
        costoTotalRD: 3500,
        estado: 'activa',
        repartos: [{ proyectoId: 'proy-3', montoRD: 3500 }],
      })
    ).rejects.toThrow('Una renta finalizada o cancelada no puede modificarse.');
  });

  it('11. Editar una renta activa o reservada sigue funcionando', async () => {
    const reservada = await repo.guardarRenta('emp-aia', {
      recursoTipo: 'vehiculo',
      recursoId: 'veh-2',
      proveedor: 'Rentadora Inicial',
      fechaInicio: '2026-12-18',
      fechaFin: '2026-12-20',
      modalidadTarifa: 'por_dia',
      tarifaRD: 4000,
      cantidadEstimada: 2,
      incluyeItbis: false,
      itbisRD: 0,
      costoTotalRD: 8000,
      estado: 'reservada',
      repartos: [{ proyectoId: 'proy-3', montoRD: 8000 }],
    });

    const editadaActiva = await repo.guardarRenta('emp-aia', {
      id: reservada.id,
      recursoTipo: reservada.recursoTipo,
      recursoId: reservada.recursoId,
      proveedor: 'Rentadora Confirmada',
      fechaInicio: reservada.fechaInicio,
      fechaFin: '2026-12-21',
      modalidadTarifa: reservada.modalidadTarifa,
      tarifaRD: 4500,
      cantidadEstimada: 3,
      incluyeItbis: false,
      itbisRD: 0,
      costoTotalRD: 13500,
      estado: 'activa',
      repartos: [{ proyectoId: 'proy-3', montoRD: 13500 }],
    });

    expect(editadaActiva.id).toBe(reservada.id);
    expect(editadaActiva.estado).toBe('activa');
    expect(editadaActiva.proveedor).toBe('Rentadora Confirmada');
    expect(editadaActiva.costoTotalRD).toBe(13500);
    expect(editadaActiva.version).toBe(2);
  });
});
