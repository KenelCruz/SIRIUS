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
import { TecnicoHoySkeleton } from '../Skeletons';
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

  const totalServiciosEnCampo = useMemo(
    () => serviciosHoy.filter((item) => item.servicio.estado === 'en_campo').length,
    [serviciosHoy]
  );

  return (
    <section className="space-y-6">
      {/* Encabezado limpio sobre el canvas */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-2xl sm:text-[26px] font-bold tracking-tight text-[#0F2942] leading-tight">
            Mi Jornada de Campo
          </h2>
          <p className="mt-1 text-xs sm:text-sm text-[#475569]">
            Fecha operativa <span className="font-mono font-semibold text-[#0F2942]">{hoyAst}</span> (AST) · Servicios activos hoy y próximos 3 días.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onVerMisRutas}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-[#0F2942] hover:bg-slate-50 min-h-[40px] whitespace-nowrap shrink-0 transition-colors"
          >
            Mis rutas ({snapshot.rutas.length})
          </button>
          <button
            type="button"
            onClick={onAbrirAgenda}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#0F2942] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0284C7] min-h-[40px] whitespace-nowrap shrink-0 transition-colors"
          >
            <CalendarDays className="h-4 w-4" />
            Mi agenda semanal
          </button>
        </div>
      </div>

      {/* Bento 3-Tile Field Summary Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-2xl bg-gradient-to-br from-[#0F2942] to-[#0284C7] p-5 text-white flex flex-col justify-between min-h-[116px]">
          <div className="flex items-center justify-between text-xs font-medium text-white/90">
            <span>Servicios en jornada</span>
            <Compass className="h-4 w-4 text-white/80" />
          </div>
          <div>
            <div className="font-mono text-2xl font-bold tabular-nums">{serviciosHoy.length}</div>
            <div className="mt-0.5 text-[11px] text-white/80">
              {totalServiciosEnCampo} en curso en campo
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200/90 bg-white p-5 flex flex-col justify-between min-h-[116px]">
          <div className="text-xs font-semibold text-[#475569]">Rutas asignadas</div>
          <div>
            <div className="font-mono text-2xl font-bold text-[#0F2942] tabular-nums">
              {snapshot.rutas.length}
            </div>
            <div className="mt-0.5 text-[11px] text-[#0284C7] font-semibold">
              Polígonos y vértices disponibles
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200/90 bg-white p-5 flex flex-col justify-between min-h-[116px]">
          <div className="text-xs font-semibold text-[#475569]">Comprobantes registrados</div>
          <div>
            <div className="font-mono text-2xl font-bold text-[#0F2942] tabular-nums">
              {snapshot.viaticos.length}
            </div>
            <div className="mt-0.5 text-[11px] text-[#475569]">
              {snapshot.viaticos.filter((v) => v.estadoAprobacion === 'pendiente').length} pendiente(s) de revisión
            </div>
          </div>
        </div>
      </div>

      {!isOnline && (
        <div className="flex items-center gap-2.5 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs text-amber-900">
          <WifiOff className="h-4 w-4 shrink-0 text-[#B45309]" />
          <span>
            Trabajando sin conexión: puedes iniciar campo, cerrar servicios, anotar bitácoras y reportar viáticos en cola local.
          </span>
        </div>
      )}

      {successBanner && (
        <div className="flex items-center gap-2.5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-medium text-[#15803D]">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{successBanner}</span>
        </div>
      )}

      {error && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-800">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center gap-1.5 rounded-xl bg-white px-3 py-1.5 text-xs font-semibold text-rose-800 border border-rose-200 min-h-[38px]"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Reintentar
          </button>
        </div>
      )}

      {isLoading ? (
        <TecnicoHoySkeleton />
      ) : serviciosHoy.length === 0 ? (
        <div className="rounded-2xl border border-slate-200/90 bg-white p-8 text-center space-y-4">
          <CalendarDays className="h-9 w-9 text-slate-400 mx-auto" />
          <div className="space-y-1 max-w-md mx-auto">
            <h3 className="text-sm font-bold text-[#0F2942]">
              No tienes servicios asignados para hoy ni los próximos 3 días
            </h3>
            <p className="text-xs text-[#475569]">
              Consulta tu agenda semanal o la lista completa de tus rutas asignadas para próximas fechas.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1">
            <button
              type="button"
              onClick={onAbrirAgenda}
              className="rounded-xl bg-[#0F2942] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#0284C7] min-h-[44px] whitespace-nowrap"
            >
              Ver mi agenda
            </button>
            <button
              type="button"
              onClick={onVerMisRutas}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-[#0F2942] hover:bg-slate-50 min-h-[44px] whitespace-nowrap"
            >
              Ver mis rutas ({snapshot.rutas.length})
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {serviciosHoy.map((item) => {
            const esProgramado = item.servicio.estado === 'programado';
            const esEnCampo = item.servicio.estado === 'en_campo';
            const pendienteSync = item.servicio.syncStatus !== 'synced';

            return (
              <article
                key={item.servicio.id}
                className="rounded-2xl border border-slate-200/90 bg-white p-5 space-y-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-bold text-[#0284C7]">
                        {item.ruta.codigoParcela}
                      </span>
                      <WorkflowBadge status={item.servicio.estado} />
                      {pendienteSync && (
                        <span className="text-[11px] font-medium text-[#B45309]">
                          · Pendiente de sincronizar
                        </span>
                      )}
                    </div>
                    <h3 className="text-sm sm:text-base font-bold text-[#0F2942]">
                      {item.servicio.nombre}
                    </h3>
                    <div className="text-xs text-[#475569]">
                      <span className="font-semibold text-[#0F2942]">
                        {item.cliente?.nombre || 'Cliente'}
                      </span>{' '}
                      · <span>{item.proyecto?.nombre || 'Proyecto'}</span>
                    </div>
                    <div className="text-xs font-medium text-[#0F2942]">{item.ruta.nombre}</div>
                  </div>

                  <button
                    type="button"
                    onClick={() => onAbrirDetalleRuta(item.ruta.id)}
                    className="shrink-0 inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-[#F8FAFC] px-3.5 py-2 text-xs font-semibold text-[#0F2942] hover:bg-slate-100 min-h-[40px] whitespace-nowrap"
                  >
                    Ver ruta
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-xl border border-slate-200/70 bg-[#F8FAFC] p-3.5 text-xs text-slate-700">
                  <div className="flex items-start gap-2">
                    <MapPin className="h-4 w-4 text-[#0284C7] shrink-0 mt-0.5" />
                    <div>
                      <div className="font-semibold text-[#0F2942]">{item.ruta.provincia}</div>
                      <div className="text-[11px] text-[#475569]">{item.ruta.ubicacion}</div>
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
                        <Truck className="h-3.5 w-3.5 text-slate-500" />
                        <span>
                          {item.vehiculos.map((v) => `${v.etiqueta} (${v.placa})`).join(', ')}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
                  {(esProgramado || esEnCampo) && (
                    <button
                      type="button"
                      onClick={() => onAbrirTransicion(item.servicio.id)}
                      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold text-white min-h-[44px] whitespace-nowrap transition-colors ${
                        esProgramado
                          ? 'bg-[#0284C7] hover:bg-[#0369A1]'
                          : 'bg-[#15803D] hover:bg-emerald-800'
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
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-[#0F2942] hover:bg-slate-50 min-h-[44px] whitespace-nowrap"
                  >
                    <ClipboardList className="h-4 w-4 text-[#0284C7]" />
                    Bitácora ({item.bitacoraCount})
                  </button>

                  <button
                    type="button"
                    onClick={() => onReportarViatico(item.ruta.id, item.ruta.proyectoId)}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-[#0F2942] hover:bg-slate-50 min-h-[44px] whitespace-nowrap"
                  >
                    <Camera className="h-4 w-4 text-[#0284C7]" />
                    Registrar viático
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
