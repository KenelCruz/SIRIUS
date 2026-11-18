import React, { useRef, useState } from 'react';
import {
  Camera,
  CheckCircle2,
  Loader2,
  MapPin,
  Navigation,
  Receipt,
  Sparkles,
  Utensils,
  X,
} from 'lucide-react';
import type {
  ExpenseCategory,
  ExpenseMethod,
  SurveyProject,
  ViaticoExpense,
} from '../types/geodesy';
import {
  formatRD,
  formatSantoDomingoAST,
  haversineMeters,
  latLonToUtm19N,
} from '../utils/geodesy';

interface MobileExpenseCaptureModalProps {
  isOpen: boolean;
  onClose: () => void;
  surveys: SurveyProject[];
  defaultSurveyId: string;
  isOnline: boolean;
  onAddExpense: (expense: ViaticoExpense) => void;
}

const CATEGORIES: ExpenseCategory[] = [
  'Combustible',
  'Dieta',
  'Hospedaje',
  'Peaje',
  'Materiales',
  'Otro',
];

const QUICK_PRESETS: Array<{
  label: string;
  category: ExpenseCategory;
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
  surveys,
  defaultSurveyId,
  isOnline,
  onAddExpense,
}) => {
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [captureMode, setCaptureMode] = useState<'ocr' | 'gps' | 'quick'>('ocr');
  const [surveyId, setSurveyId] = useState(defaultSurveyId || surveys[0]?.id || '');

  const [category, setCategory] = useState<ExpenseCategory>('Combustible');
  const [merchant, setMerchant] = useState('');
  const [amountRD, setAmountRD] = useState<string>('');
  const [itbisRD, setItbisRD] = useState<string>('0');
  const [ncf, setNcf] = useState('');
  const [dateIso, setDateIso] = useState('2026-11-17');
  const [notes, setNotes] = useState('');
  const [method, setMethod] = useState<ExpenseMethod>('OCR Móvil');

  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [pendingReceiptMime, setPendingReceiptMime] = useState<string | undefined>(undefined);
  const [needsOfflineOcr, setNeedsOfflineOcr] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
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

  if (!isOpen) return null;

  const selectedSurvey = surveys.find((s) => s.id === surveyId) ?? surveys[0];

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
          'Sin conexión: foto guardada en la cola local. Puedes ingresar un estimado o sincronizar automáticamente cuando regrese la señal.'
        );
        if (!merchant) setMerchant('Comprobante pendiente de lectura IA');
        return;
      }

      setIsAnalyzing(true);
      const res = await fetch('/api/expenses/analyze-receipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: base64,
          mimeType,
          surveyCode: selectedSurvey?.parcelCode,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'No se pudo leer el comprobante automáticamente.');
      }

      const ex = data.extracted;
      if (ex.merchant) setMerchant(ex.merchant);
      if (typeof ex.amountRD === 'number' && ex.amountRD > 0) setAmountRD(String(ex.amountRD));
      if (typeof ex.itbisRD === 'number') setItbisRD(String(ex.itbisRD));
      if (ex.ncf) setNcf(ex.ncf);
      if (ex.dateIso) setDateIso(ex.dateIso);
      if (ex.notes) setNotes(ex.notes);
      if (CATEGORIES.includes(ex.category)) setCategory(ex.category);

      setNeedsOfflineOcr(false);
      setOcrStatusMsg(`Comprobante leído automáticamente (confianza ${ex.confidence ?? 'alta'}).`);
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

      const baseLat = 18.4861;
      const baseLon = -69.9312;
      const targetLat = selectedSurvey?.centroid.lat ?? baseLat;
      const targetLon = selectedSurvey?.centroid.lon ?? baseLon;

      const distMeters = Math.max(
        haversineMeters(baseLat, baseLon, lat, lon),
        haversineMeters(baseLat, baseLon, targetLat, targetLon)
      );
      const km = Math.max(8, Number((distMeters / 1000).toFixed(1)));
      const fuelEstimate = Math.round(km * 26.5);

      setDistanceKm(km);
      setCategory('Combustible');
      setMerchant(`Traslado GPS Ruta · ${selectedSurvey?.province || 'Campo'}`);
      setAmountRD(String(fuelEstimate));
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
      if (selectedSurvey) {
        applyPosition(selectedSurvey.centroid.lat, selectedSurvey.centroid.lon, true);
      } else {
        setErrorMsg('Geolocalización no disponible en este navegador.');
        setIsLocating(false);
      }
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        applyPosition(pos.coords.latitude, pos.coords.longitude, false);
      },
      () => {
        if (selectedSurvey) {
          applyPosition(selectedSurvey.centroid.lat, selectedSurvey.centroid.lon, true);
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
    setItbisRD('0');
    setNcf('');
    setNotes(preset.notes);
    setOcrStatusMsg(`Tarifa estándar aplicada: ${formatRD(preset.amountRD)}`);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSurvey) {
      setErrorMsg('Selecciona un levantamiento para imputar el viático.');
      return;
    }
    const parsedAmount = Number(amountRD);
    if (Number.isNaN(parsedAmount) || parsedAmount < 0) {
      setErrorMsg('Ingresa un monto válido en RD$.');
      return;
    }

    const expense: ViaticoExpense = {
      id: `exp-${Date.now()}`,
      surveyId: selectedSurvey.id,
      parcelCode: selectedSurvey.parcelCode,
      surveyor: selectedSurvey.surveyor,
      category,
      merchant: merchant.trim() || `${category} en Campo`,
      amountRD: parsedAmount,
      itbisRD: Number(itbisRD) || 0,
      ncf: ncf.trim() || undefined,
      dateIso,
      timestampAST: formatSantoDomingoAST(new Date()),
      method,
      gpsCoords: gpsCoords ?? undefined,
      distanceKm,
      receiptThumbnail: receiptPreview ?? undefined,
      pendingReceiptBase64: needsOfflineOcr ? receiptPreview ?? undefined : undefined,
      pendingReceiptMime: needsOfflineOcr ? pendingReceiptMime : undefined,
      syncStatus: needsOfflineOcr ? 'needs_ocr' : 'pending',
      approved: false,
      notes: notes.trim() || undefined,
    };

    onAddExpense(expense);
    setReceiptPreview(null);
    setMerchant('');
    setAmountRD('');
    setNcf('');
    setNotes('');
    setOcrStatusMsg(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[#0F2942]/65 sm:p-4">
      <div className="w-full sm:max-w-xl rounded-t-2xl sm:rounded-md border border-[#CBD5E1] bg-white shadow-2xl max-h-[92vh] flex flex-col">
        {/* Mobile grabber */}
        <div className="sm:hidden pt-2.5 pb-1 flex justify-center">
          <div className="h-1.5 w-10 rounded-full bg-[#CBD5E1]" />
        </div>

        <div className="flex items-center justify-between border-b border-[#E2E8F0] px-5 py-3.5">
          <div>
            <h2 className="text-base font-bold text-[#0D1C2F]">
              Reporte Automático de Viático en Campo
            </h2>
            <p className="text-xs text-[#43474D]">
              Captura móvil por cámara, ruta GPS o tarifa estándar de brigada.
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
          {/* Capture Mode Segmented Tabs */}
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

          {/* Survey Selector */}
          <div>
            <label className="block text-xs font-semibold text-[#334155] mb-1">
              Levantamiento KMZ Asociado
            </label>
            <select
              value={surveyId}
              onChange={(e) => setSurveyId(e.target.value)}
              className="w-full rounded-sm border border-[#CBD5E1] bg-white px-3 py-2.5 text-xs text-[#0D1C2F] focus:border-[#0284C7] focus:outline-none min-h-[44px]"
            >
              {surveys.map((srv) => (
                <option key={srv.id} value={srv.id}>
                  {srv.parcelCode} — {srv.title} ({srv.surveyor})
                </option>
              ))}
            </select>
          </div>

          {/* Mode-specific trigger */}
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
                      Extrayendo NCF, monto e ITBIS...
                    </>
                  ) : (
                    <>
                      <Camera className="h-4 w-4" />
                      Tomar Foto o Subir Comprobante
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
                  ? 'Lectura automática con IA: extrae establecimiento, monto en RD$, ITBIS y NCF fiscal.'
                  : 'Modo sin señal: la fotografía se encola localmente para procesamiento automático al reconectar.'}
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
                Calcula la distancia geodésica desde base hasta la parcela seleccionada a razón de RD$ 26.50/km.
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

          {/* Extracted / Editable Expense Fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <label className="block font-semibold text-[#334155] mb-1">Categoría</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
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
                onChange={(e) => setAmountRD(e.target.value)}
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
              <label className="block font-semibold text-[#334155] mb-1">Fecha</label>
              <input
                type="date"
                required
                value={dateIso}
                onChange={(e) => setDateIso(e.target.value)}
                className="w-full rounded-sm border border-[#CBD5E1] px-3 py-2 font-mono text-xs text-[#0D1C2F] min-h-[42px]"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block font-semibold text-[#334155] mb-1">Detalle / Observación</label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Detalle de artículos, kilometraje o cuadrilla"
                className="w-full rounded-sm border border-[#CBD5E1] px-3 py-2 text-xs text-[#0D1C2F] min-h-[42px]"
              />
            </div>
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
              className="inline-flex items-center justify-center gap-2 rounded-sm bg-[#0F2942] px-5 py-2.5 text-xs font-semibold text-white hover:bg-[#0284C7] transition-colors min-h-[44px]"
            >
              <Receipt className="h-4 w-4" />
              {isOnline ? 'Guardar y Reportar Gasto' : 'Encolar Gasto Offline'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
