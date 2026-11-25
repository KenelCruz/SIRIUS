import React from 'react';
import { AlertTriangle, RefreshCw, WifiOff, X } from 'lucide-react';
import type { AvisoSobrescrituraLWW, ConteoPendientesPorTipo } from '../types/domain';

interface OfflineSyncBannerProps {
  isOnline: boolean;
  pendingCount: number;
  pendingCounts?: ConteoPendientesPorTipo;
  hasConflict: boolean;
  isSyncing: boolean;
  avisosLww?: AvisoSobrescrituraLWW[];
  onDescartarAvisosLww?: () => void;
  onSyncNow: () => void;
}

function formatearDesglosePendientes(counts?: ConteoPendientesPorTipo): string {
  if (!counts || counts.total === 0) return '';
  const partes: string[] = [];
  if (counts.servicios > 0) {
    partes.push(`${counts.servicios} ${counts.servicios === 1 ? 'servicio' : 'servicios'}`);
  }
  if (counts.bitacoras > 0) {
    partes.push(`${counts.bitacoras} ${counts.bitacoras === 1 ? 'bitácora' : 'bitácoras'}`);
  }
  if (counts.viaticos > 0) {
    partes.push(`${counts.viaticos} ${counts.viaticos === 1 ? 'viático' : 'viáticos'}`);
  }
  if (counts.proyectos > 0) {
    partes.push(`${counts.proyectos} ${counts.proyectos === 1 ? 'proyecto' : 'proyectos'}`);
  }
  if (counts.rutas > 0) {
    partes.push(`${counts.rutas} ${counts.rutas === 1 ? 'ruta' : 'rutas'}`);
  }
  if (counts.asignaciones > 0) {
    partes.push(
      `${counts.asignaciones} ${counts.asignaciones === 1 ? 'asignación' : 'asignaciones'}`
    );
  }
  return partes.join(' · ');
}

export const OfflineSyncBanner: React.FC<OfflineSyncBannerProps> = ({
  isOnline,
  pendingCount,
  pendingCounts,
  hasConflict,
  isSyncing,
  avisosLww = [],
  onDescartarAvisosLww,
  onSyncNow,
}) => {
  const desglose = formatearDesglosePendientes(pendingCounts);

  return (
    <>
      {avisosLww.length > 0 && (
        <div
          role="alert"
          className="flex items-start justify-between gap-3 bg-amber-50 border-b border-amber-300 px-4 py-2.5 text-xs text-amber-950"
        >
          <div className="flex items-start gap-2.5 min-w-0">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-[#B45309]" />
            <div className="space-y-0.5">
              <div className="font-bold">
                Aviso de sincronización (gana el último): {avisosLww.length}{' '}
                {avisosLww.length === 1
                  ? 'cambio local fue sobrescrito'
                  : 'cambios locales fueron sobrescritos'}{' '}
                por un registro más reciente del servidor.
              </div>
              <ul className="list-disc pl-4 text-[11px] space-y-0.5 text-amber-900">
                {avisosLww.slice(0, 3).map((av) => (
                  <li key={`${av.entidadTipo}-${av.entidadId}-${av.fecha}`}>{av.descripcion}</li>
                ))}
              </ul>
            </div>
          </div>
          {onDescartarAvisosLww && (
            <button
              type="button"
              onClick={onDescartarAvisosLww}
              className="rounded-xl p-1.5 text-amber-900 hover:bg-amber-200/70 shrink-0 transition-colors"
              aria-label="Cerrar aviso de sincronización"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      )}

      {isOnline && pendingCount === 0 && !hasConflict ? (
        <div className="h-[3px] w-full bg-[#15803D]" aria-label="Sincronizado en línea" />
      ) : hasConflict ? (
        <div className="sticky top-0 z-40 flex flex-wrap items-center justify-between gap-2 bg-[#DC2626] px-4 py-2 text-xs font-medium text-white">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>
              Conflicto de sincronización detectado — Revisa los registros pendientes antes de cerrar jornada.
            </span>
          </div>
          <button
            type="button"
            onClick={onSyncNow}
            disabled={!isOnline || isSyncing}
            className="inline-flex items-center gap-1.5 rounded-xl bg-white/15 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/25 disabled:opacity-50 whitespace-nowrap shrink-0 transition-colors"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
            Reconciliar
          </button>
        </div>
      ) : (
        <div className="sticky top-0 z-40 flex flex-wrap items-center justify-between gap-2 bg-[#0F2942] px-4 py-2 text-xs text-slate-50 border-b border-slate-700">
          <div className="flex items-center gap-2 min-w-0">
            <WifiOff className="h-4 w-4 shrink-0 text-amber-400" />
            <div className="min-w-0">
              <span>
                {!isOnline
                  ? `Sin conexión — ${pendingCount} ${
                      pendingCount === 1 ? 'cambio pendiente' : 'cambios pendientes'
                    } en cola local`
                  : `${pendingCount} ${
                      pendingCount === 1 ? 'cambio local pendiente' : 'cambios locales pendientes'
                    } por sincronizar`}
              </span>
              {desglose && (
                <span className="ml-2 font-mono text-[11px] text-sky-300">({desglose})</span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onSyncNow}
            disabled={!isOnline || isSyncing}
            className="inline-flex items-center gap-1.5 rounded-xl border border-white/25 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#0284C7] disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
            {isSyncing ? 'Sincronizando...' : 'Sincronizar ahora'}
          </button>
        </div>
      )}
    </>
  );
};
