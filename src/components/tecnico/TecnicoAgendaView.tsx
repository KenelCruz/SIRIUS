import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  MapPin,
  RefreshCw,
  Truck,
  Users,
  WifiOff,
} from 'lucide-react';
import {
  obtenerAgendaSemanalTecnico,
  obtenerFechaHoyAST,
  obtenerInicioSemanaLunes,
  sumarDiasIso,
} from '../../domain';
import type { SnapshotTecnico } from '../../types/domain';
import { TecnicoAgendaSkeleton } from '../Skeletons';
import { WorkflowBadge } from '../WorkflowBadge';

interface TecnicoAgendaViewProps {
  snapshot: SnapshotTecnico;
  isLoading: boolean;
  error: string | null;
  isOnline: boolean;
  onRetry: () => void;
  onVolverHoy: () => void;
  onAbrirDetalleRuta: (rutaId: string) => void;
}

const DIAS_ES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

function formatearDiaCorto(fechaIso: string): string {
  const dt = new Date(`${fechaIso}T12:00:00Z`);
  const diaSemana = DIAS_ES[dt.getUTCDay()];
  const [, mm, dd] = fechaIso.split('-');
  return `${diaSemana} ${dd}/${mm}`;
}

export const TecnicoAgendaView: React.FC<TecnicoAgendaViewProps> = ({
  snapshot,
  isLoading,
  error,
  isOnline,
  onRetry,
  onVolverHoy,
  onAbrirDetalleRuta,
}) => {
  const hoyAst = obtenerFechaHoyAST();
  const [inicioSemana, setInicioSemana] = useState<string>(() =>
    obtenerInicioSemanaLunes(hoyAst)
  );

  const diasSemana = useMemo(
    () => Array.from({ length: 7 }, (_, i) => sumarDiasIso(inicioSemana, i)),
    [inicioSemana]
  );

  const agendaPorDia = useMemo(
    () => obtenerAgendaSemanalTecnico(snapshot, inicioSemana),
    [snapshot, inicioSemana]
  );

  const totalAsignacionesSemana = useMemo(
    () => agendaPorDia.reduce((acc, d) => acc + d.items.length, 0),
    [agendaPorDia]
  );

  return (
    <section className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={onVolverHoy}
              className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-[#0F2942] hover:bg-slate-50 min-h-[38px] whitespace-nowrap"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Hoy
            </button>
            <h2 className="text-2xl sm:text-[26px] font-bold tracking-tight text-[#0F2942]">
              Mi Agenda Semanal
            </h2>
          </div>
          <p className="text-xs sm:text-sm text-[#475569]">
            Semana del <span className="font-mono font-semibold text-[#0F2942]">{diasSemana[0]}</span> al{' '}
            <span className="font-mono font-semibold text-[#0F2942]">{diasSemana[6]}</span> · Asignaciones de tu cuadrilla (solo lectura)
          </p>
        </div>

        <div className="inline-flex items-center gap-1.5 rounded-2xl border border-slate-200/80 bg-white p-1 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setInicioSemana((prev) => sumarDiasIso(prev, -7))}
            className="inline-flex items-center justify-center rounded-xl p-2 text-[#0F2942] hover:bg-[#F8FAFC] min-h-[38px] min-w-[38px]"
            aria-label="Semana anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setInicioSemana(obtenerInicioSemanaLunes(hoyAst))}
            className="rounded-xl px-3.5 py-1.5 text-xs font-semibold text-[#0F2942] hover:bg-[#F8FAFC] min-h-[38px] whitespace-nowrap"
          >
            Esta semana
          </button>
          <button
            type="button"
            onClick={() => setInicioSemana((prev) => sumarDiasIso(prev, 7))}
            className="inline-flex items-center justify-center rounded-xl p-2 text-[#0F2942] hover:bg-[#F8FAFC] min-h-[38px] min-w-[38px]"
            aria-label="Semana siguiente"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {!isOnline && (
        <div className="flex items-center gap-2.5 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs text-amber-900">
          <WifiOff className="h-4 w-4 shrink-0 text-[#B45309]" />
          <span>Mostrando programación guardada en caché offline.</span>
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
        <TecnicoAgendaSkeleton />
      ) : totalAsignacionesSemana === 0 ? (
        <div className="rounded-2xl border border-slate-200/90 bg-white p-8 text-center space-y-2">
          <CalendarDays className="h-8 w-8 text-slate-400 mx-auto" />
          <div className="text-sm font-bold text-[#0F2942]">
            Sin rutas programadas esta semana
          </div>
          <p className="text-xs text-[#475569]">
            No tienes asignaciones activas entre {diasSemana[0]} y {diasSemana[6]}. Prueba avanzar a la siguiente semana.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {agendaPorDia.map((dia) => {
            const esHoy = dia.fechaIso === hoyAst;
            return (
              <div
                key={dia.fechaIso}
                className={`rounded-2xl border bg-white overflow-hidden ${
                  esHoy ? 'border-[#0284C7] ring-1 ring-[#0284C7]/20' : 'border-slate-200/90'
                }`}
              >
                <div
                  className={`flex items-center justify-between px-5 py-3 border-b text-xs font-bold ${
                    esHoy
                      ? 'bg-sky-50/80 border-sky-200 text-[#0F2942]'
                      : 'bg-[#F8FAFC] border-slate-200/80 text-slate-700'
                  }`}
                >
                  <span>
                    {formatearDiaCorto(dia.fechaIso)}
                    {esHoy && (
                      <span className="ml-2 font-mono text-[11px] uppercase text-[#0284C7]">
                        · HOY
                      </span>
                    )}
                  </span>
                  <span className="font-mono text-[11px] font-normal text-[#475569] tabular-nums">
                    {dia.items.length} {dia.items.length === 1 ? 'asignación' : 'asignaciones'}
                  </span>
                </div>

                {dia.items.length === 0 ? (
                  <div className="px-5 py-3.5 text-xs text-[#475569]">Libre sin ruta asignada.</div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {dia.items.map((item) => (
                      <div
                        key={`${dia.fechaIso}-${item.asignacion.id}`}
                        className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div className="space-y-1.5 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-xs font-bold text-[#0284C7]">
                              {item.ruta.codigoParcela}
                            </span>
                            <span className="text-sm font-bold text-[#0F2942] truncate">
                              {item.ruta.nombre}
                            </span>
                          </div>
                          <div className="text-xs text-[#475569]">
                            {item.cliente?.nombre || 'Cliente'} · {item.proyecto?.nombre || 'Proyecto'}
                          </div>
                          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-700">
                            <span className="inline-flex items-center gap-1">
                              <MapPin className="h-3.5 w-3.5 text-[#0284C7]" />
                              {item.ruta.ubicacion}
                            </span>
                            {item.cuadrilla && (
                              <span className="inline-flex items-center gap-1">
                                <Users className="h-3.5 w-3.5 text-[#0F2942]" />
                                {item.cuadrilla.nombre}
                              </span>
                            )}
                            {item.vehiculos[0] && (
                              <span className="inline-flex items-center gap-1">
                                <Truck className="h-3.5 w-3.5 text-slate-500" />
                                {item.vehiculos[0].etiqueta} ({item.vehiculos[0].placa})
                              </span>
                            )}
                          </div>
                          {item.serviciosResumen.length > 0 && (
                            <div className="flex flex-wrap items-center gap-2 pt-1">
                              {item.serviciosResumen.map((s) => (
                                <span
                                  key={s.id}
                                  className="inline-flex items-center gap-1.5 text-xs text-slate-700"
                                >
                                  <span>{s.nombre}:</span>
                                  <WorkflowBadge status={s.estado} />
                                </span>
                              ))}
                            </div>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={() => onAbrirDetalleRuta(item.ruta.id)}
                          className="shrink-0 rounded-xl bg-[#0F2942] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0284C7] min-h-[42px] whitespace-nowrap transition-colors"
                        >
                          Abrir ruta
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};
