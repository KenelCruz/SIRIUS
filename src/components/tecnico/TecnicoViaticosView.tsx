import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Lock,
  Pencil,
  Receipt,
  RefreshCw,
  Trash2,
  WifiOff,
} from 'lucide-react';
import {
  validarEdicionViaticoTecnico,
  validarEliminacionViaticoTecnico,
} from '../../domain';
import type {
  EstadoAprobacionViatico,
  SnapshotTecnico,
  Viatico,
} from '../../types/domain';
import { formatRD } from '../../utils/geodesy';

interface TecnicoViaticosViewProps {
  snapshot: SnapshotTecnico;
  usuarioId: string;
  isLoading: boolean;
  error: string | null;
  isOnline: boolean;
  successBanner?: string | null;
  onRetry: () => void;
  onNuevoViatico: () => void;
  onEditarViatico: (viatico: Viatico) => void;
  onEliminarViatico: (viaticoId: string) => Promise<void>;
}

const BADGE_APROBACION: Record<EstadoAprobacionViatico, { label: string; cls: string }> = {
  pendiente: {
    label: 'Pendiente',
    cls: 'bg-[#FEF3C7] text-[#92400E] border-[#FDE047]',
  },
  aprobado: {
    label: 'Aprobado',
    cls: 'bg-[#DCFCE7] text-[#15803D] border-[#86EFAC]',
  },
  rechazado: {
    label: 'Rechazado',
    cls: 'bg-[#FEE2E2] text-[#93000A] border-[#FCA5A5]',
  },
};

