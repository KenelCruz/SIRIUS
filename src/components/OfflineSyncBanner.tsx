import React from 'react';
import { AlertTriangle, RefreshCw, WifiOff } from 'lucide-react';

interface OfflineSyncBannerProps {
  isOnline: boolean;
  pendingCount: number;
  hasConflict: boolean;
  isSyncing: boolean;
  onSyncNow: () => void;
}

export const OfflineSyncBanner: React.FC<OfflineSyncBannerProps> = ({
  isOnline,
  pendingCount,
  hasConflict,
  isSyncing,
  onSyncNow,
}) => {
  if (isOnline && pendingCount === 0 && !hasConflict) {
    return <div className="h-[3px] w-full bg-[#16A34A]" aria-label="Sincronizado en línea" />;
  }

  if (hasConflict) {
    return (
      <div className="sticky top-0 z-40 flex flex-wrap items-center justify-between gap-2 bg-[#DC2626] px-4 py-2 text-xs font-medium text-white">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>
            Conflicto de sincronización detectado — Revisa las asignaciones o registros pendientes antes de cerrar jornada.
          </span>
        </div>
        <button
          type="button"
          onClick={onSyncNow}
          disabled={!isOnline || isSyncing}
          className="inline-flex items-center gap-1.5 rounded-sm bg-white/15 px-3 py-1 text-xs font-semibold text-white hover:bg-white/25 disabled:opacity-50 whitespace-nowrap shrink-0"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
          Reconciliar
        </button>
      </div>
    );
  }

  return (
    <div className="sticky top-0 z-40 flex flex-wrap items-center justify-between gap-2 bg-[#0F2942] px-4 py-2 text-xs text-[#F8FAFC] border-b border-[#1E3A8A]">
      <div className="flex items-center gap-2">
        <WifiOff className="h-4 w-4 shrink-0 text-[#D97706]" />
        <span>
          {!isOnline
            ? `Modo Sin Conexión — ${pendingCount} ${
                pendingCount === 1 ? 'modificación local pendiente' : 'modificaciones locales pendientes'
              } de sincronización`
            : `${pendingCount} ${
                pendingCount === 1 ? 'registro local pendiente' : 'registros locales pendientes'
              } por respaldar en servidor`}
        </span>
      </div>
      <button
        type="button"
        onClick={onSyncNow}
        disabled={!isOnline || isSyncing}
        className="inline-flex items-center gap-1.5 rounded-sm border border-[#7991AF]/40 bg-[#1E3A8A]/60 px-3 py-1 text-xs font-semibold text-white hover:bg-[#0284C7] disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
      >
        <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
        {isSyncing ? 'Sincronizando...' : 'Forzar Reintento'}
      </button>
    </div>
  );
};
