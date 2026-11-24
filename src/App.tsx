import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Building2,
  CalendarDays,
  Camera,
  CheckCircle2,
  Compass,
  FileUp,
  FolderKanban,
  HelpCircle,
  History,
  Home,
  Layers,
  LogOut,
  Plus,
  PlusCircle,
  Receipt,
  Route,
  Settings,
  Users,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { AdminHoyView } from './components/AdminHoyView';
import { AgendaView } from './components/AgendaView';
import { AuditoriaView } from './components/AuditoriaView';
import { AuthGate } from './components/AuthGate';
import { CatalogosView } from './components/CatalogosView';
import { ConfiguracionView } from './components/ConfiguracionView';
import { DwgPlanViewer } from './components/DwgPlanViewer';
import { KmzImportModal } from './components/KmzImportModal';
import { KmzOsmViewer } from './components/KmzOsmViewer';
import { MobileExpenseCaptureModal } from './components/MobileExpenseCaptureModal';
import { DemoBanner, OfflineSyncBanner } from './components/OfflineSyncBanner';
import { OnboardingWizardModal } from './components/OnboardingWizardModal';
import { ProyectosView } from './components/ProyectosView';
import { PWAInstallButton } from './components/PWAInstallButton';
import { ResourceConflictModal } from './components/ResourceConflictModal';
import { RouteServicesCalculator } from './components/RouteServicesCalculator';
import { AppShellSkeleton } from './components/Skeletons';
import { TecnicoAgendaView } from './components/tecnico/TecnicoAgendaView';
import { TecnicoBitacoraModal } from './components/tecnico/TecnicoBitacoraModal';
import { TecnicoHoyView } from './components/tecnico/TecnicoHoyView';
import { TecnicoReportarSelectorModal } from './components/tecnico/TecnicoReportarSelectorModal';
import { TecnicoRutaDetalleView } from './components/tecnico/TecnicoRutaDetalleView';
import { TecnicoRutasView } from './components/tecnico/TecnicoRutasView';
import { TecnicoTransicionModal } from './components/tecnico/TecnicoTransicionModal';
import { TecnicoViaticosView } from './components/tecnico/TecnicoViaticosView';
import { TutorialVisualModal } from './components/TutorialVisualModal';
import { ViaticosView } from './components/ViaticosView';
import {
  detectarConflictosAsignacion,
  obtenerRutasAsignadasAUsuario,
  ocultarTarjetaOnboarding,
  puedeCrearOEditarOperacion,
  puedeVerAuditoria,
  puedeVerConfiguracion,
  reiniciarOnboarding,
  resolverPersonalYCargoUsuario,
  seleccionarPasoOnboarding,
} from './domain';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import { useOperacionEmpresa } from './hooks/useOperacionEmpresa';
import type {
  AreaUnit,
  ConflictDetail,
  GeoPoint,
  OnboardingPasoId,
  OverrideConflicto,
  ReglasCapturaViaticosTecnico,
  SeccionConfiguracion,
  Viatico,
} from './types/domain';
import { formatRD, latLonToUtm19N } from './utils/geodesy';
import type { ParsedDwgPlan } from './utils/dwgParser';
import { parseKmzOrKmlFile, type ParsedKmzResult } from './utils/kmzParser';

type AdminTab =
  | 'hoy'
  | 'proyectos'
  | 'agenda'
  | 'rutas'
  | 'map'
  | 'viaticos'
  | 'catalogos'
  | 'auditoria'
  | 'configuracion';

type TecnicoTab = 'hoy' | 'rutas_tecnico' | 'ruta_detalle' | 'agenda_tecnico' | 'viaticos_tecnico';

