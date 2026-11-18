import React, { useMemo, useState } from 'react';
import { AlertTriangle, History, Search } from 'lucide-react';
import type { HistorialEvento } from '../types/domain';

interface AuditoriaViewProps {
  historial: HistorialEvento[];
}

export const AuditoriaView: React.FC<AuditoriaViewProps> = ({ historial }) => {
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

  return (
    <section className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-md border border-[#CBD5E1] bg-white p-4">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-[#0284C7]" />
          <div>
            <h2 className="text-sm font-bold text-[#0F2942]">
              Bitácora de Auditoría y Excepciones (F16)
            </h2>
            <p className="text-xs text-[#43474D]">
              Registro cronológico con usuario, fecha, valor anterior, valor nuevo y overrides autorizados.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#74777E]" />
            <input
              type="text"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar usuario, motivo, valor..."
              className="rounded-sm border border-[#CBD5E1] bg-[#F8FAFC] pl-8 pr-3 py-1.5"
            />
          </div>
          <select
            value={tipoFiltro}
            onChange={(e) =>
              setTipoFiltro(e.target.value as HistorialEvento['entidadTipo'] | 'ALL')
            }
            className="rounded-sm border border-[#CBD5E1] bg-white px-2.5 py-1.5"
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

      <div className="rounded-md border border-[#E2E8F0] bg-white divide-y divide-[#E2E8F0]">
        {eventosFiltrados.length === 0 ? (
          <div className="p-8 text-center text-xs text-[#43474D]">
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
                className={`p-4 flex flex-col sm:flex-row sm:items-start justify-between gap-2 text-xs ${
                  esOverride ? 'bg-[#FEE2E2]/35' : ''
                }`}
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[11px] uppercase font-bold text-[#0284C7]">
                      {ev.entidadTipo}
                    </span>
                    <span className="font-bold text-[#0D1C2F]">{ev.accion}</span>
                    {esOverride && (
                      <span className="inline-flex items-center gap-1 rounded-sm border border-[#FCA5A5] bg-[#FEE2E2] px-1.5 py-0.5 text-[10px] font-bold text-[#93000A]">
                        <AlertTriangle className="h-3 w-3" />
                        Override Autorizado
                      </span>
                    )}
                  </div>
                  <p className="text-[#334155]">{ev.detalle}</p>
                  {(valorAnterior || valorNuevo) && (
                    <div className="mt-1 flex flex-wrap items-center gap-2 rounded-sm border border-[#E2E8F0] bg-[#F8FAFC] px-2.5 py-1.5 font-mono text-[11px]">
                      {valorAnterior && (
                        <span className="text-[#64748B]">
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
                    <div className="font-mono text-[11px] text-[#93000A]">
                      Motivo: "{String(ev.metadata?.overrideMotivo)}" · Autorizó: {ev.usuarioNombre}{' '}
                      ({String(ev.metadata?.overrideFecha || ev.fechaAST)})
                    </div>
                  )}
                </div>

                <div className="text-right shrink-0">
                  <div className="font-semibold text-[#0F2942]">{ev.usuarioNombre}</div>
                  <div className="font-mono text-[11px] text-[#43474D]">{ev.fechaAST}</div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
};
