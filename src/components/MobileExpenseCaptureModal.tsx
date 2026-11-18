import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Camera,
  CheckCircle2,
  Loader2,
  MapPin,
  Navigation,
  Plus,
  Receipt,
  Sparkles,
  Trash2,
  Utensils,
  X,
} from 'lucide-react';
import { completarRepartoConSinAsignar, validarRepartoViatico } from '../domain';
import type {
  CategoriaViatico,
  MetodoViatico,
  Proyecto,
  RepartoProyecto,
  Ruta,
  Viatico,
} from '../types/domain';
import {
  formatRD,
  formatSantoDomingoAST,
  haversineMeters,
  latLonToUtm19N,
} from '../utils/geodesy';

export type ProyectoSelectorItem = Pick<Proyecto, 'id' | 'nombre' | 'codigoContrato'>;
export type RutaSelectorItem = Pick<
  Ruta,
  'id' | 'proyectoId' | 'codigoParcela' | 'nombre' | 'provincia' | 'centroid'
>;

export type ViaticoPayload = Omit<
  Viatico,
  'id' | 'empresaId' | 'estadoAprobacion' | 'version' | 'updatedAt'
>;

export type ViaticoEdicionPayload = Omit<
  Viatico,
  | 'id'
  | 'empresaId'
  | 'creadoPorUsuarioId'
  | 'creadoPorNombre'
  | 'estadoAprobacion'
  | 'motivoRechazo'
  | 'aprobadoPorUsuarioId'
  | 'aprobadoEn'
  | 'version'
  | 'updatedAt'
>;

interface MobileExpenseCaptureModalProps {
  isOpen: boolean;
  onClose: () => void;
  proyectos: ProyectoSelectorItem[];
  rutas: RutaSelectorItem[];
  defaultProyectoId?: string;
  defaultRutaId?: string;
  editingViatico?: Viatico | null;
  isOnline: boolean;
  sessionToken: string;
  creadoPorUsuario: { id: string; nombre: string };
  baseLat?: number;
  baseLon?: number;
  onAddExpense: (expense: ViaticoPayload) => Promise<void>;
  onEditExpense?: (viaticoId: string, expense: ViaticoEdicionPayload) => Promise<void>;
}

const CATEGORIES: CategoriaViatico[] = [
  'Combustible',
  'Dieta',
  'Hospedaje',
  'Peaje',
  'Materiales',
  'Otro',
];

const QUICK_PRESETS: Array<{
  label: string;
  category: CategoriaViatico;
  merchant: string;
  amountRD: number;
  notes: string;
}> = [
  {
    label: 'Dieta Brigada (2 Téc.)',
    category: 'Dieta',
    merchant: 'Dieta Estándar Brigada Campo',
    amountRD: 4400,
    notes: 'Desayuno y almuerzo para 2 técnicos (RD$ 2,200 c/u)',
  },
  {
    label: 'Dieta Individual',
    category: 'Dieta',
    merchant: 'Dieta Individual Topógrafo',
    amountRD: 2200,
    notes: 'Alimentación jornada completa en campo',
  },
  {
    label: 'Peaje RD Vial',
    category: 'Peaje',
    merchant: 'RD Vial — Paso Rápido Autopista',
    amountRD: 200,
    notes: 'Tarifa ida/vuelta categoría 1',
  },
  {
    label: 'Hospedaje Rural',
    category: 'Hospedaje',
    merchant: 'Hotel / Alojamiento de Brigada',
    amountRD: 4800,
    notes: 'Pernocta de brigada en provincia',
  },
];

