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
      case 'vehiculo_mantenimiento':
        return 'Vehículo en Mantenimiento (Bloqueo Duro)';
      case 'equipo_mantenimiento':
        return 'Equipo GNSS No Disponible (Bloqueo Duro)';
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0F2942]/65 p-4">
      <div
        className={`w-full max-w-lg overflow-hidden rounded-md border bg-white shadow-2xl ${
          tieneBloqueoDuro || tieneBloqueoConExcepcion
            ? 'border-[#DC2626]'
            : 'border-[#D97706]'
        }`}
      >
        <div
          className={`h-1 w-full ${
            tieneBloqueoDuro || tieneBloqueoConExcepcion ? 'bg-[#DC2626]' : 'bg-[#D97706]'
          }`}
        />
        <div className="p-6 space-y-4">
          <div className="flex items-start gap-3">
            <div
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-sm ${
                tieneBloqueoDuro || tieneBloqueoConExcepcion
                  ? 'bg-[#FEE2E2] text-[#DC2626]'
                  : 'bg-[#FEF3C7] text-[#D97706]'
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
              <h3 className="text-base font-bold text-[#0D1C2F]">
                {tieneBloqueoDuro
                  ? 'Asignación Bloqueada por Indisponibilidad'
                  : tieneBloqueoConExcepcion
                  ? 'Conflicto de Agenda en Rango de Fechas'
                  : 'Advertencia Espacial de Ruta'}
              </h3>
              <p className="mt-1 text-xs text-[#43474D]">
                {tieneBloqueoDuro
                  ? 'Uno o más recursos seleccionados están en mantenimiento o fuera de servicio. Reemplázalos antes de continuar.'
                  : tieneBloqueoConExcepcion
                  ? 'Se detectaron solapamientos en el rango de fechas. Puedes reasignar o autorizar una excepción auditada con motivo.'
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
                  className={`rounded-sm border p-3 text-xs text-[#0D1C2F] ${
                    isWarning
                      ? 'border-[#FDE047] bg-[#FEF9C3]/50'
                      : 'border-[#FCA5A5] bg-[#FEE2E2]/50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`inline-flex items-center gap-1.5 font-semibold ${
                        isWarning ? 'text-[#A16207]' : 'text-[#93000A]'
                      }`}
                    >
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                      {labelForType(conflict.type)}
                    </span>
                    <span className="font-mono text-[11px] font-medium text-[#43474D]">
                      {conflict.conflictingRutaCode}
                    </span>
                  </div>
                  <p className="mt-1 text-[#334155]">
                    {conflict.message} ({conflict.conflictingRutaTitle})
                  </p>
                </div>
              );
            })}
          </div>

          {!tieneBloqueoDuro && tieneBloqueoConExcepcion && (
            <div className="space-y-1.5 text-xs">
              <label className="block font-semibold text-[#0F2942]">
                Motivo de la excepción (requerido para auditoría F16)
              </label>
              <textarea
                rows={2}
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Ej. Brigada apoya solo 2 horas en la mañana y se traslada luego al sector norte..."
                className="w-full rounded-sm border border-[#CBD5E1] px-3 py-2 text-xs text-[#0D1C2F] focus:border-[#0284C7] focus:outline-none"
              />
              {error && <p className="text-[11px] font-medium text-[#DC2626]">{error}</p>}
            </div>
          )}

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-sm border border-[#CBD5E1] bg-white px-4 py-2 text-xs font-semibold text-[#334155] hover:bg-[#F1F5F9] transition-colors min-h-[40px]"
            >
              {tieneBloqueoDuro ? 'Corregir Recursos' : 'Cancelar y Reasignar'}
            </button>
            {!tieneBloqueoDuro && (
              <button
                type="button"
                onClick={handleConfirm}
                className={`rounded-sm px-4 py-2 text-xs font-semibold text-white transition-colors min-h-[40px] ${
                  soloAdvertencias
                    ? 'bg-[#0F2942] hover:bg-[#0284C7]'
                    : 'bg-[#DC2626] hover:bg-[#B91C1C]'
                }`}
              >
                {soloAdvertencias
                  ? 'Continuar con Advertencia'
                  : 'Autorizar Excepción y Guardar'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
