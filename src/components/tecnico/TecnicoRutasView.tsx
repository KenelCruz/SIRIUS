import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarDays,
  ChevronRight,
  MapPin,
  RefreshCw,
  Route as RouteIcon,
  Search,
  Users,
  WifiOff,
} from 'lucide-react';
import type { AreaUnit, SnapshotTecnico } from '../../types/domain';
import { formatArea, formatPerimeter } from '../../utils/geodesy';
import { TecnicoRutasSkeleton } from '../Skeletons';
import { WorkflowBadge } from '../WorkflowBadge';

interface TecnicoRutasViewProps {
  snapshot: SnapshotTecnico;
  isLoading: boolean;
  error: string | null;
  isOnline: boolean;
  areaUnit: AreaUnit;
  onRetry: () => void;
  onAbrirDetalleRuta: (rutaId: string) => void;
  onAbrirAgenda: () => void;
}

export const TecnicoRutasView: React.FC<TecnicoRutasViewProps> = ({
  snapshot,
  isLoading,
  error,
  isOnline,
  areaUnit,
  onRetry,
  onAbrirDetalleRuta,
  onAbrirAgenda,
}) => {
  const [busqueda, setBusqueda] = useState('');

  const rutasFiltradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return snapshot.rutas.filter((r) => {
      if (!q) return true;
      const proyecto = snapshot.proyectos.find((p) => p.id === r.proyectoId);
      const cliente = proyecto
        ? snapshot.clientes.find((c) => c.id === proyecto.clienteId)
        : undefined;
      return (
        r.codigoParcela.toLowerCase().includes(q) ||
        r.nombre.toLowerCase().includes(q) ||
        r.provincia.toLowerCase().includes(q) ||
        (cliente?.nombre || '').toLowerCase().includes(q)
      );
    });
  }, [snapshot, busqueda]);

  return (
    <section className="space-y-5">
      <div className="rounded-lg border border-slate-200 bg-white p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base sm:text-lg font-bold tracking-tight text-slate-900">
              Mis Rutas Asignadas
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Solo ves rutas donde tu cuadrilla tiene asignación registrada ({snapshot.rutas.length}).
            </p>
          </div>
          <button
            type="button"
            onClick={onAbrirAgenda}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-[#0F2942] hover:bg-slate-50 min-h-[42px] whitespace-nowrap shrink-0"
          >
            <CalendarDays className="h-4 w-4 text-[#0284C7]" />
            Mi agenda semanal
          </button>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por parcela, ubicación, provincia o cliente..."
            className="w-full rounded-md border border-slate-300 bg-slate-50 pl-9 pr-3 py-2.5 text-xs text-slate-900 focus:bg-white min-h-[44px]"
          />
        </div>
      </div>

      {!isOnline && (
        <div className="flex items-center gap-2.5 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 text-xs text-amber-900">
          <WifiOff className="h-4 w-4 shrink-0 text-[#B45309]" />
          <span>Mostrando rutas y polígonos KMZ en caché local.</span>
        </div>
      )}

      {error && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-800">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center gap-1.5 rounded-md bg-white px-3 py-1.5 text-xs font-semibold text-rose-800 border border-rose-200 min-h-[38px]"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Reintentar
          </button>
        </div>
      )}

      {isLoading ? (
        <TecnicoRutasSkeleton />
      ) : rutasFiltradas.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-8 text-center space-y-2">
          <RouteIcon className="h-8 w-8 text-slate-400 mx-auto" />
          <div className="text-sm font-bold text-slate-900">
            {busqueda ? 'Sin rutas que coincidan con tu búsqueda' : 'No tienes rutas asignadas'}
          </div>
          <p className="text-xs text-slate-500">
            {busqueda
              ? 'Intenta limpiar el filtro de búsqueda.'
              : 'Cuando Coordinación asigne tu cuadrilla a una ruta, aparecerá aquí.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch">
          {rutasFiltradas.map((ruta) => {
            const proyecto = snapshot.proyectos.find((p) => p.id === ruta.proyectoId);
            const cliente = proyecto
              ? snapshot.clientes.find((c) => c.id === proyecto.clienteId)
              : undefined;
            const asignaciones = snapshot.asignaciones.filter((a) => a.rutaId === ruta.id);
            const servicios = snapshot.servicios.filter((s) => s.rutaId === ruta.id);
            const cuadrilla = asignaciones[0]
              ? snapshot.cuadrillas.find((c) => c.id === asignaciones[0].cuadrillaId)
              : undefined;

            return (
              <div
                key={ruta.id}
                className="rounded-lg border border-slate-200 bg-white p-5 flex flex-col justify-between gap-4"
              >
                <div className="space-y-3">
                  <div className="min-w-0">
                    <div className="font-mono text-xs font-bold text-[#0284C7]">
                      {ruta.codigoParcela}
                    </div>
                    <h3 className="text-sm sm:text-base font-bold text-slate-900 mt-0.5">
                      {ruta.nombre}
                    </h3>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {cliente?.nombre || 'Cliente'} · {proyecto?.nombre || 'Proyecto'}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-700">
                    <span className="inline-flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5 text-[#0284C7] shrink-0" />
                      {ruta.ubicacion} ({ruta.provincia})
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 rounded-md bg-slate-50 p-3 text-xs">
                    <div>
                      <span className="text-slate-500">Superficie: </span>
                      <span className="font-mono font-semibold text-[#0F2942] tabular-nums">
                        {formatArea(ruta.totalAreaM2, areaUnit)}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500">Perímetro: </span>
                      <span className="font-mono font-semibold text-[#0F2942] tabular-nums">
                        {formatPerimeter(ruta.totalPerimeterM)}
                      </span>
                    </div>
                  </div>

                  {asignaciones.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-700">
                      {cuadrilla && (
                        <span className="inline-flex items-center gap-1 font-semibold text-[#0F2942]">
                          <Users className="h-3.5 w-3.5" />
                          {cuadrilla.nombre}
                        </span>
                      )}
                      <span className="font-mono text-[11px] text-slate-500">
                        {asignaciones.map((a) => `${a.fechaInicio} → ${a.fechaFin}`).join(' · ')}
                      </span>
                    </div>
                  )}

                  {servicios.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-100">
                      {servicios.map((s) => (
                        <div key={s.id} className="inline-flex items-center gap-1.5 text-xs">
                          <span className="font-medium text-slate-700">{s.nombre}</span>
                          <WorkflowBadge status={s.estado} />
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => onAbrirDetalleRuta(ruta.id)}
                  className="w-full inline-flex items-center justify-center gap-1.5 rounded-md bg-[#0F2942] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#0284C7] min-h-[44px] transition-colors whitespace-nowrap"
                >
                  <span>Ver detalle y mapa</span>
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};
