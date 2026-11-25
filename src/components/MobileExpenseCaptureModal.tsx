import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Loader2,
  MapPin,
  Navigation,
  Plus,
  Receipt,
  Sparkles,
  Trash2,
  Upload,
  Utensils,
  X,
} from 'lucide-react';
import {
  CATEGORIAS_VIATICO,
  ERROR_TECNICO_SIN_PERSONAL,
  calcularCombustibleGpsRuta,
  completarRepartoConSinAsignar,
  crearConfiguracionInicialEmpresa,
  evaluarAlertaTopeCategoriaRecibo,
  evaluarTopeViaticoEnMision,
  normalizarResultadoAnalisisRecibo,
  obtenerReglasViaticosVigentes,
  type ResultadoAnalisisRecibo,
  validarRepartoViatico,
} from '../domain';
import type {
  CategoriaViatico,
  ConfiguracionEmpresa,
  MetodoViatico,
  MisionTecnico,
  PresetViaticoConfig,
  Proyecto,
  ReglasCapturaViaticosTecnico,
  RepartoProyecto,
  RolEmpresa,
  Ruta,
  Vehiculo,
  Viatico,
} from '../types/domain';
import {
  formatRD,
  formatSantoDomingoAST,
  haversineMeters,
  latLonToUtm19N,
} from '../utils/geodesy';
import { MediaThumb } from './MediaThumb';

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
  misiones?: MisionTecnico[];
  vehiculos?: Array<Pick<Vehiculo, 'id' | 'etiqueta' | 'placa' | 'estado'>>;
  viaticosExistentes?: Viatico[];
  configuracion?: ConfiguracionEmpresa;
  cargoUsuario?: string;
  personalIdUsuario?: string;
  rolActivo?: RolEmpresa;
  defaultProyectoId?: string;
  defaultRutaId?: string;
  editingViatico?: Viatico | null;
  isOnline: boolean;
  sessionToken: string;
  creadoPorUsuario: { id: string; nombre: string };
  baseLat?: number;
  baseLon?: number;
  moneda?: string;
  reglasCaptura?: ReglasCapturaViaticosTecnico;
  onAddExpense: (expense: ViaticoPayload) => Promise<void>;
  onEditExpense?: (viaticoId: string, expense: ViaticoEdicionPayload) => Promise<void>;
}

const DEFAULT_REGLAS_SEED = obtenerReglasViaticosVigentes(
  crearConfiguracionInicialEmpresa('default')
);

