import React from 'react';
import { ArrowRight, CheckCircle2, Clock, SkipForward, Sparkles, X } from 'lucide-react';
import {
  completarPasoOnboarding,
  obtenerPasosOnboardingVisibles,
  obtenerResumenOnboarding,
  reiniciarOnboarding,
  saltarPasoOnboarding,
  seleccionarPasoOnboarding,
} from '../domain';
import type { EstadoOnboardingEmpresa, OnboardingPasoId } from '../types/domain';
import type { DefinicionPasoOnboarding } from '../domain/onboarding';

interface OnboardingWizardModalProps {
  isOpen: boolean;
  empresaNombre: string;
  estado: EstadoOnboardingEmpresa;
  isDemo: boolean;
  onClose: () => void;
  onGuardarEstado: (nuevoEstado: EstadoOnboardingEmpresa) => Promise<void>;
  onNavegarAPaso: (paso: DefinicionPasoOnboarding) => void;
}

export const OnboardingWizardModal: React.FC<OnboardingWizardModalProps> = ({
  isOpen,
  empresaNombre,
  estado,
  isDemo,
  onClose,
  onGuardarEstado,
  onNavegarAPaso,
}) => {
  if (!isOpen) return null;

  const pasos = obtenerPasosOnboardingVisibles(isDemo);
  const resumen = obtenerResumenOnboarding(estado, isDemo);
  const pasoActivo: DefinicionPasoOnboarding =
    pasos.find((p) => p.id === estado.pasoActual) ?? pasos[0];

  const handleSelectStep = async (pasoId: OnboardingPasoId) => {
    const next = seleccionarPasoOnboarding(estado, pasoId);
    await onGuardarEstado(next);
  };

  const handleCompleteStep = async () => {
    const next = completarPasoOnboarding(estado, pasoActivo.id, isDemo);
    await onGuardarEstado(next);
  };

  const handleSkipStep = async () => {
    const next = saltarPasoOnboarding(estado, pasoActivo.id, isDemo);
    await onGuardarEstado(next);
  };

  const handleFinishLater = async () => {
    await onGuardarEstado({ ...estado, updatedAt: new Date().toISOString() });
    onClose();
  };

  const handleReset = async () => {
    const next = reiniciarOnboarding(estado.empresaId);
    await onGuardarEstado(next);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <Sparkles className="w-5 h-5 text-emerald-700 shrink-0" />
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Asistente de configuración · {empresaNombre}
              </h3>
              <p className="text-xs text-slate-500">
                Opcional y reanudable en cualquier momento ({resumen.porcentajeResuelto}% completado)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleFinishLater}
            className="p-1.5 text-slate-500 hover:text-slate-900 rounded-lg hover:bg-slate-100"
            aria-label="Cerrar asistente"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="grid grid-cols-1 md:grid-cols-12 flex-1 overflow-y-auto">
          {/* Lista de pasos */}
          <div className="md:col-span-5 border-b md:border-b-0 md:border-r border-slate-200 bg-slate-50 p-4 space-y-2">
            {pasos.map((paso) => {
              const stepStatus = estado.pasos[paso.id];
              const isActive = paso.id === pasoActivo.id;
              return (
                <button
                  key={paso.id}
                  type="button"
                  onClick={() => handleSelectStep(paso.id)}
                  className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg border text-left text-xs transition-colors ${
                    isActive
                      ? 'bg-slate-900 border-slate-900 text-white font-semibold'
                      : 'bg-white border-slate-200 text-slate-800 hover:bg-slate-100'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {stepStatus === 'completo' ? (
                      <CheckCircle2
                        className={`w-4 h-4 shrink-0 ${isActive ? 'text-emerald-400' : 'text-emerald-600'}`}
                      />
                    ) : stepStatus === 'saltado' ? (
                      <SkipForward
                        className={`w-4 h-4 shrink-0 ${isActive ? 'text-slate-300' : 'text-slate-400'}`}
                      />
                    ) : (
                      <Clock
                        className={`w-4 h-4 shrink-0 ${isActive ? 'text-amber-300' : 'text-slate-400'}`}
                      />
                    )}
                    <span className="truncate">
                      {paso.numero}. {paso.titulo}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Detalle del paso actual */}
          <div className="md:col-span-7 p-6 flex flex-col justify-between space-y-6">
            <div className="space-y-4">
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Paso {pasoActivo.numero} de {pasos.length}
                {pasoActivo.soloEnDemo ? ' · Disponible solo en modo demo' : ''}
              </div>
              <h4 className="text-lg font-bold text-slate-900">{pasoActivo.titulo}</h4>
              <p className="text-sm text-slate-600 leading-relaxed">{pasoActivo.descripcion}</p>

              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5 text-xs text-slate-600">
                {isDemo
                  ? 'En modo demo puedes explorar los datos precargados o probar el asistente KMZ sin afectar otros entornos.'
                  : 'Este asistente solo te guía hacia cada módulo para que cargues los datos reales de tu empresa cuando lo necesites.'}
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => onNavegarAPaso(pasoActivo)}
                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-semibold rounded-lg whitespace-nowrap"
                >
                  <span>Ir a {pasoActivo.titulo}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {resumen.estaFinalizado && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3.5 text-xs text-emerald-900 flex items-center justify-between gap-3">
                <span>Todos los pasos fueron revisados o saltados.</span>
                <button
                  type="button"
                  onClick={handleReset}
                  className="font-semibold underline whitespace-nowrap"
                >
                  Reiniciar
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleFinishLater}
            className="px-4 py-2 text-xs font-semibold text-slate-700 hover:text-slate-900 border border-slate-300 bg-white hover:bg-slate-100 rounded-lg whitespace-nowrap"
          >
            Terminar después
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSkipStep}
              className="px-4 py-2 text-xs font-semibold text-slate-700 border border-slate-300 bg-white hover:bg-slate-100 rounded-lg whitespace-nowrap"
            >
              Saltar paso
            </button>
            <button
              type="button"
              onClick={handleCompleteStep}
              className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg whitespace-nowrap"
            >
              Marcar como completado
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
