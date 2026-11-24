import React, { useState } from 'react';
import { AlertTriangle, Ban, Info, ShieldAlert } from 'lucide-react';
import type { ConflictDetail } from '../types/domain';

interface ResourceConflictModalProps {
  conflicts: ConflictDetail[];
  onCancel: () => void;
  onConfirmWithOverride: (motivo?: string) => void;
}

export const ResourceConflictModal: React.FC<ResourceConflictModalProps> = ({
  conflicts,
  onCancel,
  onConfirmWithOverride,
}) => {
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (conflicts.length === 0) return null;

  const tieneBloqueoDuro = conflicts.some(
    (c) => c.severidad === 'bloqueante' && !c.permiteOverride
  );
  const tieneBloqueoConExcepcion = conflicts.some(
    (c) => c.severidad === 'bloqueante' && c.permiteOverride
  );
  const soloAdvertencias = !tieneBloqueoDuro && !tieneBloqueoConExcepcion;

  const handleConfirm = () => {
    if (tieneBloqueoDuro) return;
    if (tieneBloqueoConExcepcion && motivo.trim().length < 5) {
      setError('Ingresa un motivo válido (mínimo 5 caracteres) para auditar la excepción.');
      return;
    }
    setError(null);
    onConfirmWithOverride(tieneBloqueoConExcepcion ? motivo.trim() : undefined);
    setMotivo('');
  };

  const labelForType = (type: ConflictDetail['type']) => {
    switch (type) {
      case 'cuadrilla_inactiva':
        return 'Cuadrilla Dada de Baja (Bloqueo Duro)';
      case 'vehiculo_mantenimiento':
        return 'Vehículo en Mantenimiento (Bloqueo Duro)';
      case 'equipo_mantenimiento':
        return 'Equipo GNSS No Disponible (Bloqueo Duro)';
      case 'renta_solapada':
        return 'Renta Activa/Reservada Solapada (Bloqueo Duro)';
      case 'renta_lejana':
        return 'Renta en Otra Zona Fuera de Umbral (Bloqueo Duro)';
      case 'renta_cercana':
        return 'Renta Cercana / De Camino (Permite Excepción)';
      case 'personal':
        return 'Técnico Solapado en Fechas';
      case 'cuadrilla':
        return 'Cuadrilla Solapada en Fechas';
      case 'vehiculo':
        return 'Vehículo Solapado en Fechas';
      case 'equipo':
        return 'Equipo GNSS Solapado en Fechas';
      case 'spatial':
        return 'Proximidad Espacial < 120 m (Advertencia)';
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#0F2942]/65 backdrop-blur-[2px] p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="titulo-conflicto-recursos"
    >
      <div
        className={`w-full max-w-lg overflow-hidden rounded-xl border bg-white shadow-2xl ${
          tieneBloqueoDuro || tieneBloqueoConExcepcion
            ? 'border-rose-300'
            : 'border-amber-300'
        }`}
      >
        <div
          className={`h-1.5 w-full ${
            tieneBloqueoDuro || tieneBloqueoConExcepcion ? 'bg-[#DC2626]' : 'bg-[#B45309]'
          }`}
        />
        <div className="p-6 space-y-4">
          <div className="flex items-start gap-3">
            <div
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
                tieneBloqueoDuro || tieneBloqueoConExcepcion
                  ? 'bg-rose-50 text-[#DC2626]'
                  : 'bg-amber-50 text-[#B45309]'
              }`}
            >
              {tieneBloqueoDuro ? (
                <Ban className="h-5 w-5" />
              ) : tieneBloqueoConExcepcion ? (
                <ShieldAlert className="h-5 w-5" />
              ) : (
                <Info className="h-5 w-5" />
              )}
            </div>
            <div>
              <h3 id="titulo-conflicto-recursos" className="text-base font-bold text-slate-900">
                {tieneBloqueoDuro
                  ? 'Asignación o Renta Bloqueada'
                  : tieneBloqueoConExcepcion
                  ? 'Conflicto de Agenda / Renta en Rango de Fechas'
                  : 'Advertencia Espacial de Ruta'}
              </h3>
              <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                {tieneBloqueoDuro
                  ? 'Uno o más recursos no están disponibles (mantenimiento, cuadrilla de baja o renta incompatible). Reemplázalos o ajusta las fechas antes de continuar.'
                  : tieneBloqueoConExcepcion
                  ? 'Se detectaron solapamientos de agenda o rentas cercanas dentro del umbral configurado. Puedes reasignar o autorizar una excepción auditada con motivo.'
                  : 'Se detectó cercanía con otra parcela existente (< 120 m). Es una advertencia informativa y no bloquea la asignación.'}
              </p>
            </div>
          </div>

          <div className="space-y-2 max-h-60 overflow-y-auto">
            {conflicts.map((conflict, index) => {
              const isWarning = conflict.severidad === 'advertencia';
              return (
                <div
                  key={`${conflict.type}-${index}`}
                  className={`rounded-lg border p-3.5 text-xs text-slate-900 ${
                    isWarning
                      ? 'border-amber-200 bg-amber-50/70'
                      : 'border-rose-200 bg-rose-50/70'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`inline-flex items-center gap-1.5 font-semibold ${
                        isWarning ? 'text-[#B45309]' : 'text-[#DC2626]'
                      }`}
                    >
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                      {labelForType(conflict.type)}
                    </span>
                    <span className="font-mono text-[11px] font-medium text-slate-500">
                      {conflict.conflictingRutaCode}
                    </span>
                  </div>
                  <p className="mt-1 text-slate-700">
                    {conflict.message} ({conflict.conflictingRutaTitle})
                  </p>
                </div>
              );
            })}
          </div>

          {!tieneBloqueoDuro && tieneBloqueoConExcepcion && (
            <div className="space-y-1.5 text-xs">
              <label className="block font-semibold text-slate-800">
                Motivo de la excepción (requerido para auditoría)
              </label>
              <textarea
                rows={2}
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Ej. Brigada apoya solo 2 horas en la mañana y se traslada luego al sector norte..."
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-[#0284C7] focus:outline-none"
              />
              {error && <p className="text-[11px] font-medium text-[#DC2626]">{error}</p>}
            </div>
          )}

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-md border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors min-h-[40px]"
            >
              {tieneBloqueoDuro ? 'Corregir recursos' : 'Cancelar y reasignar'}
            </button>
            {!tieneBloqueoDuro && (
              <button
                type="button"
                onClick={handleConfirm}
                className={`rounded-md px-4 py-2 text-xs font-semibold text-white transition-colors min-h-[40px] ${
                  soloAdvertencias
                    ? 'bg-[#0F2942] hover:bg-[#0284C7]'
                    : 'bg-[#DC2626] hover:bg-red-700'
                }`}
              >
                {soloAdvertencias
                  ? 'Continuar con advertencia'
                  : 'Autorizar excepción'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
