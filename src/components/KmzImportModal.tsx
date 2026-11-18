import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  Check,
  CheckCircle2,
  Download,
  FileUp,
  MapPin,
  Receipt,
  Route,
  Sparkles,
  UploadCloud,
  X,
} from 'lucide-react';
import { EQUIPMENT_ROSTER, SURVEYOR_ROSTER } from '../data/initialData';
import type { AreaUnit, SurveyProject, ViaticoExpense, WorkflowStatus } from '../types/geodesy';
import {
  formatArea,
  formatPerimeter,
  formatRD,
  formatSantoDomingoAST,
} from '../utils/geodesy';
import {
  buildRealKmzFileFromTemplate,
  parseKmzOrKmlFile,
  SAMPLE_KMZ_TEMPLATES,
  type ParsedKmzResult,
  type SampleKmzTemplate,
} from '../utils/kmzParser';
import { reverseGeocodeOSM } from '../utils/osmGeocode';
import {
  computeRouteViaticos,
  fetchOptimalRoutesOSM,
  SERVICE_CATALOG,
  TERRAIN_MULTIPLIER,
  VEHICLE_CATALOG,
  type RouteAlternative,
  type TerrainType,
} from '../utils/routingEngine';
import { KmzOsmViewer } from './KmzOsmViewer';

interface KmzImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateSurvey: (
    survey: SurveyProject,
    options?: {
      initialExpenses?: ViaticoExpense[];
      openMobileExpenseAfter?: boolean;
    }
  ) => void;
  preloadedKmz?: ParsedKmzResult | null;
}

