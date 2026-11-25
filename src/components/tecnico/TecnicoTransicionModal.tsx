import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CalendarCheck,
  CheckCircle2,
  ClipboardList,
  Play,
  WifiOff,
  X,
} from 'lucide-react';
import { obtenerFechaHoyAST } from '../../domain';
import type { PayloadTransicionServicio } from '../../domain/estados';
import type { Asignacion, EstadoServicio, RutaTecnico, ServicioTecnico } from '../../types/domain';
import { WorkflowBadge } from '../WorkflowBadge';

interface TecnicoTransicionModalProps {
  isOpen: boolean;
  onClose: () => void;
  servicio: ServicioTecnico | null;
  ruta?: RutaTecnico;
  asignacionesRuta: Asignacion[];
  bitacoraCount: number;
  isOnline: boolean;
  onConfirmarTransicion: (params: {
    servicioId: string;
    nuevoEstado: EstadoServicio;
    payload: PayloadTransicionServicio;
  }) => Promise<void>;
  onAbrirBitacora: (servicioId: string) => void;
}

export const TecnicoTransicionModal: React.FC<TecnicoTransicionModalProps> = ({
  isOpen,
  onClose,
  servicio,
  ruta,
  asignacionesRuta,
  bitacoraCount,
  isOnline,
  onConfirmarTransicion,
  onAbrirBitacora,
}) => {
  const hoyAst = obtenerFechaHoyAST();
  const [fechaInput, setFechaInput] = useState(hoyAst);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !servicio) return;
    setFechaInput(obtenerFechaHoyAST());
    setErrorMsg(null);
  }, [isOpen, servicio]);

  if (!isOpen || !servicio) return null;

  const esIniciarCampo = servicio.estado === 'programado';
  const esCerrarServicio = servicio.estado === 'en_campo';
  const nuevoEstado: EstadoServicio | null = esIniciarCampo
    ? 'en_campo'
    : esCerrarServicio
    ? 'procesando'
    : null;

  if (!nuevoEstado) return null;

  const dentroDeAsignacion = asignacionesRuta.some(
    (a) => fechaInput >= a.fechaInicio && fechaInput <= a.fechaFin
  );

  const faltaBitacoraAlCerrar = esCerrarServicio && bitacoraCount < 1;
  const fechaFinAnteriorAInicio =
    esCerrarServicio && Boolean(servicio.fechaRealInicio) && fechaInput < (servicio.fechaRealInicio || '');

  const bloqueadoPorRegla =
    (esIniciarCampo && !dentroDeAsignacion) || faltaBitacoraAlCerrar || fechaFinAnteriorAInicio;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setIsSaving(true);
    try {
      await onConfirmarTransicion({
        servicioId: servicio.id,
        nuevoEstado,
        payload: esIniciarCampo ? { fechaRealInicio: fechaInput } : { fechaRealFin: fechaInput },
      });
      onClose();
    } catch (err: unknown) {
      setErrorMsg(
        err instanceof Error ? err.message : 'No se pudo aplicar el cambio de estado.'
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[#0F2942]/65 backdrop-blur-[2px] sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="titulo-transicion-tecnico"
    >
      <div className="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl border border-slate-200/90 bg-white shadow-2xl overflow-hidden">
        <div className="sm:hidden pt-2.5 pb-1 flex justify-center bg-[#F8FAFC]">
          <div className="h-1.5 w-10 rounded-full bg-slate-300" />
        </div>

        <div className="flex items-center justify-between border-b border-slate-200/80 bg-[#F8FAFC] px-5 py-3.5">
          <div>
            <h2 id="titulo-transicion-tecnico" className="text-base font-bold tracking-tight text-[#0F2942]">
              {esIniciarCampo ? 'Iniciar Trabajo en Campo' : 'Cerrar Servicio a Procesando'}
            </h2>
            <p className="text-xs text-[#475569]">
              {ruta?.codigoParcela || 'Ruta'} · {servicio.nombre}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-[#475569] hover:bg-slate-200/70 transition-colors"
            aria-label="Cerrar diálogo"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
          <div className="flex items-center justify-between rounded-xl border border-slate-200/70 bg-[#F8FAFC] px-3.5 py-2.5">
            <span className="font-medium text-[#475569]">Cambio de estado:</span>
            <div className="flex items-center gap-2">
              <WorkflowBadge status={servicio.estado} />
              <span className="text-slate-400">→</span>
              <WorkflowBadge status={nuevoEstado} />
            </div>
          </div>

          {!isOnline && (
            <div className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-2.5 text-amber-900">
              <WifiOff className="h-4 w-4 shrink-0 mt-0.5 text-[#B45309]" />
              <span>
                Sin conexión: este cambio quedará en cola local hasta que recuperes internet.
              </span>
            </div>
          )}

          <div>
            <label className="block font-semibold text-slate-700 mb-1.5">
              {esIniciarCampo ? 'Fecha Real de Inicio en Campo' : 'Fecha Real de Cierre en Campo'}
            </label>
            <input
              type="date"
              required
              value={fechaInput}
              onChange={(e) => {
                setFechaInput(e.target.value);
                setErrorMsg(null);
              }}
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 font-mono text-xs text-[#0F2942] min-h-[44px] focus:border-[#0284C7] focus:outline-none"
            />
          </div>

          {esIniciarCampo && (
            <div className="rounded-xl border border-slate-200/70 bg-[#F8FAFC] p-3.5 space-y-1.5">
              <div className="flex items-center gap-1.5 font-semibold text-[#0F2942]">
                <CalendarCheck className="h-4 w-4 text-[#0284C7]" />
                Rango(s) asignado(s) a tu cuadrilla:
              </div>
              {asignacionesRuta.length === 0 ? (
                <p className="text-rose-800">No hay asignación activa para tu cuadrilla en esta ruta.</p>
              ) : (
                <ul className="font-mono text-[11px] text-slate-700 space-y-0.5">
                  {asignacionesRuta.map((a) => (
                    <li key={a.id}>
                      {a.fechaInicio} al {a.fechaFin}
                    </li>
                  ))}
                </ul>
              )}
              {!dentroDeAsignacion && (
                <div className="mt-2 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-2.5 text-rose-800">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-[#DC2626]" />
                  <span>
                    Bloqueado: solo puedes iniciar campo dentro del rango de fechas asignado a tu cuadrilla. Coordina una reprogramación si necesitas cambiar de fecha.
                  </span>
                </div>
              )}
            </div>
          )}

          {esCerrarServicio && (
            <div className="space-y-2.5">
              {servicio.fechaRealInicio && (
                <div className="text-[11px] text-[#475569]">
                  Inicio real registrado:{' '}
                  <span className="font-mono font-semibold text-[#0F2942]">
                    {servicio.fechaRealInicio}
                  </span>
                </div>
              )}

              {fechaFinAnteriorAInicio && (
                <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-2.5 text-rose-800">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-[#DC2626]" />
                  <span>La fecha de cierre no puede ser anterior al inicio real.</span>
                </div>
              )}

              {faltaBitacoraAlCerrar ? (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-3.5 space-y-2.5 text-rose-800">
                  <div className="flex items-start gap-2 font-semibold">
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-[#DC2626]" />
                    <span>
                      Falta bitácora de campo: debes registrar al menos 1 entrada en la bitácora del servicio antes de pasarlo a Procesando.
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onAbrirBitacora(servicio.id);
                    }}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#0F2942] px-3 py-2 text-xs font-semibold text-white hover:bg-[#0284C7] min-h-[44px] transition-colors"
                  >
                    <ClipboardList className="h-4 w-4" />
                    Agregar nota de bitácora
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-[#15803D]">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  <span>
                    Bitácora verificada ({bitacoraCount}{' '}
                    {bitacoraCount === 1 ? 'entrada registrada' : 'entradas registradas'}).
                  </span>
                </div>
              )}
            </div>
          )}

          {errorMsg && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-rose-800">
              {errorMsg}
            </div>
          )}

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2.5 pt-2 border-t border-slate-200/80">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 min-h-[44px] transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSaving || bloqueadoPorRegla}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#0F2942] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#0284C7] disabled:opacity-45 min-h-[44px] transition-colors shadow-sm"
            >
              {esIniciarCampo ? <Play className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
              {isSaving
                ? 'Aplicando...'
                : esIniciarCampo
                ? 'Confirmar inicio en campo'
                : 'Cerrar servicio'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
