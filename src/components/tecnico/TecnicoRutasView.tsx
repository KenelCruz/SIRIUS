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
    <section className="space-y-4">
      <div className="rounded-md border border-[#CBD5E1] bg-white p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-[#0D1C2F]">Mis Rutas Asignadas</h2>
            <p className="text-xs text-[#43474D]">
              Solo ves rutas donde tu cuadrilla tiene asignación registrada ({snapshot.rutas.length}).
            </p>
          </div>
          <button
            type="button"
            onClick={onAbrirAgenda}
            className="inline-flex items-center gap-1.5 rounded-sm border border-[#CBD5E1] bg-[#F8FAFC] px-3 py-2 text-xs font-semibold text-[#0F2942] hover:bg-[#EFF4FF] min-h-[40px]"
          >
            <CalendarDays className="h-4 w-4 text-[#0284C7]" />
            Mi agenda semanal
          </button>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#64748B]" />
          <input
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por parcela, ubicación, provincia o cliente..."
            className="w-full rounded-sm border border-[#CBD5E1] pl-9 pr-3 py-2.5 text-xs text-[#0D1C2F] min-h-[42px]"
          />
        </div>
      </div>

      {!isOnline && (
        <div className="flex items-center gap-2 rounded-sm border border-[#FDE047] bg-[#FEF9C3]/60 px-3 py-2 text-xs text-[#92400E]">
          <WifiOff className="h-4 w-4 shrink-0" />
          <span>Mostrando rutas y polígonos KMZ en caché local.</span>
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
            <div key={n} className="h-36 animate-pulse rounded-md bg-white border border-[#E2E8F0]" />
          ))}
        </div>
      ) : rutasFiltradas.length === 0 ? (
        <div className="rounded-md border border-[#CBD5E1] bg-white p-6 text-center space-y-2">
          <RouteIcon className="h-8 w-8 text-[#94A3B8] mx-auto" />
          <div className="text-sm font-bold text-[#0F2942]">
            {busqueda ? 'Sin rutas que coincidan con tu búsqueda' : 'No tienes rutas asignadas'}
          </div>
          <p className="text-xs text-[#43474D]">
            {busqueda
              ? 'Intenta limpiar el filtro de búsqueda.'
              : 'Cuando Coordinación asigne tu cuadrilla a una ruta, aparecerá aquí.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
                className="rounded-md border border-[#CBD5E1] bg-white p-4 flex flex-col justify-between gap-3"
              >
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-mono text-xs font-bold text-[#0284C7]">
                        {ruta.codigoParcela}
                      </div>
                      <h3 className="text-sm font-bold text-[#0D1C2F]">{ruta.nombre}</h3>
                      <div className="text-xs text-[#43474D]">
                        {cliente?.nombre || 'Cliente'} · {proyecto?.nombre || 'Proyecto'}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 text-[11px] text-[#334155]">
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5 text-[#0284C7]" />
                      {ruta.ubicacion} ({ruta.provincia})
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 rounded-sm bg-[#F8FAFC] border border-[#E2E8F0] p-2.5 text-[11px]">
                    <div>
                      <span className="text-[#43474D]">Superficie: </span>
                      <span className="font-mono font-semibold text-[#0F2942]">
                        {formatArea(ruta.totalAreaM2, areaUnit)}
                      </span>
                    </div>
                    <div>
                      <span className="text-[#43474D]">Perímetro: </span>
                      <span className="font-mono font-semibold text-[#0F2942]">
                        {formatPerimeter(ruta.totalPerimeterM)}
                      </span>
                    </div>
                  </div>

                  {asignaciones.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-[#334155]">
                      {cuadrilla && (
                        <span className="inline-flex items-center gap-1 font-semibold text-[#0F2942]">
                          <Users className="h-3.5 w-3.5" />
                          {cuadrilla.nombre}
                        </span>
                      )}
                      <span className="font-mono text-[#43474D]">
                        {asignaciones.map((a) => `${a.fechaInicio} → ${a.fechaFin}`).join(' · ')}
                      </span>
                    </div>
                  )}

                  {servicios.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {servicios.map((s) => (
                        <span
                          key={s.id}
                          className="inline-flex items-center gap-1.5 rounded-sm border border-[#E2E8F0] bg-[#F8FAFC] px-2 py-1 text-[11px]"
                        >
                          <span className="font-medium text-[#0D1C2F]">{s.nombre}</span>
                          <WorkflowBadge status={s.estado} />
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => onAbrirDetalleRuta(ruta.id)}
                  className="w-full inline-flex items-center justify-center gap-1.5 rounded-sm bg-[#0F2942] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#0284C7] min-h-[44px]"
                >
                  <span>Ver Detalle y Mapa de Ruta</span>
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
