import React from 'react';
import { AlertTriangle, ShieldAlert } from 'lucide-react';
import type { ConflictDetail } from '../types/geodesy';

interface ResourceConflictModalProps {
  conflicts: ConflictDetail[];
  onReassign: () => void;
  onOverride: () => void;
}

export const ResourceConflictModal: React.FC<ResourceConflictModalProps> = ({
  conflicts,
  onReassign,
  onOverride,
}) => {
  if (conflicts.length === 0) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0F2942]/60 p-4">
      <div className="w-full max-w-lg overflow-hidden rounded-md border border-[#DC2626] bg-white shadow-2xl">
        <div className="h-1 w-full bg-[#DC2626]" />
        <div className="p-6">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm bg-[#FEE2E2] text-[#DC2626]">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[#0D1C2F]">
                Conflicto Crítico de Asignación
              </h3>
              <p className="mt-1 text-xs text-[#43474D]">
                Se detectaron superposiciones operativas que comprometen la disponibilidad de brigada o equipo geodésico en la fecha programada.
              </p>
            </div>
          </div>

          <div className="mt-4 space-y-2.5">
            {conflicts.map((conflict, index) => (
              <div
                key={`${conflict.type}-${index}`}
                className="rounded-sm border border-[#FCA5A5] bg-[#FEE2E2]/50 p-3 text-xs text-[#0D1C2F]"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 font-semibold text-[#93000A]">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    {conflict.type === 'surveyor'
                      ? 'Brigada / Agrimensor Solapado'
                      : conflict.type === 'equipment'
                      ? 'Equipo GNSS RTK Compartido'
                      : 'Colisión Espacial de Parcela'}
                  </span>
                  <span className="font-mono text-[11px] font-medium text-[#93000A]">
                    {conflict.conflictingSurveyCode}
                  </span>
                </div>
                <p className="mt-1 text-[#334155]">
                  {conflict.message} ({conflict.conflictingSurveyTitle})
                </p>
              </div>
            ))}
          </div>

          <div className="mt-6 flex flex-col-reverse sm:flex-row sm:justify-end gap-2.5">
            <button
              type="button"
              onClick={onReassign}
              className="rounded-sm border border-[#CBD5E1] bg-white px-4 py-2 text-xs font-semibold text-[#334155] hover:bg-[#F1F5F9] transition-colors min-h-[40px]"
            >
              Reasignar Recursos
            </button>
            <button
              type="button"
              onClick={onOverride}
              className="rounded-sm bg-[#DC2626] px-4 py-2 text-xs font-semibold text-white hover:bg-[#B91C1C] transition-colors min-h-[40px]"
            >
              Sobrescribir Asignación
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
