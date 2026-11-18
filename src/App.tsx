import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Camera,
  CheckCircle2,
  Compass,
  FileSpreadsheet,
  FileUp,
  FolderKanban,
  HardHat,
  Layers,
  MapPin,
  Plus,
  Receipt,
  Route,
  Search,
  Trash2,
  Users,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { KmzImportModal } from './components/KmzImportModal';
import { KmzOsmViewer } from './components/KmzOsmViewer';
import { MobileExpenseCaptureModal } from './components/MobileExpenseCaptureModal';
import { OfflineSyncBanner } from './components/OfflineSyncBanner';
import { PWAInstallButton } from './components/PWAInstallButton';
import { ResourceConflictModal } from './components/ResourceConflictModal';
import { RouteServicesCalculator } from './components/RouteServicesCalculator';
import { ViaticosComparisonChart } from './components/ViaticosComparisonChart';
import { WorkflowBadge } from './components/WorkflowBadge';
import {
  EQUIPMENT_ROSTER,
  INITIAL_EXPENSES,
  INITIAL_SURVEYS,
  SURVEYOR_ROSTER,
} from './data/initialData';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import type {
  AreaUnit,
  ConflictDetail,
  GeoPoint,
  SurveyProject,
  UserRole,
  ViaticoExpense,
  WorkflowStatus,
} from './types/geodesy';
import {
  formatArea,
  formatPerimeter,
  formatRD,
  haversineMeters,
  latLonToUtm19N,
} from './utils/geodesy';
import { parseKmzOrKmlFile, type ParsedKmzResult } from './utils/kmzParser';

type ActiveTab = 'surveys' | 'routes' | 'map' | 'expenses' | 'brigades';

const WORKFLOW_STATES: WorkflowStatus[] = [
  'COTIZADO',
  'APROBADO',
  'PROGRAMADO',
  'EN CAMPO',
  'PROCESANDO',
  'ENTREGADO',
  'COBRADO',
];

const STORAGE_KEYS = {
  surveys: 'geomatrix_surveys_v1',
  expenses: 'geomatrix_expenses_v1',
};

function loadLocal<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

