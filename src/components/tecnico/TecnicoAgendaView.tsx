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
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-[#CBD5E1] bg-white p-4">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onVolverHoy}
              className="inline-flex items-center gap-1 rounded-sm border border-[#CBD5E1] bg-[#F8FAFC] px-2.5 py-1.5 text-xs font-semibold text-[#0F2942] hover:bg-[#EFF4FF] min-h-[36px]"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Hoy
            </button>
            <h2 className="text-sm sm:text-base font-bold text-[#0D1C2F]">
              Mi Agenda Semanal (Solo lectura)
            </h2>
          </div>
          <p className="text-xs text-[#43474D]">
            Semana del <span className="font-mono font-semibold">{diasSemana[0]}</span> al{' '}
            <span className="font-mono font-semibold">{diasSemana[6]}</span> · Asignaciones de tu cuadrilla.
          </p>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setInicioSemana((prev) => sumarDiasIso(prev, -7))}
            className="inline-flex items-center justify-center rounded-sm border border-[#CBD5E1] bg-white p-2 text-[#0F2942] hover:bg-[#F8FAFC] min-h-[40px] min-w-[40px]"
            aria-label="Semana anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setInicioSemana(obtenerInicioSemanaLunes(hoyAst))}
            className="rounded-sm border border-[#CBD5E1] bg-white px-3 py-2 text-xs font-semibold text-[#0F2942] hover:bg-[#F8FAFC] min-h-[40px]"
          >
            Esta semana
          </button>
          <button
            type="button"
            onClick={() => setInicioSemana((prev) => sumarDiasIso(prev, 7))}
            className="inline-flex items-center justify-center rounded-sm border border-[#CBD5E1] bg-white p-2 text-[#0F2942] hover:bg-[#F8FAFC] min-h-[40px] min-w-[40px]"
            aria-label="Semana siguiente"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {!isOnline && (
        <div className="flex items-center gap-2 rounded-sm border border-[#FDE047] bg-[#FEF9C3]/60 px-3 py-2 text-xs text-[#92400E]">
          <WifiOff className="h-4 w-4 shrink-0" />
          <span>Mostrando programación guardada en caché offline.</span>
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
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-md bg-white border border-[#E2E8F0]" />
          ))}
        </div>
      ) : totalAsignacionesSemana === 0 ? (
        <div className="rounded-md border border-[#CBD5E1] bg-white p-6 text-center space-y-2">
          <CalendarDays className="h-8 w-8 text-[#94A3B8] mx-auto" />
          <div className="text-sm font-bold text-[#0F2942]">
            Sin rutas programadas esta semana
          </div>
          <p className="text-xs text-[#43474D]">
            No tienes asignaciones activas entre {diasSemana[0]} y {diasSemana[6]}. Prueba avanzar a la siguiente semana.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {agendaPorDia.map((dia) => {
            const esHoy = dia.fechaIso === hoyAst;
            return (
              <div
                key={dia.fechaIso}
                className={`rounded-md border bg-white overflow-hidden ${
                  esHoy ? 'border-[#0284C7] ring-1 ring-[#0284C7]/25' : 'border-[#CBD5E1]'
                }`}
              >
                <div
                  className={`flex items-center justify-between px-4 py-2 border-b text-xs font-bold ${
                    esHoy
                      ? 'bg-[#EFF6FF] border-[#BFDBFE] text-[#0F2942]'
                      : 'bg-[#F8FAFC] border-[#E2E8F0] text-[#334155]'
                  }`}
                >
                  <span>
                    {formatearDiaCorto(dia.fechaIso)}
                    {esHoy && (
                      <span className="ml-2 font-mono text-[10px] uppercase text-[#0284C7]">
                        · HOY
                      </span>
                    )}
                  </span>
                  <span className="font-mono text-[11px] font-normal text-[#43474D]">
                    {dia.items.length} {dia.items.length === 1 ? 'asignación' : 'asignaciones'}
                  </span>
                </div>

                {dia.items.length === 0 ? (
                  <div className="px-4 py-3 text-xs text-[#64748B]">Libre sin ruta asignada.</div>
                ) : (
                  <div className="divide-y divide-[#E2E8F0]">
                    {dia.items.map((item) => (
                      <div
                        key={`${dia.fechaIso}-${item.asignacion.id}`}
                        className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div className="space-y-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-xs font-bold text-[#0284C7]">
                              {item.ruta.codigoParcela}
                            </span>
                            <span className="text-sm font-bold text-[#0D1C2F] truncate">
                              {item.ruta.nombre}
                            </span>
                          </div>
                          <div className="text-xs text-[#43474D]">
                            {item.cliente?.nombre || 'Cliente'} · {item.proyecto?.nombre || 'Proyecto'}
                          </div>
                          <div className="flex flex-wrap items-center gap-3 text-[11px] text-[#334155]">
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
                                <Truck className="h-3.5 w-3.5 text-[#43474D]" />
                                {item.vehiculos[0].etiqueta} ({item.vehiculos[0].placa})
                              </span>
                            )}
                          </div>
                          {item.serviciosResumen.length > 0 && (
                            <div className="flex flex-wrap items-center gap-1.5 pt-1">
                              {item.serviciosResumen.map((s) => (
                                <span
                                  key={s.id}
                                  className="inline-flex items-center gap-1 text-[11px] text-[#334155]"
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
                          className="shrink-0 rounded-sm bg-[#0F2942] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#0284C7] min-h-[42px]"
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
