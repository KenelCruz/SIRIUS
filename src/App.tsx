import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Building2,
  CalendarDays,
  Camera,
  CheckCircle2,
  Compass,
  FileUp,
  FolderKanban,
  History,
  Layers,
  LogOut,
  Plus,
  Receipt,
  Route,
  Users,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { AgendaView } from './components/AgendaView';
import { AuditoriaView } from './components/AuditoriaView';
import { AuthGate } from './components/AuthGate';
import { CatalogosView } from './components/CatalogosView';
import { KmzImportModal } from './components/KmzImportModal';
import { KmzOsmViewer } from './components/KmzOsmViewer';
import { MobileExpenseCaptureModal } from './components/MobileExpenseCaptureModal';
import { OfflineSyncBanner } from './components/OfflineSyncBanner';
import { ProyectosView } from './components/ProyectosView';
import { PWAInstallButton } from './components/PWAInstallButton';
import { ResourceConflictModal } from './components/ResourceConflictModal';
import { RouteServicesCalculator } from './components/RouteServicesCalculator';
import { ViaticosView } from './components/ViaticosView';
import { repositorioOperacion } from './data/LocalRepositorioOperacion';
import {
  detectarConflictosAsignacion,
  filtrarRutasParaUsuario,
  filtrarServiciosParaUsuario,
  filtrarViaticosParaUsuario,
  obtenerRutasAsignadasAUsuario,
  puedeCrearOEditarOperacion,
  puedeVerAuditoria,
} from './domain';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import type {
  AreaUnit,
  ConflictDetail,
  Empresa,
  EstadoEmpresaSnapshot,
  GeoPoint,
  OverrideConflicto,
  RolEmpresa,
  SesionActiva,
} from './types/domain';
import { formatRD, latLonToUtm19N } from './utils/geodesy';
import { parseKmzOrKmlFile, type ParsedKmzResult } from './utils/kmzParser';

type ActiveTab =
  | 'proyectos'
  | 'agenda'
  | 'rutas'
  | 'map'
  | 'viaticos'
  | 'catalogos'
  | 'auditoria';

