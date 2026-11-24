import React from 'react';
import { Camera, ClipboardList, X } from 'lucide-react';

interface TecnicoReportarSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onElegirViatico: () => void;
  onElegirBitacora: () => void;
}

export const TecnicoReportarSelectorModal: React.FC<TecnicoReportarSelectorModalProps> = ({
  isOpen,
  onClose,
  onElegirViatico,
  onElegirBitacora,
}) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[#0F2942]/65 backdrop-blur-[2px] sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="titulo-selector-reporte"
    >
      <div className="w-full sm:max-w-sm rounded-t-2xl sm:rounded-xl border border-slate-200 bg-white shadow-2xl p-5 space-y-4">
        <div className="sm:hidden pt-0.5 flex justify-center">
          <div className="h-1.5 w-10 rounded-full bg-slate-300" />
        </div>

        <div className="flex items-center justify-between border-b border-slate-200 pb-3">
          <div>
            <h2 id="titulo-selector-reporte" className="text-base font-bold text-slate-900">
              ¿Qué deseas reportar?
            </h2>
            <p className="text-xs text-slate-500">
              Captura rápida en campo, disponible incluso sin señal.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-md text-slate-500 hover:bg-slate-100"
            aria-label="Cerrar selector"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-2.5">
          <button
            type="button"
            onClick={() => {
              onClose();
              onElegirViatico();
            }}
            className="w-full flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 text-left hover:border-[#0284C7] hover:bg-sky-50/60 transition-colors min-h-[68px]"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[#0284C7] text-white">
              <Camera className="h-5 w-5" />
            </div>
            <div>
              <div className="text-sm font-bold text-[#0F2942]">Registrar viático</div>
              <div className="text-xs text-slate-500">
                Combustible, dieta, peaje u hospedaje con foto OCR o GPS.
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => {
              onClose();
              onElegirBitacora();
            }}
            className="w-full flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 text-left hover:border-[#0284C7] hover:bg-sky-50/60 transition-colors min-h-[68px]"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[#0F2942] text-white">
              <ClipboardList className="h-5 w-5" />
            </div>
            <div>
              <div className="text-sm font-bold text-[#0F2942]">Agregar nota de bitácora</div>
              <div className="text-xs text-slate-500">
                Observaciones técnicas, vértices y evidencia fotográfica.
              </div>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
};