export default function App() {
  const isOnline = useOnlineStatus();
  const viewerFileInputRef = useRef<HTMLInputElement>(null);

  const [surveys, setSurveys] = useState<SurveyProject[]>(() =>
    loadLocal<SurveyProject[]>(STORAGE_KEYS.surveys, INITIAL_SURVEYS)
  );
  const [expenses, setExpenses] = useState<ViaticoExpense[]>(() =>
    loadLocal<ViaticoExpense[]>(STORAGE_KEYS.expenses, INITIAL_EXPENSES)
  );

  const [activeTab, setActiveTab] = useState<ActiveTab>('surveys');
  const [selectedSurveyId, setSelectedSurveyId] = useState<string>(
    () => loadLocal<SurveyProject[]>(STORAGE_KEYS.surveys, INITIAL_SURVEYS)[0]?.id ?? 'srv-01'
  );
  const [standaloneKmz, setStandaloneKmz] = useState<ParsedKmzResult | null>(null);
  const [preloadedKmzForModal, setPreloadedKmzForModal] = useState<ParsedKmzResult | null>(null);

  const [role, setRole] = useState<UserRole>('Coordinador');
  const [areaUnit, setAreaUnit] = useState<AreaUnit>('tareas');

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<WorkflowStatus | 'ALL'>('ALL');
  const [surveyorFilter, setSurveyorFilter] = useState<string>('ALL');

  // Modals & Interactive States
  const [isKmzModalOpen, setIsKmzModalOpen] = useState(false);
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [pendingSurveyForConflict, setPendingSurveyForConflict] = useState<{
    survey: SurveyProject;
    initialExpenses?: ViaticoExpense[];
    openMobileExpenseAfter?: boolean;
  } | null>(null);
  const [conflicts, setConflicts] = useState<ConflictDetail[]>([]);

  // Live GPS & Sync
  const [liveGpsPoint, setLiveGpsPoint] = useState<GeoPoint | null>(null);
  const [isCapturingGps, setIsCapturingGps] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 4000);
  };

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.surveys, JSON.stringify(surveys));
    } catch {
      // Ignore quota errors
    }
  }, [surveys]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.expenses, JSON.stringify(expenses));
    } catch {
      // Ignore quota errors
    }
  }, [expenses]);

  const pendingCount = useMemo(() => {
    const sCount = surveys.filter((s) => s.syncStatus !== 'synced').length;
    const eCount = expenses.filter((e) => e.syncStatus !== 'synced').length;
    return sCount + eCount;
  }, [surveys, expenses]);

  const hasConflict = useMemo(
    () => surveys.some((s) => s.syncStatus === 'conflict'),
    [surveys]
  );

  const handleSyncNow = async () => {
    if (!isOnline || isSyncing) return;
    setIsSyncing(true);
    try {
      const updatedExpenses = [...expenses];

      for (let i = 0; i < updatedExpenses.length; i++) {
        const exp = updatedExpenses[i];
        if (exp.syncStatus === 'needs_ocr' && exp.pendingReceiptBase64) {
          try {
            const ocrRes = await fetch('/api/expenses/analyze-receipt', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                imageBase64: exp.pendingReceiptBase64,
                mimeType: exp.pendingReceiptMime || 'image/jpeg',
                surveyCode: exp.parcelCode,
              }),
            });
            if (ocrRes.ok) {
              const ocrJson = await ocrRes.json();
              const ex = ocrJson.extracted;
              updatedExpenses[i] = {
                ...exp,
                merchant: ex.merchant || exp.merchant,
                amountRD:
                  typeof ex.amountRD === 'number' && ex.amountRD > 0 ? ex.amountRD : exp.amountRD,
                itbisRD: typeof ex.itbisRD === 'number' ? ex.itbisRD : exp.itbisRD,
                ncf: ex.ncf || exp.ncf,
                dateIso: ex.dateIso || exp.dateIso,
                notes: ex.notes || exp.notes,
                pendingReceiptBase64: undefined,
                syncStatus: 'synced',
              };
            }
          } catch {
            // Keep pending if OCR failed
          }
        }
      }

      const syncedSurveys = surveys.map((s) => ({ ...s, syncStatus: 'synced' as const }));
      const syncedExpenses = updatedExpenses.map((e) =>
        e.syncStatus === 'needs_ocr' ? e : { ...e, syncStatus: 'synced' as const }
      );

      const res = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          surveys: syncedSurveys,
          expenses: syncedExpenses,
        }),
      });

      if (!res.ok) {
        throw new Error('Fallo la sincronización con el servidor.');
      }

      setSurveys(syncedSurveys);
      setExpenses(syncedExpenses);
      showToast('Sincronización completada con respaldo en servidor.');
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'No se pudo completar la sincronización.');
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    if (isOnline && pendingCount > 0) {
      handleSyncNow();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline]);

  const selectedSurvey = useMemo(
    () => surveys.find((s) => s.id === selectedSurveyId) ?? surveys[0],
    [surveys, selectedSurveyId]
  );

  const filteredSurveys = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return surveys.filter((s) => {
      const matchesQuery =
        !q ||
        s.parcelCode.toLowerCase().includes(q) ||
        s.title.toLowerCase().includes(q) ||
        s.client.toLowerCase().includes(q) ||
        s.province.toLowerCase().includes(q);
      const matchesStatus = statusFilter === 'ALL' || s.status === statusFilter;
      const matchesSurveyor = surveyorFilter === 'ALL' || s.surveyor === surveyorFilter;
      return matchesQuery && matchesStatus && matchesSurveyor;
    });
  }, [surveys, searchQuery, statusFilter, surveyorFilter]);

  const expenseTotalsBySurvey = useMemo(() => {
    const map: Record<string, number> = {};
    for (const exp of expenses) {
      map[exp.surveyId] = (map[exp.surveyId] || 0) + exp.amountRD;
    }
    return map;
  }, [expenses]);

  const kpis = useMemo(() => {
    const activeCount = surveys.filter((s) => s.status !== 'COBRADO').length;
    const totalAreaM2 = surveys.reduce((sum, s) => sum + s.totalAreaM2, 0);
    const totalBudgetViaticos = surveys.reduce((sum, s) => sum + s.budgetViaticosRD, 0);
    const totalSpentViaticos = expenses.reduce((sum, e) => sum + e.amountRD, 0);
    return {
      activeCount,
      totalAreaM2,
      totalBudgetViaticos,
      totalSpentViaticos,
    };
  }, [surveys, expenses]);

  const detectResourceConflicts = (candidate: SurveyProject): ConflictDetail[] => {
    const found: ConflictDetail[] = [];
    for (const existing of surveys) {
      if (existing.id === candidate.id) continue;
      if (existing.scheduledDate === candidate.scheduledDate && existing.surveyor === candidate.surveyor) {
        found.push({
          type: 'surveyor',
          message: `${candidate.surveyor} ya está asignado el ${candidate.scheduledDate}`,
          conflictingSurveyCode: existing.parcelCode,
          conflictingSurveyTitle: existing.title,
        });
      }
      if (
        existing.scheduledDate === candidate.scheduledDate &&
        existing.equipmentSerial === candidate.equipmentSerial
      ) {
        found.push({
          type: 'equipment',
          message: `El equipo ${candidate.equipmentSerial} está reservado para el ${candidate.scheduledDate}`,
          conflictingSurveyCode: existing.parcelCode,
          conflictingSurveyTitle: existing.title,
        });
      }
      const dist = haversineMeters(
        existing.centroid.lat,
        existing.centroid.lon,
        candidate.centroid.lat,
        candidate.centroid.lon
      );
      if (dist < 120) {
        found.push({
          type: 'spatial',
          message: `Proximidad espacial de ${dist.toFixed(0)} m respecto a parcela existente`,
          conflictingSurveyCode: existing.parcelCode,
          conflictingSurveyTitle: existing.title,
        });
      }
    }
    return found;
  };

  const commitSurveyCreation = (
    candidate: SurveyProject,
    options?: {
      initialExpenses?: ViaticoExpense[];
      openMobileExpenseAfter?: boolean;
    }
  ) => {
    setSurveys((prev) => [candidate, ...prev]);
    if (options?.initialExpenses && options.initialExpenses.length > 0) {
      setExpenses((prev) => [...options.initialExpenses!, ...prev]);
    }
    setSelectedSurveyId(candidate.id);
    setStandaloneKmz(null);
    setPreloadedKmzForModal(null);

    if (options?.openMobileExpenseAfter) {
      setActiveTab('expenses');
      setIsExpenseModalOpen(true);
      showToast(
        `Levantamiento ${candidate.parcelCode} creado. Adjunta ahora tu comprobante móvil.`
      );
    } else {
      setActiveTab('surveys');
      const expMsg =
        options?.initialExpenses && options.initialExpenses.length > 0
          ? ` con ${options.initialExpenses.length} viático(s) inicial(es)`
          : '';
      showToast(`Levantamiento ${candidate.parcelCode} registrado${expMsg}.`);
    }
  };

  const handleCreateSurvey = (
    candidate: SurveyProject,
    options?: {
      initialExpenses?: ViaticoExpense[];
      openMobileExpenseAfter?: boolean;
    }
  ) => {
    const found = detectResourceConflicts(candidate);
    if (found.length > 0) {
      setPendingSurveyForConflict({
        survey: candidate,
        initialExpenses: options?.initialExpenses,
        openMobileExpenseAfter: options?.openMobileExpenseAfter,
      });
      setConflicts(found);
      return;
    }
    commitSurveyCreation(candidate, options);
  };

  const handleOpenKmzInViewer = async (file: File) => {
    try {
      const parsed = await parseKmzOrKmlFile(file);
      setStandaloneKmz(parsed);
      setActiveTab('map');
      showToast(`Visualizando ${parsed.fileName} en OpenStreetMap.`);
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'No se pudo abrir el archivo KMZ/KML.');
    }
  };

  const handleStatusChange = (surveyId: string, newStatus: WorkflowStatus) => {
    setSurveys((prev) =>
      prev.map((s) =>
        s.id === surveyId
          ? {
              ...s,
              status: newStatus,
              updatedAt: new Date().toISOString(),
              syncStatus: 'pending',
            }
          : s
      )
    );
  };

  const handleAddExpense = (expense: ViaticoExpense) => {
    setExpenses((prev) => [expense, ...prev]);
    showToast(
      isOnline
        ? `Viático de ${formatRD(expense.amountRD)} registrado para ${expense.parcelCode}.`
        : `Viático guardado en cola offline (${expense.parcelCode}).`
    );
  };

  const handleToggleApproveExpense = (expenseId: string) => {
    if (role !== 'Coordinador') return;
    setExpenses((prev) =>
      prev.map((e) =>
        e.id === expenseId ? { ...e, approved: !e.approved, syncStatus: 'pending' } : e
      )
    );
  };

  const handleDeleteExpense = (expenseId: string) => {
    setExpenses((prev) => prev.filter((e) => e.id !== expenseId));
    showToast('Registro de viático eliminado.');
  };

  const handleCaptureLiveGps = () => {
    const activeCentroid = standaloneKmz?.centroid ?? selectedSurvey?.centroid;
    setIsCapturingGps(true);
    if (!navigator.geolocation) {
      if (activeCentroid) {
        setLiveGpsPoint(
          latLonToUtm19N(activeCentroid.lat + 0.0004, activeCentroid.lon - 0.0003, 16)
        );
        showToast('Posición simulada sobre vértice del polígono.');
      }
      setIsCapturingGps(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const pt = latLonToUtm19N(
          pos.coords.latitude,
          pos.coords.longitude,
          pos.coords.altitude ?? 15
        );
        setLiveGpsPoint(pt);
        setIsCapturingGps(false);
        showToast(`GPS fijado: ${pt.easting.toFixed(1)}E · ${pt.northing.toFixed(1)}N`);
      },
      () => {
        if (activeCentroid) {
          const pt = latLonToUtm19N(
            activeCentroid.lat + 0.00035,
            activeCentroid.lon - 0.00025,
            activeCentroid.elev
          );
          setLiveGpsPoint(pt);
          showToast('Permiso GPS bloqueado; mostrando referencia de parcela.');
        }
        setIsCapturingGps(false);
      },
      { enableHighAccuracy: true, timeout: 6000 }
    );
  };

  const handleExportExpensesCsv = () => {
    const header =
      'Fecha,Hora_AST,Parcela,Agrimensor,Categoria,Comercio,NCF,ITBIS_RD,Monto_RD,Metodo,Aprobado,Notas\n';
    const rows = expenses
      .map(
        (e) =>
          `${e.dateIso},"${e.timestampAST}",${e.parcelCode},"${e.surveyor}",${e.category},"${e.merchant.replace(
            /"/g,
            '""'
          )}",${e.ncf || ''},${e.itbisRD.toFixed(2)},${e.amountRD.toFixed(2)},${e.method},${
            e.approved ? 'SI' : 'PENDIENTE'
          },"${(e.notes || '').replace(/"/g, '""')}"`
      )
      .join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `viaticos_geomatrix_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Active KMZ object being visualized in OpenStreetMap tab
  const viewerFeatures = standaloneKmz?.features ?? selectedSurvey?.features ?? [];
  const viewerCentroid = standaloneKmz?.centroid ?? selectedSurvey?.centroid ?? latLonToUtm19N(18.4861, -69.9312, 14);
  const viewerParcelCode = standaloneKmz?.autoMeta.parcelCode ?? selectedSurvey?.parcelCode ?? 'KMZ-PREVIEW';
  const viewerFileName = standaloneKmz?.fileName ?? selectedSurvey?.kmzFileName ?? '';
  const viewerAreaM2 = standaloneKmz?.totalAreaM2 ?? selectedSurvey?.totalAreaM2 ?? 0;
  const viewerPerimeterM = standaloneKmz?.totalPerimeterM ?? selectedSurvey?.totalPerimeterM ?? 0;

  return (
    <div className="min-h-screen flex flex-col bg-[#F8FAFC] text-[#0D1C2F]">
      {/* Persistent PWA Offline & Synchronization Banner */}
      <OfflineSyncBanner
        isOnline={isOnline}
        pendingCount={pendingCount}
        hasConflict={hasConflict}
        isSyncing={isSyncing}
        onSyncNow={handleSyncNow}
      />

      <div className="flex flex-1 min-h-0">
        {/* Desktop Sidebar */}
        <aside className="hidden lg:flex lg:w-64 lg:flex-col bg-[#0F2942] text-white shrink-0">
          <div className="px-5 py-5 border-b border-[#1E3A5F]">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-sm bg-[#0284C7] text-white">
                <Compass className="h-4 w-4" />
              </div>
              <span className="text-base font-bold tracking-tight whitespace-nowrap">
                GeoMatrix RD
              </span>
            </div>
            <p className="mt-1.5 text-[11px] text-[#93CCFF]">
              Operaciones Geodésicas & Viáticos
            </p>
          </div>

          <nav className="flex-1 p-3 space-y-1">
            {(
              [
                { id: 'surveys', label: 'Levantamientos KMZ', icon: FolderKanban },
                { id: 'routes', label: 'Rutas y Servicios', icon: Route },
                { id: 'map', label: 'Visualizador KMZ (OSM)', icon: Layers },
                { id: 'expenses', label: 'Viáticos y Gastos', icon: Receipt },
                { id: 'brigades', label: 'Brigadas y Equipos', icon: Users },
              ] as const
            ).map((item) => {
              const Icon = item.icon;
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`w-full flex items-center gap-3 rounded-sm px-3 py-2.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                    active
                      ? 'bg-[#0284C7] text-white'
                      : 'text-[#CBD5E1] hover:bg-[#1E3A5F] hover:text-white'
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Role Switcher & Quick Field Trigger */}
          <div className="p-4 border-t border-[#1E3A5F] space-y-3">
            <div>
              <div className="text-[11px] text-[#93CCFF] mb-1.5 font-medium">Perfil Activo</div>
              <div className="grid grid-cols-2 gap-1 rounded-sm bg-[#091A2C] p-1">
                {(['Coordinador', 'Topógrafo'] as const).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRole(r)}
                    className={`rounded-sm py-1.5 text-[11px] font-semibold transition-colors ${
                      role === r ? 'bg-[#0284C7] text-white' : 'text-[#94A3B8] hover:text-white'
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsExpenseModalOpen(true)}
              className="w-full flex items-center justify-center gap-2 rounded-sm border border-[#5BB8FE]/40 bg-[#1E3A8A]/70 px-3 py-2.5 text-xs font-semibold text-white hover:bg-[#0284C7] transition-colors"
            >
              <Camera className="h-3.5 w-3.5" />
              Reportar Gasto Móvil
            </button>
          </div>
        </aside>

        {/* Main Viewport */}
        <div className="flex-1 flex flex-col min-w-0 pb-20 lg:pb-0">
          {/* Top Utility Header */}
          <header className="sticky top-0 z-30 flex items-center justify-between gap-4 border-b border-[#CBD5E1] bg-white/95 backdrop-blur px-4 sm:px-6 h-14">
            <div className="flex items-center gap-3 min-w-0">
              <div className="lg:hidden flex h-8 w-8 items-center justify-center rounded-sm bg-[#0F2942] text-white shrink-0">
                <Compass className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <h1 className="text-sm sm:text-base font-bold text-[#0D1C2F] truncate">
                  {activeTab === 'surveys' && 'Matriz de Levantamientos KMZ'}
                  {activeTab === 'routes' && 'Cálculo de Rutas y Servicios Sumatorios'}
                  {activeTab === 'map' && 'Visualizador KMZ · OpenStreetMap'}
                  {activeTab === 'expenses' && 'Control Automático de Viáticos'}
                  {activeTab === 'brigades' && 'Brigadas y Equipos GNSS'}
                </h1>
              </div>
            </div>

            <div className="flex items-center gap-2.5 shrink-0">
              <div
                className={`hidden sm:inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap ${
                  isOnline ? 'text-[#15803D]' : 'text-[#D97706]'
                }`}
              >
                {isOnline ? (
                  <Wifi className="h-3.5 w-3.5" />
                ) : (
                  <WifiOff className="h-3.5 w-3.5" />
                )}
                <span>{isOnline ? 'Conectado (Sync OK)' : 'Modo Offline'}</span>
              </div>

              <PWAInstallButton />

              {role === 'Coordinador' ? (
                <button
                  type="button"
                  onClick={() => {
                    setPreloadedKmzForModal(null);
                    setIsKmzModalOpen(true);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-sm bg-[#0F2942] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#0284C7] transition-colors whitespace-nowrap shrink-0 min-h-[38px]"
                >
                  <Plus className="h-4 w-4" />
                  <span className="hidden sm:inline">Nuevo Proyecto KMZ</span>
                  <span className="sm:hidden">KMZ</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsExpenseModalOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-sm bg-[#0284C7] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#006398] transition-colors whitespace-nowrap shrink-0 min-h-[38px]"
                >
                  <Camera className="h-4 w-4" />
                  <span>Reportar Gasto</span>
                </button>
              )}
            </div>
          </header>

          {/* Content Body */}
          <main className="flex-1 p-3 sm:p-6 space-y-5 max-w-[1440px] w-full mx-auto pb-24 lg:pb-8">
            {/* Mobile Role Strip */}
            <div className="flex lg:hidden items-center justify-between gap-2 rounded-md border border-[#E2E8F0] bg-white px-3 py-2">
              <div className="flex items-center gap-1.5 text-xs text-[#43474D]">
                <HardHat className="h-3.5 w-3.5 text-[#0F2942]" />
                <span className="font-medium">Rol:</span>
              </div>
              <div className="flex gap-1">
                {(['Coordinador', 'Topógrafo'] as const).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRole(r)}
                    className={`rounded-sm px-2.5 py-1 text-xs font-semibold ${
                      role === r
                        ? 'bg-[#0F2942] text-white'
                        : 'bg-[#F1F5F9] text-[#334155]'
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>

            {/* TAB 1: SURVEYS MATRIX + KPI STRIP & RECHARTS BUDGET VS ACTUAL */}
            {activeTab === 'surveys' && (
              <section className="space-y-5">
                {/* KPI Strip + Recharts Budget vs Actual Chart */}
                <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-stretch">
                  <div className="xl:col-span-5 grid grid-cols-2 gap-3">
                    <div className="rounded-md border border-[#E2E8F0] bg-white p-4 flex flex-col justify-between">
                      <div className="text-xs font-medium text-[#43474D]">Levantamientos Activos</div>
                      <div className="mt-2 flex items-baseline justify-between">
                        <span className="font-mono text-2xl font-bold text-[#0F2942] tabular-nums">
                          {kpis.activeCount}
                        </span>
                        <span className="text-[11px] text-[#43474D]">{surveys.length} totales</span>
                      </div>
                    </div>

                    <div className="rounded-md border border-[#E2E8F0] bg-white p-4 flex flex-col justify-between">
                      <div className="text-xs font-medium text-[#43474D]">Superficie Acumulada</div>
                      <div className="mt-2 font-mono text-xl font-bold text-[#0284C7] tabular-nums">
                        {formatArea(kpis.totalAreaM2, areaUnit)}
                      </div>
                    </div>

                    <div className="rounded-md border border-[#E2E8F0] bg-white p-4 flex flex-col justify-between">
                      <div className="text-xs font-medium text-[#43474D]">Viáticos Ejecutados</div>
                      <div>
                        <div className="mt-1 font-mono text-lg sm:text-xl font-bold text-[#0F2942] tabular-nums truncate">
                          {formatRD(kpis.totalSpentViaticos)}
                        </div>
                        <div className="mt-0.5 font-mono text-[11px] text-[#43474D] tabular-nums">
                          Presup.: {formatRD(kpis.totalBudgetViaticos)}
                        </div>
                      </div>
                    </div>

                    <div className="rounded-md border border-[#E2E8F0] bg-white p-4 flex flex-col justify-between">
                      <div className="text-xs font-medium text-[#43474D]">Cola Offline / Sync</div>
                      <div className="mt-2 flex items-baseline justify-between">
                        <span
                          className={`font-mono text-2xl font-bold tabular-nums ${
                            pendingCount > 0 ? 'text-[#D97706]' : 'text-[#16A34A]'
                          }`}
                        >
                          {pendingCount}
                        </span>
                        <span className="text-[11px] text-[#43474D]">
                          {pendingCount === 0 ? 'Al día' : 'Pendientes'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="xl:col-span-7 min-w-0">
                    <ViaticosComparisonChart
                      surveys={surveys}
                      expenses={expenses}
                      onSelectSurvey={(id) => {
                        setStandaloneKmz(null);
                        setSelectedSurveyId(id);
                        setActiveTab('map');
                      }}
                    />
                  </div>
                </div>
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 rounded-md border border-[#CBD5E1] bg-white p-3.5 shadow-[0_1px_3px_0_rgba(15,41,66,0.08)]">
                  <div className="relative flex-1 min-w-[200px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#74777E]" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Buscar parcela, cliente, provincia o archivo KMZ..."
                      className="w-full rounded-sm border border-[#CBD5E1] bg-[#F8FAFC] pl-9 pr-3 py-2 text-xs text-[#0D1C2F] focus:border-[#0284C7] focus:bg-white focus:outline-none min-h-[38px]"
                    />
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value as WorkflowStatus | 'ALL')}
                      className="rounded-sm border border-[#CBD5E1] bg-white px-2.5 py-2 text-xs text-[#334155] min-h-[38px]"
                      aria-label="Filtrar por estado"
                    >
                      <option value="ALL">Todos los estados</option>
                      {WORKFLOW_STATES.map((st) => (
                        <option key={st} value={st}>
                          {st}
                        </option>
                      ))}
                    </select>

                    <select
                      value={surveyorFilter}
                      onChange={(e) => setSurveyorFilter(e.target.value)}
                      className="rounded-sm border border-[#CBD5E1] bg-white px-2.5 py-2 text-xs text-[#334155] min-h-[38px]"
                      aria-label="Filtrar por agrimensor"
                    >
                      <option value="ALL">Todas las brigadas</option>
                      {SURVEYOR_ROSTER.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>

                    <div className="inline-flex rounded-sm border border-[#CBD5E1] bg-[#F8FAFC] p-0.5">
                      {(
                        [
                          { id: 'm2', label: 'm²' },
                          { id: 'ha', label: 'ha' },
                          { id: 'tareas', label: 'Tareas' },
                        ] as const
                      ).map((u) => (
                        <button
                          key={u.id}
                          type="button"
                          onClick={() => setAreaUnit(u.id)}
                          className={`rounded-sm px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                            areaUnit === u.id
                              ? 'bg-[#0F2942] text-white'
                              : 'text-[#43474D] hover:bg-white'
                          }`}
                        >
                          {u.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Desktop Dense Data Table */}
                <div className="hidden md:block rounded-md border border-[#E2E8F0] bg-white overflow-x-auto">
                  <table className="w-full border-collapse text-left text-xs">
                    <thead>
                      <tr className="bg-[#0F2942] text-white uppercase tracking-wide text-[11px] font-semibold">
                        <th className="px-4 py-3 whitespace-nowrap">Parcela / KMZ</th>
                        <th className="px-4 py-3 whitespace-nowrap">Proyecto & Cliente</th>
                        <th className="px-4 py-3 whitespace-nowrap">Agrimensor / RTK</th>
                        <th className="px-4 py-3 whitespace-nowrap text-right">Superficie</th>
                        <th className="px-4 py-3 whitespace-nowrap text-right">Viáticos (Ejec./Pres.)</th>
                        <th className="px-4 py-3 whitespace-nowrap">Estado</th>
                        <th className="px-4 py-3 whitespace-nowrap text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E2E8F0]">
                      {filteredSurveys.map((srv, idx) => {
                        const spent = expenseTotalsBySurvey[srv.id] || 0;
                        const overBudget = spent > srv.budgetViaticosRD;
                        return (
                          <tr
                            key={srv.id}
                            className={`transition-colors hover:bg-[#F1F5F9] ${
                              idx % 2 === 0 ? 'bg-white' : 'bg-[#F8FAFC]'
                            }`}
                          >
                            <td className="px-4 py-2.5 align-top">
                              <button
                                type="button"
                                onClick={() => {
                                  setStandaloneKmz(null);
                                  setSelectedSurveyId(srv.id);
                                  setActiveTab('map');
                                }}
                                className="font-mono text-xs font-bold text-[#0284C7] hover:underline text-left"
                              >
                                {srv.parcelCode}
                              </button>
                              <div className="mt-0.5 text-[11px] text-[#43474D] truncate max-w-[190px]">
                                {srv.kmzFileName}
                              </div>
                            </td>
                            <td className="px-4 py-2.5 align-top">
                              <div className="font-semibold text-[#0D1C2F]">{srv.title}</div>
                              <div className="mt-0.5 text-[11px] text-[#43474D]">
                                {srv.client} · {srv.province}
                              </div>
                            </td>
                            <td className="px-4 py-2.5 align-top">
                              <div className="font-medium text-[#0D1C2F]">{srv.surveyor}</div>
                              <div className="mt-0.5 font-mono text-[11px] text-[#43474D]">
                                {srv.equipmentSerial}
                              </div>
                            </td>
                            <td className="px-4 py-2.5 align-top text-right font-mono tabular-nums">
                              <div className="font-semibold text-[#0D1C2F]">
                                {formatArea(srv.totalAreaM2, areaUnit)}
                              </div>
                              <div className="mt-0.5 text-[11px] text-[#43474D]">
                                P: {formatPerimeter(srv.totalPerimeterM)}
                              </div>
                            </td>
                            <td className="px-4 py-2.5 align-top text-right font-mono tabular-nums">
                              <div
                                className={`font-semibold ${
                                  overBudget ? 'text-[#DC2626]' : 'text-[#0D1C2F]'
                                }`}
                              >
                                {formatRD(spent)}
                              </div>
                              <div className="mt-0.5 text-[11px] text-[#43474D]">
                                de {formatRD(srv.budgetViaticosRD)}
                              </div>
                            </td>
                            <td className="px-4 py-2.5 align-top">
                              <div className="flex flex-col items-start gap-1">
                                <WorkflowBadge status={srv.status} />
                                <select
                                  value={srv.status}
                                  onChange={(e) =>
                                    handleStatusChange(srv.id, e.target.value as WorkflowStatus)
                                  }
                                  aria-label={`Cambiar estado de ${srv.parcelCode}`}
                                  className="rounded-sm border border-[#E2E8F0] bg-white px-1.5 py-0.5 text-[11px] text-[#43474D]"
                                >
                                  {WORKFLOW_STATES.map((st) => (
                                    <option key={st} value={st}>
                                      {st}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </td>
                            <td className="px-4 py-2.5 align-top text-right whitespace-nowrap">
                              <div className="inline-flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedSurveyId(srv.id);
                                    setActiveTab('routes');
                                  }}
                                  className="rounded-sm border border-[#CBD5E1] bg-white px-2.5 py-1.5 text-[11px] font-semibold text-[#334155] hover:bg-[#F8FAFC]"
                                >
                                  Ruta
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setStandaloneKmz(null);
                                    setSelectedSurveyId(srv.id);
                                    setActiveTab('map');
                                  }}
                                  className="rounded-sm border border-[#CBD5E1] bg-white px-2.5 py-1.5 text-[11px] font-semibold text-[#0F2942] hover:bg-[#EFF4FF]"
                                >
                                  Mapa OSM
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedSurveyId(srv.id);
                                    setIsExpenseModalOpen(true);
                                  }}
                                  className="rounded-sm bg-[#0284C7] px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-[#006398]"
                                >
                                  + Viático
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  {filteredSurveys.length === 0 && (
                    <div className="p-8 text-center text-xs text-[#43474D]">
                      No hay levantamientos que coincidan con los filtros actuales.
                    </div>
                  )}
                </div>

                {/* Mobile Stacked Technical Cards */}
                <div className="md:hidden space-y-3">
                  {filteredSurveys.map((srv) => {
                    const spent = expenseTotalsBySurvey[srv.id] || 0;
                    return (
                      <div
                        key={srv.id}
                        className="rounded-md border border-[#CBD5E1] bg-white p-4 space-y-3"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="font-mono text-xs font-bold text-[#0284C7] truncate">
                              {srv.parcelCode}
                            </div>
                            <h3 className="mt-0.5 text-sm font-bold text-[#0D1C2F]">{srv.title}</h3>
                            <p className="text-xs text-[#43474D]">
                              {srv.province} · {srv.surveyor}
                            </p>
                          </div>
                          <WorkflowBadge status={srv.status} />
                        </div>

                        <div className="grid grid-cols-2 gap-2 rounded-sm bg-[#F8FAFC] p-2.5 text-xs">
                          <div>
                            <div className="text-[11px] text-[#43474D]">Superficie</div>
                            <div className="font-mono font-bold text-[#0D1C2F] tabular-nums">
                              {formatArea(srv.totalAreaM2, areaUnit)}
                            </div>
                          </div>
                          <div>
                            <div className="text-[11px] text-[#43474D]">Viáticos</div>
                            <div className="font-mono font-bold text-[#0D1C2F] tabular-nums">
                              {formatRD(spent)}
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedSurveyId(srv.id);
                              setActiveTab('routes');
                            }}
                            className="rounded-sm border border-[#CBD5E1] bg-white py-2.5 text-xs font-semibold text-[#334155] min-h-[44px]"
                          >
                            Ruta
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setStandaloneKmz(null);
                              setSelectedSurveyId(srv.id);
                              setActiveTab('map');
                            }}
                            className="rounded-sm border border-[#CBD5E1] bg-white py-2.5 text-xs font-semibold text-[#0F2942] min-h-[44px]"
                          >
                            Mapa OSM
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedSurveyId(srv.id);
                              setIsExpenseModalOpen(true);
                            }}
                            className="rounded-sm bg-[#0284C7] py-2.5 text-xs font-semibold text-white min-h-[44px]"
                          >
                            + Viático
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* TAB 2: ADDITIVE SERVICES & OPTIMAL ROUTE CALCULATOR */}
            {activeTab === 'routes' && (
              <section>
                <RouteServicesCalculator
                  surveys={surveys}
                  selectedSurvey={selectedSurvey}
                  onSelectSurvey={setSelectedSurveyId}
                  onApplyToSurvey={({
                    surveyId,
                    budgetViaticosRD,
                    contractValueRD,
                    selectedServices,
                    routeSummary,
                  }) => {
                    setSurveys((prev) =>
                      prev.map((s) =>
                        s.id === surveyId
                          ? {
                              ...s,
                              budgetViaticosRD,
                              contractValueRD,
                              selectedServices,
                              routeSummary,
                              updatedAt: new Date().toISOString(),
                              syncStatus: 'pending',
                            }
                          : s
                      )
                    );
                    showToast(
                      `Presupuesto (${formatRD(contractValueRD)}) y viáticos (${formatRD(
                        budgetViaticosRD
                      )}) aplicados al levantamiento.`
                    );
                  }}
                  onRegisterKmzFromCalculator={(parsed, payload) => {
                    const candidate: SurveyProject = {
                      id: `srv-${Date.now()}`,
                      parcelCode: parsed.autoMeta.parcelCode,
                      title: parsed.autoMeta.title,
                      client: parsed.autoMeta.client || 'Cliente por confirmar',
                      province: parsed.autoMeta.province,
                      surveyor: SURVEYOR_ROSTER[0],
                      equipmentSerial: EQUIPMENT_ROSTER[0],
                      status: 'COTIZADO',
                      scheduledDate: parsed.autoMeta.scheduledDate,
                      updatedAt: new Date().toISOString(),
                      budgetViaticosRD: payload.budgetViaticosRD,
                      contractValueRD: payload.contractValueRD,
                      kmzFileName: parsed.fileName,
                      features: parsed.features,
                      centroid: parsed.centroid,
                      totalAreaM2: parsed.totalAreaM2,
                      totalPerimeterM: parsed.totalPerimeterM,
                      syncStatus: 'pending',
                      notes: parsed.autoMeta.notes,
                      selectedServices: payload.selectedServices,
                      routeSummary: payload.routeSummary,
                    };
                    handleCreateSurvey(candidate);
                  }}
                  onLogRouteExpenses={(items) => {
                    setExpenses((prev) => [...items, ...prev]);
                    showToast(`${items.length} registro(s) de viáticos de ruta adjuntados al libro.`);
                    setActiveTab('expenses');
                  }}
                  onOpenExpenseModal={() => setIsExpenseModalOpen(true)}
                />
              </section>
            )}

            {/* TAB 3: OPENSTREETMAP KMZ VISUALIZADOR & VERTEX INSPECTOR */}
            {activeTab === 'map' && (
              <section className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-[#E2E8F0] bg-white p-3.5">
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <MapPin className="h-4 w-4 text-[#0284C7] shrink-0" />
                    <select
                      value={standaloneKmz ? '__standalone__' : selectedSurvey?.id ?? ''}
                      onChange={(e) => {
                        if (e.target.value !== '__standalone__') {
                          setStandaloneKmz(null);
                          setSelectedSurveyId(e.target.value);
                        }
                      }}
                      className="w-full sm:w-auto rounded-sm border border-[#CBD5E1] bg-[#F8FAFC] px-3 py-2 text-xs font-semibold text-[#0D1C2F] min-h-[40px]"
                    >
                      {standaloneKmz && (
                        <option value="__standalone__">
                          Vista previa: {standaloneKmz.fileName}
                        </option>
                      )}
                      {surveys.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.parcelCode} — {s.title}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      ref={viewerFileInputRef}
                      type="file"
                      accept=".kmz,.kml"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleOpenKmzInViewer(f);
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => viewerFileInputRef.current?.click()}
                      className="inline-flex items-center gap-1.5 rounded-sm border border-[#0284C7] bg-white px-3 py-2 text-xs font-semibold text-[#0284C7] hover:bg-[#EFF4FF] min-h-[40px]"
                    >
                      <FileUp className="h-3.5 w-3.5" />
                      Abrir .KMZ en Mapa
                    </button>

                    {standaloneKmz && role === 'Coordinador' ? (
                      <button
                        type="button"
                        onClick={() => {
                          setPreloadedKmzForModal(standaloneKmz);
                          setIsKmzModalOpen(true);
                        }}
                        className="inline-flex items-center gap-1.5 rounded-sm bg-[#0F2942] px-3 py-2 text-xs font-semibold text-white hover:bg-[#0284C7] min-h-[40px]"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Crear Levantamiento con este KMZ
                      </button>
                    ) : (
                      selectedSurvey && (
                        <>
                          <WorkflowBadge status={selectedSurvey.status} />
                          <button
                            type="button"
                            onClick={() => setIsExpenseModalOpen(true)}
                            className="inline-flex items-center gap-1.5 rounded-sm bg-[#0284C7] px-3 py-2 text-xs font-semibold text-white hover:bg-[#006398] min-h-[40px]"
                          >
                            <Camera className="h-3.5 w-3.5" />
                            Imputar Viático
                          </button>
                        </>
                      )
                    )}
                  </div>
                </div>

                <KmzOsmViewer
                  parcelCode={viewerParcelCode}
                  fileName={viewerFileName}
                  features={viewerFeatures}
                  centroid={viewerCentroid}
                  totalAreaM2={viewerAreaM2}
                  totalPerimeterM={viewerPerimeterM}
                  areaUnit={areaUnit}
                  onChangeAreaUnit={setAreaUnit}
                  liveGpsPoint={liveGpsPoint}
                  onCaptureLiveGps={handleCaptureLiveGps}
                  isCapturingGps={isCapturingGps}
                />

                {/* Vertex Coordinates Table & Project Viáticos / KMZ Metadata Summary */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  <div className="lg:col-span-2 rounded-md border border-[#E2E8F0] bg-white overflow-hidden">
                    <div className="border-b border-[#E2E8F0] bg-[#F8FAFC] px-4 py-3 flex items-center justify-between">
                      <h3 className="text-xs font-bold text-[#0F2942]">
                        Cuadro de Construcción · Vértices UTM Zona 19N
                      </h3>
                      <span className="font-mono text-[11px] text-[#43474D]">
                        {viewerFeatures[0]?.points.length || 0} vértices
                      </span>
                    </div>
                    <div className="overflow-x-auto max-h-[260px]">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC] text-[11px] font-semibold text-[#43474D]">
                            <th className="px-4 py-2">Estación</th>
                            <th className="px-4 py-2 text-right">Este X (m)</th>
                            <th className="px-4 py-2 text-right">Norte Y (m)</th>
                            <th className="px-4 py-2 text-right">Elevación Z</th>
                            <th className="px-4 py-2 text-right">WGS84 (Lat, Lon)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#E2E8F0] font-mono text-[11px] tabular-nums">
                          {viewerFeatures[0]?.points.map((pt, i) => (
                            <tr key={i} className="hover:bg-[#F8FAFC]">
                              <td className="px-4 py-2 font-bold text-[#0F2942]">V{i + 1}</td>
                              <td className="px-4 py-2 text-right">{pt.easting.toFixed(2)}</td>
                              <td className="px-4 py-2 text-right">{pt.northing.toFixed(2)}</td>
                              <td className="px-4 py-2 text-right">{pt.elev.toFixed(2)} m</td>
                              <td className="px-4 py-2 text-right text-[#43474D]">
                                {pt.lat.toFixed(5)}, {pt.lon.toFixed(5)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {standaloneKmz ? (
                    <div className="rounded-md border border-[#E2E8F0] bg-white p-4 space-y-3">
                      <h3 className="text-xs font-bold text-[#0F2942]">
                        Datos Autodetectados del KMZ
                      </h3>
                      <div className="space-y-1.5 text-xs">
                        <div className="flex justify-between gap-2">
                          <span className="text-[#43474D]">Nombre</span>
                          <span className="font-semibold text-right truncate max-w-[180px]">
                            {standaloneKmz.autoMeta.title}
                          </span>
                        </div>
                        <div className="flex justify-between gap-2">
                          <span className="text-[#43474D]">Provincia</span>
                          <span className="font-semibold">{standaloneKmz.autoMeta.province}</span>
                        </div>
                        <div className="flex justify-between gap-2">
                          <span className="text-[#43474D]">Fecha Detectada</span>
                          <span className="font-mono">{standaloneKmz.autoMeta.scheduledDate}</span>
                        </div>
                        <div className="flex justify-between gap-2 border-t border-[#E2E8F0] pt-1.5">
                          <span className="text-[#43474D]">Viáticos Sugeridos</span>
                          <span className="font-mono font-bold text-[#15803D]">
                            {formatRD(standaloneKmz.estimatedViaticos.totalBudgetRD)}
                          </span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    selectedSurvey && (
                      <div className="rounded-md border border-[#E2E8F0] bg-white p-4 space-y-3">
                        <h3 className="text-xs font-bold text-[#0F2942]">
                          Balance de Viáticos de Parcela
                        </h3>
                        {(() => {
                          const projectExpenses = expenses.filter(
                            (e) => e.surveyId === selectedSurvey.id
                          );
                          const spent = projectExpenses.reduce((acc, e) => acc + e.amountRD, 0);
                          const remaining = selectedSurvey.budgetViaticosRD - spent;
                          const pct = Math.min(
                            100,
                            Math.round(
                              (spent / Math.max(1, selectedSurvey.budgetViaticosRD)) * 100
                            )
                          );
                          return (
                            <>
                              <div className="space-y-1.5 text-xs">
                                <div className="flex justify-between">
                                  <span className="text-[#43474D]">Presupuestado</span>
                                  <span className="font-mono font-semibold tabular-nums">
                                    {formatRD(selectedSurvey.budgetViaticosRD)}
                                  </span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-[#43474D]">
                                    Ejecutado ({projectExpenses.length} reg.)
                                  </span>
                                  <span className="font-mono font-bold text-[#0284C7] tabular-nums">
                                    {formatRD(spent)}
                                  </span>
                                </div>
                                <div className="flex justify-between border-t border-[#E2E8F0] pt-1.5">
                                  <span className="font-semibold text-[#0D1C2F]">
                                    Saldo Disponible
                                  </span>
                                  <span
                                    className={`font-mono font-bold tabular-nums ${
                                      remaining < 0 ? 'text-[#DC2626]' : 'text-[#16A34A]'
                                    }`}
                                  >
                                    {formatRD(remaining)}
                                  </span>
                                </div>
                              </div>

                              <div className="h-2 w-full rounded-full bg-[#E2E8F0] overflow-hidden">
                                <div
                                  className={`h-full transition-all ${
                                    remaining < 0 ? 'bg-[#DC2626]' : 'bg-[#0284C7]'
                                  }`}
                                  style={{ width: `${pct}%` }}
                                />
                              </div>

                              <div className="text-[11px] text-[#43474D]">
                                Brigada:{' '}
                                <strong className="text-[#0D1C2F]">
                                  {selectedSurvey.surveyor}
                                </strong>
                                <br />
                                Equipo:{' '}
                                <span className="font-mono">{selectedSurvey.equipmentSerial}</span>
                              </div>
                            </>
                          );
                        })()}
                      </div>
                    )
                  )}
                </div>
              </section>
            )}

            {/* TAB 3: AUTOMATIC MOBILE EXPENSE REPORTING & VIATICOS LEDGER */}
            {activeTab === 'expenses' && (
              <section className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-md border border-[#CBD5E1] bg-white p-4">
                  <div>
                    <h2 className="text-sm font-bold text-[#0F2942]">
                      Captura Automática de Viáticos en Campo
                    </h2>
                    <p className="mt-0.5 text-xs text-[#43474D]">
                      Escanea comprobantes con la cámara móvil, calcula rutas por GPS UTM 19N o aplica dietas estándar con respaldo offline.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={handleExportExpensesCsv}
                      className="inline-flex items-center gap-1.5 rounded-sm border border-[#CBD5E1] bg-white px-3 py-2 text-xs font-semibold text-[#334155] hover:bg-[#F1F5F9] min-h-[40px]"
                    >
                      <FileSpreadsheet className="h-4 w-4 text-[#16A34A]" />
                      Exportar CSV
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsExpenseModalOpen(true)}
                      className="inline-flex items-center gap-1.5 rounded-sm bg-[#0284C7] px-4 py-2 text-xs font-semibold text-white hover:bg-[#006398] min-h-[40px]"
                    >
                      <Camera className="h-4 w-4" />
                      Reportar Gasto Automático
                    </button>
                  </div>
                </div>

                {/* Desktop Expenses Table */}
                <div className="hidden md:block rounded-md border border-[#E2E8F0] bg-white overflow-x-auto">
                  <table className="w-full border-collapse text-left text-xs">
                    <thead>
                      <tr className="bg-[#0F2942] text-white uppercase tracking-wide text-[11px] font-semibold">
                        <th className="px-4 py-3">Fecha / AST</th>
                        <th className="px-4 py-3">Parcela & Agrimensor</th>
                        <th className="px-4 py-3">Categoría / Comercio</th>
                        <th className="px-4 py-3">Método / NCF</th>
                        <th className="px-4 py-3 text-right">ITBIS</th>
                        <th className="px-4 py-3 text-right">Monto RD$</th>
                        <th className="px-4 py-3">Estado</th>
                        <th className="px-4 py-3 text-right">Acción</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E2E8F0]">
                      {expenses.map((exp, idx) => (
                        <tr
                          key={exp.id}
                          className={
                            idx % 2 === 0
                              ? 'bg-white hover:bg-[#F1F5F9]'
                              : 'bg-[#F8FAFC] hover:bg-[#F1F5F9]'
                          }
                        >
                          <td className="px-4 py-2.5 font-mono text-[11px] text-[#334155] whitespace-nowrap">
                            <div>{exp.dateIso}</div>
                            <div className="text-[10px] text-[#74777E]">{exp.timestampAST}</div>
                          </td>
                          <td className="px-4 py-2.5">
                            <div className="font-mono text-xs font-bold text-[#0284C7]">
                              {exp.parcelCode}
                            </div>
                            <div className="text-[11px] text-[#43474D]">{exp.surveyor}</div>
                          </td>
                          <td className="px-4 py-2.5">
                            <div className="font-semibold text-[#0D1C2F]">{exp.merchant}</div>
                            <div className="text-[11px] text-[#43474D]">
                              {exp.category} {exp.notes ? `· ${exp.notes}` : ''}
                            </div>
                          </td>
                          <td className="px-4 py-2.5 font-mono text-[11px] text-[#334155]">
                            <div>{exp.method}</div>
                            {exp.ncf && <div className="text-[#43474D]">NCF: {exp.ncf}</div>}
                            {exp.distanceKm && (
                              <div className="text-[#0284C7]">{exp.distanceKm} km GPS</div>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono tabular-nums text-[#43474D]">
                            {formatRD(exp.itbisRD)}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono font-bold tabular-nums text-[#0D1C2F]">
                            {formatRD(exp.amountRD)}
                          </td>
                          <td className="px-4 py-2.5">
                            <div className="flex flex-col gap-1 items-start">
                              <span
                                className={`text-[11px] font-semibold ${
                                  exp.approved ? 'text-[#15803D]' : 'text-[#D97706]'
                                }`}
                              >
                                {exp.approved ? 'Aprobado' : 'Por aprobar'}
                              </span>
                              {exp.syncStatus !== 'synced' && (
                                <span className="font-mono text-[10px] text-[#D97706]">
                                  {exp.syncStatus === 'needs_ocr' ? 'Cola OCR' : 'Pendiente Sync'}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-2.5 text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-1">
                              {role === 'Coordinador' && (
                                <button
                                  type="button"
                                  onClick={() => handleToggleApproveExpense(exp.id)}
                                  className="rounded-sm border border-[#CBD5E1] bg-white px-2 py-1 text-[11px] font-semibold text-[#334155] hover:bg-[#ECFDF5] hover:text-[#047857]"
                                >
                                  {exp.approved ? 'Revertir' : 'Aprobar'}
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => handleDeleteExpense(exp.id)}
                                className="rounded-sm p-1.5 text-[#74777E] hover:bg-[#FEE2E2] hover:text-[#DC2626]"
                                aria-label="Eliminar gasto"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Expense Cards */}
                <div className="md:hidden space-y-2.5">
                  {expenses.map((exp) => (
                    <div
                      key={exp.id}
                      className="rounded-md border border-[#CBD5E1] bg-white p-3.5 space-y-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="text-xs font-bold text-[#0D1C2F]">{exp.merchant}</div>
                          <div className="font-mono text-[11px] text-[#0284C7]">
                            {exp.parcelCode} · {exp.category}
                          </div>
                        </div>
                        <div className="text-right font-mono text-sm font-bold text-[#0F2942] tabular-nums">
                          {formatRD(exp.amountRD)}
                        </div>
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-[#43474D]">
                        <span>
                          {exp.method} · {exp.dateIso}
                        </span>
                        <span
                          className={
                            exp.approved
                              ? 'text-[#15803D] font-semibold'
                              : 'text-[#D97706] font-semibold'
                          }
                        >
                          {exp.approved ? 'Aprobado' : 'Pendiente'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* TAB 4: BRIGADES & GNSS RTK EQUIPMENT */}
            {activeTab === 'brigades' && (
              <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-md border border-[#E2E8F0] bg-white overflow-hidden">
                  <div className="border-b border-[#E2E8F0] bg-[#0F2942] px-4 py-3 text-xs font-semibold text-white uppercase tracking-wide">
                    Brigadas Topográficas Activas
                  </div>
                  <div className="divide-y divide-[#E2E8F0]">
                    {SURVEYOR_ROSTER.map((member) => {
                      const assigned = surveys.filter((s) => s.surveyor === member);
                      return (
                        <div key={member} className="p-4 flex items-center justify-between gap-3">
                          <div>
                            <div className="text-sm font-bold text-[#0D1C2F]">{member}</div>
                            <div className="mt-0.5 text-xs text-[#43474D]">
                              {assigned.length} levantamiento(s) asignado(s)
                            </div>
                          </div>
                          <div className="text-right font-mono text-xs text-[#0284C7]">
                            {assigned[0]?.parcelCode || 'Disponible'}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="rounded-md border border-[#E2E8F0] bg-white overflow-hidden">
                  <div className="border-b border-[#E2E8F0] bg-[#0F2942] px-4 py-3 text-xs font-semibold text-white uppercase tracking-wide">
                    Inventario de Receptores GNSS RTK
                  </div>
                  <div className="divide-y divide-[#E2E8F0]">
                    {EQUIPMENT_ROSTER.map((unit) => {
                      const assigned = surveys.filter(
                        (s) => s.equipmentSerial === unit && s.status !== 'COBRADO'
                      );
                      return (
                        <div key={unit} className="p-4 flex items-center justify-between gap-3">
                          <div>
                            <div className="font-mono text-xs font-bold text-[#0D1C2F]">{unit}</div>
                            <div className="mt-0.5 text-xs text-[#43474D]">
                              {assigned[0]
                                ? `Asignado a ${assigned[0].surveyor}`
                                : 'En almacén base Santo Domingo'}
                            </div>
                          </div>
                          <span
                            className={`text-xs font-semibold ${
                              assigned.length > 1
                                ? 'text-[#DC2626]'
                                : assigned.length === 1
                                ? 'text-[#0284C7]'
                                : 'text-[#16A34A]'
                            }`}
                          >
                            {assigned.length > 1
                              ? 'Revisión fechas'
                              : assigned.length === 1
                              ? 'En operación'
                              : 'Disponible'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </section>
            )}
          </main>
        </div>
      </div>

      {/* Mobile Fixed Thumb-Zone Bottom Navigation Bar */}
      <nav
        className="lg:hidden fixed bottom-0 left-0 right-0 z-40 h-16 border-t border-[#CBD5E1] bg-white/95 backdrop-blur grid grid-cols-5 items-center"
        aria-label="Navegación móvil"
      >
        <button
          type="button"
          onClick={() => setActiveTab('surveys')}
          className={`flex flex-col items-center justify-center h-full text-[10px] font-semibold ${
            activeTab === 'surveys' ? 'text-[#0284C7]' : 'text-[#43474D]'
          }`}
        >
          <FolderKanban className="h-4 w-4" />
          <span className="mt-0.5">Proyectos</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('routes')}
          className={`flex flex-col items-center justify-center h-full text-[10px] font-semibold ${
            activeTab === 'routes' ? 'text-[#0284C7]' : 'text-[#43474D]'
          }`}
        >
          <Route className="h-4 w-4" />
          <span className="mt-0.5">Rutas</span>
        </button>

        <button
          type="button"
          onClick={() => setIsExpenseModalOpen(true)}
          className="flex flex-col items-center justify-center h-full text-[10px] font-bold text-[#0F2942]"
        >
          <span className="flex h-8 w-11 items-center justify-center rounded-sm bg-[#0284C7] text-white">
            <Camera className="h-4 w-4" />
          </span>
          <span className="mt-0.5">Reportar</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('map')}
          className={`flex flex-col items-center justify-center h-full text-[10px] font-semibold ${
            activeTab === 'map' ? 'text-[#0284C7]' : 'text-[#43474D]'
          }`}
        >
          <Layers className="h-4 w-4" />
          <span className="mt-0.5">Mapa</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('expenses')}
          className={`flex flex-col items-center justify-center h-full text-[10px] font-semibold ${
            activeTab === 'expenses' ? 'text-[#0284C7]' : 'text-[#43474D]'
          }`}
        >
          <Receipt className="h-4 w-4" />
          <span className="mt-0.5">Viáticos</span>
        </button>
      </nav>

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-20 lg:bottom-5 right-4 z-50 flex items-center gap-2 rounded-sm border border-[#0F2942] bg-[#0F2942] px-4 py-2.5 text-xs font-medium text-white shadow-lg">
          <CheckCircle2 className="h-4 w-4 text-[#5BB8FE] shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Modals */}
      <KmzImportModal
        isOpen={isKmzModalOpen}
        onClose={() => {
          setIsKmzModalOpen(false);
          setPreloadedKmzForModal(null);
        }}
        onCreateSurvey={handleCreateSurvey}
        preloadedKmz={preloadedKmzForModal}
      />

      <MobileExpenseCaptureModal
        isOpen={isExpenseModalOpen}
        onClose={() => setIsExpenseModalOpen(false)}
        surveys={surveys}
        defaultSurveyId={selectedSurvey?.id ?? surveys[0]?.id ?? ''}
        isOnline={isOnline}
        onAddExpense={handleAddExpense}
      />

      <ResourceConflictModal
        conflicts={conflicts}
        onReassign={() => {
          setConflicts([]);
          setPendingSurveyForConflict(null);
          setIsKmzModalOpen(true);
        }}
        onOverride={() => {
          if (pendingSurveyForConflict) {
            commitSurveyCreation(pendingSurveyForConflict.survey, {
              initialExpenses: pendingSurveyForConflict.initialExpenses,
              openMobileExpenseAfter: pendingSurveyForConflict.openMobileExpenseAfter,
            });
          }
          setConflicts([]);
          setPendingSurveyForConflict(null);
        }}
      />
    </div>
  );
}