export const TecnicoViaticosView: React.FC<TecnicoViaticosViewProps> = ({
  snapshot,
  usuarioId,
  isLoading,
  error,
  isOnline,
  successBanner,
  onRetry,
  onNuevoViatico,
  onEditarViatico,
  onEliminarViatico,
}) => {
  const [filtroEstado, setFiltroEstado] = useState<'todos' | EstadoAprobacionViatico>('todos');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const resumen = useMemo(() => {
    let pendientesRD = 0;
    let aprobadosRD = 0;
    let rechazadosCount = 0;
    for (const v of snapshot.viaticos) {
      if (v.estadoAprobacion === 'pendiente') pendientesRD += v.montoRD;
      else if (v.estadoAprobacion === 'aprobado') aprobadosRD += v.montoRD;
      else if (v.estadoAprobacion === 'rechazado') rechazadosCount += 1;
    }
    return { pendientesRD, aprobadosRD, rechazadosCount };
  }, [snapshot.viaticos]);

  const viaticosFiltrados = useMemo(() => {
    return snapshot.viaticos
      .filter((v) => filtroEstado === 'todos' || v.estadoAprobacion === filtroEstado)
      .sort((a, b) => b.fechaIso.localeCompare(a.fechaIso));
  }, [snapshot.viaticos, filtroEstado]);

  const handleConfirmDelete = async (viaticoId: string) => {
    setActionError(null);
    setDeletingId(viaticoId);
    try {
      await onEliminarViatico(viaticoId);
      setConfirmDeleteId(null);
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'No se pudo eliminar el viático.');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <section className="space-y-4">
      <div className="rounded-md border border-[#CBD5E1] bg-white p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-[#0D1C2F]">Mis Viáticos y Comprobantes</h2>
            <p className="text-xs text-[#43474D]">
              Puedes editar o eliminar solo tus gastos en estado Pendiente.
            </p>
          </div>

          <button
            type="button"
            onClick={onNuevoViatico}
            className="inline-flex items-center gap-1.5 rounded-sm bg-[#0284C7] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#006398] min-h-[42px]"
          >
            <Camera className="h-4 w-4" />
            Reportar Viático
          </button>
        </div>

        {/* Resumen propio (sin presupuestos de proyectos) */}
        <div className="grid grid-cols-3 gap-2 pt-1">
          <div className="rounded-sm border border-[#E2E8F0] bg-[#F8FAFC] p-2.5">
            <div className="text-[11px] text-[#43474D]">Pendiente</div>
            <div className="mt-0.5 font-mono text-xs sm:text-sm font-bold text-[#92400E] tabular-nums">
              {formatRD(resumen.pendientesRD)}
            </div>
          </div>
          <div className="rounded-sm border border-[#E2E8F0] bg-[#F8FAFC] p-2.5">
            <div className="text-[11px] text-[#43474D]">Aprobado</div>
            <div className="mt-0.5 font-mono text-xs sm:text-sm font-bold text-[#15803D] tabular-nums">
              {formatRD(resumen.aprobadosRD)}
            </div>
          </div>
          <div className="rounded-sm border border-[#E2E8F0] bg-[#F8FAFC] p-2.5">
            <div className="text-[11px] text-[#43474D]">Rechazados</div>
            <div className="mt-0.5 font-mono text-xs sm:text-sm font-bold text-[#93000A] tabular-nums">
              {resumen.rechazadosCount}
            </div>
          </div>
        </div>

        {/* Filtros por estado de aprobación */}
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              { id: 'todos', label: `Todos (${snapshot.viaticos.length})` },
              { id: 'pendiente', label: 'Pendientes' },
              { id: 'aprobado', label: 'Aprobados' },
              { id: 'rechazado', label: 'Rechazados' },
            ] as const
          ).map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFiltroEstado(f.id)}
              className={`rounded-sm px-3 py-1.5 text-xs font-semibold border min-h-[36px] ${
                filtroEstado === f.id
                  ? 'border-[#0F2942] bg-[#0F2942] text-white'
                  : 'border-[#CBD5E1] bg-white text-[#334155] hover:bg-[#F8FAFC]'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {!isOnline && (
        <div className="flex items-center gap-2 rounded-sm border border-[#FDE047] bg-[#FEF9C3]/60 px-3 py-2 text-xs text-[#92400E]">
          <WifiOff className="h-4 w-4 shrink-0" />
          <span>
            Sin señal: los viáticos nuevos o editados quedan en cola local y se sincronizan automáticamente al reconectar.
          </span>
        </div>
      )}

      {successBanner && (
        <div className="flex items-center gap-2 rounded-sm border border-[#86EFAC] bg-[#F0FDF4] px-3.5 py-2.5 text-xs font-medium text-[#15803D]">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{successBanner}</span>
        </div>
      )}

      {(error || actionError) && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-[#FCA5A5] bg-[#FEE2E2] px-4 py-3 text-xs text-[#93000A]">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>{actionError || error}</span>
          </div>
          {error && (
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex items-center gap-1 rounded-sm bg-white px-2.5 py-1 text-xs font-semibold text-[#93000A] border border-[#FCA5A5]"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Reintentar
            </button>
          )}
        </div>
      )}

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2].map((n) => (
            <div key={n} className="h-32 animate-pulse rounded-md bg-white border border-[#E2E8F0]" />
          ))}
        </div>
      ) : viaticosFiltrados.length === 0 ? (
        <div className="rounded-md border border-[#CBD5E1] bg-white p-6 text-center space-y-3">
          <Receipt className="h-9 w-9 text-[#94A3B8] mx-auto" />
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-[#0F2942]">
              No hay viáticos en esta vista
            </h3>
            <p className="text-xs text-[#43474D]">
              Registra combustible, dietas, peajes o recibos con foto desde campo.
            </p>
          </div>
          <button
            type="button"
            onClick={onNuevoViatico}
            className="inline-flex items-center gap-1.5 rounded-sm bg-[#0F2942] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0284C7] min-h-[42px]"
          >
            <Camera className="h-4 w-4" />
            Registrar primer viático
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {viaticosFiltrados.map((v) => {
            const ruta = v.rutaId
              ? snapshot.rutas.find((r) => r.id === v.rutaId)
              : undefined;
            const badge = BADGE_APROBACION[v.estadoAprobacion];
            const puedeEditar = validarEdicionViaticoTecnico(v, usuarioId).valido;
            const puedeEliminar = validarEliminacionViaticoTecnico(v, usuarioId).valido;
            const confirmandoBorrado = confirmDeleteId === v.id;

            return (
              <article
                key={v.id}
                className="rounded-md border border-[#CBD5E1] bg-white p-4 space-y-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex items-center rounded-sm border px-2 py-0.5 text-[11px] font-semibold ${badge.cls}`}
                      >
                        {badge.label}
                      </span>
                      <span className="font-mono text-[11px] font-semibold text-[#0284C7]">
                        {v.categoria}
                      </span>
                      {v.syncStatus !== 'synced' && (
                        <span className="rounded-sm bg-[#FEF3C7] px-1.5 py-0.5 font-mono text-[10px] font-semibold text-[#92400E]">
                          {v.syncStatus === 'needs_ocr'
                            ? 'OCR pendiente al reconectar'
                            : 'Pendiente de subir'}
                        </span>
                      )}
                    </div>
                    <h3 className="text-sm font-bold text-[#0D1C2F]">{v.comercio}</h3>
                    <div className="text-xs text-[#43474D]">
                      <span className="font-mono">{v.fechaIso}</span> · {v.metodo}
                      {ruta && (
                        <span className="ml-2 text-[#0F2942] font-medium">
                          · {ruta.codigoParcela}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div className="font-mono text-sm font-bold text-[#0D1C2F] tabular-nums">
                      {formatRD(v.montoRD)}
                    </div>
                    {v.itbisRD > 0 && (
                      <div className="font-mono text-[11px] text-[#43474D]">
                        ITBIS {formatRD(v.itbisRD)}
                      </div>
                    )}
                    {v.ncf && (
                      <div className="font-mono text-[10px] text-[#64748B]">{v.ncf}</div>
                    )}
                  </div>
                </div>

                {v.receiptThumbnail && (
                  <div className="flex items-center gap-2.5">
                    <img
                      src={v.receiptThumbnail}
                      alt={`Comprobante ${v.comercio}`}
                      className="h-14 w-14 rounded-sm border border-[#CBD5E1] object-cover"
                    />
                    {v.notas && <p className="text-xs text-[#43474D]">{v.notas}</p>}
                  </div>
                )}

                {!v.receiptThumbnail && v.notas && (
                  <p className="text-xs text-[#43474D]">{v.notas}</p>
                )}

                {v.estadoAprobacion === 'rechazado' && v.motivoRechazo && (
                  <div className="rounded-sm border border-[#FCA5A5] bg-[#FEE2E2] px-3 py-2 text-xs text-[#93000A]">
                    <strong>Motivo de rechazo:</strong> {v.motivoRechazo}
                  </div>
                )}

                {puedeEditar || puedeEliminar ? (
                  confirmandoBorrado ? (
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-[#FCA5A5] bg-[#FEF2F2] p-2.5 text-xs">
                      <span className="font-semibold text-[#93000A]">
                        ¿Eliminar este viático pendiente?
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          className="rounded-sm border border-[#CBD5E1] bg-white px-3 py-1.5 font-semibold text-[#334155]"
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          disabled={deletingId === v.id}
                          onClick={() => handleConfirmDelete(v.id)}
                          className="rounded-sm bg-[#DC2626] px-3 py-1.5 font-semibold text-white disabled:opacity-50"
                        >
                          {deletingId === v.id ? 'Eliminando...' : 'Sí, eliminar'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2 pt-1 border-t border-[#E2E8F0]">
                      {puedeEditar && (
                        <button
                          type="button"
                          onClick={() => onEditarViatico(v)}
                          className="inline-flex items-center justify-center gap-1.5 rounded-sm border border-[#CBD5E1] bg-[#F8FAFC] px-3 py-2 text-xs font-semibold text-[#0F2942] hover:bg-[#EFF4FF] min-h-[42px]"
                        >
                          <Pencil className="h-3.5 w-3.5 text-[#0284C7]" />
                          Editar
                        </button>
                      )}
                      {puedeEliminar && (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(v.id)}
                          className="inline-flex items-center justify-center gap-1.5 rounded-sm border border-[#FCA5A5] bg-white px-3 py-2 text-xs font-semibold text-[#DC2626] hover:bg-[#FEF2F2] min-h-[42px]"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Eliminar
                        </button>
                      )}
                    </div>
                  )
                ) : (
                  <div className="flex items-center gap-2 border-t border-[#E2E8F0] pt-2.5 text-[11px] text-[#64748B]">
                    <Lock className="h-3.5 w-3.5 shrink-0" />
                    <span>
                      Solo lectura: los viáticos {v.estadoAprobacion === 'aprobado' ? 'aprobados' : 'rechazados'} no pueden modificarse ni eliminarse.
                    </span>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
};
