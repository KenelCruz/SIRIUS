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
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[#0F2942]/65 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="titulo-transicion-tecnico"
    >
      <div className="w-full sm:max-w-md rounded-t-2xl sm:rounded-md border border-[#CBD5E1] bg-white shadow-2xl">
        <div className="sm:hidden pt-2.5 pb-1 flex justify-center">
          <div className="h-1.5 w-10 rounded-full bg-[#CBD5E1]" />
        </div>

        <div className="flex items-center justify-between border-b border-[#E2E8F0] px-5 py-3.5">
          <div>
            <h2 id="titulo-transicion-tecnico" className="text-base font-bold text-[#0D1C2F]">
              {esIniciarCampo ? 'Iniciar Trabajo en Campo' : 'Cerrar Servicio a Procesando'}
            </h2>
            <p className="text-xs text-[#43474D]">
              {ruta?.codigoParcela || 'Ruta'} · {servicio.nombre}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-sm text-[#43474D] hover:bg-[#F1F5F9]"
            aria-label="Cerrar diálogo"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
          <div className="flex items-center justify-between rounded-sm border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2.5">
            <span className="font-medium text-[#43474D]">Cambio de estado:</span>
            <div className="flex items-center gap-2">
              <WorkflowBadge status={servicio.estado} />
              <span className="text-[#43474D]">→</span>
              <WorkflowBadge status={nuevoEstado} />
            </div>
          </div>

          {!isOnline && (
            <div className="flex items-start gap-2 rounded-sm border border-[#FDE047] bg-[#FEF9C3]/60 px-3 py-2 text-[#92400E]">
              <WifiOff className="h-4 w-4 shrink-0 mt-0.5" />
              <span>
                Sin conexión: este cambio quedará en cola local hasta que recuperes internet.
              </span>
            </div>
          )}

          <div>
            <label className="block font-semibold text-[#334155] mb-1">
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
              className="w-full rounded-sm border border-[#CBD5E1] px-3 py-2.5 font-mono text-xs text-[#0D1C2F] min-h-[44px]"
            />
          </div>

          {esIniciarCampo && (
            <div className="rounded-sm border border-[#E2E8F0] bg-[#F8FAFC] p-3 space-y-1">
              <div className="flex items-center gap-1.5 font-semibold text-[#0F2942]">
                <CalendarCheck className="h-4 w-4 text-[#0284C7]" />
                Rango(s) asignado(s) a tu cuadrilla:
              </div>
              {asignacionesRuta.length === 0 ? (
                <p className="text-[#93000A]">No hay asignación activa para tu cuadrilla en esta ruta.</p>
              ) : (
                <ul className="font-mono text-[11px] text-[#334155] space-y-0.5">
                  {asignacionesRuta.map((a) => (
                    <li key={a.id}>
                      {a.fechaInicio} al {a.fechaFin}
                    </li>
                  ))}
                </ul>
              )}
              {!dentroDeAsignacion && (
                <div className="mt-2 flex items-start gap-2 rounded-sm border border-[#FCA5A5] bg-[#FEE2E2] p-2.5 text-[#93000A]">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>
                    Bloqueado: solo puedes iniciar campo dentro del rango de fechas asignado a tu cuadrilla. Coordina una reprogramación si necesitas cambiar de fecha.
                  </span>
                </div>
              )}
            </div>
          )}

          {esCerrarServicio && (
            <div className="space-y-2">
              {servicio.fechaRealInicio && (
                <div className="text-[11px] text-[#43474D]">
                  Inicio real registrado:{' '}
                  <span className="font-mono font-semibold text-[#0F2942]">
                    {servicio.fechaRealInicio}
                  </span>
                </div>
              )}

              {fechaFinAnteriorAInicio && (
                <div className="flex items-start gap-2 rounded-sm border border-[#FCA5A5] bg-[#FEE2E2] p-2.5 text-[#93000A]">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>La fecha de cierre no puede ser anterior al inicio real.</span>
                </div>
              )}

              {faltaBitacoraAlCerrar ? (
                <div className="rounded-sm border border-[#FCA5A5] bg-[#FEE2E2] p-3 space-y-2.5 text-[#93000A]">
                  <div className="flex items-start gap-2 font-semibold">
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
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
                    className="w-full inline-flex items-center justify-center gap-2 rounded-sm bg-[#0F2942] px-3 py-2 text-xs font-semibold text-white hover:bg-[#0284C7] min-h-[42px]"
                  >
                    <ClipboardList className="h-4 w-4" />
                    Agregar Nota de Bitácora Ahora
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2 rounded-sm border border-[#86EFAC] bg-[#F0FDF4] px-3 py-2 text-[#15803D]">
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
            <div className="rounded-sm border border-[#FCA5A5] bg-[#FEE2E2] px-3 py-2 text-[#93000A]">
              {errorMsg}
            </div>
          )}

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2 border-t border-[#E2E8F0]">
            <button
              type="button"
              onClick={onClose}
              className="rounded-sm border border-[#CBD5E1] bg-white px-4 py-2.5 text-xs font-semibold text-[#334155] hover:bg-[#F1F5F9] min-h-[44px]"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSaving || bloqueadoPorRegla}
              className="inline-flex items-center justify-center gap-2 rounded-sm bg-[#0F2942] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#0284C7] disabled:opacity-45 min-h-[44px]"
            >
              {esIniciarCampo ? <Play className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
              {isSaving
                ? 'Aplicando...'
                : esIniciarCampo
                ? 'Confirmar Inicio en Campo'
                : 'Cerrar Servicio'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
