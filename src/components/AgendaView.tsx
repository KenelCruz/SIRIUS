import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarDays,
  Plus,
  ShieldCheck,
  Trash2,
  Users,
  Wrench,
} from 'lucide-react';
import {
  detectarConflictosAsignacion,
  expandirRangoFechas,
  puedeAsignarRutas,
  validarRangoFechas,
} from '../domain';
import type {
  Asignacion,
  ConflictDetail,
  Cuadrilla,
  EquipoGNSS,
  OverrideConflicto,
  Personal,
  RolEmpresa,
  Ruta,
  Vehiculo,
} from '../types/domain';
import { ResourceConflictModal } from './ResourceConflictModal';

interface AgendaViewProps {
  rol: RolEmpresa;
  usuarioActual: { id: string; nombre: string };
  rutas: Ruta[];
  cuadrillas: Cuadrilla[];
  personal: Personal[];
  vehiculos: Vehiculo[];
  equipos: EquipoGNSS[];
  asignaciones: Asignacion[];
  onGuardarAsignacion: (
    datos: Omit<Asignacion, 'id' | 'empresaId' | 'version' | 'updatedAt' | 'syncStatus'> & {
      id?: string;
    }
  ) => Promise<void>;
  onEliminarAsignacion: (asignacionId: string) => Promise<void>;
}

