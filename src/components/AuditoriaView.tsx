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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-lg border border-slate-200 bg-white p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-sky-50 text-[#0284C7]">
            <History className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Bitácora de Auditoría y Excepciones (F16)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Registro cronológico con usuario, fecha, valor anterior, valor nuevo y overrides autorizados.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 text-xs">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar usuario, motivo, valor..."
              className="rounded-md border border-slate-300 bg-slate-50 pl-8 pr-3 py-2 text-xs text-slate-900 focus:bg-white min-h-[40px]"
            />
          </div>
          <select
            value={tipoFiltro}
            onChange={(e) =>
              setTipoFiltro(e.target.value as HistorialEvento['entidadTipo'] | 'ALL')
            }
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs text-slate-700 min-h-[40px]"
            aria-label="Filtrar por tipo de entidad"
          >
            <option value="ALL">Todas las entidades</option>
            <option value="asignacion">Asignaciones</option>
            <option value="servicio">Servicios</option>
            <option value="viatico">Viáticos</option>
            <option value="ruta">Rutas</option>
            <option value="proyecto">Proyectos</option>
            <option value="catalogo">Catálogos</option>
            <option value="empresa">Empresa</option>
          </select>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white divide-y divide-slate-200 overflow-hidden">
        {eventosFiltrados.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
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
                  esOverride ? 'bg-rose-50/40' : ''
                }`}
              >
                <div className="space-y-1.5 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-mono text-[11px] font-bold text-[#0284C7] uppercase">
                      {ev.entidadTipo}
                    </span>
                    <span aria-hidden="true" className="text-slate-300">·</span>
                    <span className="font-bold text-slate-900">{ev.accion}</span>
                    {esOverride && (
                      <span className="inline-flex items-center gap-1 rounded-md border border-rose-200 bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-[#DC2626]">
                        <AlertTriangle className="h-3 w-3" />
                        Override Autorizado
                      </span>
                    )}
                  </div>
                  <p className="text-slate-700 leading-relaxed">{ev.detalle}</p>
                  {(valorAnterior || valorNuevo) && (
                    <div className="mt-1 flex flex-wrap items-center gap-2 rounded-md bg-slate-50 px-3 py-1.5 font-mono text-[11px]">
                      {valorAnterior && (
                        <span className="text-slate-500">
                          Anterior: <span className="text-slate-700">{valorAnterior}</span>
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
                  <div className="font-semibold text-slate-900">{ev.usuarioNombre}</div>
                  <div className="font-mono text-[11px] text-slate-500 mt-0.5">{ev.fechaAST}</div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
};