const FALLBACK_REGLAS_CAPTURA: ReglasCapturaViaticosTecnico = {
  version: DEFAULT_REGLAS_SEED.version,
  vigenciaDesde: DEFAULT_REGLAS_SEED.vigenciaDesde,
  gpsRuta: DEFAULT_REGLAS_SEED.gpsRuta,
  presetsRapidos: DEFAULT_REGLAS_SEED.presetsRapidos,
  categoriasViatico: [...CATEGORIAS_VIATICO],
};

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
  misiones = [],
  vehiculos = [],
  viaticosExistentes = [],
  configuracion,
  cargoUsuario,
  personalIdUsuario,
  rolActivo,
  defaultProyectoId,
  defaultRutaId,
  editingViatico = null,
  isOnline,
  sessionToken,
  creadoPorUsuario,
  baseLat = 18.4861,
  baseLon = -69.9312,
  moneda = 'RD$',
  reglasCaptura = FALLBACK_REGLAS_CAPTURA,
  onAddExpense,
  onEditExpense,
}) => {
  const categoriasDisponibles = reglasCaptura.categoriasViatico?.length
    ? reglasCaptura.categoriasViatico
    : CATEGORIAS_VIATICO;
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [captureMode, setCaptureMode] = useState<'ocr' | 'gps' | 'quick'>('ocr');
  const [rutaId, setRutaId] = useState(defaultRutaId || rutas[0]?.id || '');
  const [misionId, setMisionId] = useState('');
  const [vehiculoId, setVehiculoId] = useState(vehiculos[0]?.id || '');
  const [galonesCargados, setGalonesCargados] = useState('');
  const [motivoExcedente, setMotivoExcedente] = useState('');

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
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isStartingCamera, setIsStartingCamera] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [extractedAnalysis, setExtractedAnalysis] = useState<ResultadoAnalisisRecibo | null>(null);

  const [isLocating, setIsLocating] = useState(false);
  const [gpsCoords, setGpsCoords] = useState<{
    lat: number;
    lon: number;
    easting: number;
    northing: number;
  } | null>(null);
  const [distanceKm, setDistanceKm] = useState<number | undefined>(undefined);

  const stopCamera = () => {
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsCameraOpen(false);
  };

  useEffect(() => {
    if (!isOpen) {
      stopCamera();
    }
    return () => {
      stopCamera();
    };
  }, [isOpen]);

  useEffect(() => {
    if (isCameraOpen && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {});
    }
  }, [isCameraOpen]);

  // Sincroniza ruta, proyecto y campos al abrir o cambiar de ruta activa / modo edición
  useEffect(() => {
    if (!isOpen) return;

    setErrorMsg(null);
    setOcrStatusMsg(null);
    setCameraError(null);
    setExtractedAnalysis(null);

    if (editingViatico) {
      setRutaId(editingViatico.rutaId || '');
      setMisionId(editingViatico.misionId || '');
      setVehiculoId(editingViatico.vehiculoId || vehiculos[0]?.id || '');
      setGalonesCargados(
        typeof editingViatico.galonesCargados === 'number'
          ? String(editingViatico.galonesCargados)
          : ''
      );
      setMotivoExcedente(editingViatico.motivoExcedente || '');
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
    const nextMisionId = nextRutaId
      ? misiones.find((m) => m.rutaIds.includes(nextRutaId))?.id || ''
      : '';

    setCaptureMode('ocr');
    setRutaId(nextRutaId);
    setMisionId(nextMisionId);
    setVehiculoId(vehiculos[0]?.id || '');
    setGalonesCargados('');
    setMotivoExcedente('');
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
  }, [isOpen, defaultRutaId, defaultProyectoId, editingViatico, rutas, proyectos, misiones, vehiculos]);

  const selectedRuta = useMemo(() => rutas.find((r) => r.id === rutaId), [rutas, rutaId]);
  const montoNumerico = Number(amountRD) || 0;
  const cargoEfectivo =
    cargoUsuario || (rolActivo === 'tecnico' ? 'tecnico' : 'administrativo');

  const evalTope = useMemo(
    () =>
      evaluarTopeViaticoEnMision({
        misionId: misionId || undefined,
        categoria: category,
        montoRD: montoNumerico,
        cargoCodigo: cargoEfectivo,
        usuarioId: creadoPorUsuario.id,
        personalId: personalIdUsuario,
        viaticosExistentes,
        excluirViaticoId: editingViatico?.id,
        config: configuracion,
        topeDirecto: reglasCaptura.topesUsuario?.[category],
        fechaCalculoIso: dateIso,
      }),
    [
      misionId,
      category,
      montoNumerico,
      cargoEfectivo,
      creadoPorUsuario.id,
      personalIdUsuario,
      viaticosExistentes,
      editingViatico?.id,
      configuracion,
      reglasCaptura.topesUsuario,
      dateIso,
    ]
  );

  const alertaTopeCategoria = useMemo(
    () =>
      evaluarAlertaTopeCategoriaRecibo({
        categoria: category,
        montoReciboRD: montoNumerico,
        cargoCodigo: cargoEfectivo,
        config: configuracion,
        topeDirecto: reglasCaptura.topesUsuario?.[category],
        fechaCalculoIso: dateIso,
      }),
    [category, montoNumerico, cargoEfectivo, configuracion, reglasCaptura.topesUsuario, dateIso]
  );

  const superaTopeVisual = alertaTopeCategoria.superaTope || evalTope.superaTope;

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

  const analyzeReceiptDataUrl = async (base64: string, mimeType: string) => {
    setErrorMsg(null);
    setOcrStatusMsg(null);
    setCameraError(null);
    setMethod('OCR Móvil');
    setReceiptPreview(base64);
    setPendingReceiptMime(mimeType);

    if (!isOnline) {
      setNeedsOfflineOcr(true);
      setExtractedAnalysis(null);
      setOcrStatusMsg(
        'Sin conexión: foto guardada en cola local para lectura con IA al reconectar. Puedes completar los campos manualmente.'
      );
      if (!merchant) setMerchant('Comprobante pendiente de lectura IA');
      return;
    }

    setExtractedAnalysis(null);
    setIsAnalyzing(true);
    try {
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
        throw new Error(data.error || 'No se pudo analizar el comprobante automáticamente.');
      }

      const ex = normalizarResultadoAnalisisRecibo(data.extracted, dateIso);
      setExtractedAnalysis(ex);

      if (ex.merchant) setMerchant(ex.merchant);
      if (ex.amountRD > 0) {
        setAmountRD(String(ex.amountRD));
        syncAmountIntoUniqueSplit(ex.amountRD);
      }
      setItbisRD(String(ex.itbisRD));
      setNcf(ex.ncf);
      if (ex.dateIso) setDateIso(ex.dateIso);
      if (ex.notes) setNotes(ex.notes);
      if (categoriasDisponibles.includes(ex.category)) setCategory(ex.category);

      setNeedsOfflineOcr(false);
      const partesResumen: string[] = [];
      if (ex.amountRD > 0) partesResumen.push(`monto ${formatRD(ex.amountRD, moneda)}`);
      if (ex.cargos.length > 0) partesResumen.push(`${ex.cargos.length} cargo(s)`);
      if (ex.ncf) partesResumen.push(`NCF ${ex.ncf}`);
      if (ex.dateIso) partesResumen.push(`fecha ${ex.dateIso}`);
      setOcrStatusMsg(
        `Análisis IA aplicado (${partesResumen.join(' · ') || `confianza ${ex.confidence}`}). Verifica los datos antes de registrar.`
      );
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Error analizando el comprobante con IA.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleReceiptSelected = async (file: File) => {
    setErrorMsg(null);
    setOcrStatusMsg(null);
    setCameraError(null);
    try {
      const { base64, mimeType } = await compressImageToBase64(file);
      await analyzeReceiptDataUrl(base64, mimeType);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Error procesando la imagen seleccionada.');
    }
  };

  const handleOpenCamera = async () => {
    setErrorMsg(null);
    setCameraError(null);
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setCameraError(
        'La cámara en vivo no está disponible en este navegador. Usa "Subir imagen" para seleccionar o tomar la foto.'
      );
      return;
    }

    stopCamera();
    setIsStartingCamera(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1600 },
          height: { ideal: 1200 },
        },
        audio: false,
      });
      streamRef.current = stream;
      setIsCameraOpen(true);
    } catch {
      setCameraError(
        'No se pudo acceder a la cámara (permiso denegado o dispositivo sin cámara). Puedes usar "Subir imagen".'
      );
    } finally {
      setIsStartingCamera(false);
    }
  };

  const handleCaptureCameraFrame = async () => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) {
      setCameraError('La cámara aún se está enfocando. Intenta capturar nuevamente en un segundo.');
      return;
    }

    const maxDim = 1280;
    let width = video.videoWidth;
    let height = video.videoHeight;
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
      setCameraError('No se pudo procesar el fotograma de la cámara.');
      return;
    }
    ctx.drawImage(video, 0, 0, width, height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
    stopCamera();
    await analyzeReceiptDataUrl(dataUrl, 'image/jpeg');
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
      const distanciaOneWayKm = Number((distMeters / 1000).toFixed(1));
      const gpsCalc = calcularCombustibleGpsRuta({
        distanciaOneWayKm,
        regla: reglasCaptura.gpsRuta,
      });

      setDistanceKm(gpsCalc.distanciaCalculadaKm);
      setCategory('Combustible');
      setMerchant(`Traslado GPS Ruta · ${selectedRuta?.provincia || 'Campo'}`);
      setAmountRD(String(gpsCalc.montoRD));
      syncAmountIntoUniqueSplit(gpsCalc.montoRD);
      setItbisRD('0');
      const etiquetaDist =
        gpsCalc.conceptoDistancia === 'ida_vuelta' ? 'ida y vuelta' : 'solo ida';
      setNotes(
        `Cálculo automático ${gpsCalc.distanciaCalculadaKm} km (${etiquetaDist}, mín. ${gpsCalc.minimoKm} km) @ ${formatRD(gpsCalc.tarifaPorKmRD, moneda)}/km · UTM ${utm.easting.toFixed(0)}E ${utm.northing.toFixed(0)}N${
          simulated ? ' (coordenada de parcela)' : ''
        }`
      );
      setOcrStatusMsg(
        `Ubicación fijada en ${utm.easting.toFixed(1)}E, ${utm.northing.toFixed(1)}N (${gpsCalc.distanciaCalculadaKm} km calculados).`
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

  const handleApplyPreset = (preset: PresetViaticoConfig) => {
    setMethod('Dieta Automática');
    setCategory(preset.categoria);
    setMerchant(preset.comercio);
    setAmountRD(String(preset.montoRD));
    syncAmountIntoUniqueSplit(preset.montoRD);
    setItbisRD('0');
    setNcf('');
    setNotes(preset.notas);
    setOcrStatusMsg(`Tarifa estándar aplicada: ${formatRD(preset.montoRD, moneda)}`);
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
      setErrorMsg(`Ingresa un monto válido en ${moneda}.`);
      return;
    }

    const validacion = validarRepartoViatico(parsedAmount, repartosCalculados);
    if (!validacion.valido) {
      setErrorMsg(validacion.error || 'El reparto por proyecto debe igualar el monto total.');
      return;
    }

    const requiereMotivoExc =
      evalTope.motivoExcedenteRequerido || (evalTope.categoriaNoPermitida && parsedAmount > 0);
    if (requiereMotivoExc && motivoExcedente.trim().length < 3) {
      setErrorMsg(
        'Este gasto supera el tope de la misión (o la categoría no está permitida). Indica el motivo del excedente (mín. 3 caracteres).'
      );
      return;
    }

    const galonesNum =
      category === 'Combustible' && galonesCargados.trim()
        ? Number(galonesCargados)
        : undefined;
    if (galonesNum !== undefined && (!Number.isFinite(galonesNum) || galonesNum < 0)) {
      setErrorMsg('Los galones cargados deben ser un número válido mayor o igual a 0.');
      return;
    }

    setIsSaving(true);
    try {
      const payloadBase: ViaticoEdicionPayload = {
        misionId: misionId || undefined,
        rutaId: rutaId || undefined,
        vehiculoId: category === 'Combustible' && vehiculoId ? vehiculoId : undefined,
        galonesCargados: galonesNum && galonesNum > 0 ? galonesNum : undefined,
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
        motivoExcedente: motivoExcedente.trim() || undefined,
        receiptThumbnail: receiptPreview ?? undefined,
        pendingReceiptBase64: needsOfflineOcr ? receiptPreview ?? undefined : undefined,
        pendingReceiptMime: needsOfflineOcr ? pendingReceiptMime : undefined,
        repartos: repartosCalculados,
        configVersion: editingViatico?.configVersion ?? reglasCaptura.version,
        tarifaUsadaRD:
          editingViatico?.tarifaUsadaRD ??
          (method === 'GPS Ruta' ? reglasCaptura.gpsRuta.tarifaPorKmRD : undefined),
        conceptoDistanciaUsado:
          editingViatico?.conceptoDistanciaUsado ??
          (method === 'GPS Ruta' ? reglasCaptura.gpsRuta.conceptoDistancia : undefined),
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
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[#0F2942]/65 backdrop-blur-[2px] sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="titulo-captura-viatico"
    >
      <div className="w-full sm:max-w-xl rounded-t-2xl sm:rounded-2xl border border-slate-200/90 bg-white shadow-2xl max-h-[92vh] flex flex-col overflow-hidden">
        <div className="sm:hidden pt-2.5 pb-1 flex justify-center bg-[#F8FAFC]">
          <div className="h-1.5 w-10 rounded-full bg-slate-300" />
        </div>

        <div className="flex items-center justify-between border-b border-slate-200/80 bg-[#F8FAFC] px-5 py-3.5">
          <div>
            <h2 id="titulo-captura-viatico" className="text-base font-bold tracking-tight text-[#0F2942]">
              {editingViatico ? 'Editar Viático Pendiente' : 'Reportar Viático en Campo'}
            </h2>
            <p className="text-xs text-[#475569]">
              Captura opcional por foto OCR (editable), ruta GPS o tarifa rápida. Se registra en estado Pendiente.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-[#475569] hover:bg-slate-200/70 shrink-0 transition-colors"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="overflow-y-auto p-5 space-y-4">
          {/* Capture Mode Tabs */}
          <div className="grid grid-cols-3 gap-1.5 rounded-2xl border border-slate-200/70 bg-[#F1F5F9] p-1">
            <button
              type="button"
              onClick={() => setCaptureMode('ocr')}
              className={`flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-semibold transition-all min-h-[44px] whitespace-nowrap ${
                captureMode === 'ocr'
                  ? 'bg-[#0F2942] text-white shadow-sm'
                  : 'text-[#475569] hover:bg-white hover:text-[#0F2942]'
              }`}
            >
              <Camera className="h-3.5 w-3.5" />
              Foto Recibo
            </button>
            <button
              type="button"
              onClick={() => {
                stopCamera();
                setCaptureMode('gps');
              }}
              className={`flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-semibold transition-all min-h-[44px] whitespace-nowrap ${
                captureMode === 'gps'
                  ? 'bg-[#0F2942] text-white shadow-sm'
                  : 'text-[#475569] hover:bg-white hover:text-[#0F2942]'
              }`}
            >
              <Navigation className="h-3.5 w-3.5" />
              Ruta GPS
            </button>
            <button
              type="button"
              onClick={() => {
                stopCamera();
                setCaptureMode('quick');
              }}
              className={`flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-semibold transition-all min-h-[44px] whitespace-nowrap ${
                captureMode === 'quick'
                  ? 'bg-[#0F2942] text-white shadow-sm'
                  : 'text-[#475569] hover:bg-white hover:text-[#0F2942]'
              }`}
            >
              <Utensils className="h-3.5 w-3.5" />
              Dieta Rápida
            </button>
          </div>

          {rolActivo === 'tecnico' && !personalIdUsuario && (
            <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs text-rose-800">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-[#DC2626]" />
              <span>{ERROR_TECNICO_SIN_PERSONAL}</span>
            </div>
          )}

          {/* Misión y Ruta de referencia */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[#334155] mb-1">
                Misión (controla topes por cargo)
              </label>
              <select
                value={misionId}
                onChange={(e) => setMisionId(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs text-[#0F2942] min-h-[44px] focus:border-[#0284C7] focus:outline-none"
              >
                <option value="">Sin misión (gasto suelto / administrativo)</option>
                {misiones.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nombre} ({m.provincia})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
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
                  if (!editingViatico && nextRutaId) {
                    const matchMision = misiones.find((m) => m.rutaIds.includes(nextRutaId));
                    if (matchMision) setMisionId(matchMision.id);
                  }
                }}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs text-[#0F2942] min-h-[44px] focus:border-[#0284C7] focus:outline-none"
              >
                <option value="">Sin ruta específica (gasto general)</option>
                {rutas.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.codigoParcela} — {r.nombre} ({r.provincia})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {captureMode === 'ocr' && (
            <div className="rounded-2xl border border-slate-200/70 bg-[#F8FAFC] p-4 space-y-3">
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (f) handleReceiptSelected(f);
                }}
              />

              {isCameraOpen ? (
                <div className="space-y-3">
                  <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-[#0F2942]">
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      className="w-full max-h-64 object-cover"
                    />
                    <div className="pointer-events-none absolute inset-4 rounded-xl border border-dashed border-white/70" />
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={stopCamera}
                      className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 min-h-[44px] whitespace-nowrap transition-colors"
                    >
                      Cerrar cámara
                    </button>
                    <button
                      type="button"
                      onClick={handleCaptureCameraFrame}
                      disabled={isAnalyzing}
                      className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 rounded-xl bg-[#0284C7] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0369A1] disabled:opacity-60 min-h-[44px] whitespace-nowrap transition-colors"
                    >
                      <Camera className="h-4 w-4" />
                      Capturar y analizar recibo
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                  <button
                    type="button"
                    onClick={handleOpenCamera}
                    disabled={isAnalyzing || isStartingCamera}
                    className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-[#0284C7] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#0369A1] disabled:opacity-60 transition-colors min-h-[44px] whitespace-nowrap shadow-sm"
                  >
                    {isAnalyzing ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Analizando recibo con IA...
                      </>
                    ) : isStartingCamera ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Iniciando cámara...
                      </>
                    ) : (
                      <>
                        <Camera className="h-4 w-4" />
                        Usar cámara
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => cameraInputRef.current?.click()}
                    disabled={isAnalyzing}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-[#0F2942] hover:bg-slate-100 disabled:opacity-60 transition-colors min-h-[44px] whitespace-nowrap"
                  >
                    <Upload className="h-4 w-4 text-[#0284C7]" />
                    Subir imagen
                  </button>

                  {receiptPreview && (
                    <div className="flex items-center gap-2">
                      <div className="relative shrink-0">
                        <MediaThumb
                          src={receiptPreview}
                          alt="Vista previa del comprobante"
                          caption="Recibo"
                          sizeClass="h-14 w-14 shrink-0"
                          onRemove={
                            isAnalyzing
                              ? undefined
                              : () => {
                                  setReceiptPreview(null);
                                  setPendingReceiptMime(undefined);
                                  setNeedsOfflineOcr(false);
                                  setExtractedAnalysis(null);
                                }
                          }
                          removeLabel="Quitar comprobante"
                        />
                        {isAnalyzing && (
                          <div
                            className="absolute inset-0 flex items-center justify-center rounded-xl bg-[#0F2942]/55"
                            aria-hidden="true"
                          >
                            <Loader2 className="h-5 w-5 animate-spin text-white" />
                          </div>
                        )}
                      </div>
                      {isOnline && (
                        <button
                          type="button"
                          onClick={() =>
                            analyzeReceiptDataUrl(
                              receiptPreview,
                              pendingReceiptMime || 'image/jpeg'
                            )
                          }
                          disabled={isAnalyzing}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] font-semibold text-[#0F2942] hover:bg-slate-100 disabled:opacity-50 min-h-[40px] whitespace-nowrap transition-colors"
                        >
                          <Sparkles className="h-3.5 w-3.5 text-[#0284C7]" />
                          Re-analizar
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}

              {cameraError && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
                  {cameraError}
                </div>
              )}

              {isAnalyzing && (
                <div
                  role="status"
                  aria-live="polite"
                  className="rounded-xl border border-sky-200 bg-white p-3.5 space-y-3 text-xs"
                >
                  <div className="flex items-start gap-2.5">
                    <Loader2 className="h-4 w-4 animate-spin text-[#0284C7] shrink-0 mt-0.5" />
                    <div className="space-y-0.5">
                      <div className="font-semibold text-[#0F2942]">
                        Analizando recibo con IA...
                      </div>
                      <p className="text-[11px] text-[#475569]">
                        Extrayendo monto total, desglose de cargos, ITBIS, NCF y fecha del comprobante.
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 border-t border-slate-100" aria-hidden="true">
                    {['Subtotal', 'ITBIS', 'Otros cargos', 'NCF'].map((campo) => (
                      <div key={campo} className="space-y-1.5">
                        <div className="text-[10px] text-slate-500">{campo}</div>
                        <div className="h-3.5 w-16 rounded-lg bg-slate-200 animate-pulse" />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {!isAnalyzing && extractedAnalysis && (
                <div className="rounded-xl border border-slate-200/90 bg-white p-3.5 space-y-2 text-[11px] text-slate-700">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-1.5">
                    <span className="font-semibold text-[#0F2942]">
                      Desglose detectado por IA
                    </span>
                    <span className="font-mono text-slate-500">
                      Confianza: {extractedAnalysis.confidence} · Fecha: {extractedAnalysis.dateIso}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono tabular-nums">
                    <div>
                      <div className="text-[10px] font-sans text-slate-500">Subtotal</div>
                      <div className="font-semibold text-slate-900">
                        {formatRD(extractedAnalysis.subtotalRD, moneda)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] font-sans text-slate-500">ITBIS</div>
                      <div className="font-semibold text-slate-900">
                        {formatRD(extractedAnalysis.itbisRD, moneda)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] font-sans text-slate-500">Otros cargos</div>
                      <div className="font-semibold text-slate-900">
                        {formatRD(extractedAnalysis.otrosCargosRD, moneda)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] font-sans text-slate-500">NCF</div>
                      <div className="font-semibold text-[#0284C7]">
                        {extractedAnalysis.ncf || 'No requerido'}
                      </div>
                    </div>
                  </div>

                  {extractedAnalysis.cargos.length > 0 && (
                    <div className="border-t border-slate-100 pt-1.5 space-y-1">
                      <div className="text-[10px] font-semibold text-slate-500">
                        Cargos identificados en el recibo
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0.5">
                        {extractedAnalysis.cargos.map((cargo, idx) => (
                          <div
                            key={`${cargo.descripcion}-${idx}`}
                            className="flex items-center justify-between gap-2"
                          >
                            <span className="truncate text-slate-700">{cargo.descripcion}</span>
                            <span className="font-mono font-semibold text-slate-900 tabular-nums shrink-0">
                              {formatRD(cargo.montoRD, moneda)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <p className="flex items-center gap-1.5 text-[11px] text-slate-600">
                <Sparkles className="h-3.5 w-3.5 text-[#0284C7] shrink-0" />
                {isOnline
                  ? 'La cámara analiza automáticamente monto, cargos, ITBIS, NCF (si aplica) y fecha como sugerencia editable.'
                  : 'Modo sin señal: la fotografía se encola localmente para análisis IA al reconectar.'}
              </p>
            </div>
          )}

          {captureMode === 'gps' && (
            <div className="rounded-2xl border border-slate-200/70 bg-[#F8FAFC] p-4 space-y-2.5">
              <button
                type="button"
                onClick={handleAutoGpsMileage}
                disabled={isLocating}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#0284C7] px-4 py-3 text-xs font-semibold text-white hover:bg-[#0369A1] disabled:opacity-60 transition-colors min-h-[48px] shadow-sm"
              >
                {isLocating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Calculando posición UTM 19N y distancia...
                  </>
                ) : (
                  <>
                    <MapPin className="h-4 w-4" />
                    Calcular combustible por GPS
                  </>
                )}
              </button>
              <p className="text-[11px] text-[#475569]">
                Calcula la distancia geodésica desde base hasta la parcela (
                {reglasCaptura.gpsRuta.conceptoDistancia === 'ida_vuelta'
                  ? 'ida y vuelta'
                  : 'solo ida'}
                , mínimo {reglasCaptura.gpsRuta.minimoKm} km) a razón de{' '}
                <span className="font-mono tabular-nums">{formatRD(reglasCaptura.gpsRuta.tarifaPorKmRD, moneda)}/km</span>.
              </p>
            </div>
          )}

          {captureMode === 'quick' && (
            <div className="grid grid-cols-2 gap-2.5">
              {reglasCaptura.presetsRapidos.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => handleApplyPreset(preset)}
                  className="rounded-2xl border border-slate-200/70 bg-[#F8FAFC] p-3.5 text-left hover:border-[#0284C7] hover:bg-sky-50/70 transition-colors min-h-[56px]"
                >
                  <div className="text-xs font-semibold text-[#0F2942]">{preset.etiqueta}</div>
                  <div className="mt-0.5 font-mono text-xs font-bold text-[#0284C7] tabular-nums">
                    {formatRD(preset.montoRD, moneda)}
                  </div>
                </button>
              ))}
            </div>
          )}

          {ocrStatusMsg && (
            <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs text-[#15803D]">
              <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{ocrStatusMsg}</span>
            </div>
          )}

          {errorMsg && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs text-rose-800">
              {errorMsg}
            </div>
          )}

          {superaTopeVisual && (
            <div
              role="alert"
              className="flex items-start gap-2.5 rounded-xl border border-rose-300 bg-rose-50 px-3.5 py-3 text-xs text-rose-900"
            >
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-[#DC2626]" />
              <div className="space-y-0.5">
                <div className="font-semibold text-[#991B1B]">
                  {alertaTopeCategoria.categoriaNoPermitida || evalTope.categoriaNoPermitida
                    ? `Categoría "${category}" no permitida según reglas de viáticos`
                    : alertaTopeCategoria.superaTope
                    ? `El monto del recibo supera el tope permitido para ${category}`
                    : `El acumulado en misión supera el tope de ${category}`}
                </div>
                <p className="text-[11px] text-rose-800 tabular-nums">
                  {alertaTopeCategoria.superaTope ? (
                    <>
                      Recibo:{' '}
                      <strong className="font-mono">{formatRD(montoNumerico, moneda)}</strong>
                      {' · '}
                      Tope configurado:{' '}
                      <strong className="font-mono">
                        {formatRD(alertaTopeCategoria.topePermitidoRD ?? 0, moneda)}
                      </strong>
                      {' · '}
                      Excedente:{' '}
                      <strong className="font-mono text-[#DC2626]">
                        +{formatRD(alertaTopeCategoria.excedenteReciboRD, moneda)}
                      </strong>
                      {evalTope.motivoExcedenteRequerido
                        ? '. Indica el motivo del excedente más abajo para poder registrarlo.'
                        : '. Quedará marcado con excedente para revisión administrativa.'}
                    </>
                  ) : (
                    evalTope.mensajeAviso
                  )}
                </p>
              </div>
            </div>
          )}

          {/* Expense Fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <label className="block font-semibold text-slate-700 mb-1.5">Categoría</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as CategoriaViatico)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-[#0F2942] min-h-[42px] focus:border-[#0284C7] focus:outline-none"
              >
                {categoriasDisponibles.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1.5">Monto Total (RD$)</label>
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
                className={`w-full rounded-xl border px-3 py-2 font-mono text-xs min-h-[42px] tabular-nums focus:outline-none ${
                  superaTopeVisual
                    ? 'border-rose-400 bg-rose-50/40 text-rose-900 focus:border-[#DC2626]'
                    : 'border-slate-200 text-[#0F2942] focus:border-[#0284C7]'
                }`}
              />
              {alertaTopeCategoria.aplicaTope && (
                <p
                  className={`mt-1 text-[11px] tabular-nums ${
                    alertaTopeCategoria.superaTope
                      ? 'font-semibold text-[#DC2626]'
                      : 'text-slate-500'
                  }`}
                >
                  {alertaTopeCategoria.superaTope
                    ? `Excede el tope de ${formatRD(
                        alertaTopeCategoria.topePermitidoRD ?? 0,
                        moneda
                      )} (+${formatRD(alertaTopeCategoria.excedenteReciboRD, moneda)})`
                    : `Tope permitido para ${category}: ${formatRD(
                        alertaTopeCategoria.topePermitidoRD ?? 0,
                        moneda
                      )}`}
                </p>
              )}
            </div>
            <div className="sm:col-span-2">
              <label className="block font-semibold text-slate-700 mb-1.5">
                Comercio / Estación / Concepto
              </label>
              <input
                type="text"
                required
                value={merchant}
                onChange={(e) => setMerchant(e.target.value)}
                placeholder="Ej. Estación Texaco Autovía del Este"
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-[#0F2942] min-h-[42px] focus:border-[#0284C7] focus:outline-none"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1.5">NCF (Opcional)</label>
              <input
                type="text"
                value={ncf}
                onChange={(e) => setNcf(e.target.value)}
                placeholder="B010000..."
                className="w-full rounded-xl border border-slate-200 px-3 py-2 font-mono text-xs text-[#0F2942] min-h-[42px] focus:border-[#0284C7] focus:outline-none"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1.5">ITBIS (RD$)</label>
              <input
                type="number"
                step="0.01"
                min={0}
                value={itbisRD}
                onChange={(e) => setItbisRD(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 font-mono text-xs text-[#0F2942] min-h-[42px] tabular-nums focus:border-[#0284C7] focus:outline-none"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1.5">Fecha</label>
              <input
                type="date"
                required
                value={dateIso}
                onChange={(e) => setDateIso(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 font-mono text-xs text-[#0F2942] min-h-[42px] focus:border-[#0284C7] focus:outline-none"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1.5">Observación</label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Detalle de artículos o km"
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-[#0F2942] min-h-[42px] focus:border-[#0284C7] focus:outline-none"
              />
            </div>

            {category === 'Combustible' && (
              <>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1.5">
                    Vehículo abastecido (para rendimiento)
                  </label>
                  <select
                    value={vehiculoId}
                    onChange={(e) => setVehiculoId(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-[#0F2942] min-h-[42px] focus:border-[#0284C7] focus:outline-none"
                  >
                    <option value="">Sin vehículo específico</option>
                    {vehiculos.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.etiqueta} ({v.placa})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1.5">
                    Galones cargados (opcional)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min={0}
                    value={galonesCargados}
                    onChange={(e) => setGalonesCargados(e.target.value)}
                    placeholder="Ej. 11.2"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 font-mono text-xs text-[#0F2942] min-h-[42px] tabular-nums focus:border-[#0284C7] focus:outline-none"
                  />
                </div>
              </>
            )}
          </div>

          {/* Evaluación de Tope en Misión (B2) */}
          {evalTope.aplicaTope && (
            <div
              className={`rounded-2xl border p-3.5 text-xs space-y-2 ${
                evalTope.categoriaNoPermitida || evalTope.superaTope
                  ? 'border-rose-200 bg-rose-50 text-rose-900'
                  : 'border-slate-200/70 bg-[#F8FAFC] text-slate-700'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold">
                  Tope de misión ({evalTope.cargoCodigo} · {category}):{' '}
                  {formatRD(evalTope.topeAplicadoRD ?? 0, moneda)}
                </span>
                <span className="font-mono text-[11px] tabular-nums">
                  Acumulado: {formatRD(evalTope.acumuladoPrevioRD, moneda)} &rarr; Nuevo total:{' '}
                  {formatRD(evalTope.totalConNuevoRD, moneda)}
                </span>
              </div>

              {evalTope.mensajeAviso && (
                <div className="flex items-start gap-2 font-semibold">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-[#DC2626]" />
                  <span>{evalTope.mensajeAviso}</span>
                </div>
              )}

              {(evalTope.motivoExcedenteRequerido ||
                (evalTope.categoriaNoPermitida && montoNumerico > 0)) && (
                <div>
                  <label className="block font-semibold text-rose-900 mb-1.5">
                    Motivo obligatorio del excedente (no bloquea el registro)
                  </label>
                  <textarea
                    rows={2}
                    required
                    value={motivoExcedente}
                    onChange={(e) => setMotivoExcedente(e.target.value)}
                    placeholder="Ej. Extensión de jornada por lluvia o zona remota..."
                    className="w-full rounded-xl border border-rose-300 bg-white px-3 py-2 text-xs text-[#0F2942] focus:border-[#0284C7] focus:outline-none"
                  />
                </div>
              )}
            </div>
          )}

          {/* Exact Project Split Editor (F10) */}
          <div className="rounded-2xl border border-slate-200/70 bg-[#F8FAFC] p-4 space-y-3 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-bold text-[#0F2942]">
                Imputación Exacta a Proyectos (RD$)
              </span>
              <div className="inline-flex rounded-xl border border-slate-200 bg-[#F1F5F9] p-1">
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
                    className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap transition-all ${
                      repartoModo === m.id ? 'bg-[#0F2942] text-white shadow-sm' : 'text-[#475569]'
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
                className="w-full min-h-[40px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-[#0F2942] focus:border-[#0284C7] focus:outline-none"
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
              <p className="text-[11px] text-[#B45309]">
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
                      className="flex-1 min-h-[40px] rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs focus:border-[#0284C7] focus:outline-none"
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
                      className="w-28 min-h-[40px] rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-xs tabular-nums focus:border-[#0284C7] focus:outline-none"
                    />
                    {repartosMultiples.length > 1 && (
                      <button
                        type="button"
                        onClick={() =>
                          setRepartosMultiples((prev) => prev.filter((_, i) => i !== idx))
                        }
                        className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-[#DC2626] hover:bg-rose-50 transition-colors"
                        aria-label="Eliminar línea"
                      >
                        <Trash2 className="h-4 w-4" />
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
                    className="min-h-[36px] inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-[#0F2942] hover:bg-slate-100 whitespace-nowrap transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Agregar proyecto
                  </button>

                  <div className="flex items-center gap-2 text-xs">
                    <span className="font-mono tabular-nums">
                      Suma: <strong>{formatRD(sumaMultipleRD)}</strong> /{' '}
                      {formatRD(montoNumerico)}
                    </span>
                    {Math.abs(montoNumerico - sumaMultipleRD) > 0.01 &&
                      montoNumerico > sumaMultipleRD && (
                        <button
                          type="button"
                          onClick={handleCompletarConSinAsignar}
                          className="rounded-xl bg-amber-100 px-2.5 py-1 font-semibold text-amber-900 hover:bg-amber-200 whitespace-nowrap transition-colors"
                        >
                          Saldo a Sin asignar
                        </button>
                      )}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2.5 border-t border-slate-200/80 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 min-h-[44px] whitespace-nowrap transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSaving || isAnalyzing}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#0F2942] px-5 py-2.5 text-xs font-semibold text-white hover:bg-[#0284C7] disabled:opacity-50 transition-colors min-h-[44px] whitespace-nowrap shadow-sm"
            >
              {isAnalyzing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Receipt className="h-4 w-4" />
              )}
              {isAnalyzing
                ? 'Esperando análisis IA...'
                : isSaving
                ? 'Registrando...'
                : editingViatico
                ? 'Actualizar viático'
                : isOnline
                ? 'Registrar viático'
                : 'Encolar viático offline'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
