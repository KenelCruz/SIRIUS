import React, { useMemo, useState } from 'react';
import { AlertTriangle, History, Search } from 'lucide-react';
import type { HistorialEvento } from '../types/domain';
import { AuditoriaViewSkeleton } from './Skeletons';

interface AuditoriaViewProps {
  historial: HistorialEvento[];
  isLoading?: boolean;
}

export const AuditoriaView: React.FC<AuditoriaViewProps> = ({ historial, isLoading = false }) => {
  const [tipoFiltro, setTipoFiltro] = useState<HistorialEvento['entidadTipo'] | 'ALL'>('ALL');
  const [busqueda, setBusqueda] = useState('');

  const eventosFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return historial.filter((h) => {
      if (tipoFiltro !== 'ALL' && h.entidadTipo !== tipoFiltro) return false;
      if (!q) return true;
      const valAnt = (h.valorAnterior ?? String(h.metadata?.valorAnterior ?? '')).toLowerCase();
      const valNvo = (h.valorNuevo ?? String(h.metadata?.valorNuevo ?? '')).toLowerCase();
      const motivoOv = String(h.metadata?.overrideMotivo ?? '').toLowerCase();
      return (
        h.accion.toLowerCase().includes(q) ||
        h.detalle.toLowerCase().includes(q) ||
        h.usuarioNombre.toLowerCase().includes(q) ||
        valAnt.includes(q) ||
        valNvo.includes(q) ||
        motivoOv.includes(q)
      );
    });
  }, [historial, tipoFiltro, busqueda]);

  if (isLoading) {
    return <AuditoriaViewSkeleton />;
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
        <div>
          <h2 className="text-2xl sm:text-[26px] font-bold tracking-tight text-[#0F2942]">
            Auditoría y Excepciones
          </h2>
          <p className="text-sm text-[#475569] mt-0.5">
            Registro cronológico con usuario, fecha, valor anterior, valor nuevo y overrides autorizados.
          </p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-slate-200/90 bg-white p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-[#0284C7]">
            <History className="h-4 w-4" />
          </div>
          <div>
            <div className="text-sm font-bold text-[#0F2942]">
              Bitácora inmutable de eventos
            </div>
            <div className="text-xs text-[#475569]">
              {eventosFiltrados.length} registro(s) visible(s)
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 text-xs">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar usuario, motivo, valor..."
              className="rounded-xl border border-slate-200 bg-[#F8FAFC] pl-9 pr-3 py-2 text-xs text-[#0F2942] focus:border-[#0284C7] focus:bg-white focus:outline-none min-h-[42px]"
            />
          </div>
          <select
            value={tipoFiltro}
            onChange={(e) =>
              setTipoFiltro(e.target.value as HistorialEvento['entidadTipo'] | 'ALL')
            }
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-[#334155] min-h-[42px] focus:border-[#0284C7] focus:outline-none"
            aria-label="Filtrar por tipo de entidad"
          >
            <option value="ALL">Todas las entidades</option>
            <option value="asignacion">Asignaciones</option>
            <option value="servicio">Servicios</option>
            <option value="viatico">Viáticos</option>
            <option value="ruta">Rutas</option>
            <option value="proyecto">Proyectos</option>
            <option value="presupuesto">Presupuestos</option>
            <option value="catalogo">Catálogos</option>
            <option value="empresa">Empresa</option>
          </select>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200/90 bg-white divide-y divide-slate-100 overflow-hidden">
        {eventosFiltrados.length === 0 ? (
          <div className="p-10 text-center text-xs text-[#475569]">
            No hay eventos de auditoría que coincidan con el filtro.
          </div>
        ) : (
          eventosFiltrados.map((ev) => {
            const esOverride = Boolean(ev.metadata?.overrideMotivo);
            const valorAnterior =
              ev.valorAnterior ??
              (ev.metadata?.valorAnterior !== undefined
                ? String(ev.metadata.valorAnterior)
                : undefined);
            const valorNuevo =
              ev.valorNuevo ??
              (ev.metadata?.valorNuevo !== undefined
                ? String(ev.metadata.valorNuevo)
                : undefined);

            return (
              <div
                key={ev.id}
                className={`p-4 sm:p-5 flex flex-col sm:flex-row sm:items-start justify-between gap-3 text-xs ${
                  esOverride ? 'bg-rose-50/40' : 'hover:bg-[#F8FAFC]/70 transition-colors'
                }`}
              >
                <div className="space-y-1.5 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-mono text-[11px] font-bold text-[#0284C7] uppercase">
                      {ev.entidadTipo}
                    </span>
                    <span aria-hidden="true" className="text-slate-300">·</span>
                    <span className="font-bold text-[#0F2942]">{ev.accion}</span>
                    {esOverride && (
                      <span className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-[#DC2626]">
                        <AlertTriangle className="h-3 w-3" />
                        Override Autorizado
                      </span>
                    )}
                  </div>
                  <p className="text-[#334155] leading-relaxed">{ev.detalle}</p>
                  {(valorAnterior || valorNuevo) && (
                    <div className="mt-1 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200/70 bg-[#F8FAFC] px-3 py-2 font-mono text-[11px]">
                      {valorAnterior && (
                        <span className="text-[#475569]">
                          Anterior: <span className="text-[#334155]">{valorAnterior}</span>
                        </span>
                      )}
                      {valorAnterior && valorNuevo && <span className="text-[#0284C7]">→</span>}
                      {valorNuevo && (
                        <span className="text-[#0F2942] font-semibold">
                          Nuevo: {valorNuevo}
                        </span>
                      )}
                    </div>
                  )}
                  {esOverride && (
                    <div className="font-mono text-[11px] text-[#DC2626]">
                      Motivo: "{String(ev.metadata?.overrideMotivo)}" · Autorizó: {ev.usuarioNombre}{' '}
                      ({String(ev.metadata?.overrideFecha || ev.fechaAST)})
                    </div>
                  )}
                </div>

                <div className="sm:text-right shrink-0">
                  <div className="font-semibold text-[#0F2942]">{ev.usuarioNombre}</div>
                  <div className="font-mono text-[11px] text-[#475569] mt-0.5">{ev.fechaAST}</div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
};
