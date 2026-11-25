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
  ERROR_TECNICO_SIN_PERSONAL,
  puedeEditarViatico,
  validarEdicionViaticoTecnico,
  validarEliminacionViaticoTecnico,
} from '../../domain';
import type {
  EstadoAprobacionViatico,
  SnapshotTecnico,
  Viatico,
} from '../../types/domain';
import { formatRD } from '../../utils/geodesy';
import { MediaThumb } from '../MediaThumb';
import { TecnicoViaticosSkeleton } from '../Skeletons';

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
    cls: 'bg-amber-50 text-[#B45309] border-amber-300',
  },
  aprobado: {
    label: 'Aprobado',
    cls: 'bg-emerald-50 text-[#15803D] border-emerald-200',
  },
  rechazado: {
    label: 'Rechazado',
    cls: 'bg-rose-50 text-[#DC2626] border-rose-200',
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
    <section className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl sm:text-[26px] font-bold tracking-tight text-[#0F2942]">
            Mis Viáticos y Comprobantes
          </h2>
          <p className="text-xs sm:text-sm text-[#475569] mt-0.5">
            Puedes editar o eliminar únicamente tus gastos en estado Pendiente.
          </p>
        </div>

        <button
          type="button"
          onClick={onNuevoViatico}
          className="inline-flex items-center gap-1.5 rounded-xl bg-[#0F2942] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#0284C7] min-h-[42px] whitespace-nowrap shrink-0 self-start sm:self-auto transition-colors"
        >
          <Camera className="h-4 w-4" />
          Registrar viático
        </button>
      </div>

      {/* Bento Summary Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-2xl bg-gradient-to-br from-[#0F2942] to-[#0284C7] p-5 text-white flex flex-col justify-between min-h-[112px]">
          <div className="text-xs font-medium text-white/90">Aprobado empresa</div>
          <div className="font-mono text-2xl font-bold tabular-nums">
            {formatRD(resumen.aprobadosRD)}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200/90 bg-white p-5 flex flex-col justify-between min-h-[112px]">
          <div className="text-xs font-semibold text-[#475569]">Pendiente por decidir</div>
          <div className="font-mono text-2xl font-bold text-[#B45309] tabular-nums">
            {formatRD(resumen.pendientesRD)}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200/90 bg-white p-5 flex flex-col justify-between min-h-[112px]">
          <div className="text-xs font-semibold text-[#475569]">Rechazados</div>
          <div className="font-mono text-2xl font-bold text-[#DC2626] tabular-nums">
            {resumen.rechazadosCount}
          </div>
        </div>
      </div>

      {/* Pill-Track Status Filter */}
      <div className="rounded-2xl border border-slate-200/90 bg-white p-3.5 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex flex-wrap gap-1 rounded-2xl bg-[#F1F5F9] p-1 border border-slate-200/70">
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
              className={`rounded-xl px-3.5 py-1.5 text-xs font-semibold transition-colors min-h-[36px] whitespace-nowrap ${
                filtroEstado === f.id
                  ? 'bg-[#0F2942] text-white shadow-sm'
                  : 'text-[#475569] hover:text-[#0F2942]'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <span className="text-xs text-[#475569] tabular-nums">
          {viaticosFiltrados.length} comprobante(s)
        </span>
      </div>

      {!snapshot.personalIdUsuario && (
        <div className="flex items-start gap-2.5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-800">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-[#DC2626]" />
          <span>{ERROR_TECNICO_SIN_PERSONAL}</span>
        </div>
      )}

      {!isOnline && (
        <div className="flex items-center gap-2.5 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs text-amber-900">
          <WifiOff className="h-4 w-4 shrink-0 text-[#B45309]" />
          <span>
            Sin señal: los viáticos nuevos o editados quedan en cola local y se sincronizan automáticamente al reconectar.
          </span>
        </div>
      )}

      {successBanner && (
        <div className="flex items-center gap-2.5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-medium text-[#15803D]">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{successBanner}</span>
        </div>
      )}

      {(error || actionError) && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-800">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>{actionError || error}</span>
          </div>
          {error && (
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex items-center gap-1.5 rounded-xl bg-white px-3 py-1.5 text-xs font-semibold text-rose-800 border border-rose-200 min-h-[38px]"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Reintentar
            </button>
          )}
        </div>
      )}

      {isLoading ? (
        <TecnicoViaticosSkeleton />
      ) : viaticosFiltrados.length === 0 ? (
        <div className="rounded-2xl border border-slate-200/90 bg-white p-8 text-center space-y-3">
          <Receipt className="h-9 w-9 text-slate-400 mx-auto" />
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-[#0F2942]">
              No hay viáticos en esta vista
            </h3>
            <p className="text-xs text-[#475569]">
              Registra combustible, dietas, peajes o recibos con foto desde campo.
            </p>
          </div>
          <button
            type="button"
            onClick={onNuevoViatico}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#0F2942] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#0284C7] min-h-[44px]"
          >
            <Camera className="h-4 w-4" />
            Registrar primer viático
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {viaticosFiltrados.map((v) => {
            const ruta = v.rutaId
              ? snapshot.rutas.find((r) => r.id === v.rutaId)
              : undefined;
            const mision = v.misionId
              ? snapshot.misiones?.find((m) => m.id === v.misionId)
              : undefined;
            const badge = BADGE_APROBACION[v.estadoAprobacion];
            const puedeEditar =
              puedeEditarViatico('tecnico', v, usuarioId) &&
              validarEdicionViaticoTecnico(v, usuarioId).valido;
            const puedeEliminar = validarEliminacionViaticoTecnico(v, usuarioId).valido;
            const confirmandoBorrado = confirmDeleteId === v.id;

            return (
              <article
                key={v.id}
                className="rounded-2xl border border-slate-200/90 bg-white p-5 space-y-3.5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span
                        className={`inline-flex items-center rounded-lg border px-2 py-0.5 text-[11px] font-semibold ${badge.cls}`}
                      >
                        {badge.label}
                      </span>
                      <span className="font-mono text-xs font-semibold text-[#0284C7]">
                        {v.categoria}
                      </span>
                      {v.syncStatus !== 'synced' && (
                        <span className="text-[11px] font-medium text-[#B45309]">
                          ·{' '}
                          {v.syncStatus === 'needs_ocr'
                            ? 'OCR pendiente al reconectar'
                            : 'Pendiente de subir'}
                        </span>
                      )}
                    </div>
                    <h3 className="text-sm sm:text-base font-bold text-[#0F2942]">{v.comercio}</h3>
                    <div className="text-xs text-[#475569]">
                      <span className="font-mono">{v.fechaIso}</span> · {v.metodo}
                      {ruta && (
                        <span className="ml-2 text-[#0F2942] font-medium">
                          · {ruta.codigoParcela}
                        </span>
                      )}
                      {mision && (
                        <span className="ml-2 text-[#0284C7] font-medium">
                          · Misión: {mision.nombre}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div className="font-mono text-base font-bold text-[#0F2942] tabular-nums">
                      {formatRD(v.montoRD)}
                    </div>
                    {v.itbisRD > 0 && (
                      <div className="font-mono text-[11px] text-[#475569] tabular-nums">
                        ITBIS {formatRD(v.itbisRD)}
                      </div>
                    )}
                    {v.ncf && (
                      <div className="font-mono text-[11px] text-slate-400">{v.ncf}</div>
                    )}
                  </div>
                </div>

                {(v.receiptThumbnail || v.notas) && (
                  <div className="flex items-center gap-3">
                    {v.receiptThumbnail && (
                      <MediaThumb
                        src={v.receiptThumbnail}
                        alt={`Comprobante ${v.comercio}`}
                        caption="Recibo"
                        sizeClass="h-16 w-16"
                      />
                    )}
                    {v.notas && <p className="text-xs text-slate-600 leading-relaxed">{v.notas}</p>}
                  </div>
                )}

                {v.estadoAprobacion === 'rechazado' && v.motivoRechazo && (
                  <div className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs text-rose-800">
                    <strong>Motivo de rechazo:</strong> {v.motivoRechazo}
                  </div>
                )}

                {typeof v.excedenteRD === 'number' && v.excedenteRD > 0 && (
                  <div className="rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-900 space-y-0.5">
                    <div>
                      <strong>Excedente sobre tope de misión:</strong> {formatRD(v.excedenteRD)}
                      {v.decisionExcedente === 'cargo_colaborador' && ' (A cargo del colaborador)'}
                      {v.decisionExcedente === 'aprobado_empresa' && ' (Cubierto por la empresa)'}
                    </div>
                    {v.motivoExcedente && (
                      <div className="text-[11px]">Motivo: {v.motivoExcedente}</div>
                    )}
                  </div>
                )}

                {puedeEditar || puedeEliminar ? (
                  confirmandoBorrado ? (
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs">
                      <span className="font-semibold text-rose-800">
                        ¿Eliminar este viático pendiente?
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          className="rounded-xl border border-slate-200 bg-white px-3.5 py-1.5 font-semibold text-slate-700 min-h-[38px]"
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          disabled={deletingId === v.id}
                          onClick={() => handleConfirmDelete(v.id)}
                          className="rounded-xl bg-[#DC2626] px-3.5 py-1.5 font-semibold text-white disabled:opacity-50 min-h-[38px]"
                        >
                          {deletingId === v.id ? 'Eliminando...' : 'Confirmar eliminación'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2.5 pt-2 border-t border-slate-100">
                      {puedeEditar && (
                        <button
                          type="button"
                          onClick={() => onEditarViatico(v)}
                          className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-[#F8FAFC] px-3 py-2 text-xs font-semibold text-[#0F2942] hover:bg-slate-100 min-h-[44px]"
                        >
                          <Pencil className="h-3.5 w-3.5 text-[#0284C7]" />
                          Editar viático
                        </button>
                      )}
                      {puedeEliminar && (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(v.id)}
                          className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-rose-200 bg-white px-3 py-2 text-xs font-semibold text-[#DC2626] hover:bg-rose-50 min-h-[44px]"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Eliminar viático
                        </button>
                      )}
                    </div>
                  )
                ) : (
                  <div className="flex items-center gap-2 border-t border-slate-100 pt-2.5 text-xs text-[#475569]">
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