export default function App() {
  const isOnline = useOnlineStatus();
  const viewerFileInputRef = useRef<HTMLInputElement>(null);

  const [sesion, setSesion] = useState<SesionActiva | null>(() =>
    repositorioOperacion.obtenerSesionGuardada()
  );
  const [empresasDisponibles, setEmpresasDisponibles] = useState<
    Array<{ empresa: Empresa; rol: RolEmpresa }>
  >([]);
  const [requiereElegirEmpresa, setRequiereElegirEmpresa] = useState(false);
  const [snapshot, setSnapshot] = useState<EstadoEmpresaSnapshot | null>(null);

  const [activeTab, setActiveTab] = useState<ActiveTab>('proyectos');
  const [selectedRutaId, setSelectedRutaId] = useState<string>('');
  const [areaUnit, setAreaUnit] = useState<AreaUnit>('tareas');

  const [standaloneKmz, setStandaloneKmz] = useState<ParsedKmzResult | null>(null);
  const [preloadedKmzForModal, setPreloadedKmzForModal] = useState<ParsedKmzResult | null>(null);
  const [defaultProyectoModal, setDefaultProyectoModal] = useState<string | undefined>(undefined);
  const [isKmzModalOpen, setIsKmzModalOpen] = useState(false);
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [expenseDefaultProyectoId, setExpenseDefaultProyectoId] = useState<string | undefined>(
    undefined
  );
  const [expenseDefaultRutaId, setExpenseDefaultRutaId] = useState<string | undefined>(undefined);

  // Conflicto diferido al crear asignación opcional desde el wizard KMZ
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
  const [isSyncing, setIsSyncing] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 4500);
  };

  const refrescarSnapshot = async (empresaId: string) => {
    const snap = await repositorioOperacion.cargarSnapshotEmpresa(empresaId);
    setSnapshot(snap);
    setSelectedRutaId((prev) =>
      prev && snap.rutas.some((r) => r.id === prev) ? prev : snap.rutas[0]?.id || ''
    );
  };

  // Cargar empresas y snapshot si ya había sesión guardada (incluye arranque offline con caché)
  useEffect(() => {
    if (!sesion) return;
    let active = true;
    (async () => {
      const lista = await repositorioOperacion.listarEmpresasDeUsuario(sesion.usuario.id);
      if (!active) return;
      setEmpresasDisponibles(lista);
      await refrescarSnapshot(sesion.empresaActivaId);
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sesion?.usuario.id, sesion?.empresaActivaId]);

  const handleLogin = async (email: string, password: string) => {
    const nuevaSesion = await repositorioOperacion.iniciarSesion(email, password);
    const lista = await repositorioOperacion.listarEmpresasDeUsuario(nuevaSesion.usuario.id);
    setEmpresasDisponibles(lista);
    setSesion(nuevaSesion);
    if (lista.length > 1) {
      setRequiereElegirEmpresa(true);
    } else {
      setRequiereElegirEmpresa(false);
      await refrescarSnapshot(nuevaSesion.empresaActivaId);
    }
  };

  const handleEntrarConCacheOffline = async () => {
    const guardada = repositorioOperacion.obtenerSesionGuardada();
    if (!guardada) return;
    setSesion(guardada);
    setRequiereElegirEmpresa(false);
    await refrescarSnapshot(guardada.empresaActivaId);
    showToast('Sesión restaurada desde caché offline.');
  };

  const handleSeleccionarEmpresa = async (empresaId: string) => {
    const actualizada = await repositorioOperacion.cambiarEmpresaActiva(empresaId);
    setSesion(actualizada);
    setRequiereElegirEmpresa(false);
    await refrescarSnapshot(empresaId);
    setActiveTab('proyectos');
  };

  const handleCerrarSesion = async () => {
    await repositorioOperacion.cerrarSesion();
    setSesion(null);
    setSnapshot(null);
    setEmpresasDisponibles([]);
    setRequiereElegirEmpresa(false);
  };

  // Permisos y alcance por rol (F1, F12-F14)
  const rol = sesion?.rolActivo ?? 'tecnico';
  const canEdit = puedeCrearOEditarOperacion(rol);
  const canAudit = puedeVerAuditoria(rol);

  const rutasAsignadasIds = useMemo(() => {
    if (!sesion || !snapshot) return new Set<string>();
    const mem = sesion.membresias.find((m) => m.empresaId === snapshot.empresa.id);
    return obtenerRutasAsignadasAUsuario({
      usuarioId: sesion.usuario.id,
      personalIdMembresia: mem?.personalId,
      personal: snapshot.personal,
      cuadrillas: snapshot.cuadrillas,
      asignaciones: snapshot.asignaciones,
    });
  }, [sesion, snapshot]);

  const rutasVisibles = useMemo(() => {
    if (!snapshot) return [];
    return filtrarRutasParaUsuario(rol, snapshot.rutas, rutasAsignadasIds);
  }, [rol, snapshot, rutasAsignadasIds]);

  const serviciosVisibles = useMemo(() => {
    if (!snapshot) return [];
    return filtrarServiciosParaUsuario(rol, snapshot.servicios, rutasAsignadasIds);
  }, [rol, snapshot, rutasAsignadasIds]);

  const viaticosVisibles = useMemo(() => {
    if (!snapshot || !sesion) return [];
    return filtrarViaticosParaUsuario(rol, snapshot.viaticos, sesion.usuario.id);
  }, [rol, snapshot, sesion]);

  const selectedRuta = useMemo(
    () => rutasVisibles.find((r) => r.id === selectedRutaId) ?? rutasVisibles[0],
    [rutasVisibles, selectedRutaId]
  );

  // Sync counts
  const pendingCount = useMemo(() => {
    if (!snapshot) return 0;
    return (
      snapshot.proyectos.filter((x) => x.syncStatus !== 'synced').length +
      snapshot.rutas.filter((x) => x.syncStatus !== 'synced').length +
      snapshot.servicios.filter((x) => x.syncStatus !== 'synced').length +
      snapshot.asignaciones.filter((x) => x.syncStatus !== 'synced').length +
      snapshot.viaticos.filter((x) => x.syncStatus !== 'synced').length +
      snapshot.bitacoras.filter((x) => x.syncStatus !== 'synced').length
    );
  }, [snapshot]);

  const hasConflict = useMemo(() => {
    if (!snapshot) return false;
    return (
      snapshot.proyectos.some((x) => x.syncStatus === 'conflict') ||
      snapshot.rutas.some((x) => x.syncStatus === 'conflict') ||
      snapshot.servicios.some((x) => x.syncStatus === 'conflict') ||
      snapshot.asignaciones.some((x) => x.syncStatus === 'conflict') ||
      snapshot.viaticos.some((x) => x.syncStatus === 'conflict')
    );
  }, [snapshot]);

  const handleSyncNow = async () => {
    if (!isOnline || isSyncing || !snapshot) return;
    setIsSyncing(true);
    try {
      const res = await repositorioOperacion.sincronizarConServidor(snapshot.empresa.id);
      setSnapshot(res.snapshot);
      const extra = res.ocrProcesados > 0 ? ` (${res.ocrProcesados} recibo(s) OCR procesados)` : '';
      showToast(`Sincronización LWW completada con servidor${extra}.`);
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'No se pudo completar la sincronización.');
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    if (isOnline && pendingCount > 0 && snapshot && sesion) {
      handleSyncNow();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline]);

  // Mostrar AuthGate si no hay sesión o si eligió cambiar/seleccionar empresa
  if (!sesion || requiereElegirEmpresa || !snapshot) {
    return (
      <AuthGate
        isOnline={isOnline}
        cuentasDemo={repositorioOperacion.listarCuentasDemo()}
        sesionGuardada={sesion}
        empresasDisponibles={empresasDisponibles}
        onLogin={handleLogin}
        onEntrarConCacheOffline={handleEntrarConCacheOffline}
        onSeleccionarEmpresa={handleSeleccionarEmpresa}
        onCerrarSesion={handleCerrarSesion}
      />
    );
  }

  const empresaId = snapshot.empresa.id;

  const handleOpenKmzInViewer = async (file: File) => {
    try {
      const parsed = await parseKmzOrKmlFile(file);
      setStandaloneKmz(parsed);
      setActiveTab('map');
      showToast(`Visualizando ${parsed.fileName} en OpenStreetMap.`);
    } catch (err: unknown) {
      showToast(
        err instanceof Error ? err.message : 'No se pudo abrir el archivo KMZ/KML/GeoJSON.'
      );
    }
  };

  const handleCaptureLiveGps = () => {
    const activeCentroid = standaloneKmz?.centroid ?? selectedRuta?.centroid;
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

  const navItems: Array<{ id: ActiveTab; label: string; shortLabel: string; icon: React.FC<{ className?: string }> }> = [
    { id: 'proyectos', label: 'Proyectos y Rutas', shortLabel: 'Proyectos', icon: FolderKanban },
    { id: 'agenda', label: 'Agenda y Cuadrillas', shortLabel: 'Agenda', icon: CalendarDays },
    { id: 'rutas', label: 'Rutas y Servicios', shortLabel: 'Rutas', icon: Route },
    { id: 'map', label: 'Visor KMZ (OSM)', shortLabel: 'Mapa', icon: Layers },
    { id: 'viaticos', label: 'Viáticos y Gastos', shortLabel: 'Viáticos', icon: Receipt },
    { id: 'catalogos', label: 'Catálogos y Equipos', shortLabel: 'Catálogos', icon: Users },
    ...(canAudit
      ? [{ id: 'auditoria' as const, label: 'Auditoría F16', shortLabel: 'Auditoría', icon: History }]
      : []),
  ];

  // Datos activos para el visor OSM
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
          <div className="px-5 py-5 border-b border-[#1E3A5F] space-y-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-sm bg-[#0284C7] text-white">
                <Compass className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div
                  className="text-base font-bold tracking-tight whitespace-nowrap truncate"
                  title="SIRIUS: Sistema Integral de Recursos, Información, Operaciones y Análisis"
                >
                  SIRIUS
                </div>
                <div className="text-[10px] leading-tight text-[#CBD5E1] line-clamp-2">
                  Sistema Integral de Recursos, Información, Operaciones y Análisis
                </div>
                <div className="mt-0.5 text-[11px] font-medium text-[#93CCFF] truncate">
                  {snapshot.empresa.nombre}
                </div>
              </div>
            </div>

            {empresasDisponibles.length > 1 && (
              <div className="flex items-center gap-1.5 rounded-sm bg-[#091A2C] px-2.5 py-1.5">
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

          {/* Sesión Activa & Reporte Móvil */}
          <div className="p-4 border-t border-[#1E3A5F] space-y-3">
            <div className="rounded-sm bg-[#091A2C] p-2.5 text-xs">
              <div className="font-bold text-white truncate">{sesion.usuario.nombre}</div>
              <div className="mt-0.5 flex items-center justify-between text-[11px] text-[#93CCFF]">
                <span className="font-mono uppercase">{rol}</span>
                <button
                  type="button"
                  onClick={handleCerrarSesion}
                  className="inline-flex items-center gap-1 text-[#CBD5E1] hover:text-white"
                >
                  <LogOut className="h-3 w-3" />
                  Salir
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                setExpenseDefaultProyectoId(selectedRuta?.proyectoId);
                setExpenseDefaultRutaId(selectedRuta?.id);
                setIsExpenseModalOpen(true);
              }}
              className="w-full flex items-center justify-center gap-2 rounded-sm border border-[#5BB8FE]/40 bg-[#1E3A8A]/70 px-3 py-2.5 text-xs font-semibold text-white hover:bg-[#0284C7] transition-colors"
            >
              <Camera className="h-3.5 w-3.5" />
              Reportar Viático Móvil
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
                  {activeTab === 'proyectos' && `${snapshot.empresa.nombre} · Proyectos y Rutas`}
                  {activeTab === 'agenda' && 'Agenda de Cuadrillas y Conflictos'}
                  {activeTab === 'rutas' && 'Cálculo de Rutas y Servicios Sumatorios'}
                  {activeTab === 'map' && 'Visualizador KMZ / GeoJSON · OpenStreetMap'}
                  {activeTab === 'viaticos' && 'Control de Viáticos y Reparto por Proyecto'}
                  {activeTab === 'catalogos' && 'Catálogos, Flota y Equipos GNSS'}
                  {activeTab === 'auditoria' && 'Auditoría Operativa (F16)'}
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

              {canEdit ? (
                <button
                  type="button"
                  onClick={() => {
                    setPreloadedKmzForModal(null);
                    setDefaultProyectoModal(snapshot.proyectos[0]?.id);
                    setIsKmzModalOpen(true);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-sm bg-[#0F2942] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#0284C7] transition-colors whitespace-nowrap shrink-0 min-h-[38px]"
                >
                  <Plus className="h-4 w-4" />
                  <span className="hidden sm:inline">Nueva Ruta KMZ</span>
                  <span className="sm:hidden">KMZ</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setExpenseDefaultProyectoId(selectedRuta?.proyectoId);
                    setExpenseDefaultRutaId(selectedRuta?.id);
                    setIsExpenseModalOpen(true);
                  }}
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
            {/* Mobile Company & Session Strip */}
            <div className="flex lg:hidden items-center justify-between gap-2 rounded-md border border-[#E2E8F0] bg-white px-3 py-2 text-xs">
              <div className="min-w-0">
                <div className="font-bold text-[#0F2942] truncate">{snapshot.empresa.nombre}</div>
                <div className="font-mono text-[11px] text-[#43474D]">
                  {sesion.usuario.nombre} · {rol.toUpperCase()}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {empresasDisponibles.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setRequiereElegirEmpresa(true)}
                    className="rounded-sm border border-[#CBD5E1] px-2.5 py-1.5 text-[11px] font-semibold"
                  >
                    Empresa
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleCerrarSesion}
                  className="rounded-sm border border-[#CBD5E1] p-1.5 text-[#334155]"
                  aria-label="Cerrar sesión"
                >
                  <LogOut className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {activeTab === 'proyectos' && (
              <ProyectosView
                rol={rol}
                usuarioActual={sesion.usuario}
                clientes={snapshot.clientes}
                proyectos={snapshot.proyectos}
                rutas={rutasVisibles}
                servicios={serviciosVisibles}
                bitacoras={snapshot.bitacoras}
                viaticos={viaticosVisibles}
                rutasAsignadasIds={rutasAsignadasIds}
                areaUnit={areaUnit}
                pendingSyncCount={pendingCount}
                onChangeAreaUnit={setAreaUnit}
                onCrearCliente={async (datos) => {
                  await repositorioOperacion.crearCliente(empresaId, datos);
                  await refrescarSnapshot(empresaId);
                  showToast(`Cliente "${datos.nombre}" registrado.`);
                }}
                onCrearProyecto={async (datos) => {
                  await repositorioOperacion.crearProyecto(empresaId, datos);
                  await refrescarSnapshot(empresaId);
                  showToast(`Proyecto "${datos.nombre}" creado en estado Cotizado.`);
                }}
                onAbrirNuevaRutaKmz={(proyId) => {
                  setPreloadedKmzForModal(null);
                  setDefaultProyectoModal(proyId);
                  setIsKmzModalOpen(true);
                }}
                onAgregarServicioARuta={async (datos) => {
                  await repositorioOperacion.crearServicio(empresaId, datos);
                  await refrescarSnapshot(empresaId);
                  showToast(`Servicio "${datos.nombre}" agregado.`);
                }}
                onTransicionarServicio={async (params) => {
                  await repositorioOperacion.transicionarServicio({
                    empresaId,
                    servicioId: params.servicioId,
                    nuevoEstado: params.nuevoEstado,
                    payload: params.payload,
                  });
                  await refrescarSnapshot(empresaId);
                  showToast(`Estado actualizado a "${params.nuevoEstado}".`);
                }}
                onAgregarBitacora={async (datos) => {
                  await repositorioOperacion.agregarBitacora(empresaId, datos);
                  await refrescarSnapshot(empresaId);
                  showToast('Entrada agregada a la bitácora.');
                }}
                onVerRutaEnMapa={(rId) => {
                  setStandaloneKmz(null);
                  setSelectedRutaId(rId);
                  setActiveTab('map');
                }}
                onCalcularRuta={(rId) => {
                  setSelectedRutaId(rId);
                  setActiveTab('rutas');
                }}
                onReportarViaticoEnRuta={(rId, pId) => {
                  setExpenseDefaultRutaId(rId);
                  setExpenseDefaultProyectoId(pId);
                  setIsExpenseModalOpen(true);
                }}
              />
            )}

            {activeTab === 'agenda' && (
              <AgendaView
                rol={rol}
                usuarioActual={sesion.usuario}
                rutas={rutasVisibles}
                cuadrillas={snapshot.cuadrillas}
                personal={snapshot.personal}
                vehiculos={snapshot.vehiculos}
                equipos={snapshot.equipos}
                asignaciones={snapshot.asignaciones}
                onGuardarAsignacion={async (datos) => {
                  await repositorioOperacion.guardarAsignacion(empresaId, datos);
                  await refrescarSnapshot(empresaId);
                  showToast(
                    datos.overrideConflicto
                      ? 'Asignación guardada con excepción auditada.'
                      : 'Asignación de cuadrilla programada.'
                  );
                }}
                onEliminarAsignacion={async (asigId) => {
                  await repositorioOperacion.eliminarAsignacion(empresaId, asigId);
                  await refrescarSnapshot(empresaId);
                  showToast('Asignación eliminada.');
                }}
              />
            )}

            {activeTab === 'rutas' && (
              <RouteServicesCalculator
                rutas={rutasVisibles}
                proyectos={snapshot.proyectos}
                vehiculos={snapshot.vehiculos}
                selectedRuta={selectedRuta}
                canEdit={canEdit}
                creadoPorUsuario={sesion.usuario}
                baseLat={snapshot.empresa.baseLat}
                baseLon={snapshot.empresa.baseLon}
                baseDireccion={snapshot.empresa.direccionBase}
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
                    await repositorioOperacion.actualizarRuta(empresaId, {
                      ...rutaObj,
                      routeSummary,
                    });
                  }
                  if (proyObj) {
                    await repositorioOperacion.actualizarProyecto(empresaId, {
                      ...proyObj,
                      presupuestoViaticosRD: budgetViaticosRD,
                      valorContratoRD: contractValueRD,
                    });
                  }
                  for (const sp of serviciosPropuestos) {
                    const existe = snapshot.servicios.some(
                      (s) => s.rutaId === rutaId && s.tipoServicioId === sp.tipoServicioId
                    );
                    if (!existe) {
                      await repositorioOperacion.crearServicio(empresaId, {
                        rutaId,
                        tipoServicioId: sp.tipoServicioId,
                        nombre: sp.nombre,
                        cotizacionRD: sp.cotizacionRD,
                        estado: 'cotizado',
                      });
                    }
                  }
                  await refrescarSnapshot(empresaId);
                  showToast(
                    `Presupuesto (${formatRD(budgetViaticosRD)}) y servicios aplicados a la ruta.`
                  );
                }}
                onRegisterKmzFromCalculator={(parsed) => {
                  setPreloadedKmzForModal(parsed);
                  setIsKmzModalOpen(true);
                }}
                onLogRouteExpenses={async (items) => {
                  for (const item of items) {
                    await repositorioOperacion.registrarViatico(empresaId, item);
                  }
                  await refrescarSnapshot(empresaId);
                  setActiveTab('viaticos');
                  showToast(`${items.length} viático(s) de ruta registrados en el libro.`);
                }}
                onOpenExpenseModal={() => {
                  setExpenseDefaultRutaId(selectedRuta?.id);
                  setExpenseDefaultProyectoId(selectedRuta?.proyectoId);
                  setIsExpenseModalOpen(true);
                }}
              />
            )}

            {activeTab === 'map' && (
              <section className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-md border border-[#CBD5E1] bg-white p-4">
                  <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-0">
                    <select
                      value={standaloneKmz ? '__standalone__' : selectedRuta?.id ?? ''}
                      onChange={(e) => {
                        if (e.target.value !== '__standalone__') {
                          setStandaloneKmz(null);
                          setSelectedRutaId(e.target.value);
                        }
                      }}
                      className="rounded-sm border border-[#CBD5E1] bg-white px-3 py-2 text-xs font-medium text-[#0D1C2F] min-h-[40px] max-w-full"
                    >
                      {standaloneKmz && (
                        <option value="__standalone__">
                          Vista previa: {standaloneKmz.fileName}
                        </option>
                      )}
                      {rutasVisibles.map((r) => (
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
                      }}
                    />

                    <button
                      type="button"
                      onClick={() => viewerFileInputRef.current?.click()}
                      className="inline-flex items-center gap-1.5 rounded-sm border border-[#CBD5E1] bg-[#F8FAFC] px-3 py-2 text-xs font-semibold text-[#0F2942] hover:bg-[#EFF4FF] min-h-[40px]"
                    >
                      <FileUp className="h-4 w-4 text-[#0284C7]" />
                      Abrir Archivo KMZ / GeoJSON
                    </button>

                    {standaloneKmz && canEdit && (
                      <button
                        type="button"
                        onClick={() => {
                          setPreloadedKmzForModal(standaloneKmz);
                          setIsKmzModalOpen(true);
                        }}
                        className="inline-flex items-center gap-1.5 rounded-sm bg-[#0F2942] px-3 py-2 text-xs font-semibold text-white hover:bg-[#0284C7] min-h-[40px]"
                      >
                        <Plus className="h-4 w-4" />
                        Guardar como Ruta de Proyecto
                      </button>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={handleCaptureLiveGps}
                    disabled={isCapturingGps}
                    className="inline-flex items-center justify-center gap-1.5 rounded-sm bg-[#0284C7] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#006398] disabled:opacity-60 min-h-[40px] shrink-0"
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
                />
              </section>
            )}

            {activeTab === 'viaticos' && (
              <ViaticosView
                rol={rol}
                viaticos={viaticosVisibles}
                proyectos={snapshot.proyectos}
                onAbrirModalNuevo={() => {
                  setExpenseDefaultProyectoId(selectedRuta?.proyectoId);
                  setExpenseDefaultRutaId(selectedRuta?.id);
                  setIsExpenseModalOpen(true);
                }}
                onDecidirViatico={async (params) => {
                  await repositorioOperacion.decidirViatico({
                    empresaId,
                    ...params,
                  });
                  await refrescarSnapshot(empresaId);
                  showToast(`Viático marcado como ${params.nuevoEstado}.`);
                }}
                onActualizarReparto={async (viaticoId, repartos) => {
                  await repositorioOperacion.actualizarRepartoViatico(
                    empresaId,
                    viaticoId,
                    repartos
                  );
                  await refrescarSnapshot(empresaId);
                  showToast('Reparto exacto por proyecto actualizado.');
                }}
                onEliminarViatico={async (viaticoId) => {
                  await repositorioOperacion.eliminarViatico(empresaId, viaticoId);
                  await refrescarSnapshot(empresaId);
                  showToast('Viático eliminado.');
                }}
              />
            )}

            {activeTab === 'catalogos' && (
              <CatalogosView
                rol={rol}
                empresa={snapshot.empresa}
                membresias={snapshot.membresias}
                usuarios={snapshot.usuarios}
                clientes={snapshot.clientes}
                personal={snapshot.personal}
                vehiculos={snapshot.vehiculos}
                equipos={snapshot.equipos}
                cuadrillas={snapshot.cuadrillas}
                onCrearCliente={async (datos) => {
                  await repositorioOperacion.crearCliente(empresaId, datos);
                  await refrescarSnapshot(empresaId);
                }}
                onGuardarPersonal={async (item) => {
                  await repositorioOperacion.guardarPersonal(empresaId, item);
                  await refrescarSnapshot(empresaId);
                }}
                onGuardarVehiculo={async (item) => {
                  await repositorioOperacion.guardarVehiculo(empresaId, item);
                  await refrescarSnapshot(empresaId);
                }}
                onGuardarEquipo={async (item) => {
                  await repositorioOperacion.guardarEquipo(empresaId, item);
                  await refrescarSnapshot(empresaId);
                }}
                onGuardarCuadrilla={async (item) => {
                  await repositorioOperacion.guardarCuadrilla(empresaId, item);
                  await refrescarSnapshot(empresaId);
                }}
                onActualizarEmpresa={async (emp) => {
                  await repositorioOperacion.actualizarEmpresa(emp);
                  await refrescarSnapshot(empresaId);
                }}
                onGuardarMembresiaUsuario={async (params) => {
                  await repositorioOperacion.guardarMembresiaUsuario({
                    empresaId,
                    ...params,
                  });
                  await refrescarSnapshot(empresaId);
                }}
              />
            )}

            {activeTab === 'auditoria' && canAudit && (
              <AuditoriaView historial={snapshot.historial} />
            )}
          </main>
        </div>
      </div>

      {/* Mobile Sticky 5-Button Navigation Bar */}
      <nav className="fixed bottom-0 inset-x-0 z-40 grid grid-cols-5 border-t border-[#CBD5E1] bg-white lg:hidden shadow-[0_-2px_10px_rgba(15,41,66,0.08)]">
        {[
          { id: 'proyectos' as const, label: 'Proyectos', icon: FolderKanban },
          { id: 'agenda' as const, label: 'Agenda', icon: CalendarDays },
          { id: 'map' as const, label: 'Mapa', icon: Layers },
          { id: 'viaticos' as const, label: 'Viáticos', icon: Receipt },
          { id: 'catalogos' as const, label: 'Equipos', icon: Users },
        ].map((item) => {
          const Icon = item.icon;
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.id)}
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

      {/* Modales */}
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
        onCrearClienteYProyectoRapido={async (datos) => {
          let cliId = datos.clienteIdExistente;
          if (!cliId) {
            const nuevoCli = await repositorioOperacion.crearCliente(empresaId, {
              nombre: datos.clienteNombre,
              rnc: datos.clienteRnc,
              contacto: datos.clienteContacto,
            });
            cliId = nuevoCli.id;
          }
          return repositorioOperacion.crearProyecto(empresaId, {
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
          const nuevaRuta = await repositorioOperacion.crearRuta(empresaId, ruta);
          for (const srv of servicios) {
            await repositorioOperacion.crearServicio(empresaId, {
              ...srv,
              rutaId: nuevaRuta.id,
            });
          }
          if (viaticosIniciales && viaticosIniciales.length > 0) {
            for (const via of viaticosIniciales) {
              await repositorioOperacion.registrarViatico(empresaId, {
                ...via,
                rutaId: nuevaRuta.id,
              });
            }
          }

          if (asignacionOpcional) {
            const snapActual = await repositorioOperacion.cargarSnapshotEmpresa(empresaId);
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
            });

            if (conflictos.length > 0) {
              setPendingKmzAsig({
                rutaId: nuevaRuta.id,
                ...asignacionOpcional,
              });
              setKmzAsigConflictos(conflictos);
            } else {
              await repositorioOperacion.guardarAsignacion(empresaId, {
                rutaId: nuevaRuta.id,
                ...asignacionOpcional,
              });
            }
          }

          await refrescarSnapshot(empresaId);
          setSelectedRutaId(nuevaRuta.id);
          setStandaloneKmz(null);
          setPreloadedKmzForModal(null);

          if (openMobileExpenseAfter) {
            setExpenseDefaultRutaId(nuevaRuta.id);
            setExpenseDefaultProyectoId(proyectoId);
            setIsExpenseModalOpen(true);
            showToast(`Ruta ${nuevaRuta.codigoParcela} creada. Adjunta tu comprobante móvil.`);
          } else {
            setActiveTab('proyectos');
            showToast(`Ruta ${nuevaRuta.codigoParcela} y servicios registrados.`);
          }
        }}
      />

      <MobileExpenseCaptureModal
        isOpen={isExpenseModalOpen}
        onClose={() => setIsExpenseModalOpen(false)}
        proyectos={snapshot.proyectos}
        rutas={rutasVisibles}
        defaultProyectoId={expenseDefaultProyectoId}
        defaultRutaId={expenseDefaultRutaId}
        isOnline={isOnline}
        sessionToken={sesion.token}
        creadoPorUsuario={sesion.usuario}
        baseLat={snapshot.empresa.baseLat}
        baseLon={snapshot.empresa.baseLon}
        onAddExpense={async (expense) => {
          await repositorioOperacion.registrarViatico(empresaId, expense);
          await refrescarSnapshot(empresaId);
          showToast(
            isOnline
              ? `Viático de ${formatRD(expense.montoRD)} registrado.`
              : `Viático guardado en cola offline (${formatRD(expense.montoRD)}).`
          );
        }}
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
          await repositorioOperacion.guardarAsignacion(empresaId, {
            ...pendingKmzAsig,
            overrideConflicto,
          });
          await refrescarSnapshot(empresaId);
          setPendingKmzAsig(null);
          setKmzAsigConflictos([]);
          showToast('Asignación de ruta guardada con excepción auditada.');
        }}
      />

      {toastMessage && (
        <div className="fixed bottom-20 lg:bottom-5 right-4 z-50 flex items-center gap-2 rounded-sm border border-[#0F2942] bg-[#0F2942] px-4 py-2.5 text-xs font-medium text-white shadow-lg max-w-sm">
          <CheckCircle2 className="h-4 w-4 text-[#86EFAC] shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
}