export const AgendaView: React.FC<AgendaViewProps> = ({
  rol,
  usuarioActual,
  rutas,
  cuadrillas,
  personal,
  vehiculos,
  equipos,
  asignaciones,
  onGuardarAsignacion,
  onEliminarAsignacion,
}) => {
  const canAssign = puedeAsignarRutas(rol);

  const [rutaId, setRutaId] = useState(rutas[0]?.id || '');
  const [cuadrillaId, setCuadrillaId] = useState(cuadrillas[0]?.id || '');
  const [fechaInicio, setFechaInicio] = useState(
    rutas[0]?.fechaPrevista || new Date().toISOString().slice(0, 10)
  );
  const [fechaFin, setFechaFin] = useState(
    rutas[0]?.fechaPrevista || new Date().toISOString().slice(0, 10)
  );
  const [vehiculoIds, setVehiculoIds] = useState<string[]>(
    vehiculos.find((v) => v.estado === 'disponible')?.id
      ? [vehiculos.find((v) => v.estado === 'disponible')!.id]
      : []
  );
  const [equipoIds, setEquipoIds] = useState<string[]>(
    equipos.find((e) => e.estado === 'disponible')?.id
      ? [equipos.find((e) => e.estado === 'disponible')!.id]
      : []
  );

  const [filtroCuadrilla, setFiltroCuadrilla] = useState('ALL');
  const [filtroFecha, setFiltroFecha] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [pendingCandidate, setPendingCandidate] = useState<
    | (Omit<Asignacion, 'id' | 'empresaId' | 'version' | 'updatedAt' | 'syncStatus'> & {
        id?: string;
      })
    | null
  >(null);
  const [conflictosModal, setConflictosModal] = useState<ConflictDetail[]>([]);

  const toggleId = (list: string[], id: string, setter: (v: string[]) => void) => {
    setter(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  };

  const handleSubmitAsignacion = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!rutaId || !cuadrillaId) {
      setFormError('Selecciona una ruta y una cuadrilla.');
      return;
    }
    if (!validarRangoFechas(fechaInicio, fechaFin)) {
      setFormError('El rango de fechas es inválido (fechaInicio debe ser menor o igual a fechaFin).');
      return;
    }

    const candidata = {
      id: `asig-cand-${Date.now()}`,
      rutaId,
      fechaInicio,
      fechaFin,
      cuadrillaId,
      vehiculoIds,
      equipoIds,
    };

    const encontrados = detectarConflictosAsignacion({
      candidata,
      asignacionesExistentes: asignaciones,
      rutas,
      cuadrillas,
      personal,
      vehiculos,
      equipos,
    });

    const payloadLimpio = {
      rutaId,
      fechaInicio,
      fechaFin,
      cuadrillaId,
      vehiculoIds,
      equipoIds,
    };

    if (encontrados.length > 0) {
      setPendingCandidate(payloadLimpio);
      setConflictosModal(encontrados);
      return;
    }

    setIsSaving(true);
    try {
      await onGuardarAsignacion(payloadLimpio);
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Error al guardar la asignación.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleConfirmarOverride = async (motivo?: string) => {
    if (!pendingCandidate) return;
    setFormError(null);
    setIsSaving(true);
    try {
      const overrideConflicto: OverrideConflicto | undefined = motivo
        ? {
            motivo,
            usuarioId: usuarioActual.id,
            usuarioNombre: usuarioActual.nombre,
            fecha: new Date().toISOString().slice(0, 10),
          }
        : undefined;
      await onGuardarAsignacion({
        ...pendingCandidate,
        overrideConflicto,
      });
      setPendingCandidate(null);
      setConflictosModal([]);
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'No se pudo autorizar la asignación.');
    } finally {
      setIsSaving(false);
    }
  };

  // F6: Expandir cada asignación por cada día en [fechaInicio, fechaFin]
  const agendaPorDia = useMemo(() => {
    const mapa = new Map<string, Array<{ asignacion: Asignacion; ruta?: Ruta; cuadrilla?: Cuadrilla }>>();
    for (const asig of asignaciones) {
      if (filtroCuadrilla !== 'ALL' && asig.cuadrillaId !== filtroCuadrilla) continue;
      const ruta = rutas.find((r) => r.id === asig.rutaId);
      const cuadrilla = cuadrillas.find((c) => c.id === asig.cuadrillaId);
      const dias = expandirRangoFechas(asig.fechaInicio, asig.fechaFin);
      for (const dia of dias) {
        if (filtroFecha && dia !== filtroFecha) continue;
        const arr = mapa.get(dia) || [];
        arr.push({ asignacion: asig, ruta, cuadrilla });
        mapa.set(dia, arr);
      }
    }
    return Array.from(mapa.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [asignaciones, rutas, cuadrillas, filtroCuadrilla, filtroFecha]);

  return (
    <section className="space-y-5">
      {canAssign && (
        <form
          onSubmit={handleSubmitAsignacion}
          className="rounded-md border border-[#CBD5E1] bg-white p-4 sm:p-5 space-y-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E2E8F0] pb-3">
            <div>
              <h2 className="text-sm font-bold text-[#0F2942]">
                Programar Asignación de Cuadrilla por Rango de Fechas (F5)
              </h2>
              <p className="text-xs text-[#43474D]">
                Valida solapamientos de cuadrilla, técnicos, vehículos, equipos GNSS y proximidad espacial (&lt; 120 m).
              </p>
            </div>
          </div>

          {formError && (
            <div className="rounded-sm border border-[#FCA5A5] bg-[#FEE2E2] px-3 py-2 text-xs text-[#93000A]">
              {formError}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
            <div className="md:col-span-2">
              <label className="block font-semibold text-[#334155] mb-1">Ruta / Parcela</label>
              <select
                value={rutaId}
                onChange={(e) => {
                  setRutaId(e.target.value);
                  const r = rutas.find((x) => x.id === e.target.value);
                  if (r) {
                    setFechaInicio(r.fechaPrevista);
                    setFechaFin(r.fechaPrevista);
                  }
                }}
                className="w-full rounded-sm border border-[#CBD5E1] bg-white px-3 py-2 text-xs"
              >
                {rutas.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.codigoParcela} — {r.nombre} ({r.provincia})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-semibold text-[#334155] mb-1">Fecha Inicio</label>
              <input
                type="date"
                required
                value={fechaInicio}
                onChange={(e) => setFechaInicio(e.target.value)}
                className="w-full rounded-sm border border-[#CBD5E1] px-3 py-2 font-mono text-xs"
              />
            </div>

            <div>
              <label className="block font-semibold text-[#334155] mb-1">Fecha Fin</label>
              <input
                type="date"
                required
                min={fechaInicio}
                value={fechaFin}
                onChange={(e) => setFechaFin(e.target.value)}
                className="w-full rounded-sm border border-[#CBD5E1] px-3 py-2 font-mono text-xs"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div>
              <label className="block font-semibold text-[#334155] mb-1.5">Cuadrilla</label>
              <select
                value={cuadrillaId}
                onChange={(e) => setCuadrillaId(e.target.value)}
                className="w-full rounded-sm border border-[#CBD5E1] bg-white px-3 py-2 text-xs"
              >
                {cuadrillas.map((c) => {
                  const jefe = personal.find((p) => p.id === c.jefeId);
                  return (
                    <option key={c.id} value={c.id}>
                      {c.nombre} ({jefe?.nombre || 'Sin jefe'})
                    </option>
                  );
                })}
              </select>
            </div>

            <div>
              <label className="block font-semibold text-[#334155] mb-1.5">Vehículos</label>
              <div className="space-y-1.5 max-h-28 overflow-y-auto rounded-sm border border-[#E2E8F0] p-2 bg-[#F8FAFC]">
                {vehiculos.map((v) => {
                  const enMant = v.estado !== 'disponible';
                  return (
                    <label
                      key={v.id}
                      className="flex items-center justify-between gap-2 cursor-pointer"
                    >
                      <span className="inline-flex items-center gap-1.5">
                        <input
                          type="checkbox"
                          checked={vehiculoIds.includes(v.id)}
                          onChange={() => toggleId(vehiculoIds, v.id, setVehiculoIds)}
                          className="accent-[#0F2942]"
                        />
                        <span>
                          {v.etiqueta} ({v.placa})
                        </span>
                      </span>
                      {enMant && (
                        <span className="inline-flex items-center gap-1 font-mono text-[10px] font-semibold text-[#DC2626]">
                          <Wrench className="h-3 w-3" />
                          {v.estado === 'en_mantenimiento' ? 'Mantenimiento' : 'Fuera serv.'}
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="block font-semibold text-[#334155] mb-1.5">Equipos GNSS RTK</label>
              <div className="space-y-1.5 max-h-28 overflow-y-auto rounded-sm border border-[#E2E8F0] p-2 bg-[#F8FAFC]">
                {equipos.map((eq) => (
                  <label
                    key={eq.id}
                    className="flex items-center justify-between gap-2 cursor-pointer"
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <input
                        type="checkbox"
                        checked={equipoIds.includes(eq.id)}
                        onChange={() => toggleId(equipoIds, eq.id, setEquipoIds)}
                        className="accent-[#0F2942]"
                      />
                      <span className="font-mono">{eq.nombre}</span>
                    </span>
                    {eq.estado !== 'disponible' && (
                      <span className="font-mono text-[10px] font-semibold text-[#DC2626]">
                        {eq.estado}
                      </span>
                    )}
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={isSaving}
              className="inline-flex items-center gap-1.5 rounded-sm bg-[#0F2942] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0284C7] disabled:opacity-50 min-h-[40px]"
            >
              <Plus className="h-4 w-4" />
              {isSaving ? 'Validando y guardando...' : 'Validar Conflictos y Programar'}
            </button>
          </div>
        </form>
      )}

      {/* F6: Multi-day Expanded Agenda */}
      <div className="rounded-md border border-[#CBD5E1] bg-white p-4 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#E2E8F0] pb-3">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-[#0284C7]" />
            <h2 className="text-sm font-bold text-[#0F2942]">
              Agenda Operativa por Día (F6 — Expansión de Rangos)
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <select
              value={filtroCuadrilla}
              onChange={(e) => setFiltroCuadrilla(e.target.value)}
              className="rounded-sm border border-[#CBD5E1] bg-white px-2.5 py-1.5"
            >
              <option value="ALL">Todas las cuadrillas</option>
              {cuadrillas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
            <input
              type="date"
              value={filtroFecha}
              onChange={(e) => setFiltroFecha(e.target.value)}
              className="rounded-sm border border-[#CBD5E1] px-2.5 py-1.5 font-mono"
            />
            {filtroFecha && (
              <button
                type="button"
                onClick={() => setFiltroFecha('')}
                className="text-[11px] font-semibold text-[#0284C7] hover:underline"
              >
                Limpiar fecha
              </button>
            )}
          </div>
        </div>

        {agendaPorDia.length === 0 ? (
          <div className="py-8 text-center text-xs text-[#43474D]">
            No hay asignaciones programadas para los filtros seleccionados.
          </div>
        ) : (
          <div className="space-y-4">
            {agendaPorDia.map(([fechaDia, items]) => (
              <div key={fechaDia} className="space-y-2">
                <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-1">
                  <span className="font-mono text-xs font-bold text-[#0F2942]">{fechaDia}</span>
                  <span className="text-[11px] text-[#43474D]">
                    {items.length} cuadrilla(s) en campo
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {items.map(({ asignacion, ruta, cuadrilla }) => {
                    const vehNames = asignacion.vehiculoIds
                      .map((id) => vehiculos.find((v) => v.id === id)?.etiqueta || id)
                      .join(', ');
                    const eqNames = asignacion.equipoIds
                      .map((id) => equipos.find((e) => e.id === id)?.nombre || id)
                      .join(', ');

                    return (
                      <div
                        key={`${fechaDia}-${asignacion.id}`}
                        className="rounded-sm border border-[#E2E8F0] bg-[#F8FAFC] p-3 space-y-1.5 text-xs"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="font-mono text-[11px] font-bold text-[#0284C7]">
                              {ruta?.codigoParcela || asignacion.rutaId} · Rango{' '}
                              {asignacion.fechaInicio} → {asignacion.fechaFin}
                            </div>
                            <div className="font-bold text-[#0D1C2F]">
                              {ruta?.nombre || 'Ruta sin nombre'}
                            </div>
                          </div>

                          {canAssign && (
                            <button
                              type="button"
                              onClick={() => onEliminarAsignacion(asignacion.id)}
                              title="Eliminar asignación"
                              className="rounded-sm p-1 text-[#DC2626] hover:bg-[#FEE2E2]"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-3 text-[11px] text-[#334155]">
                          <span className="inline-flex items-center gap-1 font-semibold">
                            <Users className="h-3 w-3 text-[#0F2942]" />
                            {cuadrilla?.nombre || asignacion.cuadrillaId}
                          </span>
                          <span>Vehículos: {vehNames || 'Ninguno'}</span>
                          <span>GNSS: {eqNames || 'Ninguno'}</span>
                        </div>

                        {asignacion.overrideConflicto ? (
                          <div className="rounded-sm border border-[#FCA5A5] bg-[#FEE2E2]/60 px-2.5 py-1.5 text-[11px] text-[#93000A]">
                            <span className="inline-flex items-center gap-1 font-semibold">
                              <AlertTriangle className="h-3 w-3" />
                              Excepción autorizada por {asignacion.overrideConflicto.usuarioNombre} (
                              {asignacion.overrideConflicto.fecha}):
                            </span>{' '}
                            {asignacion.overrideConflicto.motivo}
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-1 text-[11px] text-[#15803D]">
                            <ShieldCheck className="h-3 w-3" />
                            Sin conflictos de recursos
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <ResourceConflictModal
        conflicts={conflictosModal}
        onCancel={() => {
          setPendingCandidate(null);
          setConflictosModal([]);
        }}
        onConfirmWithOverride={handleConfirmarOverride}
      />
    </section>
  );
};
