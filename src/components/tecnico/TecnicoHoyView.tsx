import React, { useMemo } from 'react';
import {
  AlertTriangle,
  CalendarDays,
  Camera,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Compass,
  MapPin,
  Play,
  RefreshCw,
  Truck,
  Users,
  WifiOff,
} from 'lucide-react';
import { obtenerFechaHoyAST, obtenerServiciosHoyTecnico } from '../../domain';
import type { SnapshotTecnico } from '../../types/domain';
import { WorkflowBadge } from '../WorkflowBadge';

interface TecnicoHoyViewProps {
  snapshot: SnapshotTecnico;
  isLoading: boolean;
  error: string | null;
  isOnline: boolean;
  successBanner?: string | null;
  onRetry: () => void;
  onAbrirDetalleRuta: (rutaId: string) => void;
  onAbrirTransicion: (servicioId: string) => void;
  onAbrirBitacora: (servicioId: string) => void;
  onReportarViatico: (rutaId: string, proyectoId: string) => void;
  onAbrirAgenda: () => void;
  onVerMisRutas: () => void;
}

export const TecnicoHoyView: React.FC<TecnicoHoyViewProps> = ({
  snapshot,
  isLoading,
  error,
  isOnline,
  successBanner,
  onRetry,
  onAbrirDetalleRuta,
  onAbrirTransicion,
  onAbrirBitacora,
  onReportarViatico,
  onAbrirAgenda,
  onVerMisRutas,
}) => {
  const hoyAst = obtenerFechaHoyAST();
  const serviciosHoy = useMemo(
    () => obtenerServiciosHoyTecnico(snapshot, hoyAst),
    [snapshot, hoyAst]
  );

  return (
    <section className="space-y-4">
      {/* Encabezado de jornada */}
      <div className="rounded-md border border-[#CBD5E1] bg-white p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Compass className="h-4 w-4 text-[#0284C7]" />
            <h2 className="text-base font-bold text-[#0D1C2F]">Mi Jornada de Campo</h2>
          </div>
          <p className="mt-0.5 text-xs text-[#43474D]">
            Hoy (<span className="font-mono font-semibold">{hoyAst}</span>) y próximos 3 días ·{' '}
            {serviciosHoy.length}{' '}
            {serviciosHoy.length === 1 ? 'servicio activo o próximo' : 'servicios activos o próximos'}.
          </p>
        </div>

        <button
          type="button"
          onClick={onAbrirAgenda}
          className="inline-flex items-center justify-center gap-2 rounded-sm border border-[#CBD5E1] bg-[#F8FAFC] px-3.5 py-2 text-xs font-semibold text-[#0F2942] hover:bg-[#EFF4FF] min-h-[42px]"
        >
          <CalendarDays className="h-4 w-4 text-[#0284C7]" />
          Mi agenda semanal
        </button>
      </div>

      {!isOnline && (
        <div className="flex items-center gap-2 rounded-sm border border-[#FDE047] bg-[#FEF9C3]/60 px-3 py-2 text-xs text-[#92400E]">
          <WifiOff className="h-4 w-4 shrink-0" />
          <span>
            Trabajando sin conexión: puedes iniciar campo, cerrar servicios, anotar bitácoras y reportar viáticos en cola local.
          </span>
        </div>
      )}

      {successBanner && (
        <div className="flex items-center gap-2 rounded-sm border border-[#86EFAC] bg-[#F0FDF4] px-3.5 py-2.5 text-xs font-medium text-[#15803D]">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{successBanner}</span>
        </div>
      )}

      {error && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-[#FCA5A5] bg-[#FEE2E2] px-4 py-3 text-xs text-[#93000A]">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center gap-1 rounded-sm bg-white px-2.5 py-1 text-xs font-semibold text-[#93000A] border border-[#FCA5A5]"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Reintentar
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2].map((n) => (
            <div key={n} className="h-44 animate-pulse rounded-md bg-white border border-[#E2E8F0]" />
          ))}
        </div>
      ) : serviciosHoy.length === 0 ? (
        <div className="rounded-md border border-[#CBD5E1] bg-white p-6 text-center space-y-3">
          <CalendarDays className="h-9 w-9 text-[#94A3B8] mx-auto" />
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-[#0F2942]">
              No tienes servicios asignados para hoy ni los próximos 3 días
            </h3>
            <p className="text-xs text-[#43474D]">
              Consulta tu agenda semanal o la lista completa de tus rutas asignadas para próximas fechas.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
            <button
              type="button"
              onClick={onAbrirAgenda}
              className="rounded-sm bg-[#0F2942] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0284C7] min-h-[42px]"
            >
              Ver Mi Agenda
            </button>
            <button
              type="button"
              onClick={onVerMisRutas}
              className="rounded-sm border border-[#CBD5E1] bg-white px-4 py-2 text-xs font-semibold text-[#0F2942] hover:bg-[#F8FAFC] min-h-[42px]"
            >
              Ver Mis Rutas ({snapshot.rutas.length})
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {serviciosHoy.map((item) => {
            const esProgramado = item.servicio.estado === 'programado';
            const esEnCampo = item.servicio.estado === 'en_campo';
            const pendienteSync = item.servicio.syncStatus !== 'synced';

            return (
              <article
                key={item.servicio.id}
                className="rounded-md border border-[#CBD5E1] bg-white p-4 space-y-3 shadow-xs"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-bold text-[#0284C7]">
                        {item.ruta.codigoParcela}
                      </span>
                      <WorkflowBadge status={item.servicio.estado} />
                      {pendienteSync && (
                        <span className="rounded-sm bg-[#FEF3C7] px-1.5 py-0.5 font-mono text-[10px] font-semibold text-[#92400E]">
                          Pendiente de sincronizar
                        </span>
                      )}
                    </div>
                    <h3 className="text-sm font-bold text-[#0D1C2F]">{item.servicio.nombre}</h3>
                    <div className="text-xs text-[#334155]">
                      <span className="font-semibold">{item.cliente?.nombre || 'Cliente'}</span> ·{' '}
                      <span>{item.proyecto?.nombre || 'Proyecto'}</span>
                    </div>
                    <div className="text-xs font-medium text-[#0F2942]">{item.ruta.nombre}</div>
                  </div>

                  <button
                    type="button"
                    onClick={() => onAbrirDetalleRuta(item.ruta.id)}
                    className="shrink-0 inline-flex items-center gap-1 rounded-sm border border-[#CBD5E1] bg-[#F8FAFC] px-2.5 py-1.5 text-xs font-semibold text-[#0F2942] hover:bg-[#EFF4FF] min-h-[38px]"
                  >
                    Detalle
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 rounded-sm bg-[#F8FAFC] border border-[#E2E8F0] p-3 text-xs text-[#334155]">
                  <div className="flex items-start gap-2">
                    <MapPin className="h-4 w-4 text-[#0284C7] shrink-0 mt-0.5" />
                    <div>
                      <div className="font-semibold text-[#0D1C2F]">{item.ruta.provincia}</div>
                      <div className="text-[11px] text-[#43474D]">{item.ruta.ubicacion}</div>
                    </div>
                  </div>
                  <div className="space-y-1 text-[11px]">
                    {item.asignacion && (
                      <div className="font-mono text-[#0F2942]">
                        Asignado: {item.asignacion.fechaInicio} al {item.asignacion.fechaFin}
                      </div>
                    )}
                    {item.cuadrilla && (
                      <div className="flex items-center gap-1.5">
                        <Users className="h-3.5 w-3.5 text-[#0F2942]" />
                        <span>{item.cuadrilla.nombre}</span>
                      </div>
                    )}
                    {item.vehiculos.length > 0 && (
                      <div className="flex items-center gap-1.5">
                        <Truck className="h-3.5 w-3.5 text-[#43474D]" />
                        <span>
                          {item.vehiculos.map((v) => `${v.etiqueta} (${v.placa})`).join(', ')}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                  {(esProgramado || esEnCampo) && (
                    <button
                      type="button"
                      onClick={() => onAbrirTransicion(item.servicio.id)}
                      className={`inline-flex items-center justify-center gap-2 rounded-sm px-3.5 py-2.5 text-xs font-semibold text-white min-h-[44px] ${
                        esProgramado
                          ? 'bg-[#0284C7] hover:bg-[#006398]'
                          : 'bg-[#15803D] hover:bg-[#166534]'
                      }`}
                    >
                      {esProgramado ? (
                        <>
                          <Play className="h-4 w-4" />
                          Iniciar campo
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="h-4 w-4" />
                          Cerrar servicio
                        </>
                      )}
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => onAbrirBitacora(item.servicio.id)}
                    className="inline-flex items-center justify-center gap-2 rounded-sm border border-[#CBD5E1] bg-white px-3 py-2.5 text-xs font-semibold text-[#0F2942] hover:bg-[#F8FAFC] min-h-[44px]"
                  >
                    <ClipboardList className="h-4 w-4 text-[#0284C7]" />
                    Bitácora ({item.bitacoraCount})
                  </button>

                  <button
                    type="button"
                    onClick={() => onReportarViatico(item.ruta.id, item.ruta.proyectoId)}
                    className="inline-flex items-center justify-center gap-2 rounded-sm border border-[#CBD5E1] bg-white px-3 py-2.5 text-xs font-semibold text-[#0F2942] hover:bg-[#F8FAFC] min-h-[44px]"
                  >
                    <Camera className="h-4 w-4 text-[#0284C7]" />
                    Reportar viático
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
};