async function compressImageToBase64(file: File): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('No se pudo leer la imagen.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Formato de imagen inválido.'));
      img.onload = () => {
        const maxDim = 1280;
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
          resolve({ base64: String(reader.result), mimeType: file.type || 'image/jpeg' });
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
        resolve({ base64: dataUrl, mimeType: 'image/jpeg' });
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

export const MobileExpenseCaptureModal: React.FC<MobileExpenseCaptureModalProps> = ({
  isOpen,
  onClose,
  proyectos,
  rutas,
  defaultProyectoId,
  defaultRutaId,
  editingViatico = null,
  isOnline,
  sessionToken,
  creadoPorUsuario,
  baseLat = 18.4861,
  baseLon = -69.9312,
  onAddExpense,
  onEditExpense,
}) => {
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [captureMode, setCaptureMode] = useState<'ocr' | 'gps' | 'quick'>('ocr');
  const [rutaId, setRutaId] = useState(defaultRutaId || rutas[0]?.id || '');

  const resolveInitialProyectoId = () => {
    if (defaultProyectoId) return defaultProyectoId;
    const rutaBase = rutas.find((r) => r.id === (defaultRutaId || rutas[0]?.id));
    return rutaBase?.proyectoId || proyectos[0]?.id || 'sin_asignar';
  };

  const [category, setCategory] = useState<CategoriaViatico>('Combustible');
  const [merchant, setMerchant] = useState('');
  const [amountRD, setAmountRD] = useState<string>('');
  const [itbisRD, setItbisRD] = useState<string>('0');
  const [ncf, setNcf] = useState('');
  const [dateIso, setDateIso] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [method, setMethod] = useState<MetodoViatico>('OCR Móvil');

  const [repartoModo, setRepartoModo] = useState<'unico' | 'multiple' | 'sin_asignar'>('unico');
  const [proyectoUnicoId, setProyectoUnicoId] = useState<string>(resolveInitialProyectoId);
  const [repartosMultiples, setRepartosMultiples] = useState<RepartoProyecto[]>([
    { proyectoId: resolveInitialProyectoId(), montoRD: 0 },
  ]);

  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [pendingReceiptMime, setPendingReceiptMime] = useState<string | undefined>(undefined);
  const [needsOfflineOcr, setNeedsOfflineOcr] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [ocrStatusMsg, setOcrStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [isLocating, setIsLocating] = useState(false);
  const [gpsCoords, setGpsCoords] = useState<{
    lat: number;
    lon: number;
    easting: number;
    northing: number;
  } | null>(null);
  const [distanceKm, setDistanceKm] = useState<number | undefined>(undefined);

  // Sincroniza ruta, proyecto y campos al abrir o cambiar de ruta activa / modo edición
  useEffect(() => {
    if (!isOpen) return;

    setErrorMsg(null);
    setOcrStatusMsg(null);

    if (editingViatico) {
      setRutaId(editingViatico.rutaId || '');
      setCategory(editingViatico.categoria);
      setMerchant(editingViatico.comercio);
      setAmountRD(String(editingViatico.montoRD));
      setItbisRD(String(editingViatico.itbisRD ?? 0));
      setNcf(editingViatico.ncf || '');
      setDateIso(editingViatico.fechaIso);
      setNotes(editingViatico.notas || '');
      setMethod(editingViatico.metodo);
      setReceiptPreview(editingViatico.receiptThumbnail || null);
      setPendingReceiptMime(editingViatico.pendingReceiptMime);
      setNeedsOfflineOcr(editingViatico.syncStatus === 'needs_ocr');
      setGpsCoords(editingViatico.gpsCoords || null);
      setDistanceKm(editingViatico.distanceKm);

      if (editingViatico.repartos.length === 1) {
        const unico = editingViatico.repartos[0];
        if (unico.proyectoId === 'sin_asignar') {
          setRepartoModo('sin_asignar');
          setProyectoUnicoId(proyectos[0]?.id || 'sin_asignar');
        } else {
          setRepartoModo('unico');
          setProyectoUnicoId(unico.proyectoId);
        }
        setRepartosMultiples(editingViatico.repartos);
      } else {
        setRepartoModo('multiple');
        setRepartosMultiples(editingViatico.repartos.map((r) => ({ ...r })));
      }
      return;
    }

    const nextRutaId = defaultRutaId || rutas[0]?.id || '';
    const rutaObj = rutas.find((r) => r.id === nextRutaId);
    const nextProyectoId =
      defaultProyectoId || rutaObj?.proyectoId || proyectos[0]?.id || 'sin_asignar';

    setCaptureMode('ocr');
    setRutaId(nextRutaId);
    setCategory('Combustible');
    setMerchant('');
    setAmountRD('');
    setItbisRD('0');
    setNcf('');
    setDateIso(new Date().toISOString().slice(0, 10));
    setNotes('');
    setMethod('OCR Móvil');
    setRepartoModo('unico');
    setProyectoUnicoId(nextProyectoId);
    setRepartosMultiples([{ proyectoId: nextProyectoId, montoRD: 0 }]);
    setReceiptPreview(null);
    setPendingReceiptMime(undefined);
    setNeedsOfflineOcr(false);
    setGpsCoords(null);
    setDistanceKm(undefined);
  }, [isOpen, defaultRutaId, defaultProyectoId, editingViatico, rutas, proyectos]);

  const selectedRuta = useMemo(() => rutas.find((r) => r.id === rutaId), [rutas, rutaId]);
  const montoNumerico = Number(amountRD) || 0;

  const repartosCalculados = useMemo<RepartoProyecto[]>(() => {
    if (repartoModo === 'sin_asignar') {
      return [{ proyectoId: 'sin_asignar', montoRD: montoNumerico }];
    }
    if (repartoModo === 'unico') {
      return [{ proyectoId: proyectoUnicoId || 'sin_asignar', montoRD: montoNumerico }];
    }
    return repartosMultiples;
  }, [repartoModo, proyectoUnicoId, montoNumerico, repartosMultiples]);

  const sumaMultipleRD = useMemo(
    () => repartosMultiples.reduce((acc, r) => acc + (Number(r.montoRD) || 0), 0),
    [repartosMultiples]
  );

  if (!isOpen) return null;

  const syncAmountIntoUniqueSplit = (newMonto: number) => {
    if (repartoModo === 'multiple' && repartosMultiples.length === 1) {
      setRepartosMultiples([{ ...repartosMultiples[0], montoRD: newMonto }]);
    }
  };

  const handleReceiptSelected = async (file: File) => {
    setErrorMsg(null);
    setOcrStatusMsg(null);
    setMethod('OCR Móvil');
    try {
      const { base64, mimeType } = await compressImageToBase64(file);
      setReceiptPreview(base64);
      setPendingReceiptMime(mimeType);

      if (!isOnline) {
        setNeedsOfflineOcr(true);
        setOcrStatusMsg(
          'Sin conexión: foto guardada en cola local para lectura OCR al reconectar. Puedes completar los campos manualmente.'
        );
        if (!merchant) setMerchant('Comprobante pendiente de lectura IA');
        return;
      }

      setIsAnalyzing(true);
      const res = await fetch('/api/expenses/analyze-receipt', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-session-token': sessionToken,
        },
        body: JSON.stringify({
          imageBase64: base64,
          mimeType,
          surveyCode: selectedRuta?.codigoParcela,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'No se pudo leer el comprobante automáticamente.');
      }

      const ex = data.extracted;
      if (ex.merchant) setMerchant(ex.merchant);
      if (typeof ex.amountRD === 'number' && ex.amountRD > 0) {
        setAmountRD(String(ex.amountRD));
        syncAmountIntoUniqueSplit(ex.amountRD);
      }
      if (typeof ex.itbisRD === 'number') setItbisRD(String(ex.itbisRD));
      if (ex.ncf) setNcf(ex.ncf);
      if (ex.dateIso) setDateIso(ex.dateIso);
      if (ex.notes) setNotes(ex.notes);
      if (CATEGORIES.includes(ex.category)) setCategory(ex.category);

      setNeedsOfflineOcr(false);
      setOcrStatusMsg(
        `Sugerencia OCR aplicada (confianza ${ex.confidence ?? 'alta'}). Revisa y edita cualquier campo antes de guardar.`
      );
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Error procesando el comprobante.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleAutoGpsMileage = () => {
    setErrorMsg(null);
    setOcrStatusMsg(null);
    setMethod('GPS Ruta');
    setIsLocating(true);

    const applyPosition = (lat: number, lon: number, simulated = false) => {
      const utm = latLonToUtm19N(lat, lon, 15);
      setGpsCoords({
        lat: utm.lat,
        lon: utm.lon,
        easting: utm.easting,
        northing: utm.northing,
      });

      const targetLat = selectedRuta?.centroid.lat ?? baseLat;
      const targetLon = selectedRuta?.centroid.lon ?? baseLon;

      const distMeters = Math.max(
        haversineMeters(baseLat, baseLon, lat, lon),
        haversineMeters(baseLat, baseLon, targetLat, targetLon)
      );
      const km = Math.max(8, Number((distMeters / 1000).toFixed(1)));
      const fuelEstimate = Math.round(km * 26.5);

      setDistanceKm(km);
      setCategory('Combustible');
      setMerchant(`Traslado GPS Ruta · ${selectedRuta?.provincia || 'Campo'}`);
      setAmountRD(String(fuelEstimate));
      syncAmountIntoUniqueSplit(fuelEstimate);
      setItbisRD('0');
      setNotes(
        `Cálculo automático ${km} km @ RD$ 26.50/km · UTM ${utm.easting.toFixed(0)}E ${utm.northing.toFixed(0)}N${
          simulated ? ' (coordenada de parcela)' : ''
        }`
      );
      setOcrStatusMsg(
        `Ubicación fijada en ${utm.easting.toFixed(1)}E, ${utm.northing.toFixed(1)}N (${km} km calculados).`
      );
      setIsLocating(false);
    };

    if (!navigator.geolocation) {
      if (selectedRuta) {
        applyPosition(selectedRuta.centroid.lat, selectedRuta.centroid.lon, true);
      } else {
        setErrorMsg('Geolocalización no disponible en este navegador.');
        setIsLocating(false);
      }
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => applyPosition(pos.coords.latitude, pos.coords.longitude, false),
      () => {
        if (selectedRuta) {
          applyPosition(selectedRuta.centroid.lat, selectedRuta.centroid.lon, true);
        } else {
          setErrorMsg('No se obtuvo permiso GPS del dispositivo.');
          setIsLocating(false);
        }
      },
      { enableHighAccuracy: true, timeout: 6000 }
    );
  };

  const handleApplyPreset = (preset: (typeof QUICK_PRESETS)[number]) => {
    setMethod('Dieta Automática');
    setCategory(preset.category);
    setMerchant(preset.merchant);
    setAmountRD(String(preset.amountRD));
    syncAmountIntoUniqueSplit(preset.amountRD);
    setItbisRD('0');
    setNcf('');
    setNotes(preset.notes);
    setOcrStatusMsg(`Tarifa estándar aplicada: ${formatRD(preset.amountRD)}`);
  };

  const handleCompletarConSinAsignar = () => {
    const completado = completarRepartoConSinAsignar(montoNumerico, repartosMultiples);
    setRepartosMultiples(completado);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    const parsedAmount = Number(amountRD);
    if (Number.isNaN(parsedAmount) || parsedAmount < 0) {
      setErrorMsg('Ingresa un monto válido en RD$.');
      return;
    }

    const validacion = validarRepartoViatico(parsedAmount, repartosCalculados);
    if (!validacion.valido) {
      setErrorMsg(validacion.error || 'El reparto por proyecto debe igualar el monto total.');
      return;
    }

    setIsSaving(true);
    try {
      const payloadBase: ViaticoEdicionPayload = {
        rutaId: rutaId || undefined,
        fechaIso: dateIso,
        timestampAST: editingViatico?.timestampAST || formatSantoDomingoAST(new Date()),
        categoria: category,
        comercio: merchant.trim() || `${category} en Campo`,
        montoRD: parsedAmount,
        itbisRD: Number(itbisRD) || 0,
        ncf: ncf.trim() || undefined,
        metodo: method,
        gpsCoords: gpsCoords ?? undefined,
        distanceKm,
        receiptThumbnail: receiptPreview ?? undefined,
        pendingReceiptBase64: needsOfflineOcr ? receiptPreview ?? undefined : undefined,
        pendingReceiptMime: needsOfflineOcr ? pendingReceiptMime : undefined,
        repartos: repartosCalculados,
        notas: notes.trim() || undefined,
        syncStatus: needsOfflineOcr ? 'needs_ocr' : 'pending',
      };

      if (editingViatico && onEditExpense) {
        await onEditExpense(editingViatico.id, payloadBase);
      } else {
        await onAddExpense({
          ...payloadBase,
          creadoPorUsuarioId: creadoPorUsuario.id,
          creadoPorNombre: creadoPorUsuario.nombre,
        });
      }

      onClose();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'No se pudo guardar el viático.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[#0F2942]/65 sm:p-4">
      <div className="w-full sm:max-w-xl rounded-t-2xl sm:rounded-md border border-[#CBD5E1] bg-white shadow-2xl max-h-[92vh] flex flex-col">
        <div className="sm:hidden pt-2.5 pb-1 flex justify-center">
          <div className="h-1.5 w-10 rounded-full bg-[#CBD5E1]" />
        </div>

        <div className="flex items-center justify-between border-b border-[#E2E8F0] px-5 py-3.5">
          <div>
            <h2 className="text-base font-bold text-[#0D1C2F]">
              {editingViatico ? 'Editar Viático Pendiente' : 'Reportar Viático en Campo'}
            </h2>
            <p className="text-xs text-[#43474D]">
              Captura opcional por foto OCR (editable), ruta GPS o tarifa rápida. Se registra en estado Pendiente.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-sm text-[#43474D] hover:bg-[#F1F5F9]"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="overflow-y-auto p-5 space-y-4">
          {/* Capture Mode Tabs */}
          <div className="grid grid-cols-3 gap-1.5 rounded-sm bg-[#F1F5F9] p-1">
            <button
              type="button"
              onClick={() => setCaptureMode('ocr')}
              className={`flex items-center justify-center gap-1.5 rounded-sm py-2.5 text-xs font-semibold transition-colors min-h-[44px] ${
                captureMode === 'ocr'
                  ? 'bg-[#0F2942] text-white'
                  : 'text-[#334155] hover:bg-white'
              }`}
            >
              <Camera className="h-3.5 w-3.5" />
              Foto Recibo
            </button>
            <button
              type="button"
              onClick={() => setCaptureMode('gps')}
              className={`flex items-center justify-center gap-1.5 rounded-sm py-2.5 text-xs font-semibold transition-colors min-h-[44px] ${
                captureMode === 'gps'
                  ? 'bg-[#0F2942] text-white'
                  : 'text-[#334155] hover:bg-white'
              }`}
            >
              <Navigation className="h-3.5 w-3.5" />
              Ruta GPS
            </button>
            <button
              type="button"
              onClick={() => setCaptureMode('quick')}
              className={`flex items-center justify-center gap-1.5 rounded-sm py-2.5 text-xs font-semibold transition-colors min-h-[44px] ${
                captureMode === 'quick'
                  ? 'bg-[#0F2942] text-white'
                  : 'text-[#334155] hover:bg-white'
              }`}
            >
              <Utensils className="h-3.5 w-3.5" />
              Dieta Rápida
            </button>
          </div>

          {/* Ruta de referencia */}
          <div>
            <label className="block text-xs font-semibold text-[#334155] mb-1">
              Ruta de Campo de Referencia
            </label>
            <select
              value={rutaId}
              onChange={(e) => {
                const nextRutaId = e.target.value;
                setRutaId(nextRutaId);
                const r = rutas.find((x) => x.id === nextRutaId);
                if (r && repartoModo === 'unico') {
                  setProyectoUnicoId(r.proyectoId);
                }
              }}
              className="w-full rounded-sm border border-[#CBD5E1] bg-white px-3 py-2.5 text-xs text-[#0D1C2F] min-h-[44px]"
            >
              <option value="">Sin ruta específica (gasto general)</option>
              {rutas.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.codigoParcela} — {r.nombre} ({r.provincia})
                </option>
              ))}
            </select>
          </div>

          {captureMode === 'ocr' && (
            <div className="rounded-md border border-[#CBD5E1] bg-[#F8FAFC] p-4">
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleReceiptSelected(f);
                }}
              />
              <div className="flex flex-col sm:flex-row items-center gap-3">
                <button
                  type="button"
                  onClick={() => cameraInputRef.current?.click()}
                  disabled={isAnalyzing}
                  className="w-full sm:w-auto flex-1 inline-flex items-center justify-center gap-2 rounded-sm bg-[#0284C7] px-4 py-3 text-xs font-semibold text-white hover:bg-[#006398] disabled:opacity-60 transition-colors min-h-[48px]"
                >
                  {isAnalyzing ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Leyendo comprobante (sugerencia)...
                    </>
                  ) : (
                    <>
                      <Camera className="h-4 w-4" />
                      Tomar Foto / Subir Recibo (Opcional)
                    </>
                  )}
                </button>
                {receiptPreview && (
                  <img
                    src={receiptPreview}
                    alt="Vista previa del comprobante"
                    className="h-14 w-14 rounded-sm border border-[#CBD5E1] object-cover shrink-0"
                  />
                )}
              </div>
              <p className="mt-2 flex items-center gap-1.5 text-[11px] text-[#43474D]">
                <Sparkles className="h-3.5 w-3.5 text-[#0284C7] shrink-0" />
                {isOnline
                  ? 'La foto prellena los campos como sugerencia editable; revisa monto, NCF e ITBIS antes de guardar.'
                  : 'Modo sin señal: la fotografía se encola localmente para OCR al reconectar.'}
              </p>
            </div>
          )}

          {captureMode === 'gps' && (
            <div className="rounded-md border border-[#CBD5E1] bg-[#F8FAFC] p-4 space-y-2.5">
              <button
                type="button"
                onClick={handleAutoGpsMileage}
                disabled={isLocating}
                className="w-full inline-flex items-center justify-center gap-2 rounded-sm bg-[#0284C7] px-4 py-3 text-xs font-semibold text-white hover:bg-[#006398] disabled:opacity-60 transition-colors min-h-[48px]"
              >
                {isLocating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Calculando posición UTM 19N y distancia...
                  </>
                ) : (
                  <>
                    <MapPin className="h-4 w-4" />
                    Capturar GPS y Calcular Combustible Automático
                  </>
                )}
              </button>
              <p className="text-[11px] text-[#43474D]">
                Calcula la distancia geodésica desde base hasta la parcela a razón de RD$ 26.50/km.
              </p>
            </div>
          )}

          {captureMode === 'quick' && (
            <div className="grid grid-cols-2 gap-2">
              {QUICK_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => handleApplyPreset(preset)}
                  className="rounded-sm border border-[#CBD5E1] bg-[#F8FAFC] p-3 text-left hover:border-[#0284C7] hover:bg-[#EFF4FF] transition-colors min-h-[54px]"
                >
                  <div className="text-xs font-semibold text-[#0F2942]">{preset.label}</div>
                  <div className="mt-0.5 font-mono text-xs font-bold text-[#0284C7] tabular-nums">
                    {formatRD(preset.amountRD)}
                  </div>
                </button>
              ))}
            </div>
          )}

          {ocrStatusMsg && (
            <div className="flex items-start gap-2 rounded-sm border border-[#86EFAC] bg-[#F0FDF4] px-3 py-2 text-xs text-[#15803D]">
              <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{ocrStatusMsg}</span>
            </div>
          )}

          {errorMsg && (
            <div className="rounded-sm border border-[#FCA5A5] bg-[#FEE2E2] px-3 py-2 text-xs text-[#93000A]">
              {errorMsg}
            </div>
          )}

          {/* Expense Fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <label className="block font-semibold text-[#334155] mb-1">Categoría</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as CategoriaViatico)}
                className="w-full rounded-sm border border-[#CBD5E1] bg-white px-3 py-2 text-xs text-[#0D1C2F] min-h-[42px]"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-semibold text-[#334155] mb-1">Monto Total (RD$)</label>
              <input
                type="number"
                step="0.01"
                min={0}
                required={!needsOfflineOcr}
                value={amountRD}
                onChange={(e) => {
                  setAmountRD(e.target.value);
                  syncAmountIntoUniqueSplit(Number(e.target.value) || 0);
                }}
                placeholder="0.00"
                className="w-full rounded-sm border border-[#CBD5E1] px-3 py-2 font-mono text-xs text-[#0D1C2F] min-h-[42px]"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block font-semibold text-[#334155] mb-1">
                Comercio / Estación / Concepto
              </label>
              <input
                type="text"
                required
                value={merchant}
                onChange={(e) => setMerchant(e.target.value)}
                placeholder="Ej. Estación Texaco Autovía del Este"
                className="w-full rounded-sm border border-[#CBD5E1] px-3 py-2 text-xs text-[#0D1C2F] min-h-[42px]"
              />
            </div>
            <div>
              <label className="block font-semibold text-[#334155] mb-1">NCF (Opcional)</label>
              <input
                type="text"
                value={ncf}
                onChange={(e) => setNcf(e.target.value)}
                placeholder="B010000..."
                className="w-full rounded-sm border border-[#CBD5E1] px-3 py-2 font-mono text-xs text-[#0D1C2F] min-h-[42px]"
              />
            </div>
            <div>
              <label className="block font-semibold text-[#334155] mb-1">ITBIS (RD$)</label>
              <input
                type="number"
                step="0.01"
                min={0}
                value={itbisRD}
                onChange={(e) => setItbisRD(e.target.value)}
                className="w-full rounded-sm border border-[#CBD5E1] px-3 py-2 font-mono text-xs text-[#0D1C2F] min-h-[42px]"
              />
            </div>
            <div>
              <label className="block font-semibold text-[#334155] mb-1">Fecha</label>
              <input
                type="date"
                required
                value={dateIso}
                onChange={(e) => setDateIso(e.target.value)}
                className="w-full rounded-sm border border-[#CBD5E1] px-3 py-2 font-mono text-xs text-[#0D1C2F] min-h-[42px]"
              />
            </div>
            <div>
              <label className="block font-semibold text-[#334155] mb-1">Observación</label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Detalle de artículos o km"
                className="w-full rounded-sm border border-[#CBD5E1] px-3 py-2 text-xs text-[#0D1C2F] min-h-[42px]"
              />
            </div>
          </div>

          {/* Exact Project Split Editor (F10) */}
          <div className="rounded-md border border-[#CBD5E1] bg-[#F8FAFC] p-3.5 space-y-2.5 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-bold text-[#0F2942]">
                Imputación Exacta a Proyectos (RD$)
              </span>
              <div className="inline-flex rounded-sm border border-[#CBD5E1] bg-white p-0.5">
                {(
                  [
                    { id: 'unico', label: '1 Proyecto' },
                    { id: 'multiple', label: 'Dividir' },
                    { id: 'sin_asignar', label: 'Sin asignar' },
                  ] as const
                ).map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      setRepartoModo(m.id);
                      if (m.id === 'multiple' && repartosMultiples.length === 0) {
                        setRepartosMultiples([
                          { proyectoId: proyectos[0]?.id || 'sin_asignar', montoRD: montoNumerico },
                        ]);
                      }
                    }}
                    className={`rounded-sm px-2 py-1 text-[11px] font-semibold ${
                      repartoModo === m.id ? 'bg-[#0F2942] text-white' : 'text-[#43474D]'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            {repartoModo === 'unico' && (
              <select
                value={proyectoUnicoId}
                onChange={(e) => setProyectoUnicoId(e.target.value)}
                className="w-full rounded-sm border border-[#CBD5E1] bg-white px-3 py-2 text-xs text-[#0D1C2F]"
              >
                {proyectos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.codigoContrato} — {p.nombre} ({formatRD(montoNumerico)})
                  </option>
                ))}
                <option value="sin_asignar">Sin asignar ({formatRD(montoNumerico)})</option>
              </select>
            )}

            {repartoModo === 'sin_asignar' && (
              <p className="text-[11px] text-[#A16207]">
                El gasto completo ({formatRD(montoNumerico)}) quedará en{' '}
                <strong>Sin asignar</strong> para que Coordinación lo distribuya luego.
              </p>
            )}

            {repartoModo === 'multiple' && (
              <div className="space-y-2">
                {repartosMultiples.map((linea, idx) => (
                  <div key={`${linea.proyectoId}-${idx}`} className="flex items-center gap-2">
                    <select
                      value={linea.proyectoId}
                      onChange={(e) => {
                        const val = e.target.value;
                        setRepartosMultiples((prev) =>
                          prev.map((item, i) => (i === idx ? { ...item, proyectoId: val } : item))
                        );
                      }}
                      className="flex-1 rounded-sm border border-[#CBD5E1] bg-white px-2.5 py-1.5 text-xs"
                    >
                      {proyectos.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.codigoContrato} — {p.nombre}
                        </option>
                      ))}
                      <option value="sin_asignar">Sin asignar</option>
                    </select>
                    <input
                      type="number"
                      step="0.01"
                      min={0}
                      value={linea.montoRD}
                      onChange={(e) => {
                        const val = Number(e.target.value) || 0;
                        setRepartosMultiples((prev) =>
                          prev.map((item, i) => (i === idx ? { ...item, montoRD: val } : item))
                        );
                      }}
                      className="w-28 rounded-sm border border-[#CBD5E1] bg-white px-2 py-1.5 font-mono text-xs"
                    />
                    {repartosMultiples.length > 1 && (
                      <button
                        type="button"
                        onClick={() =>
                          setRepartosMultiples((prev) => prev.filter((_, i) => i !== idx))
                        }
                        className="rounded-sm p-1.5 text-[#DC2626] hover:bg-[#FEE2E2]"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ))}

                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      const usado = new Set(repartosMultiples.map((r) => r.proyectoId));
                      const libre = proyectos.find((p) => !usado.has(p.id))?.id || 'sin_asignar';
                      const saldo = Math.max(0, Number((montoNumerico - sumaMultipleRD).toFixed(2)));
                      setRepartosMultiples((prev) => [
                        ...prev,
                        { proyectoId: libre, montoRD: saldo },
                      ]);
                    }}
                    className="inline-flex items-center gap-1 rounded-sm border border-[#CBD5E1] bg-white px-2.5 py-1 text-[11px] font-semibold text-[#0F2942] hover:bg-[#F1F5F9]"
                  >
                    <Plus className="h-3 w-3" />
                    Añadir proyecto
                  </button>

                  <div className="flex items-center gap-2 text-[11px]">
                    <span className="font-mono">
                      Suma: <strong>{formatRD(sumaMultipleRD)}</strong> /{' '}
                      {formatRD(montoNumerico)}
                    </span>
                    {Math.abs(montoNumerico - sumaMultipleRD) > 0.01 &&
                      montoNumerico > sumaMultipleRD && (
                        <button
                          type="button"
                          onClick={handleCompletarConSinAsignar}
                          className="rounded-sm bg-[#FEF3C7] px-2 py-1 font-semibold text-[#A16207] hover:bg-[#FDE68A]"
                        >
                          Saldo a Sin asignar
                        </button>
                      )}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2.5 border-t border-[#E2E8F0] pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-sm border border-[#CBD5E1] bg-white px-4 py-2.5 text-xs font-semibold text-[#334155] hover:bg-[#F1F5F9] min-h-[44px]"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="inline-flex items-center justify-center gap-2 rounded-sm bg-[#0F2942] px-5 py-2.5 text-xs font-semibold text-white hover:bg-[#0284C7] disabled:opacity-50 transition-colors min-h-[44px]"
            >
              <Receipt className="h-4 w-4" />
              {isSaving
                ? 'Guardando...'
                : editingViatico
                ? 'Guardar Cambios'
                : isOnline
                ? 'Guardar y Reportar Viático'
                : 'Encolar Viático Offline'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
