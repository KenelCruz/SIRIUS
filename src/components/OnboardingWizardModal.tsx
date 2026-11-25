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
import type { DatosDeteccionOnboarding, DefinicionPasoOnboarding } from '../domain/onboarding';

interface OnboardingWizardModalProps {
  isOpen: boolean;
  empresaNombre: string;
  estado: EstadoOnboardingEmpresa;
  isDemo: boolean;
  datosOnboarding?: DatosDeteccionOnboarding;
  onClose: () => void;
  onGuardarEstado: (nuevoEstado: EstadoOnboardingEmpresa) => Promise<void>;
  onNavegarAPaso: (paso: DefinicionPasoOnboarding) => void;
}

export const OnboardingWizardModal: React.FC<OnboardingWizardModalProps> = ({
  isOpen,
  empresaNombre,
  estado,
  isDemo,
  datosOnboarding,
  onClose,
  onGuardarEstado,
  onNavegarAPaso,
}) => {
  if (!isOpen) return null;

  const pasos = obtenerPasosOnboardingVisibles(isDemo);
  const resumen = obtenerResumenOnboarding(estado, isDemo, datosOnboarding);
  const pasoActivo: DefinicionPasoOnboarding =
    pasos.find((p) => p.id === estado.pasoActual) ?? pasos[0];
  const detalleActivo =
    resumen.detallePasos.find((d) => d.paso.id === pasoActivo.id) ?? resumen.detallePasos[0];

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
    <div
      className="fixed inset-0 z-50 bg-[#0F2942]/65 backdrop-blur-[2px] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="titulo-onboarding-wizard"
    >
      <div className="bg-white border border-slate-200/90 rounded-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh] shadow-2xl">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200/80 bg-[#F8FAFC] flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-[#0284C7] border border-sky-200/70">
              <Sparkles className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 id="titulo-onboarding-wizard" className="text-base font-bold tracking-tight text-[#0F2942] truncate">
                Asistente de configuración · {empresaNombre}
              </h3>
              <p className="text-xs text-[#475569]">
                {resumen.pasosCompletados.length} de {resumen.totalPasos} completos reales
                {resumen.pasosCompletadosManuales.length > 0
                  ? ` · ${resumen.pasosCompletadosManuales.length} completado(s) manualmente`
                  : ''}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleFinishLater}
            className="min-h-[40px] min-w-[40px] flex items-center justify-center text-[#475569] hover:text-[#0F2942] rounded-xl hover:bg-slate-200/70 shrink-0 transition-colors"
            aria-label="Cerrar asistente"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="grid grid-cols-1 md:grid-cols-12 flex-1 overflow-y-auto">
          {/* Lista de pasos */}
          <div className="md:col-span-5 border-b md:border-b-0 md:border-r border-slate-200/80 bg-[#F8FAFC] p-4 space-y-2">
            {resumen.detallePasos.map(({ paso, estado: stepStatus, etiquetaEstado }) => {
              const isActive = paso.id === pasoActivo.id;
              return (
                <button
                  key={paso.id}
                  type="button"
                  onClick={() => handleSelectStep(paso.id)}
                  className={`w-full flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl border text-left text-xs transition-all min-h-[44px] ${
                    isActive
                      ? 'bg-[#0F2942] border-[#0F2942] text-white font-semibold shadow-sm'
                      : 'bg-white border-slate-200 text-[#0F2942] hover:bg-slate-100/80'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    {stepStatus === 'completo' ? (
                      <CheckCircle2
                        className={`w-4 h-4 shrink-0 ${isActive ? 'text-emerald-400' : 'text-[#15803D]'}`}
                      />
                    ) : stepStatus === 'completo_manual' ? (
                      <CheckCircle2
                        className={`w-4 h-4 shrink-0 ${isActive ? 'text-amber-300' : 'text-[#B45309]'}`}
                      />
                    ) : stepStatus === 'saltado' ? (
                      <SkipForward
                        className={`w-4 h-4 shrink-0 ${isActive ? 'text-slate-300' : 'text-slate-400'}`}
                      />
                    ) : (
                      <Clock
                        className={`w-4 h-4 shrink-0 ${isActive ? 'text-sky-300' : 'text-slate-400'}`}
                      />
                    )}
                    <div className="min-w-0">
                      <div className="truncate">
                        {paso.numero}. {paso.titulo}
                      </div>
                      {stepStatus === 'completo_manual' && (
                        <div
                          className={`text-[10px] truncate ${
                            isActive ? 'text-amber-200' : 'text-[#B45309] font-medium'
                          }`}
                        >
                          {etiquetaEstado}
                        </div>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Detalle del paso actual */}
          <div className="md:col-span-7 p-6 flex flex-col justify-between space-y-6">
            <div className="space-y-4">
              <div className="text-xs font-semibold text-[#0284C7]">
                Paso {pasoActivo.numero} de {pasos.length}
                {pasoActivo.soloEnDemo ? ' · Disponible solo en modo demo' : ''}
              </div>
              <h4 className="text-lg font-bold tracking-tight text-[#0F2942] text-balance">{pasoActivo.titulo}</h4>
              <p className="text-sm text-[#475569] leading-relaxed">{pasoActivo.descripcion}</p>

              {detalleActivo?.estado === 'completo' && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3.5 text-xs text-emerald-900">
                  Completado con datos reales registrados en la empresa.
                </div>
              )}

              {detalleActivo?.estado === 'completo_manual' && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 text-xs text-amber-900">
                  Marcado como completado manualmente (excepción): aún faltan datos mínimos en este
                  módulo para considerarse completo real.
                </div>
              )}

              {(!detalleActivo || detalleActivo.estado === 'pendiente' || detalleActivo.estado === 'saltado') && (
                <div className="bg-[#F8FAFC] border border-slate-200/70 rounded-xl p-3.5 text-xs text-[#475569]">
                  {isDemo
                    ? 'En modo demo puedes explorar los datos precargados o probar el asistente KMZ sin afectar otros entornos.'
                    : 'Este asistente solo te guía hacia cada módulo para que cargues los datos reales de tu empresa cuando lo necesites.'}
                </div>
              )}

              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => onNavegarAPaso(pasoActivo)}
                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#0284C7] hover:bg-[#0369A1] text-white text-xs sm:text-sm font-semibold rounded-xl whitespace-nowrap min-h-[42px] transition-colors shadow-sm"
                >
                  <span>Ir a {pasoActivo.titulo}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {resumen.estaFinalizado && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3.5 text-xs text-emerald-900 flex items-center justify-between gap-3">
                <span>
                  Todos los pasos fueron revisados ({resumen.pasosCompletados.length} completos reales
                  {resumen.pasosCompletadosManuales.length > 0
                    ? `, ${resumen.pasosCompletadosManuales.length} completado(s) manualmente`
                    : ''}
                  ).
                </span>
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
        <div className="px-6 py-4 border-t border-slate-200/80 bg-[#F8FAFC] flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleFinishLater}
            className="min-h-[40px] px-4 py-2 text-xs font-semibold text-slate-700 hover:text-[#0F2942] border border-slate-200 bg-white hover:bg-slate-100 rounded-xl whitespace-nowrap transition-colors"
          >
            Terminar después
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSkipStep}
              className="min-h-[40px] px-4 py-2 text-xs font-semibold text-slate-700 border border-slate-200 bg-white hover:bg-slate-100 rounded-xl whitespace-nowrap transition-colors"
            >
              Saltar paso
            </button>
            <button
              type="button"
              onClick={handleCompleteStep}
              disabled={detalleActivo?.estado === 'completo'}
              className="min-h-[40px] px-4 py-2 text-xs font-semibold text-white bg-[#0F2942] hover:bg-[#0284C7] disabled:bg-[#15803D] disabled:opacity-90 rounded-xl whitespace-nowrap transition-colors shadow-sm"
            >
              {detalleActivo?.estado === 'completo'
                ? 'Completado con datos'
                : 'Marcar como completado'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