export default function App() {
  const isOnline = useOnlineStatus();
  const viewerFileInputRef = useRef<HTMLInputElement>(null);

  const {
    sesion,
    empresasDisponibles,
    requiereElegirEmpresa,
    proyeccion,
    configuracion,
    cargos,
    combustiblesVigentes,
    serviciosVigentes,
    factoresTerrenoVigentes,
    reglasViaticosVigentes,
    rendimientoFlotaVigente,
    onboarding,
    tutorialesPerfil,
    tutorialesVistos,
    isLoadingSnapshot,
    errorSnapshot,
    isSyncing,
    avisosLww,
    pendingCounts,
    hasConflict,
    isDemoActivo,
    cuentasDemo,
    iniciarSesion,
    entrarConCacheOffline,
    seleccionarEmpresa,
    cerrarSesion,
    refrescar,
    sincronizarAhora,
    marcarTutorialVisto,
    descartarAvisosLww,
    actions,
  } = useOperacionEmpresa(isOnline);

  const [adminTab, setAdminTab] = useState<AdminTab>('hoy');
  const [tecnicoTab, setTecnicoTab] = useState<TecnicoTab>('hoy');
  const [tecnicoRutaDetalleId, setTecnicoRutaDetalleId] = useState<string>('');
  const [configSeccionInicial, setConfigSeccionInicial] = useState<SeccionConfiguracion | undefined>(
    undefined
  );
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false);
  const [isTutorialOpen, setIsTutorialOpen] = useState(false);

  const [selectedRutaId, setSelectedRutaId] = useState<string>('');
  const [areaUnit, setAreaUnit] = useState<AreaUnit>('tareas');

  const [standaloneKmz, setStandaloneKmz] = useState<ParsedKmzResult | null>(null);
  const [mapViewerMode, setMapViewerMode] = useState<'cartografia' | 'planos'>('cartografia');
  const [loadedDwgPlan, setLoadedDwgPlan] = useState<ParsedDwgPlan | null>(null);
  const [preloadedKmzForModal, setPreloadedKmzForModal] = useState<ParsedKmzResult | null>(null);
  const [defaultProyectoModal, setDefaultProyectoModal] = useState<string | undefined>(undefined);
  const [isKmzModalOpen, setIsKmzModalOpen] = useState(false);

  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [editingViatico, setEditingViatico] = useState<Viatico | null>(null);
  const [expenseDefaultProyectoId, setExpenseDefaultProyectoId] = useState<string | undefined>(
    undefined
  );
  const [expenseDefaultRutaId, setExpenseDefaultRutaId] = useState<string | undefined>(undefined);

  // Modales exclusivos de campo para técnico
  const [isReportarSelectorOpen, setIsReportarSelectorOpen] = useState(false);
  const [isBitacoraModalOpen, setIsBitacoraModalOpen] = useState(false);
  const [bitacoraDefaultServicioId, setBitacoraDefaultServicioId] = useState<string | undefined>(
    undefined
  );
  const [transicionServicioId, setTransicionServicioId] = useState<string | null>(null);
  const [tecnicoSuccessBanner, setTecnicoSuccessBanner] = useState<string | null>(null);

  // Conflicto diferido al crear asignación opcional desde el wizard KMZ (admin/coordinador)
  const [pendingKmzAsig, setPendingKmzAsig] = useState<{
    rutaId: string;
    fechaInicio: string;
    fechaFin: string;
    cuadrillaId: string;
    vehiculoIds: string[];
    equipoIds: string[];
  } | null>(null);
  const [kmzAsigConflictos, setKmzAsigConflictos] = useState<ConflictDetail[]>([]);

  const [liveGpsPoint, setLiveGpsPoint] = useState<GeoPoint | null>(null);
  const [isCapturingGps, setIsCapturingGps] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 4500);
  };

  const showTecnicoSuccess = (msg: string) => {
    setTecnicoSuccessBanner(msg);
    showToast(msg);
    setTimeout(() => {
      setTecnicoSuccessBanner((prev) => (prev === msg ? null : prev));
    }, 5000);
  };

  // Al iniciar sesión o cambiar de empresa: Admin abre en 'hoy', Coordinador en 'proyectos', Técnico en 'hoy'
  useEffect(() => {
    if (!sesion) return;
    setConfigSeccionInicial(undefined);
    setIsOnboardingOpen(false);
    if (sesion.rolActivo === 'tecnico') {
      setTecnicoTab('hoy');
      setTecnicoRutaDetalleId('');
    } else if (sesion.rolActivo === 'admin') {
      setAdminTab('hoy');
    } else {
      setAdminTab('proyectos');
    }
  }, [sesion?.usuario.id, sesion?.empresaActivaId, sesion?.rolActivo]);

  // Abrir automáticamente el tutorial visual la primera vez que el perfil ingresa
  const hasProyeccion = Boolean(proyeccion);
  useEffect(() => {
    if (!sesion || requiereElegirEmpresa || !hasProyeccion) return;
    if (!tutorialesVistos[sesion.rolActivo]) {
      setIsTutorialOpen(true);
    }
  }, [
    sesion?.usuario.id,
    sesion?.empresaActivaId,
    sesion?.rolActivo,
    requiereElegirEmpresa,
    hasProyeccion,
    tutorialesVistos,
  ]);

  // Mantener ruta activa seleccionada al actualizar snapshot
  useEffect(() => {
    if (!proyeccion) return;
    const rutas = proyeccion.snapshot.rutas;
    setSelectedRutaId((prev) =>
      prev && rutas.some((r) => r.id === prev) ? prev : rutas[0]?.id || ''
    );
  }, [proyeccion]);

  const handleCerrarTutorial = () => {
    setIsTutorialOpen(false);
    marcarTutorialVisto();
  };

  const handleLogin = async (email: string, password: string) => {
    const nuevaSesion = await iniciarSesion(email, password);
    if (nuevaSesion.rolActivo === 'tecnico') {
      setTecnicoTab('hoy');
    } else if (nuevaSesion.rolActivo === 'admin') {
      setAdminTab('hoy');
    } else {
      setAdminTab('proyectos');
    }
  };

  const handleEntrarConCacheOffline = async () => {
    const guardada = await entrarConCacheOffline();
    if (!guardada) return;
    if (guardada.rolActivo === 'tecnico') {
      setTecnicoTab('hoy');
    } else if (guardada.rolActivo === 'admin') {
      setAdminTab('hoy');
    } else {
      setAdminTab('proyectos');
    }
    showToast('Sesión restaurada desde caché offline.');
  };

  const handleSeleccionarEmpresa = async (empresaId: string) => {
    const actualizada = await seleccionarEmpresa(empresaId);
    if (actualizada.rolActivo === 'tecnico') {
      setTecnicoTab('hoy');
    } else if (actualizada.rolActivo === 'admin') {
      setAdminTab('hoy');
    } else {
      setAdminTab('proyectos');
    }
  };

  const handleCerrarSesion = async () => {
    await cerrarSesion();
    setSelectedRutaId('');
    setTecnicoRutaDetalleId('');
    setStandaloneKmz(null);
    setIsOnboardingOpen(false);
    setIsTutorialOpen(false);
  };

  const handleSyncNow = async () => {
    try {
      const res = await sincronizarAhora();
      if (!res) return;
      const extraOcr =
        res.ocrProcesados > 0 ? ` (${res.ocrProcesados} recibo(s) OCR procesados)` : '';
      const extraLww =
        res.sobrescritosLocales.length > 0
          ? ` · ${res.sobrescritosLocales.length} cambio(s) local(es) actualizado(s) por versión más reciente`
          : '';
      showToast(`Sincronización completada${extraOcr}${extraLww}.`);
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'No se pudo completar la sincronización.');
    }
  };

  const rutasAsignadasAdminIds = useMemo(() => {
    if (!sesion || !proyeccion || proyeccion.rol === 'tecnico') return new Set<string>();
    const snap = proyeccion.snapshot;
    const mem = sesion.membresias.find((m) => m.empresaId === snap.empresa.id);
    return obtenerRutasAsignadasAUsuario({
      usuarioId: sesion.usuario.id,
      personalIdMembresia: mem?.personalId,
      personal: snap.personal,
      cuadrillas: snap.cuadrillas,
      asignaciones: snap.asignaciones,
    });
  }, [sesion, proyeccion]);

  // Mostrar AuthGate si no hay sesión o si debe elegir empresa
  if (!sesion || requiereElegirEmpresa) {
    return (
      <AuthGate
        isOnline={isOnline}
        isDemoActivo={isDemoActivo}
        cuentasDemo={cuentasDemo}
        sesionGuardada={sesion}
        empresasDisponibles={empresasDisponibles}
        onLogin={handleLogin}
        onEntrarConCacheOffline={handleEntrarConCacheOffline}
        onSeleccionarEmpresa={handleSeleccionarEmpresa}
        onCerrarSesion={handleCerrarSesion}
      />
    );
  }

  // Skeleton del shell operativo mientras carga el snapshot inicial
  if (!proyeccion) {
    return <AppShellSkeleton />;
  }

  const rol = proyeccion.rol;
  const empresaNombre = proyeccion.snapshot.empresa.nombre;
  const empresaId = proyeccion.snapshot.empresa.id;

  const selectedRutaGeneral =
    proyeccion.snapshot.rutas.find((r) => r.id === selectedRutaId) ??
    proyeccion.snapshot.rutas[0];

  const handleCaptureLiveGps = (fallbackCentroid?: GeoPoint) => {
    const activeCentroid = fallbackCentroid ?? standaloneKmz?.centroid ?? selectedRutaGeneral?.centroid;
    setIsCapturingGps(true);
    if (!navigator.geolocation) {
      if (activeCentroid) {
        setLiveGpsPoint(
          latLonToUtm19N(activeCentroid.lat + 0.0004, activeCentroid.lon - 0.0003, 16)
        );
        showToast('Posición referenciada sobre vértice del polígono.');
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

  const abrirModalViatico = (opts?: { rutaId?: string; proyectoId?: string; editar?: Viatico }) => {
    if (opts?.editar) {
      setEditingViatico(opts.editar);
      setExpenseDefaultRutaId(opts.editar.rutaId);
      setExpenseDefaultProyectoId(opts.editar.repartos[0]?.proyectoId);
    } else {
      setEditingViatico(null);
      const rutaObj = opts?.rutaId
        ? proyeccion.snapshot.rutas.find((r) => r.id === opts.rutaId)
        : selectedRutaGeneral;
      setExpenseDefaultRutaId(opts?.rutaId ?? rutaObj?.id);
      setExpenseDefaultProyectoId(opts?.proyectoId ?? rutaObj?.proyectoId);
    }
    setIsExpenseModalOpen(true);
  };

  // ============================================================================
  // RENDERIZADO ESTRICTO PARA ROL TÉCNICO (recibe únicamente SnapshotTecnico)
  // ============================================================================
  if (proyeccion.rol === 'tecnico') {
    const snapTecnico = proyeccion.snapshot;
    const servicioEnTransicion = transicionServicioId
      ? snapTecnico.servicios.find((s) => s.id === transicionServicioId) ?? null
      : null;
    const rutaServicioTransicion = servicioEnTransicion
      ? snapTecnico.rutas.find((r) => r.id === servicioEnTransicion.rutaId)
      : undefined;
    const asignacionesServicioTransicion = servicioEnTransicion
      ? snapTecnico.asignaciones.filter((a) => a.rutaId === servicioEnTransicion.rutaId)
      : [];
    const bitacorasServicioTransicion = servicioEnTransicion
      ? snapTecnico.bitacoras.filter((b) => b.servicioId === servicioEnTransicion.id).length
      : 0;

    const rutaActivaDetalle =
      tecnicoTab === 'ruta_detalle'
        ? snapTecnico.rutas.find((r) => r.id === tecnicoRutaDetalleId)
        : snapTecnico.rutas[0];

    const abrirDetalleRuta = (rId: string) => {
      setTecnicoRutaDetalleId(rId);
      setSelectedRutaId(rId);
      setTecnicoTab('ruta_detalle');
    };

    const tecnicoSidebarItems: Array<{
      id: Exclude<TecnicoTab, 'ruta_detalle'>;
      label: string;
      icon: React.FC<{ className?: string }>;
    }> = [
      { id: 'hoy', label: 'Hoy en Campo', icon: Compass },
      { id: 'rutas_tecnico', label: 'Mis Rutas', icon: Route },
      { id: 'agenda_tecnico', label: 'Mi Agenda Semanal', icon: CalendarDays },
      { id: 'viaticos_tecnico', label: 'Mis Viáticos', icon: Receipt },
    ];

    return (
      <div className="min-h-screen flex flex-col bg-[#F8FAFC] text-[#0D1C2F]">
        <DemoBanner visible={isDemoActivo} />
        <OfflineSyncBanner
          isOnline={isOnline}
          pendingCount={pendingCounts.total}
          pendingCounts={pendingCounts}
          hasConflict={hasConflict}
          isSyncing={isSyncing}
          avisosLww={avisosLww}
          onDescartarAvisosLww={descartarAvisosLww}
          onSyncNow={handleSyncNow}
        />

        <div className="flex flex-1 min-h-0">
          {/* Desktop Sidebar Técnico (únicamente vistas permitidas) */}
          <aside className="hidden lg:flex lg:w-64 lg:flex-col bg-[#0F2942] text-white shrink-0">
            <div className="px-5 py-5 border-b border-[#1E3A5F] space-y-3">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-md bg-[#0284C7] text-white">
                  <Compass className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-base font-bold tracking-tight truncate">SIRIUS</div>
                  <div className="text-[11px] leading-tight text-[#CBD5E1] line-clamp-2">
                    Módulo de Campo · Técnico
                  </div>
                  <div className="mt-0.5 text-[11px] font-medium text-[#93CCFF] truncate">
                    {empresaNombre}
                  </div>
                </div>
              </div>

              {empresasDisponibles.length > 1 && (
                <div className="flex items-center gap-1.5 rounded-md bg-[#091A2C] px-2.5 py-2 border border-white/10">
                  <Building2 className="h-3.5 w-3.5 text-[#93CCFF] shrink-0" />
                  <select
                    value={empresaId}
                    onChange={(e) => handleSeleccionarEmpresa(e.target.value)}
                    aria-label="Cambiar empresa activa"
                    className="w-full bg-transparent text-xs font-semibold text-white focus:outline-none"
                  >
                    {empresasDisponibles.map((item) => (
                      <option
                        key={item.empresa.id}
                        value={item.empresa.id}
                        className="text-[#0D1C2F]"
                      >
                        {item.empresa.nombre} ({item.rol})
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <nav className="flex-1 p-3 space-y-1">
              {tecnicoSidebarItems.map((item) => {
                const Icon = item.icon;
                const active =
                  tecnicoTab === item.id ||
                  (item.id === 'rutas_tecnico' && tecnicoTab === 'ruta_detalle');
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setTecnicoTab(item.id)}
                    className={`w-full flex items-center gap-3 rounded-md px-3 py-2.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 min-h-[40px] ${
                      active
                        ? 'bg-[#0284C7] text-white shadow-sm'
                        : 'text-[#CBD5E1] hover:bg-[#1E3A5F] hover:text-white'
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>

            <div className="p-4 border-t border-[#1E3A5F] space-y-3">
              <div className="rounded-lg bg-[#091A2C] p-3 text-xs border border-white/10">
                <div className="font-bold text-white truncate">{sesion.usuario.nombre}</div>
                <div className="mt-1 flex items-center justify-between text-[11px] text-[#93CCFF]">
                  <span className="font-mono uppercase">TÉCNICO</span>
                  <button
                    type="button"
                    onClick={handleCerrarSesion}
                    className="inline-flex items-center gap-1 text-[#CBD5E1] hover:text-white whitespace-nowrap shrink-0"
                  >
                    <LogOut className="h-3 w-3" />
                    Salir
                  </button>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsReportarSelectorOpen(true)}
                className="w-full flex items-center justify-center gap-2 rounded-md bg-[#0284C7] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#006398] transition-colors whitespace-nowrap shrink-0 min-h-[44px]"
              >
                <PlusCircle className="h-4 w-4" />
                Reportar en Campo
              </button>
            </div>
          </aside>

          {/* Main Viewport Técnico */}
          <div className="flex-1 flex flex-col min-w-0 pb-20 lg:pb-0">
            <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-slate-200 bg-white/95 backdrop-blur px-4 sm:px-6 h-14">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="lg:hidden flex h-8 w-8 items-center justify-center rounded-md bg-[#0F2942] text-white shrink-0">
                  <Compass className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <h1 className="text-sm sm:text-base font-bold tracking-tight text-[#0D1C2F] truncate">
                    {tecnicoTab === 'hoy' && 'Hoy en Campo'}
                    {tecnicoTab === 'rutas_tecnico' && 'Mis Rutas Asignadas'}
                    {tecnicoTab === 'ruta_detalle' && 'Detalle y Mapa de Ruta'}
                    {tecnicoTab === 'agenda_tecnico' && 'Mi Agenda Semanal'}
                    {tecnicoTab === 'viaticos_tecnico' && 'Mis Viáticos'}
                  </h1>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <div
                  className={`inline-flex items-center gap-1 text-xs font-medium whitespace-nowrap ${
                    isOnline ? 'text-[#15803D]' : 'text-[#D97706]'
                  }`}
                >
                  {isOnline ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
                  <span className="hidden sm:inline">{isOnline ? 'Conectado' : 'Offline'}</span>
                </div>

                <PWAInstallButton />

                <button
                  type="button"
                  onClick={() => setIsTutorialOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-[#0F2942] hover:bg-slate-50 min-h-[40px] whitespace-nowrap shrink-0"
                  title="Ver guía visual del módulo técnico"
                >
                  <HelpCircle className="h-4 w-4 text-[#0284C7]" />
                  <span className="hidden sm:inline">Ayuda</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsReportarSelectorOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-md bg-[#0284C7] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#006398] min-h-[40px] whitespace-nowrap shrink-0"
                >
                  <PlusCircle className="h-4 w-4" />
                  <span className="hidden sm:inline">Reportar</span>
                </button>
              </div>
            </header>

            <main className="flex-1 p-4 sm:p-6 space-y-6 max-w-[1080px] w-full mx-auto pb-24 lg:pb-8">
              {/* Mobile Session Strip */}
              <div className="flex lg:hidden items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-xs">
                <div className="min-w-0">
                  <div className="font-bold text-[#0F2942] truncate">{empresaNombre}</div>
                  <div className="font-mono text-[11px] text-[#43474D]">
                    {sesion.usuario.nombre} · TÉCNICO
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {empresasDisponibles.length > 1 && (
                    <select
                      value={empresaId}
                      onChange={(e) => handleSeleccionarEmpresa(e.target.value)}
                      aria-label="Cambiar empresa activa"
                      className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-[#0F2942] max-w-[140px] min-h-[36px]"
                    >
                      {empresasDisponibles.map((item) => (
                        <option key={item.empresa.id} value={item.empresa.id}>
                          {item.empresa.nombre}
                        </option>
                      ))}
                    </select>
                  )}
                  <button
                    type="button"
                    onClick={handleCerrarSesion}
                    className="rounded-md border border-slate-200 p-2 text-[#334155] hover:bg-slate-50 min-h-[36px] min-w-[36px] flex items-center justify-center"
                    aria-label="Cerrar sesión"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {tecnicoTab === 'hoy' && (
                <TecnicoHoyView
                  snapshot={snapTecnico}
                  isLoading={isLoadingSnapshot}
                  error={errorSnapshot}
                  isOnline={isOnline}
                  successBanner={tecnicoSuccessBanner}
                  onRetry={() => refrescar()}
                  onAbrirDetalleRuta={abrirDetalleRuta}
                  onAbrirTransicion={(srvId) => setTransicionServicioId(srvId)}
                  onAbrirBitacora={(srvId) => {
                    setBitacoraDefaultServicioId(srvId);
                    setIsBitacoraModalOpen(true);
                  }}
                  onReportarViatico={(rId, pId) => abrirModalViatico({ rutaId: rId, proyectoId: pId })}
                  onAbrirAgenda={() => setTecnicoTab('agenda_tecnico')}
                  onVerMisRutas={() => setTecnicoTab('rutas_tecnico')}
                />
              )}

              {tecnicoTab === 'rutas_tecnico' && (
                <TecnicoRutasView
                  snapshot={snapTecnico}
                  isLoading={isLoadingSnapshot}
                  error={errorSnapshot}
                  isOnline={isOnline}
                  areaUnit={areaUnit}
                  onRetry={() => refrescar()}
                  onAbrirDetalleRuta={abrirDetalleRuta}
                  onAbrirAgenda={() => setTecnicoTab('agenda_tecnico')}
                />
              )}

              {tecnicoTab === 'ruta_detalle' && (
                <TecnicoRutaDetalleView
                  snapshot={snapTecnico}
                  rutaId={tecnicoRutaDetalleId || snapTecnico.rutas[0]?.id || ''}
                  areaUnit={areaUnit}
                  onChangeAreaUnit={setAreaUnit}
                  liveGpsPoint={liveGpsPoint}
                  isCapturingGps={isCapturingGps}
                  onCaptureLiveGps={() => handleCaptureLiveGps(rutaActivaDetalle?.centroid)}
                  isOnline={isOnline}
                  successBanner={tecnicoSuccessBanner}
                  onVolver={() => setTecnicoTab('rutas_tecnico')}
                  onAbrirTransicion={(srvId) => setTransicionServicioId(srvId)}
                  onAbrirBitacora={(srvId) => {
                    setBitacoraDefaultServicioId(srvId);
                    setIsBitacoraModalOpen(true);
                  }}
                  onReportarViatico={(rId, pId) => abrirModalViatico({ rutaId: rId, proyectoId: pId })}
                />
              )}

              {tecnicoTab === 'agenda_tecnico' && (
                <TecnicoAgendaView
                  snapshot={snapTecnico}
                  isLoading={isLoadingSnapshot}
                  error={errorSnapshot}
                  isOnline={isOnline}
                  onRetry={() => refrescar()}
                  onVolverHoy={() => setTecnicoTab('hoy')}
                  onAbrirDetalleRuta={abrirDetalleRuta}
                />
              )}

              {tecnicoTab === 'viaticos_tecnico' && (
                <TecnicoViaticosView
                  snapshot={snapTecnico}
                  usuarioId={sesion.usuario.id}
                  isLoading={isLoadingSnapshot}
                  error={errorSnapshot}
                  isOnline={isOnline}
                  successBanner={tecnicoSuccessBanner}
                  onRetry={() => refrescar()}
                  onNuevoViatico={() =>
                    abrirModalViatico({
                      rutaId: rutaActivaDetalle?.id,
                      proyectoId: rutaActivaDetalle?.proyectoId,
                    })
                  }
                  onEditarViatico={(v) => abrirModalViatico({ editar: v })}
                  onEliminarViatico={async (vId) => {
                    await actions.eliminarViatico(vId);
                    showTecnicoSuccess('Viático pendiente eliminado.');
                  }}
                />
              )}
            </main>
          </div>
        </div>

        {/* Navegación móvil estricta de 4 botones para Técnico */}
        <nav
          aria-label="Navegación principal técnico"
          className="fixed bottom-0 inset-x-0 z-40 grid grid-cols-4 border-t border-[#CBD5E1] bg-white lg:hidden shadow-[0_-2px_10px_rgba(15,41,66,0.08)]"
        >
          <button
            type="button"
            onClick={() => setTecnicoTab('hoy')}
            className={`flex flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-semibold min-h-[56px] ${
              tecnicoTab === 'hoy' || tecnicoTab === 'agenda_tecnico'
                ? 'text-[#0284C7] bg-[#F8FAFC]'
                : 'text-[#43474D]'
            }`}
          >
            <Compass className="h-4 w-4" />
            <span>Hoy</span>
          </button>

          <button
            type="button"
            onClick={() => setTecnicoTab('rutas_tecnico')}
            className={`flex flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-semibold min-h-[56px] ${
              tecnicoTab === 'rutas_tecnico' || tecnicoTab === 'ruta_detalle'
                ? 'text-[#0284C7] bg-[#F8FAFC]'
                : 'text-[#43474D]'
            }`}
          >
            <Route className="h-4 w-4" />
            <span>Mis rutas</span>
          </button>

          <button
            type="button"
            onClick={() => setIsReportarSelectorOpen(true)}
            className="flex flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-bold text-[#0F2942] bg-[#EFF6FF] border-x border-[#E2E8F0] min-h-[56px]"
          >
            <PlusCircle className="h-5 w-5 text-[#0284C7]" />
            <span>Reportar</span>
          </button>

          <button
            type="button"
            onClick={() => setTecnicoTab('viaticos_tecnico')}
            className={`flex flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-semibold min-h-[56px] ${
              tecnicoTab === 'viaticos_tecnico'
                ? 'text-[#0284C7] bg-[#F8FAFC]'
                : 'text-[#43474D]'
            }`}
          >
            <Receipt className="h-4 w-4" />
            <span>Mis viáticos</span>
          </button>
        </nav>

        {/* Modales de campo para Técnico */}
        <TecnicoReportarSelectorModal
          isOpen={isReportarSelectorOpen}
          onClose={() => setIsReportarSelectorOpen(false)}
          onElegirViatico={() =>
            abrirModalViatico({
              rutaId: rutaActivaDetalle?.id,
              proyectoId: rutaActivaDetalle?.proyectoId,
            })
          }
          onElegirBitacora={() => {
            const srvPreferido = rutaActivaDetalle
              ? snapTecnico.servicios.find((s) => s.rutaId === rutaActivaDetalle.id)?.id
              : undefined;
            setBitacoraDefaultServicioId(srvPreferido);
            setIsBitacoraModalOpen(true);
          }}
        />

        <TecnicoBitacoraModal
          isOpen={isBitacoraModalOpen}
          onClose={() => setIsBitacoraModalOpen(false)}
          snapshot={snapTecnico}
          usuarioActual={sesion.usuario}
          defaultServicioId={bitacoraDefaultServicioId}
          isOnline={isOnline}
          onAgregarBitacora={async (datos) => {
            await actions.agregarBitacora(datos);
            showTecnicoSuccess(
              isOnline
                ? 'Entrada agregada a la bitácora.'
                : 'Bitácora guardada en cola offline.'
            );
          }}
        />

        <TecnicoTransicionModal
          isOpen={Boolean(servicioEnTransicion)}
          onClose={() => setTransicionServicioId(null)}
          servicio={servicioEnTransicion}
          ruta={rutaServicioTransicion}
          asignacionesRuta={asignacionesServicioTransicion}
          bitacoraCount={bitacorasServicioTransicion}
          isOnline={isOnline}
          onConfirmarTransicion={async (params) => {
            await actions.transicionarServicio(params);
            showTecnicoSuccess(
              params.nuevoEstado === 'en_campo'
                ? 'Servicio iniciado en campo.'
                : 'Servicio cerrado a Procesando.'
            );
          }}
          onAbrirBitacora={(srvId) => {
            setBitacoraDefaultServicioId(srvId);
            setIsBitacoraModalOpen(true);
          }}
        />

        <MobileExpenseCaptureModal
          isOpen={isExpenseModalOpen}
          onClose={() => {
            setIsExpenseModalOpen(false);
            setEditingViatico(null);
          }}
          proyectos={snapTecnico.proyectos}
          rutas={snapTecnico.rutas}
          misiones={snapTecnico.misiones}
          vehiculos={snapTecnico.vehiculos}
          viaticosExistentes={snapTecnico.viaticos}
          personalIdUsuario={snapTecnico.personalIdUsuario}
          cargoUsuario={
            snapTecnico.personal.find((p) => p.id === snapTecnico.personalIdUsuario)?.cargo ??
            'tecnico'
          }
          rolActivo="tecnico"
          defaultProyectoId={expenseDefaultProyectoId}
          defaultRutaId={expenseDefaultRutaId}
          editingViatico={editingViatico}
          isOnline={isOnline}
          sessionToken={sesion.token}
          creadoPorUsuario={sesion.usuario}
          baseLat={snapTecnico.empresa.baseLat}
          baseLon={snapTecnico.empresa.baseLon}
          moneda={snapTecnico.empresa.moneda}
          reglasCaptura={snapTecnico.reglasCapturaViaticos}
          onAddExpense={async (expense) => {
            await actions.registrarViatico(expense);
            showTecnicoSuccess(
              isOnline
                ? `Viático de ${formatRD(expense.montoRD)} registrado.`
                : `Viático guardado en cola offline (${formatRD(expense.montoRD)}).`
            );
          }}
          onEditExpense={async (viaticoId, expense) => {
            await actions.editarViatico(viaticoId, expense);
            showTecnicoSuccess('Viático pendiente actualizado.');
          }}
        />

        <TutorialVisualModal
          isOpen={isTutorialOpen}
          rol="tecnico"
          tarjetas={tutorialesPerfil}
          onClose={handleCerrarTutorial}
          onCompletar={handleCerrarTutorial}
        />

        {toastMessage && (
          <div className="fixed bottom-20 lg:bottom-5 right-4 z-50 flex items-center gap-2 rounded-lg border border-white/15 bg-[#091A2C]/95 backdrop-blur-md px-4 py-2.5 text-xs font-medium text-white shadow-xl max-w-sm">
            <CheckCircle2 className="h-4 w-4 text-[#86EFAC] shrink-0" />
            <span>{toastMessage}</span>
          </div>
        )}
      </div>
    );
  }

  // ============================================================================
  // RENDERIZADO ADMIN / COORDINADOR (preserva todas las vistas existentes)
  // ============================================================================
  const snapshot = proyeccion.snapshot;
  const canEdit = puedeCrearOEditarOperacion(rol);
  const canAudit = puedeVerAuditoria(rol);
  const canViewConfig = puedeVerConfiguracion(rol);
  const selectedRuta =
    snapshot.rutas.find((r) => r.id === selectedRutaId) ?? snapshot.rutas[0];

  const membresiaActivaAdmin = sesion.membresias.find((m) => m.empresaId === snapshot.empresa.id);
  const personalCargoUsuarioAdmin = resolverPersonalYCargoUsuario({
    usuarioId: sesion.usuario.id,
    rol,
    personalIdMembresia: membresiaActivaAdmin?.personalId,
    personal: snapshot.personal,
  });

  const reglasCapturaAdmin: ReglasCapturaViaticosTecnico | undefined =
    configuracion && reglasViaticosVigentes
      ? {
          version: reglasViaticosVigentes.version,
          vigenciaDesde: reglasViaticosVigentes.vigenciaDesde,
          gpsRuta: reglasViaticosVigentes.gpsRuta,
          presetsRapidos: reglasViaticosVigentes.presetsRapidos,
          categoriasViatico: configuracion.categoriasViatico,
        }
      : undefined;

  const handleNavegarPasoOnboarding = async (pasoId: OnboardingPasoId) => {
    if (onboarding) {
      const actualizado = seleccionarPasoOnboarding(onboarding, pasoId);
      await actions.guardarOnboarding(actualizado);
    }
    setIsOnboardingOpen(false);
    if (pasoId === 'empresa') {
      setConfigSeccionInicial('empresa');
      setAdminTab('configuracion');
    } else if (pasoId === 'personal_cargos') {
      setAdminTab('catalogos');
    } else if (pasoId === 'flota') {
      setAdminTab('catalogos');
    } else if (pasoId === 'servicios') {
      setConfigSeccionInicial('servicios');
      setAdminTab('configuracion');
    } else if (pasoId === 'cliente_proyecto') {
      setAdminTab('proyectos');
    } else if (pasoId === 'kmz_demo') {
      setPreloadedKmzForModal(null);
      setDefaultProyectoModal(snapshot.proyectos[0]?.id);
      setIsKmzModalOpen(true);
    }
  };

  const handleOpenKmzInViewer = async (file: File) => {
    try {
      const parsed = await parseKmzOrKmlFile(file);
      setStandaloneKmz(parsed);
      setMapViewerMode('cartografia');
      setAdminTab('map');
      showToast(`Visualizando ${parsed.fileName} en OpenStreetMap.`);
    } catch (err: unknown) {
      showToast(
        err instanceof Error ? err.message : 'No se pudo abrir el archivo KMZ/KML/GeoJSON.'
      );
    }
  };

  const navItems: Array<{
    id: AdminTab;
    label: string;
    shortLabel: string;
    icon: React.FC<{ className?: string }>;
  }> = [
    ...(rol === 'admin'
      ? [{ id: 'hoy' as const, label: 'Hoy', shortLabel: 'Hoy', icon: Home }]
      : []),
    { id: 'proyectos', label: 'Proyectos y Rutas', shortLabel: 'Proyectos', icon: FolderKanban },
    { id: 'agenda', label: 'Agenda y Cuadrillas', shortLabel: 'Agenda', icon: CalendarDays },
    { id: 'rutas', label: 'Rutas y Servicios', shortLabel: 'Rutas', icon: Route },
    { id: 'map', label: 'Visor KMZ / KML / DWG', shortLabel: 'Visor', icon: Layers },
    { id: 'viaticos', label: 'Viáticos y Gastos', shortLabel: 'Viáticos', icon: Receipt },
    { id: 'catalogos', label: 'Catálogos y Equipos', shortLabel: 'Catálogos', icon: Users },
    ...(canAudit
      ? [{ id: 'auditoria' as const, label: 'Auditoría F16', shortLabel: 'Auditoría', icon: History }]
      : []),
    ...(canViewConfig
      ? [
          {
            id: 'configuracion' as const,
            label: 'Configuración',
            shortLabel: 'Config',
            icon: Settings,
          },
        ]
      : []),
  ];

  const viewerFeatures = standaloneKmz?.features ?? selectedRuta?.features ?? [];
  const viewerCentroid =
    standaloneKmz?.centroid ??
    selectedRuta?.centroid ??
    latLonToUtm19N(snapshot.empresa.baseLat, snapshot.empresa.baseLon, 14);
  const viewerParcelCode =
    standaloneKmz?.autoMeta.parcelCode ?? selectedRuta?.codigoParcela ?? 'KMZ-PREVIEW';
  const viewerFileName = standaloneKmz?.fileName ?? selectedRuta?.kmzFileName ?? '';
  const viewerAreaM2 = standaloneKmz?.totalAreaM2 ?? selectedRuta?.totalAreaM2 ?? 0;
  const viewerPerimeterM = standaloneKmz?.totalPerimeterM ?? selectedRuta?.totalPerimeterM ?? 0;

  return (
    <div className="min-h-screen flex flex-col bg-[#F8FAFC] text-[#0D1C2F]">
      <DemoBanner visible={isDemoActivo} />
      <OfflineSyncBanner
        isOnline={isOnline}
        pendingCount={pendingCounts.total}
        pendingCounts={pendingCounts}
        hasConflict={hasConflict}
        isSyncing={isSyncing}
        avisosLww={avisosLww}
        onDescartarAvisosLww={descartarAvisosLww}
        onSyncNow={handleSyncNow}
      />

      <div className="flex flex-1 min-h-0">
        {/* Desktop Sidebar */}
        <aside className="hidden lg:flex lg:w-64 lg:flex-col bg-[#0F2942] text-white shrink-0">
          <div className="px-5 py-5 border-b border-[#1E3A5F] space-y-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-[#0284C7] text-white">
                <Compass className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div
                  className="text-base font-bold tracking-tight whitespace-nowrap truncate"
                  title="SIRIUS: Sistema Integral de Recursos, Información, Operaciones y Análisis"
                >
                  SIRIUS
                </div>
                <div className="text-[11px] leading-tight text-[#CBD5E1] line-clamp-2">
                  Sistema Integral de Recursos, Información, Operaciones y Análisis
                </div>
                <div className="mt-0.5 text-[11px] font-medium text-[#93CCFF] truncate">
                  {snapshot.empresa.nombre}
                </div>
              </div>
            </div>

            {empresasDisponibles.length > 1 && (
              <div className="flex items-center gap-1.5 rounded-md bg-[#091A2C] px-2.5 py-2 border border-white/10">
                <Building2 className="h-3.5 w-3.5 text-[#93CCFF] shrink-0" />
                <select
                  value={empresaId}
                  onChange={(e) => handleSeleccionarEmpresa(e.target.value)}
                  aria-label="Cambiar empresa activa"
                  className="w-full bg-transparent text-xs font-semibold text-white focus:outline-none"
                >
                  {empresasDisponibles.map((item) => (
                    <option key={item.empresa.id} value={item.empresa.id} className="text-[#0D1C2F]">
                      {item.empresa.nombre} ({item.rol})
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <nav className="flex-1 p-3 space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = adminTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setAdminTab(item.id)}
                  className={`w-full flex items-center gap-3 rounded-md px-3 py-2.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 min-h-[40px] ${
                    active
                      ? 'bg-[#0284C7] text-white shadow-sm'
                      : 'text-[#CBD5E1] hover:bg-[#1E3A5F] hover:text-white'
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Sesión Activa & Reporte Móvil */}
          <div className="p-4 border-t border-[#1E3A5F] space-y-3">
            <div className="rounded-lg bg-[#091A2C] p-3 text-xs border border-white/10">
              <div className="font-bold text-white truncate">{sesion.usuario.nombre}</div>
              <div className="mt-1 flex items-center justify-between text-[11px] text-[#93CCFF]">
                <span className="font-mono uppercase">{rol}</span>
                <button
                  type="button"
                  onClick={handleCerrarSesion}
                  className="inline-flex items-center gap-1 text-[#CBD5E1] hover:text-white whitespace-nowrap shrink-0"
                >
                  <LogOut className="h-3 w-3" />
                  Salir
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={() => abrirModalViatico()}
              className="w-full flex items-center justify-center gap-2 rounded-md border border-white/20 bg-[#0284C7] px-3 py-2.5 text-xs font-semibold text-white hover:bg-[#006398] transition-colors whitespace-nowrap shrink-0 min-h-[40px]"
            >
              <Camera className="h-3.5 w-3.5" />
              Reportar Viático Móvil
            </button>
          </div>
        </aside>

        {/* Main Viewport */}
        <div className="flex-1 flex flex-col min-w-0 pb-20 lg:pb-0">
          <header className="sticky top-0 z-30 flex items-center justify-between gap-4 border-b border-slate-200 bg-white/95 backdrop-blur px-4 sm:px-6 h-14">
            <div className="flex items-center gap-3 min-w-0">
              <div className="lg:hidden flex h-8 w-8 items-center justify-center rounded-md bg-[#0F2942] text-white shrink-0">
                <Compass className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <h1 className="text-sm sm:text-base font-bold tracking-tight text-[#0D1C2F] truncate">
                  {adminTab === 'hoy' && `${snapshot.empresa.nombre} · Hoy`}
                  {adminTab === 'proyectos' && `${snapshot.empresa.nombre} · Proyectos y Rutas`}
                  {adminTab === 'agenda' && 'Agenda de Cuadrillas y Conflictos'}
                  {adminTab === 'rutas' && 'Cálculo de Rutas y Servicios Sumatorios'}
                  {adminTab === 'map' &&
                    (mapViewerMode === 'planos'
                      ? 'Planos Arquitectónicos · AutoCAD (.DWG / .DXF)'
                      : 'Visualizador KMZ / KML / GeoJSON · OpenStreetMap')}
                  {adminTab === 'viaticos' && 'Control de Viáticos y Reparto por Proyecto'}
                  {adminTab === 'catalogos' && 'Catálogos, Flota y Equipos GNSS'}
                  {adminTab === 'auditoria' && 'Auditoría Operativa (F16)'}
                  {adminTab === 'configuracion' && `${snapshot.empresa.nombre} · Configuración`}
                </h1>
              </div>
            </div>

            <div className="flex items-center gap-2.5 shrink-0">
              <div
                className={`hidden sm:inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap ${
                  isOnline ? 'text-[#15803D]' : 'text-[#D97706]'
                }`}
              >
                {isOnline ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
                <span>{isOnline ? 'Conectado' : 'Offline'}</span>
              </div>

              <PWAInstallButton />

              {rol === 'admin' && (
                <button
                  type="button"
                  onClick={() => setAdminTab('hoy')}
                  className="lg:hidden inline-flex items-center justify-center rounded-md border border-slate-200 bg-white px-2.5 py-2 text-xs font-semibold text-[#0F2942] hover:bg-slate-50 min-h-[40px] min-w-[40px]"
                  title="Hoy"
                  aria-label="Ir a Hoy"
                >
                  <Home className="h-4 w-4 text-[#0F2942]" />
                </button>
              )}

              {canViewConfig && (
                <button
                  type="button"
                  onClick={() => setAdminTab('configuracion')}
                  className="lg:hidden inline-flex items-center justify-center rounded-md border border-slate-200 bg-white px-2.5 py-2 text-xs font-semibold text-[#0F2942] hover:bg-slate-50 min-h-[40px] min-w-[40px]"
                  title="Configuración"
                  aria-label="Ir a Configuración"
                >
                  <Settings className="h-4 w-4 text-[#0F2942]" />
                </button>
              )}

              <button
                type="button"
                onClick={() => setIsTutorialOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-[#0F2942] hover:bg-slate-50 min-h-[40px] whitespace-nowrap shrink-0"
                title="Abrir tutorial visual del perfil"
              >
                <HelpCircle className="h-4 w-4 text-[#0284C7]" />
                <span className="hidden sm:inline">Ayuda</span>
              </button>

              {canEdit && (
                <button
                  type="button"
                  onClick={() => {
                    setPreloadedKmzForModal(null);
                    setDefaultProyectoModal(snapshot.proyectos[0]?.id);
                    setIsKmzModalOpen(true);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-md bg-[#0F2942] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0284C7] transition-colors whitespace-nowrap shrink-0 min-h-[40px]"
                >
                  <Plus className="h-4 w-4" />
                  <span className="hidden sm:inline">Nueva Ruta KMZ</span>
                  <span className="sm:hidden">KMZ</span>
                </button>
              )}
            </div>
          </header>

          <main className="flex-1 p-4 sm:p-6 space-y-6 max-w-[1440px] w-full mx-auto pb-24 lg:pb-8">
            <div className="flex lg:hidden items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-xs">
              <div className="min-w-0">
                <div className="font-bold text-[#0F2942] truncate">{snapshot.empresa.nombre}</div>
                <div className="font-mono text-[11px] text-[#43474D]">
                  {sesion.usuario.nombre} · {rol.toUpperCase()}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {empresasDisponibles.length > 1 && (
                  <select
                    value={empresaId}
                    onChange={(e) => handleSeleccionarEmpresa(e.target.value)}
                    aria-label="Cambiar empresa activa"
                    className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-[#0F2942] max-w-[140px] min-h-[36px]"
                  >
                    {empresasDisponibles.map((item) => (
                      <option key={item.empresa.id} value={item.empresa.id}>
                        {item.empresa.nombre}
                      </option>
                    ))}
                  </select>
                )}
                <button
                  type="button"
                  onClick={handleCerrarSesion}
                  className="rounded-md border border-slate-200 p-2 text-[#334155] hover:bg-slate-50 min-h-[36px] min-w-[36px] flex items-center justify-center"
                  aria-label="Cerrar sesión"
                >
                  <LogOut className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {adminTab === 'hoy' && rol === 'admin' && onboarding && (
              <AdminHoyView
                empresa={snapshot.empresa}
                isLoading={isLoadingSnapshot}
                personal={snapshot.personal}
                proyectos={snapshot.proyectos}
                serviciosConfig={configuracion?.servicios ?? []}
                rutas={snapshot.rutas}
                servicios={snapshot.servicios}
                asignaciones={snapshot.asignaciones}
                cuadrillas={snapshot.cuadrillas}
                vehiculos={snapshot.vehiculos}
                viaticos={snapshot.viaticos}
                rentas={snapshot.rentas}
                onboarding={onboarding}
                isDemo={isDemoActivo}
                onIrAPasoOnboarding={(pasoId) => {
                  handleNavegarPasoOnboarding(pasoId).catch(() => {});
                }}
                onAbrirOnboarding={() => setIsOnboardingOpen(true)}
                onCerrarTarjetaOnboarding={async () => {
                  const oculta = ocultarTarjetaOnboarding(onboarding);
                  await actions.guardarOnboarding(oculta);
                  showToast(
                    'Tarjeta ocultada. Puedes reabrir el asistente en Configuración → Ayuda y tutorial.'
                  );
                }}
                onIrATab={(tab) => setAdminTab(tab)}
              />
            )}

            {adminTab === 'proyectos' && (
              <ProyectosView
                rol={rol}
                isLoading={isLoadingSnapshot}
                usuarioActual={sesion.usuario}
                clientes={snapshot.clientes}
                proyectos={snapshot.proyectos}
                rutas={snapshot.rutas}
                servicios={snapshot.servicios}
                bitacoras={snapshot.bitacoras}
                viaticos={snapshot.viaticos}
                rutasAsignadasIds={rutasAsignadasAdminIds}
                areaUnit={areaUnit}
                pendingSyncCount={pendingCounts.total}
                serviciosCatalogo={serviciosVigentes}
                factoresTerreno={factoresTerrenoVigentes}
                moneda={snapshot.empresa.moneda}
                onChangeAreaUnit={setAreaUnit}
                onCrearCliente={async (datos) => {
                  await actions.crearCliente(datos);
                  showToast(`Cliente "${datos.nombre}" registrado.`);
                }}
                onCrearProyecto={async (datos) => {
                  await actions.crearProyecto(datos);
                  showToast(`Proyecto "${datos.nombre}" creado en estado Cotizado.`);
                }}
                onAbrirNuevaRutaKmz={(proyId) => {
                  setPreloadedKmzForModal(null);
                  setDefaultProyectoModal(proyId);
                  setIsKmzModalOpen(true);
                }}
                onAgregarServicioARuta={async (datos) => {
                  await actions.crearServicio(datos);
                  showToast(`Servicio "${datos.nombre}" agregado.`);
                }}
                onTransicionarServicio={async (params) => {
                  await actions.transicionarServicio(params);
                  showToast(`Estado actualizado a "${params.nuevoEstado}".`);
                }}
                onAgregarBitacora={async (datos) => {
                  await actions.agregarBitacora(datos);
                  showToast('Entrada agregada a la bitácora.');
                }}
                onVerRutaEnMapa={(rId) => {
                  setStandaloneKmz(null);
                  setSelectedRutaId(rId);
                  setMapViewerMode('cartografia');
                  setAdminTab('map');
                }}
                onCalcularRuta={(rId) => {
                  setSelectedRutaId(rId);
                  setAdminTab('rutas');
                }}
                onReportarViaticoEnRuta={(rId, pId) =>
                  abrirModalViatico({ rutaId: rId, proyectoId: pId })
                }
              />
            )}

            {adminTab === 'agenda' && (
              <AgendaView
                rol={rol}
                isLoading={isLoadingSnapshot}
                usuarioActual={sesion.usuario}
                rutas={snapshot.rutas}
                cuadrillas={snapshot.cuadrillas}
                personal={snapshot.personal}
                vehiculos={snapshot.vehiculos}
                equipos={snapshot.equipos}
                asignaciones={snapshot.asignaciones}
                rentas={snapshot.rentas}
                misiones={snapshot.misiones}
                umbralCercaniaRentaKm={rendimientoFlotaVigente?.umbralCercaniaRentaKm}
                onGuardarAsignacion={async (datos) => {
                  await actions.guardarAsignacion(datos);
                  showToast(
                    datos.overrideConflicto
                      ? 'Asignación guardada con excepción auditada.'
                      : 'Asignación de cuadrilla programada.'
                  );
                }}
                onEliminarAsignacion={async (asigId) => {
                  await actions.eliminarAsignacion(asigId);
                  showToast('Asignación eliminada.');
                }}
              />
            )}

            {adminTab === 'rutas' && (
              <RouteServicesCalculator
                rutas={snapshot.rutas}
                proyectos={snapshot.proyectos}
                vehiculos={snapshot.vehiculos}
                selectedRuta={selectedRuta}
                isLoading={isLoadingSnapshot}
                canEdit={canEdit}
                creadoPorUsuario={sesion.usuario}
                baseLat={snapshot.empresa.baseLat}
                baseLon={snapshot.empresa.baseLon}
                baseDireccion={snapshot.empresa.direccionBase}
                serviciosVigentes={serviciosVigentes}
                factoresTerreno={factoresTerrenoVigentes}
                reglasViaticos={reglasViaticosVigentes}
                moneda={snapshot.empresa.moneda}
                onSelectRuta={setSelectedRutaId}
                onApplyToRuta={async ({
                  rutaId,
                  proyectoId,
                  budgetViaticosRD,
                  contractValueRD,
                  serviciosPropuestos,
                  routeSummary,
                }) => {
                  const rutaObj = snapshot.rutas.find((r) => r.id === rutaId);
                  const proyObj = snapshot.proyectos.find((p) => p.id === proyectoId);
                  if (rutaObj) {
                    await actions.actualizarRuta({
                      ...rutaObj,
                      routeSummary,
                    });
                  }
                  if (proyObj) {
                    await actions.actualizarProyecto({
                      ...proyObj,
                      presupuestoViaticosRD: budgetViaticosRD,
                      valorContratoRD: contractValueRD,
                    });
                  }
                  for (const sp of serviciosPropuestos) {
                    const existente = snapshot.servicios.find(
                      (s) => s.rutaId === rutaId && s.tipoServicioId === sp.tipoServicioId
                    );
                    if (!existente) {
                      await actions.crearServicio({
                        rutaId,
                        tipoServicioId: sp.tipoServicioId,
                        nombre: sp.nombre,
                        cotizacionRD: sp.cotizacionRD,
                        configVersion: sp.configVersion,
                        tarifaBaseUsadaRD: sp.tarifaBaseUsadaRD,
                        recargosUsadosRD: sp.recargosUsadosRD,
                        estado: 'cotizado',
                      });
                    } else if (
                      existente.estado === 'cotizado' &&
                      existente.cotizacionRD !== sp.cotizacionRD
                    ) {
                      await actions.actualizarServicio({
                        ...existente,
                        nombre: sp.nombre,
                        cotizacionRD: sp.cotizacionRD,
                        configVersion: sp.configVersion,
                        tarifaBaseUsadaRD: sp.tarifaBaseUsadaRD,
                        recargosUsadosRD: sp.recargosUsadosRD,
                      });
                    }
                  }
                  showToast(
                    `Presupuesto (${formatRD(budgetViaticosRD, snapshot.empresa.moneda)}) y servicios aplicados al proyecto.`
                  );
                }}
                onRegisterKmzFromCalculator={(parsed) => {
                  setPreloadedKmzForModal(parsed);
                  setIsKmzModalOpen(true);
                }}
                onLogRouteExpenses={async (items) => {
                  for (const item of items) {
                    await actions.registrarViatico(item);
                  }
                  setAdminTab('viaticos');
                  showToast(`${items.length} viático(s) de ruta registrados en el libro.`);
                }}
                onOpenExpenseModal={() =>
                  abrirModalViatico({
                    rutaId: selectedRuta?.id,
                    proyectoId: selectedRuta?.proyectoId,
                  })
                }
              />
            )}

            {adminTab === 'map' && (
              <section className="space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-5 py-3">
                  <div className="inline-flex rounded-md bg-slate-100 p-1 border border-slate-200">
                    <button
                      type="button"
                      onClick={() => setMapViewerMode('cartografia')}
                      className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                        mapViewerMode === 'cartografia'
                          ? 'bg-[#0F2942] text-white shadow-sm'
                          : 'text-[#334155] hover:text-[#0F2942]'
                      }`}
                    >
                      <Layers className="h-3.5 w-3.5" />
                      Mapa Cartográfico (KMZ / KML / GeoJSON)
                    </button>
                    <button
                      type="button"
                      onClick={() => setMapViewerMode('planos')}
                      className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                        mapViewerMode === 'planos'
                          ? 'bg-[#0F2942] text-white shadow-sm'
                          : 'text-[#334155] hover:text-[#0F2942]'
                      }`}
                    >
                      <Compass className="h-3.5 w-3.5" />
                      Planos Arquitectónicos (.DWG / .DXF)
                    </button>
                  </div>

                  <span className="text-xs text-[#43474D]">
                    {mapViewerMode === 'planos'
                      ? 'Lectura vectorial CAD local para arquitectura e ingeniería'
                      : 'Parcelas, polilíneas y coordenadas UTM Zona 19N sobre OSM'}
                  </span>
                </div>

                {mapViewerMode === 'cartografia' ? (
                  <>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-4">
                      <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-0">
                        <select
                          value={standaloneKmz ? '__standalone__' : selectedRuta?.id ?? ''}
                          onChange={(e) => {
                            if (e.target.value !== '__standalone__') {
                              setStandaloneKmz(null);
                              setSelectedRutaId(e.target.value);
                            }
                          }}
                          className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-[#0D1C2F] min-h-[40px] max-w-full"
                        >
                          {standaloneKmz && (
                            <option value="__standalone__">
                              Vista previa: {standaloneKmz.fileName}
                            </option>
                          )}
                          {snapshot.rutas.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.codigoParcela} — {r.nombre} ({r.provincia})
                            </option>
                          ))}
                        </select>

                        <input
                          ref={viewerFileInputRef}
                          type="file"
                          accept=".kmz,.kml,.geojson,.json"
                          className="hidden"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) handleOpenKmzInViewer(f);
                            e.target.value = '';
                          }}
                        />

                        <button
                          type="button"
                          onClick={() => viewerFileInputRef.current?.click()}
                          className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-semibold text-[#0F2942] hover:bg-sky-50 min-h-[40px] whitespace-nowrap shrink-0"
                        >
                          <FileUp className="h-4 w-4 text-[#0284C7]" />
                          Abrir Archivo KMZ / KML / GeoJSON
                        </button>

                        {standaloneKmz && canEdit && (
                          <button
                            type="button"
                            onClick={() => {
                              setPreloadedKmzForModal(standaloneKmz);
                              setIsKmzModalOpen(true);
                            }}
                            className="inline-flex items-center gap-1.5 rounded-md bg-[#0F2942] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#0284C7] min-h-[40px] whitespace-nowrap shrink-0"
                          >
                            <Plus className="h-4 w-4" />
                            Guardar como Ruta de Proyecto
                          </button>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => handleCaptureLiveGps()}
                        disabled={isCapturingGps}
                        className="inline-flex items-center justify-center gap-1.5 rounded-md bg-[#0284C7] px-4 py-2 text-xs font-semibold text-white hover:bg-[#006398] disabled:opacity-60 min-h-[40px] whitespace-nowrap shrink-0"
                      >
                        <Compass className="h-4 w-4" />
                        {isCapturingGps ? 'Fijando GPS...' : 'Capturar GPS Actual'}
                      </button>
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
                      onDropFile={handleOpenKmzInViewer}
                    />
                  </>
                ) : (
                  <DwgPlanViewer
                    plan={loadedDwgPlan}
                    onPlanLoaded={(next) => {
                      setLoadedDwgPlan(next);
                      if (next) {
                        showToast(`Plano ${next.fileName} cargado (${next.layers.length} capas).`);
                      }
                    }}
                  />
                )}
              </section>
            )}

            {adminTab === 'viaticos' && (
              <ViaticosView
                rol={rol}
                isLoading={isLoadingSnapshot}
                viaticos={snapshot.viaticos}
                proyectos={snapshot.proyectos}
                misiones={snapshot.misiones}
                rentas={snapshot.rentas}
                cargos={cargos}
                configuracion={configuracion ?? undefined}
                moneda={snapshot.empresa.moneda}
                onAbrirModalNuevo={() => abrirModalViatico()}
                onDecidirViatico={async (params) => {
                  await actions.decidirViatico(params);
                  showToast(`Viático marcado como ${params.nuevoEstado}.`);
                }}
                onActualizarReparto={async (viaticoId, repartos) => {
                  await actions.actualizarRepartoViatico(viaticoId, repartos);
                  showToast('Reparto exacto por proyecto actualizado.');
                }}
                onEliminarViatico={async (viaticoId) => {
                  await actions.eliminarViatico(viaticoId);
                  showToast('Viático eliminado.');
                }}
              />
            )}

            {adminTab === 'catalogos' && (
              <CatalogosView
                rol={rol}
                isLoading={isLoadingSnapshot}
                clientes={snapshot.clientes}
                personal={snapshot.personal}
                cargos={cargos}
                vehiculos={snapshot.vehiculos}
                combustiblesVigentes={combustiblesVigentes}
                equipos={snapshot.equipos}
                cuadrillas={snapshot.cuadrillas}
                misiones={snapshot.misiones}
                rutas={snapshot.rutas}
                proyectos={snapshot.proyectos}
                asignaciones={snapshot.asignaciones}
                viaticos={snapshot.viaticos}
                bitacoras={snapshot.bitacoras}
                rentas={snapshot.rentas}
                rendimientoConfig={rendimientoFlotaVigente}
                reglasViaticos={reglasViaticosVigentes}
                usuarioActual={sesion.usuario}
                moneda={snapshot.empresa.moneda}
                onCrearCliente={async (datos) => {
                  await actions.crearCliente(datos);
                }}
                onGuardarPersonal={async (item) => {
                  await actions.guardarPersonal(item);
                }}
                onGuardarVehiculo={async (item) => {
                  await actions.guardarVehiculo(item);
                }}
                onGuardarEquipo={async (item) => {
                  await actions.guardarEquipo(item);
                }}
                onGuardarCuadrilla={async (item) => {
                  await actions.guardarCuadrilla(item);
                }}
                onGuardarRenta={async (datos) => {
                  await actions.guardarRenta(datos);
                  showToast('Renta registrada en flota/equipos.');
                }}
                onDevolverRenta={async (params) => {
                  await actions.devolverRenta(params);
                  showToast('Devolución de renta registrada.');
                }}
                onCrearMision={async (datos) => {
                  await actions.crearMision(datos);
                  showToast(`Misión "${datos.nombre}" creada.`);
                }}
              />
            )}

            {adminTab === 'auditoria' && canAudit && (
              <AuditoriaView historial={snapshot.historial} isLoading={isLoadingSnapshot} />
            )}

            {adminTab === 'configuracion' && canViewConfig && configuracion && (
              <ConfiguracionView
                rol={rol}
                isLoading={isLoadingSnapshot}
                usuarioActualId={sesion.usuario.id}
                empresa={snapshot.empresa}
                configuracion={configuracion}
                membresias={snapshot.membresias}
                usuarios={snapshot.usuarios}
                personal={snapshot.personal}
                vehiculos={snapshot.vehiculos}
                isDemo={isDemoActivo}
                seccionInicial={configSeccionInicial}
                onActualizarEmpresa={async (emp) => {
                  await actions.actualizarEmpresa(emp);
                  showToast('Datos de la empresa actualizados.');
                }}
                onGuardarMembresiaUsuario={async (params) => {
                  await actions.guardarMembresiaUsuario(params);
                  showToast(`Acceso guardado para ${params.email}.`);
                }}
                onActualizarAccesoMembresia={async (params) => {
                  await actions.actualizarAccesoMembresia(params);
                  showToast('Permiso de usuario actualizado.');
                }}
                onGuardarCargoConfig={async (cargo) => {
                  await actions.guardarCargoConfig(cargo);
                  showToast(`Cargo "${cargo.etiqueta}" guardado.`);
                }}
                onEliminarCargoConfig={async (codigo) => {
                  await actions.eliminarCargoConfig(codigo);
                  showToast('Cargo eliminado del catálogo.');
                }}
                onCrearTipoCombustible={async (params) => {
                  await actions.crearTipoCombustible(params);
                  showToast(`Combustible "${params.nombre}" agregado.`);
                }}
                onAgregarVigenciaCombustible={async (params) => {
                  await actions.agregarVigenciaCombustible(params);
                  showToast(`Nueva vigencia de combustible (${params.vigenciaDesde}) guardada.`);
                }}
                onCrearServicioCatalogo={async (params) => {
                  await actions.crearServicioCatalogo(params);
                  showToast(`Servicio "${params.nombre}" agregado al catálogo.`);
                }}
                onAgregarVigenciaServicio={async (params) => {
                  await actions.agregarVigenciaServicio(params);
                  showToast(`Nueva vigencia (${params.tarifa.vigenciaDesde}) aplicada.`);
                }}
                onAgregarVigenciaFactoresTerreno={async (factores) => {
                  await actions.agregarVigenciaFactoresTerreno(factores);
                  showToast(`Factores de terreno vigentes desde ${factores.vigenciaDesde} guardados.`);
                }}
                onAgregarVigenciaReglasViaticos={async (reglas) => {
                  await actions.agregarVigenciaReglasViaticos(reglas);
                  showToast(`Reglas vigentes desde ${reglas.vigenciaDesde} guardadas.`);
                }}
                onAgregarVigenciaTopeViatico={async (params) => {
                  await actions.agregarVigenciaTopeViatico(params);
                  showToast(
                    `Tope de viático (${params.categoria}) vigente desde ${params.vigenciaDesde} guardado.`
                  );
                }}
                onAgregarVigenciaRendimientoFlota={async (regla) => {
                  await actions.agregarVigenciaRendimientoFlota(regla);
                  showToast(
                    `Parámetros de rendimiento y cercanía vigentes desde ${regla.vigenciaDesde} guardados.`
                  );
                }}
                onAbrirTutorial={() => setIsTutorialOpen(true)}
                onReiniciarOnboarding={async () => {
                  const nuevo = reiniciarOnboarding(snapshot.empresa.id);
                  await actions.guardarOnboarding(nuevo);
                  setIsOnboardingOpen(true);
                  showToast('Asistente de puesta en marcha reiniciado.');
                }}
              />
            )}
          </main>
        </div>
      </div>

      {/* Mobile Sticky 5-Button Navigation Bar para Admin / Coordinador */}
      <nav className="fixed bottom-0 inset-x-0 z-40 grid grid-cols-5 border-t border-[#CBD5E1] bg-white lg:hidden shadow-[0_-2px_10px_rgba(15,41,66,0.08)]">
        {[
          { id: 'proyectos' as const, label: 'Proyectos', icon: FolderKanban },
          { id: 'agenda' as const, label: 'Agenda', icon: CalendarDays },
          { id: 'map' as const, label: 'Mapa', icon: Layers },
          { id: 'viaticos' as const, label: 'Viáticos', icon: Receipt },
          { id: 'catalogos' as const, label: 'Equipos', icon: Users },
        ].map((item) => {
          const Icon = item.icon;
          const active = adminTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setAdminTab(item.id)}
              className={`flex flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-semibold min-h-[54px] ${
                active ? 'text-[#0284C7] bg-[#F8FAFC]' : 'text-[#43474D]'
              }`}
            >
              <Icon className="h-4 w-4" />
              <span className="truncate">{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Modales Admin / Coordinador */}
      <KmzImportModal
        isOpen={isKmzModalOpen}
        onClose={() => {
          setIsKmzModalOpen(false);
          setPreloadedKmzForModal(null);
        }}
        clientes={snapshot.clientes}
        proyectos={snapshot.proyectos}
        vehiculos={snapshot.vehiculos}
        cuadrillas={snapshot.cuadrillas}
        equipos={snapshot.equipos}
        defaultProyectoId={defaultProyectoModal}
        preloadedKmz={preloadedKmzForModal}
        creadoPorUsuario={sesion.usuario}
        baseLat={snapshot.empresa.baseLat}
        baseLon={snapshot.empresa.baseLon}
        baseDireccion={snapshot.empresa.direccionBase}
        serviciosVigentes={serviciosVigentes}
        factoresTerreno={factoresTerrenoVigentes}
        reglasViaticos={reglasViaticosVigentes}
        moneda={snapshot.empresa.moneda}
        onCrearClienteYProyectoRapido={async (datos) => {
          let cliId = datos.clienteIdExistente;
          if (!cliId) {
            const nuevoCli = await actions.crearCliente({
              nombre: datos.clienteNombre,
              rnc: datos.clienteRnc,
              contacto: datos.clienteContacto,
            });
            cliId = nuevoCli.id;
          }
          return actions.crearProyecto({
            clienteId: cliId,
            nombre: datos.proyectoNombre,
            codigoContrato: datos.codigoContrato,
            presupuestoViaticosRD: datos.presupuestoViaticosRD,
            valorContratoRD: datos.valorContratoRD,
          });
        }}
        onCreateRutaCompleta={async ({
          proyectoId,
          ruta,
          servicios,
          asignacionOpcional,
          viaticosIniciales,
          openMobileExpenseAfter,
        }) => {
          const nuevaRuta = await actions.crearRuta(ruta);
          for (const srv of servicios) {
            await actions.crearServicio({
              ...srv,
              rutaId: nuevaRuta.id,
            });
          }
          if (viaticosIniciales && viaticosIniciales.length > 0) {
            for (const via of viaticosIniciales) {
              await actions.registrarViatico({
                ...via,
                rutaId: nuevaRuta.id,
              });
            }
          }

          if (asignacionOpcional) {
            const snapActual = await actions.cargarSnapshotParaValidacion();
            const conflictos = detectarConflictosAsignacion({
              candidata: {
                id: `asig-kmz-${Date.now()}`,
                rutaId: nuevaRuta.id,
                ...asignacionOpcional,
              },
              asignacionesExistentes: snapActual.asignaciones,
              rutas: snapActual.rutas,
              cuadrillas: snapActual.cuadrillas,
              personal: snapActual.personal,
              vehiculos: snapActual.vehiculos,
              equipos: snapActual.equipos,
              rentasExistentes: snapActual.rentas,
              misiones: snapActual.misiones,
              umbralCercaniaRentaKm: rendimientoFlotaVigente?.umbralCercaniaRentaKm,
            });

            if (conflictos.length > 0) {
              setPendingKmzAsig({
                rutaId: nuevaRuta.id,
                ...asignacionOpcional,
              });
              setKmzAsigConflictos(conflictos);
            } else {
              await actions.guardarAsignacion({
                rutaId: nuevaRuta.id,
                ...asignacionOpcional,
              });
            }
          }

          setSelectedRutaId(nuevaRuta.id);
          setStandaloneKmz(null);
          setPreloadedKmzForModal(null);

          if (openMobileExpenseAfter) {
            abrirModalViatico({ rutaId: nuevaRuta.id, proyectoId });
            showToast(`Ruta ${nuevaRuta.codigoParcela} creada. Adjunta tu comprobante móvil.`);
          } else {
            setAdminTab('proyectos');
            showToast(`Ruta ${nuevaRuta.codigoParcela} y servicios registrados.`);
          }
        }}
      />

      <MobileExpenseCaptureModal
        isOpen={isExpenseModalOpen}
        onClose={() => {
          setIsExpenseModalOpen(false);
          setEditingViatico(null);
        }}
        proyectos={snapshot.proyectos}
        rutas={snapshot.rutas}
        misiones={snapshot.misiones}
        vehiculos={snapshot.vehiculos}
        viaticosExistentes={snapshot.viaticos}
        configuracion={configuracion ?? undefined}
        cargoUsuario={personalCargoUsuarioAdmin.cargoCodigo}
        personalIdUsuario={personalCargoUsuarioAdmin.personalId}
        rolActivo={rol}
        defaultProyectoId={expenseDefaultProyectoId}
        defaultRutaId={expenseDefaultRutaId}
        editingViatico={editingViatico}
        isOnline={isOnline}
        sessionToken={sesion.token}
        creadoPorUsuario={sesion.usuario}
        baseLat={snapshot.empresa.baseLat}
        baseLon={snapshot.empresa.baseLon}
        moneda={snapshot.empresa.moneda}
        reglasCaptura={reglasCapturaAdmin}
        onAddExpense={async (expense) => {
          await actions.registrarViatico(expense);
          showToast(
            isOnline
              ? `Viático de ${formatRD(expense.montoRD)} registrado.`
              : `Viático guardado en cola offline (${formatRD(expense.montoRD)}).`
          );
        }}
        onEditExpense={async (viaticoId, expense) => {
          await actions.editarViatico(viaticoId, expense);
          showToast('Viático actualizado.');
        }}
      />

      {rol === 'admin' && onboarding && (
        <OnboardingWizardModal
          isOpen={isOnboardingOpen}
          empresaNombre={snapshot.empresa.nombre}
          estado={onboarding}
          isDemo={isDemoActivo}
          datosOnboarding={{
            empresa: snapshot.empresa,
            personal: snapshot.personal,
            vehiculos: snapshot.vehiculos,
            serviciosConfig: configuracion?.servicios ?? [],
            proyectos: snapshot.proyectos,
            esDemo: isDemoActivo,
          }}
          onClose={() => setIsOnboardingOpen(false)}
          onGuardarEstado={async (nuevo) => {
            await actions.guardarOnboarding(nuevo);
          }}
          onNavegarAPaso={(paso) => {
            handleNavegarPasoOnboarding(paso.id).catch(() => {});
          }}
        />
      )}

      <TutorialVisualModal
        isOpen={isTutorialOpen}
        rol={rol}
        tarjetas={tutorialesPerfil}
        onClose={handleCerrarTutorial}
        onCompletar={handleCerrarTutorial}
      />

      <ResourceConflictModal
        conflicts={kmzAsigConflictos}
        onCancel={() => {
          setPendingKmzAsig(null);
          setKmzAsigConflictos([]);
        }}
        onConfirmWithOverride={async (motivo) => {
          if (!pendingKmzAsig) return;
          const overrideConflicto: OverrideConflicto | undefined = motivo
            ? {
                motivo,
                usuarioId: sesion.usuario.id,
                usuarioNombre: sesion.usuario.nombre,
                fecha: new Date().toISOString().slice(0, 10),
              }
            : undefined;
          await actions.guardarAsignacion({
            ...pendingKmzAsig,
            overrideConflicto,
          });
          setPendingKmzAsig(null);
          setKmzAsigConflictos([]);
          showToast('Asignación de ruta guardada con excepción auditada.');
        }}
      />

      {toastMessage && (
        <div className="fixed bottom-20 lg:bottom-5 right-4 z-50 flex items-center gap-2 rounded-lg border border-white/15 bg-[#091A2C]/95 backdrop-blur-md px-4 py-2.5 text-xs font-medium text-white shadow-xl max-w-sm">
          <CheckCircle2 className="h-4 w-4 text-[#86EFAC] shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
}