export const KmzImportModal: React.FC<KmzImportModalProps> = ({
  isOpen,
  onClose,
  onCreateSurvey,
  preloadedKmz = null,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [parsed, setParsed] = useState<ParsedKmzResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [previewUnit, setPreviewUnit] = useState<AreaUnit>('tareas');
  const [osmLocationTag, setOsmLocationTag] = useState<string | null>(null);

  // Step 1 Metadata
  const [parcelCode, setParcelCode] = useState('');
  const [title, setTitle] = useState('');
  const [client, setClient] = useState('');
  const [province, setProvince] = useState('');
  const [scheduledDate, setScheduledDate] = useState('2026-11-17');
  const [notes, setNotes] = useState('');

  // Step 2 Services + Route Calculation
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>(['rtk', 'deslinde']);
  const [corridorKm, setCorridorKm] = useState<number>(1);
  const [terrain, setTerrain] = useState<TerrainType>('Llano');
  const [vehicleId, setVehicleId] = useState<string>(VEHICLE_CATALOG[0].id);
  const [fuelPricePerGalRD, setFuelPricePerGalRD] = useState<number>(
    VEHICLE_CATALOG[0].fuelPricePerGalRD
  );
  const [kmPerGal, setKmPerGal] = useState<number>(VEHICLE_CATALOG[0].kmPerGal);
  const [routes, setRoutes] = useState<RouteAlternative[]>([]);
  const [selectedRouteId, setSelectedRouteId] = useState<'economica' | 'rapida'>('economica');
  const [includeTolls, setIncludeTolls] = useState(true);
  const [includeLodging, setIncludeLodging] = useState(false);
  const [isRouting, setIsRouting] = useState(false);

  // Step 3 Assignment & Viáticos Attachment
  const [surveyor, setSurveyor] = useState(SURVEYOR_ROSTER[0]);
  const [equipmentSerial, setEquipmentSerial] = useState(EQUIPMENT_ROSTER[0]);
  const [status, setStatus] = useState<WorkflowStatus>('PROGRAMADO');
  const [attachRouteViaticos, setAttachRouteViaticos] = useState(true);

  const activeVehicle = useMemo(
    () => VEHICLE_CATALOG.find((v) => v.id === vehicleId) ?? VEHICLE_CATALOG[0],
    [vehicleId]
  );

  const activeRoute = useMemo(
    () => routes.find((r) => r.id === selectedRouteId) ?? routes[0],
    [routes, selectedRouteId]
  );

  const servicesSummary = useMemo(() => {
    const areaM2 = parsed?.totalAreaM2 ?? 0;
    const terrainMult = TERRAIN_MULTIPLIER[terrain];
    const items = SERVICE_CATALOG.filter((s) => selectedServiceIds.includes(s.id)).map((svc) => {
      const corridorExtra =
        svc.id === 'ingenieria' && svc.perKmCorridorRD
          ? Math.max(0, corridorKm) * svc.perKmCorridorRD
          : 0;
      const areaSurcharge =
        areaM2 > 10000 ? Math.round(((areaM2 - 10000) / 10000) * 3500) : 0;
      const totalRD = Math.round((svc.basePriceRD + corridorExtra + areaSurcharge) * terrainMult);
      return { ...svc, totalRD };
    });
    return {
      items,
      totalServicesRD: items.reduce((sum, i) => sum + i.totalRD, 0),
    };
  }, [parsed?.totalAreaM2, selectedServiceIds, corridorKm, terrain]);

  const routeBreakdown = useMemo(() => {
    const dist = activeRoute?.distanceOneWayKm ?? parsed?.estimatedViaticos.distanceFromBaseKm ?? 20;
    return computeRouteViaticos({
      distanceOneWayKm: dist,
      oneWayTollRD: activeRoute?.oneWayTollRD ?? 0,
      includeTolls,
      includeLodging,
      fuelPricePerGalRD,
      kmPerGal,
      maintenancePerKmRD: activeVehicle.maintenancePerKmRD,
      areaM2: parsed?.totalAreaM2 ?? 2500,
      terrain,
      serviceCount: selectedServiceIds.length,
    });
  }, [
    activeRoute,
    parsed?.estimatedViaticos.distanceFromBaseKm,
    parsed?.totalAreaM2,
    includeTolls,
    includeLodging,
    fuelPricePerGalRD,
    kmPerGal,
    activeVehicle.maintenancePerKmRD,
    terrain,
    selectedServiceIds.length,
  ]);

  const totalContractRD = servicesSummary.totalServicesRD + routeBreakdown.totalViaticosRD;

  const applyParsedResult = async (res: ParsedKmzResult, template?: SampleKmzTemplate) => {
    setParsed(res);
    setOsmLocationTag(null);

    const meta = res.autoMeta;
    setTitle(meta.title);
    setParcelCode(template?.parcelCode || meta.parcelCode);
    setProvince(template?.province || meta.province);
    setClient(meta.client || (template ? 'Inversiones Territoriales Caribe SRL' : ''));
    setScheduledDate(meta.scheduledDate);
    setNotes(meta.municipality ? `Ubicación: ${meta.municipality} · ${meta.notes}` : meta.notes);

    if (meta.surveyor) {
      const matched = SURVEYOR_ROSTER.find((s) =>
        s.toLowerCase().includes(meta.surveyor!.toLowerCase())
      );
      if (matched) setSurveyor(matched);
    }

    // Fetch optimal OSRM routes for Step 2
    setIsRouting(true);
    fetchOptimalRoutesOSM(res.centroid.lat, res.centroid.lon)
      .then((r) => {
        setRoutes(r);
        if (r[0] && r[0].distanceOneWayKm > 105) {
          setIncludeLodging(true);
        } else {
          setIncludeLodging(false);
        }
      })
      .finally(() => setIsRouting(false));

    // Enrich province/municipality from OpenStreetMap Nominatim
    const osmLoc = await reverseGeocodeOSM(res.centroid.lat, res.centroid.lon);
    if (osmLoc.source === 'osm') {
      if (!template && !res.autoMeta.extractedFields.includes('Provincia (KML)')) {
        setProvince(osmLoc.province);
      }
      const locParts = [osmLoc.locality, osmLoc.municipality, osmLoc.province].filter(Boolean);
      const locLabel = locParts.join(', ');
      setOsmLocationTag(locLabel);
      setNotes((prev) => {
        if (prev.includes(locLabel)) return prev;
        return prev ? `OSM: ${locLabel} · ${prev}` : `Ubicación OSM: ${locLabel}`;
      });
    }
  };

  useEffect(() => {
    if (isOpen && preloadedKmz) {
      setStep(1);
      applyParsedResult(preloadedKmz);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, preloadedKmz]);

  if (!isOpen) return null;

  const handleFile = async (file: File) => {
    setError(null);
    setIsParsing(true);
    try {
      const result = await parseKmzOrKmlFile(file);
      await applyParsedResult(result);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'No se pudo procesar el archivo KMZ/KML.');
    } finally {
      setIsParsing(false);
    }
  };

  const handleLoadSample = async (template: SampleKmzTemplate) => {
    setError(null);
    setIsParsing(true);
    try {
      const file = await buildRealKmzFileFromTemplate(template);
      const result = await parseKmzOrKmlFile(file);
      await applyParsedResult(result, template);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error cargando plantilla KMZ.');
    } finally {
      setIsParsing(false);
    }
  };

  const handleDownloadSampleKmz = async (template: SampleKmzTemplate) => {
    const file = await buildRealKmzFileFromTemplate(template);
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = template.fileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  const buildInitialRouteExpenses = (surveyId: string, finalParcelCode: string): ViaticoExpense[] => {
    if (!attachRouteViaticos || !parsed) return [];
    const now = new Date();
    const dateIso = scheduledDate || now.toISOString().slice(0, 10);
    const tsAST = formatSantoDomingoAST(now);
    const list: ViaticoExpense[] = [];

    if (routeBreakdown.fuelRD > 0) {
      list.push({
        id: `exp-init-fuel-${Date.now()}`,
        surveyId,
        parcelCode: finalParcelCode,
        surveyor,
        category: 'Combustible',
        merchant: `Combustible Ruta · ${activeRoute?.name || 'Traslado Campo'}`,
        amountRD: routeBreakdown.fuelRD,
        itbisRD: 0,
        dateIso,
        timestampAST: tsAST,
        method: 'GPS Ruta',
        distanceKm: routeBreakdown.roundTripKm,
        gpsCoords: {
          lat: parsed.centroid.lat,
          lon: parsed.centroid.lon,
          easting: parsed.centroid.easting,
          northing: parsed.centroid.northing,
        },
        syncStatus: 'pending',
        approved: false,
        notes: `${routeBreakdown.roundTripKm} km ida y vuelta (${routeBreakdown.gallonsNeeded} gal)`,
      });
    }

    if (routeBreakdown.tollsRD > 0) {
      list.push({
        id: `exp-init-toll-${Date.now() + 1}`,
        surveyId,
        parcelCode: finalParcelCode,
        surveyor,
        category: 'Peaje',
        merchant: `RD Vial — ${activeRoute?.tollNote || 'Peajes Ruta'}`,
        amountRD: routeBreakdown.tollsRD,
        itbisRD: 0,
        dateIso,
        timestampAST: tsAST,
        method: 'GPS Ruta',
        distanceKm: routeBreakdown.roundTripKm,
        syncStatus: 'pending',
        approved: false,
        notes: `Peajes ida y vuelta`,
      });
    }

    if (routeBreakdown.perDiemRD > 0) {
      list.push({
        id: `exp-init-diet-${Date.now() + 2}`,
        surveyId,
        parcelCode: finalParcelCode,
        surveyor,
        category: 'Dieta',
        merchant: `Dieta Cuadrilla (${routeBreakdown.fieldDays} día(s))`,
        amountRD: routeBreakdown.perDiemRD,
        itbisRD: 0,
        dateIso,
        timestampAST: tsAST,
        method: 'Dieta Automática',
        syncStatus: 'pending',
        approved: false,
        notes: `Terreno ${terrain} · Servicios: ${selectedServiceIds.join(', ')}`,
      });
    }

    return list;
  };

  const finalizeSurvey = (openMobileExpenseAfter: boolean) => {
    if (!parsed) {
      setError('Carga primero un archivo .KMZ o .KML.');
      setStep(1);
      return;
    }

    const surveyId = `srv-${Date.now()}`;
    const finalParcelCode = parcelCode.trim() || parsed.autoMeta.parcelCode;

    const newSurvey: SurveyProject = {
      id: surveyId,
      parcelCode: finalParcelCode,
      title: title.trim() || parsed.documentName,
      client: client.trim() || 'Propietario por confirmar',
      province: province.trim() || parsed.autoMeta.province,
      surveyor,
      equipmentSerial,
      status,
      scheduledDate,
      updatedAt: new Date().toISOString(),
      budgetViaticosRD: routeBreakdown.totalViaticosRD,
      contractValueRD: totalContractRD,
      kmzFileName: parsed.fileName,
      features: parsed.features,
      centroid: parsed.centroid,
      totalAreaM2: parsed.totalAreaM2,
      totalPerimeterM: parsed.totalPerimeterM,
      syncStatus: 'pending',
      notes: notes.trim() || undefined,
      selectedServices: selectedServiceIds,
      routeSummary: {
        routeName: activeRoute?.name || 'Ruta Directa',
        distanceOneWayKm: activeRoute?.distanceOneWayKm ?? parsed.estimatedViaticos.distanceFromBaseKm,
        durationMin: activeRoute?.durationMin ?? 35,
        tollsRD: routeBreakdown.tollsRD,
        fuelRD: routeBreakdown.fuelRD,
        vehicleLabel: activeVehicle.label,
      },
    };

    const initialExpenses = buildInitialRouteExpenses(surveyId, finalParcelCode);
    onCreateSurvey(newSurvey, {
      initialExpenses,
      openMobileExpenseAfter,
    });
    setParsed(null);
    setStep(1);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0F2942]/65 p-3 sm:p-4 overflow-y-auto">
      <div className="w-full max-w-3xl rounded-md border border-[#CBD5E1] bg-white shadow-2xl my-auto max-h-[94vh] flex flex-col">
        {/* Header + 3-Step Flow Progress */}
        <div className="border-b border-[#E2E8F0] px-5 py-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-[#0D1C2F]">
                Flujo de Levantamiento KMZ y Viáticos
              </h2>
              <p className="text-xs text-[#43474D]">
                Carga el polígono, suma servicios, calcula la ruta vial y adjunta los viáticos en 3 pasos.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-sm p-1.5 text-[#43474D] hover:bg-[#F1F5F9]"
              aria-label="Cerrar modal"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {(
              [
                { num: 1, label: '1. Polígono KMZ' },
                { num: 2, label: '2. Servicios y Ruta' },
                { num: 3, label: '3. Brigada y Viáticos' },
              ] as const
            ).map((item) => {
              const isActive = step === item.num;
              const isDone = step > item.num;
              const canJump = item.num === 1 || !!parsed;
              return (
                <button
                  key={item.num}
                  type="button"
                  disabled={!canJump}
                  onClick={() => canJump && setStep(item.num)}
                  className={`rounded-sm border px-2.5 py-2 text-left text-xs font-semibold transition-colors disabled:opacity-40 ${
                    isActive
                      ? 'border-[#0F2942] bg-[#0F2942] text-white'
                      : isDone
                      ? 'border-[#86EFAC] bg-[#F0FDF4] text-[#15803D]'
                      : 'border-[#E2E8F0] bg-[#F8FAFC] text-[#43474D]'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Scrollable Step Body */}
        <div className="overflow-y-auto p-5 space-y-4 flex-1">
          {error && (
            <div className="rounded-sm border border-[#FCA5A5] bg-[#FEE2E2] px-3 py-2 text-xs font-medium text-[#93000A]">
              {error}
            </div>
          )}

          {/* STEP 1: KMZ UPLOAD, AUTO-FILL & OSM PREVIEW */}
          {step === 1 && (
            <div className="space-y-4">
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const f = e.dataTransfer.files?.[0];
                  if (f) handleFile(f);
                }}
                onClick={() => fileInputRef.current?.click()}
                className="cursor-pointer rounded-md border border-dashed border-[#0284C7] bg-[#F8FAFC] p-4 text-center hover:bg-[#EFF4FF] transition-colors"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".kmz,.kml"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFile(f);
                  }}
                />
                <UploadCloud className="mx-auto h-7 w-7 text-[#0284C7]" />
                <p className="mt-1.5 text-sm font-semibold text-[#0F2942]">
                  {isParsing
                    ? 'Descomprimiendo KMZ, proyectando UTM 19N y consultando OpenStreetMap...'
                    : 'Arrastra tu archivo .KMZ o .KML aquí, o haz clic para seleccionarlo'}
                </p>
                <p className="mt-0.5 text-xs text-[#43474D]">
                  Extrae polígonos, ExtendedData, fecha, provincia y área automáticamente
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {SAMPLE_KMZ_TEMPLATES.map((tpl) => (
                  <div
                    key={tpl.key}
                    className="flex items-center justify-between gap-2 rounded-sm border border-[#CBD5E1] bg-white px-3 py-2"
                  >
                    <button
                      type="button"
                      onClick={() => handleLoadSample(tpl)}
                      className="flex items-center gap-2 text-left text-xs font-medium text-[#0F2942] hover:text-[#0284C7] min-w-0"
                    >
                      <FileUp className="h-4 w-4 shrink-0 text-[#0284C7]" />
                      <span className="truncate">{tpl.label}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDownloadSampleKmz(tpl)}
                      title="Descargar archivo .kmz real"
                      className="rounded-sm p-1.5 text-[#43474D] hover:bg-[#F1F5F9] shrink-0"
                    >
                      <Download className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>

              {parsed && (
                <>
                  <div className="rounded-md border border-[#86EFAC] bg-[#F0FDF4] p-3 text-xs space-y-1.5">
                    <div className="flex items-center justify-between font-semibold text-[#15803D]">
                      <span className="inline-flex items-center gap-1.5">
                        <CheckCircle2 className="h-4 w-4" />
                        KMZ procesado: {parsed.fileName}
                      </span>
                      <span className="font-mono text-[11px]">
                        {formatArea(parsed.totalAreaM2, 'tareas')} · {formatPerimeter(parsed.totalPerimeterM)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[11px] text-[#166534]">
                      <Sparkles className="h-3.5 w-3.5 shrink-0" />
                      <span>
                        Autollenado: {parsed.autoMeta.extractedFields.join(' · ')}
                        {osmLocationTag ? ` · OSM (${osmLocationTag})` : ''}
                      </span>
                    </div>
                  </div>

                  <KmzOsmViewer
                    parcelCode={parcelCode || parsed.autoMeta.parcelCode}
                    fileName={parsed.fileName}
                    features={parsed.features}
                    centroid={parsed.centroid}
                    totalAreaM2={parsed.totalAreaM2}
                    totalPerimeterM={parsed.totalPerimeterM}
                    areaUnit={previewUnit}
                    onChangeAreaUnit={setPreviewUnit}
                    compact={true}
                  />

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div>
                      <label className="block font-semibold text-[#334155] mb-1">Código Catastral</label>
                      <input
                        type="text"
                        value={parcelCode}
                        onChange={(e) => setParcelCode(e.target.value)}
                        className="w-full rounded-sm border border-[#CBD5E1] px-3 py-2 font-mono text-xs text-[#0D1C2F]"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-[#334155] mb-1">Nombre del Levantamiento</label>
                      <input
                        type="text"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        className="w-full rounded-sm border border-[#CBD5E1] px-3 py-2 text-xs text-[#0D1C2F]"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-[#334155] mb-1">Cliente / Propietario</label>
                      <input
                        type="text"
                        value={client}
                        onChange={(e) => setClient(e.target.value)}
                        placeholder="Extraído del KML o ingresar si no consta"
                        className="w-full rounded-sm border border-[#CBD5E1] px-3 py-2 text-xs text-[#0D1C2F]"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-[#334155] mb-1">Provincia</label>
                      <input
                        type="text"
                        value={province}
                        onChange={(e) => setProvince(e.target.value)}
                        className="w-full rounded-sm border border-[#CBD5E1] px-3 py-2 text-xs text-[#0D1C2F]"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-[#334155] mb-1">Fecha Programada</label>
                      <input
                        type="date"
                        value={scheduledDate}
                        onChange={(e) => setScheduledDate(e.target.value)}
                        className="w-full rounded-sm border border-[#CBD5E1] px-3 py-2 font-mono text-xs text-[#0D1C2F]"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-[#334155] mb-1">Notas de Campo</label>
                      <input
                        type="text"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        className="w-full rounded-sm border border-[#CBD5E1] px-3 py-2 text-xs text-[#0D1C2F]"
                      />
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* STEP 2: ADDITIVE SERVICES + OSM ROUTE VIATICOS */}
          {step === 2 && parsed && (
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-bold text-[#0F2942]">
                    Servicios Técnicos Sumatorios ({selectedServiceIds.length} activos)
                  </h3>
                  <span className="font-mono text-xs font-bold text-[#0284C7] tabular-nums">
                    Subtotal servicios: {formatRD(servicesSummary.totalServicesRD)}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {SERVICE_CATALOG.map((svc) => {
                    const checked = selectedServiceIds.includes(svc.id);
                    return (
                      <button
                        key={svc.id}
                        type="button"
                        onClick={() =>
                          setSelectedServiceIds((prev) =>
                            prev.includes(svc.id)
                              ? prev.filter((x) => x !== svc.id)
                              : [...prev, svc.id]
                          )
                        }
                        className={`flex items-center justify-between gap-2 rounded-sm border px-3 py-2 text-left transition-colors ${
                          checked
                            ? 'border-[#0F2942] bg-[#0F2942] text-white'
                            : 'border-[#CBD5E1] bg-white text-[#0D1C2F] hover:bg-[#F8FAFC]'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border ${
                              checked
                                ? 'border-[#FBBF24] bg-[#FBBF24] text-[#0F2942]'
                                : 'border-[#94A3B8] bg-white'
                            }`}
                          >
                            {checked && <Check className="h-3 w-3 stroke-[3]" />}
                          </span>
                          <div className="min-w-0">
                            <div className="text-xs font-bold">{svc.name}</div>
                            <div className={`text-[11px] ${checked ? 'text-[#CBD5E1]' : 'text-[#43474D]'}`}>
                              {svc.subtitle}
                            </div>
                          </div>
                        </div>
                        <span
                          className={`font-mono text-xs font-bold tabular-nums ${
                            checked ? 'text-[#FBBF24]' : 'text-[#0F2942]'
                          }`}
                        >
                          + {formatRD(svc.basePriceRD).replace('.00', '')}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {selectedServiceIds.includes('ingenieria') && (
                  <div className="mt-2 flex items-center justify-between gap-3 rounded-sm border border-[#CBD5E1] bg-[#F8FAFC] px-3 py-2 text-xs">
                    <span className="font-semibold text-[#0F2942]">
                      Longitud corredor vial (km @ RD$ 10,000/km):
                    </span>
                    <input
                      type="number"
                      min={0}
                      step={0.5}
                      value={corridorKm}
                      onChange={(e) => setCorridorKm(Math.max(0, Number(e.target.value)))}
                      className="w-24 rounded-sm border border-[#CBD5E1] bg-white px-2 py-1 font-mono text-xs"
                    />
                  </div>
                )}
              </div>

              {/* Terrain & Vehicle */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block font-bold text-[#0F2942] mb-1">Topografía</label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(['Llano', 'Ondulado', 'Montañoso'] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setTerrain(t)}
                        className={`rounded-sm border py-2 font-semibold ${
                          terrain === t
                            ? 'border-[#0F2942] bg-[#0F2942] text-white'
                            : 'border-[#CBD5E1] bg-white text-[#334155]'
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block font-bold text-[#0F2942] mb-1">Vehículo de Cuadrilla</label>
                  <select
                    value={vehicleId}
                    onChange={(e) => {
                      setVehicleId(e.target.value);
                      const v = VEHICLE_CATALOG.find((x) => x.id === e.target.value);
                      if (v) {
                        setFuelPricePerGalRD(v.fuelPricePerGalRD);
                        setKmPerGal(v.kmPerGal);
                      }
                    }}
                    className="w-full rounded-sm border border-[#CBD5E1] bg-white px-2.5 py-2 text-xs"
                  >
                    {VEHICLE_CATALOG.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Routes Comparison */}
              <div className="rounded-md border border-[#CBD5E1] bg-[#F8FAFC] p-3.5 space-y-2.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="inline-flex items-center gap-1.5 font-bold text-[#0F2942]">
                    <Route className="h-4 w-4 text-[#0284C7]" />
                    Rutas OpenStreetMap (Ida y Vuelta)
                  </span>
                  <span className="font-mono text-[11px] text-[#0284C7]">
                    {isRouting ? 'Calculando ruta...' : `${routeBreakdown.roundTripKm} km ida/vuelta`}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {routes.map((r) => {
                    const b = computeRouteViaticos({
                      distanceOneWayKm: r.distanceOneWayKm,
                      oneWayTollRD: r.oneWayTollRD,
                      includeTolls,
                      includeLodging,
                      fuelPricePerGalRD,
                      kmPerGal,
                      maintenancePerKmRD: activeVehicle.maintenancePerKmRD,
                      areaM2: parsed.totalAreaM2,
                      terrain,
                      serviceCount: selectedServiceIds.length,
                    });
                    const active = r.id === activeRoute?.id;
                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => setSelectedRouteId(r.id)}
                        className={`rounded-sm border p-2.5 text-left ${
                          active
                            ? 'border-2 border-[#0F2942] bg-white'
                            : 'border-[#CBD5E1] bg-white/70 hover:bg-white'
                        }`}
                      >
                        <div className="flex justify-between items-center text-[11px]">
                          <span className="font-bold text-[#0284C7]">{r.badge}</span>
                          <span className="font-mono font-bold text-[#0F2942] tabular-nums">
                            {formatRD(b.totalViaticosRD)}
                          </span>
                        </div>
                        <div className="text-xs font-bold text-[#0D1C2F] mt-0.5">{r.name}</div>
                        <div className="font-mono text-[11px] text-[#43474D]">
                          {r.distanceOneWayKm} km ida · {r.tollNote}
                        </div>
                      </button>
                    );
                  })}
                </div>

                <div className="flex flex-wrap items-center gap-4 pt-1 text-xs">
                  <label className="inline-flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={includeTolls}
                      onChange={(e) => setIncludeTolls(e.target.checked)}
                      className="accent-[#0F2942]"
                    />
                    Incluir peajes ida y vuelta
                  </label>
                  <label className="inline-flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={includeLodging}
                      onChange={(e) => setIncludeLodging(e.target.checked)}
                      className="accent-[#0F2942]"
                    />
                    Pernocta / hospedaje cuadrilla
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: BRIGADE ASSIGNMENT & ATTACH VIATICOS */}
          {step === 3 && parsed && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div>
                  <label className="block font-semibold text-[#334155] mb-1">Agrimensor Responsable</label>
                  <select
                    value={surveyor}
                    onChange={(e) => setSurveyor(e.target.value)}
                    className="w-full rounded-sm border border-[#CBD5E1] bg-white px-3 py-2 text-xs text-[#0D1C2F]"
                  >
                    {SURVEYOR_ROSTER.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-[#334155] mb-1">Equipo GNSS RTK</label>
                  <select
                    value={equipmentSerial}
                    onChange={(e) => setEquipmentSerial(e.target.value)}
                    className="w-full rounded-sm border border-[#CBD5E1] bg-white px-3 py-2 font-mono text-xs text-[#0D1C2F]"
                  >
                    {EQUIPMENT_ROSTER.map((eq) => (
                      <option key={eq} value={eq}>
                        {eq}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-[#334155] mb-1">Estado Inicial</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as WorkflowStatus)}
                    className="w-full rounded-sm border border-[#CBD5E1] bg-white px-3 py-2 text-xs text-[#0D1C2F]"
                  >
                    <option value="COTIZADO">COTIZADO</option>
                    <option value="APROBADO">APROBADO</option>
                    <option value="PROGRAMADO">PROGRAMADO</option>
                    <option value="EN CAMPO">EN CAMPO</option>
                  </select>
                </div>
              </div>

              {/* Financial Summary */}
              <div className="rounded-md border border-[#CBD5E1] bg-[#F8FAFC] p-4 space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-[#43474D]">
                    Servicios Sumatorios ({servicesSummary.items.map((i) => i.name).join(' + ') || 'Ninguno'})
                  </span>
                  <span className="font-mono font-semibold tabular-nums">
                    {formatRD(servicesSummary.totalServicesRD)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#43474D]">
                    Presupuesto Viáticos ({activeRoute?.name || 'Ruta'} · {routeBreakdown.roundTripKm} km)
                  </span>
                  <span className="font-mono font-semibold text-[#0284C7] tabular-nums">
                    {formatRD(routeBreakdown.totalViaticosRD)}
                  </span>
                </div>
                <div className="flex justify-between border-t border-[#CBD5E1] pt-2 text-sm font-bold text-[#0F2942]">
                  <span>Inversión Total Estimada</span>
                  <span className="font-mono tabular-nums">{formatRD(totalContractRD)}</span>
                </div>
              </div>

              {/* Attach Viáticos Option */}
              <div className="rounded-md border border-[#0284C7]/40 bg-[#EFF6FF] p-4 space-y-2">
                <label className="flex items-start gap-2.5 cursor-pointer text-xs">
                  <input
                    type="checkbox"
                    checked={attachRouteViaticos}
                    onChange={(e) => setAttachRouteViaticos(e.target.checked)}
                    className="mt-0.5 accent-[#0F2942]"
                  />
                  <div>
                    <div className="font-bold text-[#0F2942]">
                      Adjuntar automáticamente viáticos iniciales de ruta al guardar
                    </div>
                    <p className="mt-0.5 text-[#334155]">
                      Genera en el libro de viáticos: Combustible ({formatRD(routeBreakdown.fuelRD)}),
                      Peajes ({formatRD(routeBreakdown.tollsRD)}) y Dieta ({formatRD(routeBreakdown.perDiemRD)}).
                    </p>
                  </div>
                </label>
              </div>
            </div>
          )}
        </div>

        {/* Stepper Footer Actions */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 border-t border-[#E2E8F0] px-5 py-4 bg-[#F8FAFC]">
          <div>
            {step > 1 && (
              <button
                type="button"
                onClick={() => setStep((s) => (s === 3 ? 2 : 1))}
                className="inline-flex items-center gap-1.5 rounded-sm border border-[#CBD5E1] bg-white px-3.5 py-2 text-xs font-semibold text-[#334155] hover:bg-[#F1F5F9] min-h-[40px]"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Anterior
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-sm border border-[#CBD5E1] bg-white px-3.5 py-2 text-xs font-semibold text-[#334155] hover:bg-[#F1F5F9] min-h-[40px]"
            >
              Cancelar
            </button>

            {step < 3 ? (
              <button
                type="button"
                disabled={!parsed}
                onClick={() => {
                  if (!parsed) {
                    setError('Carga primero un archivo .KMZ o .KML.');
                    return;
                  }
                  setStep((s) => (s === 1 ? 2 : 3));
                }}
                className="inline-flex items-center gap-1.5 rounded-sm bg-[#0F2942] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0284C7] disabled:opacity-40 transition-colors min-h-[40px]"
              >
                <span>{step === 1 ? 'Continuar a Servicios y Ruta' : 'Continuar a Brigada y Viáticos'}</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => finalizeSurvey(false)}
                  className="inline-flex items-center gap-1.5 rounded-sm bg-[#0F2942] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0284C7] transition-colors min-h-[40px]"
                >
                  <Receipt className="h-3.5 w-3.5" />
                  Guardar Levantamiento
                </button>
                <button
                  type="button"
                  onClick={() => finalizeSurvey(true)}
                  className="inline-flex items-center gap-1.5 rounded-sm bg-[#0284C7] px-4 py-2 text-xs font-semibold text-white hover:bg-[#006398] transition-colors min-h-[40px]"
                >
                  <Camera className="h-3.5 w-3.5" />
                  Guardar y Adjuntar Recibo Móvil
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
