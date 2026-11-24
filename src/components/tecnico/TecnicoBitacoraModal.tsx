import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Camera,
  CheckCircle2,
  ClipboardList,
  Clock,
  Loader2,
  WifiOff,
  X,
} from 'lucide-react';
import type { BitacoraEntrada, SnapshotTecnico } from '../../types/domain';
import { formatSantoDomingoAST } from '../../utils/geodesy';
import { MediaThumb } from '../MediaThumb';

interface TecnicoBitacoraModalProps {
  isOpen: boolean;
  onClose: () => void;
  snapshot: SnapshotTecnico;
  usuarioActual: { id: string; nombre: string };
  defaultServicioId?: string;
  isOnline: boolean;
  onAgregarBitacora: (
    datos: Omit<BitacoraEntrada, 'id' | 'empresaId' | 'fechaAST' | 'syncStatus'>
  ) => Promise<void>;
}

async function compressPhoto(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('No se pudo leer la fotografía seleccionada.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('El archivo seleccionado no es una imagen válida.'));
      img.onload = () => {
        const maxDim = 1024;
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          const ratio = Math.min(maxDim / width, maxDim / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(String(reader.result));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.78));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

export const TecnicoBitacoraModal: React.FC<TecnicoBitacoraModalProps> = ({
  isOpen,
  onClose,
  snapshot,
  usuarioActual,
  defaultServicioId,
  isOnline,
  onAgregarBitacora,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [servicioId, setServicioId] = useState<string>('');
  const [nota, setNota] = useState<string>('');
  const [kmRecorridos, setKmRecorridos] = useState<string>('');
  const [fotos, setFotos] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isProcessingPhoto, setIsProcessingPhoto] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const serviciosDisponibles = useMemo(() => {
    return snapshot.servicios.filter(
      (s) => s.estado === 'en_campo' || s.estado === 'programado' || s.estado === 'procesando'
    );
  }, [snapshot.servicios]);

  useEffect(() => {
    if (!isOpen) return;
    setErrorMsg(null);
    setSuccessMsg(null);
    setNota('');
    setKmRecorridos('');
    setFotos([]);

    if (defaultServicioId && snapshot.servicios.some((s) => s.id === defaultServicioId)) {
      setServicioId(defaultServicioId);
    } else {
      const enCampo = serviciosDisponibles.find((s) => s.estado === 'en_campo');
      setServicioId(enCampo?.id || serviciosDisponibles[0]?.id || snapshot.servicios[0]?.id || '');
    }
  }, [isOpen, defaultServicioId, serviciosDisponibles, snapshot.servicios]);

  const servicioActual = useMemo(
    () => snapshot.servicios.find((s) => s.id === servicioId),
    [snapshot.servicios, servicioId]
  );

  const rutaActual = useMemo(
    () =>
      servicioActual
        ? snapshot.rutas.find((r) => r.id === servicioActual.rutaId)
        : undefined,
    [snapshot.rutas, servicioActual]
  );

  const entradasDelServicio = useMemo(
    () =>
      snapshot.bitacoras
        .filter((b) => b.servicioId === servicioId)
        .sort((a, b) => b.fechaAST.localeCompare(a.fechaAST)),
    [snapshot.bitacoras, servicioId]
  );

  if (!isOpen) return null;

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorMsg(null);
    setIsProcessingPhoto(true);
    try {
      const compressed = await compressPhoto(file);
      setFotos((prev) => [...prev, compressed]);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'No se pudo adjuntar la fotografía.');
    } finally {
      setIsProcessingPhoto(false);
      e.target.value = '';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!servicioActual || !rutaActual) {
      setErrorMsg('Selecciona un servicio asignado antes de guardar la bitácora.');
      return;
    }
    if (!nota.trim()) {
      setErrorMsg('Describe las novedades, vértices o incidencias de campo.');
      return;
    }

    const kmNum = kmRecorridos.trim() ? Number(kmRecorridos) : undefined;
    if (kmNum !== undefined && (!Number.isFinite(kmNum) || kmNum < 0)) {
      setErrorMsg('Los kilómetros recorridos deben ser un número mayor o igual a 0.');
      return;
    }

    setIsSaving(true);
    try {
      await onAgregarBitacora({
        servicioId: servicioActual.id,
        rutaId: rutaActual.id,
        autorUsuarioId: usuarioActual.id,
        autorNombre: usuarioActual.nombre,
        nota: nota.trim(),
        kmRecorridos: kmNum && kmNum > 0 ? kmNum : undefined,
        fotos,
      });
      setNota('');
      setKmRecorridos('');
      setFotos([]);
      setSuccessMsg(
        isOnline
          ? 'Entrada guardada en la bitácora del servicio.'
          : 'Entrada guardada offline; se sincronizará al recuperar señal.'
      );
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'No se pudo guardar la entrada de bitácora.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[#0F2942]/65 backdrop-blur-[2px] sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="titulo-bitacora-tecnico"
    >
      <div className="w-full sm:max-w-lg rounded-t-2xl sm:rounded-xl border border-slate-200 bg-white shadow-2xl max-h-[92vh] flex flex-col">
        <div className="sm:hidden pt-2.5 pb-1 flex justify-center">
          <div className="h-1.5 w-10 rounded-full bg-slate-300" />
        </div>

        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
          <div>
            <h2 id="titulo-bitacora-tecnico" className="text-base font-bold text-slate-900">
              Bitácora de Campo
            </h2>
            <p className="text-xs text-slate-500">
              Registro cronológico en hora local RD (AST) con evidencia fotográfica.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-md text-slate-500 hover:bg-slate-100"
            aria-label="Cerrar bitácora"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="overflow-y-auto p-5 space-y-4">
          {!isOnline && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-900">
              <WifiOff className="h-4 w-4 shrink-0 mt-0.5 text-[#B45309]" />
              <span>
                Modo sin conexión: las notas y fotos se guardan localmente y suben automáticamente al volver a tener señal.
              </span>
            </div>
          )}

          {snapshot.servicios.length === 0 ? (
            <div className="rounded-lg bg-slate-50 p-5 text-xs text-slate-500 text-center">
              No tienes servicios asignados disponibles para registrar bitácora.
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1.5">
                  Servicio / Ruta Asignada
                </label>
                <select
                  value={servicioId}
                  onChange={(e) => {
                    setServicioId(e.target.value);
                    setSuccessMsg(null);
                    setErrorMsg(null);
                  }}
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 text-xs text-slate-900 min-h-[44px]"
                >
                  {snapshot.servicios.map((s) => {
                    const r = snapshot.rutas.find((x) => x.id === s.rutaId);
                    return (
                      <option key={s.id} value={s.id}>
                        {r?.codigoParcela || 'RUTA'} · {s.nombre} ({s.estado.replace('_', ' ')})
                      </option>
                    );
                  })}
                </select>
                {rutaActual && (
                  <p className="mt-1 text-[11px] text-slate-500">
                    {rutaActual.nombre} · {rutaActual.ubicacion}
                  </p>
                )}
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1.5">
                  Nota Técnica de Campo
                </label>
                <textarea
                  rows={3}
                  required
                  value={nota}
                  onChange={(e) => setNota(e.target.value)}
                  placeholder="Ej. Base RTK fijada en vértice V1 con PDOP 1.3; replanteo completado sin obstrucciones."
                  className="w-full rounded-md border border-slate-300 px-3 py-2.5 text-xs text-slate-900 focus:border-[#0284C7] focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1.5">
                  Kilómetros recorridos en jornada (opcional)
                </label>
                <input
                  type="number"
                  step="0.1"
                  min={0}
                  value={kmRecorridos}
                  onChange={(e) => setKmRecorridos(e.target.value)}
                  placeholder="Ej. 84.5 (para control de rendimiento de flota)"
                  className="w-full rounded-md border border-slate-300 px-3 py-2.5 font-mono text-xs text-slate-900 min-h-[44px] tabular-nums"
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={handlePhotoChange}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isProcessingPhoto}
                  className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-[#0F2942] hover:bg-slate-50 disabled:opacity-60 min-h-[44px] whitespace-nowrap"
                >
                  {isProcessingPhoto ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Camera className="h-4 w-4 text-[#0284C7]" />
                  )}
                  {isProcessingPhoto ? 'Procesando foto...' : 'Adjuntar Foto de Evidencia'}
                </button>

                <span className="inline-flex items-center gap-1 text-[11px] font-mono text-slate-500">
                  <Clock className="h-3.5 w-3.5 text-[#0284C7]" />
                  {formatSantoDomingoAST(new Date())}
                </span>
              </div>

              {fotos.length > 0 && (
                <div className="flex flex-wrap gap-2.5">
                  {fotos.map((src, idx) => (
                    <MediaThumb
                      key={idx}
                      src={src}
                      alt={`Evidencia de campo ${idx + 1}`}
                      caption={`Foto ${idx + 1}`}
                      sizeClass="h-20 w-20"
                      onRemove={() => setFotos((prev) => prev.filter((_, i) => i !== idx))}
                      removeLabel={`Quitar fotografía ${idx + 1}`}
                    />
                  ))}
                </div>
              )}

              {errorMsg && (
                <div className="rounded-md border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs text-rose-800">
                  {errorMsg}
                </div>
              )}

              {successMsg && (
                <div className="flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs text-[#15803D]">
                  <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{successMsg}</span>
                </div>
              )}

              <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2.5 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-md border border-slate-300 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 min-h-[44px]"
                >
                  Cerrar
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="inline-flex items-center justify-center gap-2 rounded-md bg-[#0F2942] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#0284C7] disabled:opacity-50 min-h-[44px]"
                >
                  <ClipboardList className="h-4 w-4" />
                  {isSaving
                    ? 'Guardando...'
                    : isOnline
                    ? 'Guardar en Bitácora'
                    : 'Guardar en Cola Offline'}
                </button>
              </div>
            </form>
          )}

          {/* Historial reciente del servicio seleccionado */}
          {entradasDelServicio.length > 0 && (
            <div className="border-t border-slate-200 pt-3.5 space-y-2">
              <div className="text-xs font-bold text-[#0F2942]">
                Entradas registradas en este servicio ({entradasDelServicio.length})
              </div>
              <div className="divide-y divide-slate-200 max-h-48 overflow-y-auto pr-1">
                {entradasDelServicio.map((b) => (
                  <div key={b.id} className="py-2.5 text-xs space-y-1">
                    <div className="flex items-center justify-between gap-2 text-[11px]">
                      <span className="font-semibold text-[#0F2942]">{b.autorNombre}</span>
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-slate-500">{b.fechaAST}</span>
                        <span
                          className={`font-semibold ${
                            b.syncStatus === 'synced' ? 'text-[#15803D]' : 'text-[#B45309]'
                          }`}
                        >
                          · {b.syncStatus === 'synced' ? 'Sincronizada' : 'Pendiente'}
                        </span>
                      </div>
                    </div>
                    <p className="text-slate-700">{b.nota}</p>
                    {typeof b.kmRecorridos === 'number' && b.kmRecorridos > 0 && (
                      <div className="font-mono text-[11px] text-[#0284C7]">
                        Recorrido reportado: {b.kmRecorridos} km
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
