import React, { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Camera,
  Check,
  CheckCircle2,
  Download,
  FileUp,
  MapPin,
  Navigation,
  Receipt,
  RotateCcw,
  Route,
  Search,
  Sparkles,
  UploadCloud,
  X,
} from 'lucide-react';
import {
  calcularCotizacionServicioVigente,
  crearConfiguracionInicialEmpresa,
  obtenerFactoresTerrenoVigentes,
  obtenerReglasViaticosVigentes,
  obtenerServiciosVigentes,
  type ServicioCatalogoVigente,
} from '../domain';
import type {
  AreaUnit,
  CategoriaViatico,
  Cliente,
  Cuadrilla,
  EquipoGNSS,
  EstadoServicio,
  Proyecto,
  ReglasViaticosVersion,
  Ruta,
  Servicio,
  TerrenoFactorVersion,
  Vehiculo,
  Viatico,
} from '../types/domain';
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
import {
  reverseGeocodeOSM,
  searchAddressOSM,
  type AddressSearchResult,
} from '../utils/osmGeocode';
import {
  computeRouteViaticos,
  fetchOptimalRoutesOSM,
  SANTO_DOMINGO_ORIGIN,
  VEHICLE_CATALOG,
  type RouteAlternative,
  type TerrainType,
} from '../utils/routingEngine';
import { KmzOsmViewer } from './KmzOsmViewer';

interface KmzImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  clientes: Cliente[];
  proyectos: Proyecto[];
  vehiculos: Vehiculo[];
  cuadrillas: Cuadrilla[];
  equipos: EquipoGNSS[];
  defaultProyectoId?: string;
  preloadedKmz?: ParsedKmzResult | null;
  creadoPorUsuario: { id: string; nombre: string };
  baseLat?: number;
  baseLon?: number;
  baseDireccion?: string;
  serviciosVigentes?: ServicioCatalogoVigente[];
  factoresTerreno?: TerrenoFactorVersion | null;
  reglasViaticos?: ReglasViaticosVersion | null;
  moneda?: string;
  onCrearClienteYProyectoRapido: (datos: {
    clienteIdExistente?: string;
    clienteNombre: string;
    clienteRnc: string;
    clienteContacto: string;
    proyectoNombre: string;
    codigoContrato: string;
    presupuestoViaticosRD: number;
    valorContratoRD: number;
  }) => Promise<Proyecto>;
  onCreateRutaCompleta: (payload: {
    proyectoId: string;
    ruta: Omit<Ruta, 'id' | 'empresaId' | 'version' | 'updatedAt' | 'syncStatus'>;
    servicios: Array<Omit<Servicio, 'id' | 'empresaId' | 'rutaId' | 'version' | 'updatedAt' | 'syncStatus'>>;
    asignacionOpcional?: {
      fechaInicio: string;
      fechaFin: string;
      cuadrillaId: string;
      vehiculoIds: string[];
      equipoIds: string[];
    };
    viaticosIniciales?: Array<
      Omit<Viatico, 'id' | 'empresaId' | 'estadoAprobacion' | 'version' | 'updatedAt'>
    >;
    openMobileExpenseAfter?: boolean;
  }) => Promise<void>;
}

const DEFAULT_CFG_KMZ = crearConfiguracionInicialEmpresa('default');
const DEFAULT_SERVICIOS_KMZ = obtenerServiciosVigentes(DEFAULT_CFG_KMZ);
const DEFAULT_TERRENO_KMZ = obtenerFactoresTerrenoVigentes(DEFAULT_CFG_KMZ);
const DEFAULT_REGLAS_KMZ = obtenerReglasViaticosVigentes(DEFAULT_CFG_KMZ);

export const KmzImportModal: React.FC<KmzImportModalProps> = ({
  isOpen,
  onClose,
  clientes,
  proyectos,
  vehiculos,
  cuadrillas,
  equipos,
  defaultProyectoId,
  preloadedKmz = null,
  creadoPorUsuario,
  baseLat = SANTO_DOMINGO_ORIGIN.lat,
  baseLon = SANTO_DOMINGO_ORIGIN.lon,
  baseDireccion = 'Base Operativa (Santo Domingo)',
  serviciosVigentes = DEFAULT_SERVICIOS_KMZ,
  factoresTerreno,
  reglasViaticos,
  moneda = 'RD$',
  onCrearClienteYProyectoRapido,
  onCreateRutaCompleta,
}) => {
  const activeServicios = useMemo(
    () => serviciosVigentes.filter((s) => s.activo),
    [serviciosVigentes]
  );
  const activeTerreno = factoresTerreno ?? DEFAULT_TERRENO_KMZ;
  const activeReglas = reglasViaticos ?? DEFAULT_REGLAS_KMZ;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const originMapRef = useRef<HTMLDivElement>(null);
  const originLeafletRef = useRef<L.Map | null>(null);
  const originOverlayRef = useRef<L.FeatureGroup | null>(null);

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [parsed, setParsed] = useState<ParsedKmzResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [previewUnit, setPreviewUnit] = useState<AreaUnit>('tareas');
  const [osmLocationTag, setOsmLocationTag] = useState<string | null>(null);

  // Proyecto destino (o creación inline rápida F2+F3)
  const [modoProyecto, setModoProyecto] = useState<'existente' | 'nuevo'>(
    proyectos.length > 0 ? 'existente' : 'nuevo'
  );
  const [proyectoId, setProyectoId] = useState<string>(defaultProyectoId || proyectos[0]?.id || '');
  const [clienteIdExistente, setClienteIdExistente] = useState<string>(clientes[0]?.id || '');
  const [nuevoClienteNombre, setNuevoClienteNombre] = useState('');
  const [nuevoClienteRnc, setNuevoClienteRnc] = useState('');
  const [nuevoClienteContacto, setNuevoClienteContacto] = useState('');
  const [nuevoProyectoNombre, setNuevoProyectoNombre] = useState('');
  const [nuevoCodigoContrato, setNuevoCodigoContrato] = useState(
    `AIA-${new Date().getFullYear()}-${String(Math.floor(100 + Math.random() * 899))}`
  );

  // Step 1 Metadata de Ruta
  const [parcelCode, setParcelCode] = useState('');
  const [nombreRuta, setNombreRuta] = useState('');
  const [ubicacion, setUbicacion] = useState('');
  const [province, setProvince] = useState('');
  const [fechaPrevista, setFechaPrevista] = useState(new Date().toISOString().slice(0, 10));

  // Step 2 Services + Route Calculation
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>(['rtk', 'deslinde']);
  const [corridorKm, setCorridorKm] = useState<number>(1);
  const [terrain, setTerrain] = useState<TerrainType>('Llano');
  const defaultVehiculo =
    vehiculos.find((v) => v.estado === 'disponible') || vehiculos[0];
  const [vehiculoId, setVehiculoId] = useState<string>(
    defaultVehiculo?.id || VEHICLE_CATALOG[0].id
  );
  const [fuelPricePerGalRD, setFuelPricePerGalRD] = useState<number>(
    defaultVehiculo?.precioGalonRD || VEHICLE_CATALOG[0].fuelPricePerGalRD
  );
  const [kmPerGal, setKmPerGal] = useState<number>(
    defaultVehiculo?.kmPorGal || VEHICLE_CATALOG[0].kmPerGal
  );
  const [routes, setRoutes] = useState<RouteAlternative[]>([]);
  const [selectedRouteId, setSelectedRouteId] = useState<'economica' | 'rapida'>('economica');
  const [includeTolls, setIncludeTolls] = useState(true);
  const [includeLodging, setIncludeLodging] = useState(false);
  const [isRouting, setIsRouting] = useState(false);

  // Punto de partida personalizado (empresa / calle / pin mapa)
  const [originPoint, setOriginPoint] = useState<{
    lat: number;
    lon: number;
    label: string;
    source: 'empresa' | 'calle' | 'pin';
  }>({
    lat: baseLat,
    lon: baseLon,
    label: baseDireccion,
    source: 'empresa',
  });
  const [originQuery, setOriginQuery] = useState('');
  const [originResults, setOriginResults] = useState<AddressSearchResult[]>([]);
  const [isSearchingOrigin, setIsSearchingOrigin] = useState(false);
  const [showOriginPinMap, setShowOriginPinMap] = useState(false);

  // Step 3 Programación opcional & Viáticos iniciales
  const [programarAhora, setProgramarAhora] = useState(true);
  const [cuadrillaId, setCuadrillaId] = useState(
    cuadrillas.find((c) => c.activa)?.id || cuadrillas[0]?.id || ''
  );
  const [equipoId, setEquipoId] = useState(
    equipos.find((e) => e.estado === 'disponible')?.id || equipos[0]?.id || ''
  );
  const [fechaFinAsignacion, setFechaFinAsignacion] = useState(fechaPrevista);
  const [estadoInicialServicio, setEstadoInicialServicio] = useState<EstadoServicio>('cotizado');
  const [attachRouteViaticos, setAttachRouteViaticos] = useState(true);

  const activeVehicleConfig = useMemo(() => {
    const vEmpresa = vehiculos.find((v) => v.id === vehiculoId);
    if (vEmpresa) {
      return {
        id: vEmpresa.id,
        label: `${vEmpresa.etiqueta} (${vEmpresa.placa})`,
        fuelName: vEmpresa.tipoCombustible,
        fuelPricePerGalRD: vEmpresa.precioGalonRD,
        kmPerGal: vEmpresa.kmPorGal,
        maintenancePerKmRD: vEmpresa.mantenimientoPorKmRD,
      };
    }
    const vFallback = VEHICLE_CATALOG.find((v) => v.id === vehiculoId) ?? VEHICLE_CATALOG[0];
    return vFallback;
  }, [vehiculos, vehiculoId]);

  const activeRoute = useMemo(
    () => routes.find((r) => r.id === selectedRouteId) ?? routes[0],
    [routes, selectedRouteId]
  );

  const servicesSummary = useMemo(() => {
    const areaM2 = parsed?.totalAreaM2 ?? 0;
    const items = activeServicios
      .filter((s) => selectedServiceIds.includes(s.codigo))
      .map((svc) => {
        const calc = calcularCotizacionServicioVigente({
          servicio: svc,
          areaM2,
          corridorKm,
          terrain,
          factoresTerreno: activeTerreno,
        });
        return {
          id: svc.codigo,
          name: svc.nombre,
          subtitle: svc.subtitulo,
          version: svc.version,
          precioBaseRD: svc.precioBaseRD,
          recargosRD: calc.corridorExtraRD + calc.areaSurchargeRD,
          totalRD: calc.totalRD,
        };
      });
    return {
      items,
      totalServicesRD: items.reduce((sum, i) => sum + i.totalRD, 0),
    };
  }, [parsed?.totalAreaM2, activeServicios, selectedServiceIds, corridorKm, terrain, activeTerreno]);

  const routeBreakdown = useMemo(() => {
    const dist = activeRoute?.distanceOneWayKm ?? parsed?.estimatedViaticos.distanceFromBaseKm ?? 20;
    return computeRouteViaticos({
      distanceOneWayKm: dist,
      oneWayTollRD: activeRoute?.oneWayTollRD ?? 0,
      includeTolls,
      includeLodging,
      fuelPricePerGalRD,
      kmPerGal,
      maintenancePerKmRD: activeVehicleConfig.maintenancePerKmRD,
      areaM2: parsed?.totalAreaM2 ?? 2500,
      terrain,
      serviceCount: selectedServiceIds.length,
      reglasViaticos: activeReglas,
      factoresTerreno: activeTerreno,
    });
  }, [
    activeRoute,
    parsed?.estimatedViaticos.distanceFromBaseKm,
    parsed?.totalAreaM2,
    includeTolls,
    includeLodging,
    fuelPricePerGalRD,
    kmPerGal,
    activeVehicleConfig.maintenancePerKmRD,
    terrain,
    selectedServiceIds.length,
    activeReglas,
    activeTerreno,
  ]);

  const totalContractRD = servicesSummary.totalServicesRD + routeBreakdown.totalViaticosRD;

  const applyParsedResult = async (res: ParsedKmzResult, template?: SampleKmzTemplate) => {
    setParsed(res);
    setOsmLocationTag(null);

    const meta = res.autoMeta;
    setNombreRuta(meta.title);
    setParcelCode(template?.parcelCode || meta.parcelCode);
    setProvince(template?.province || meta.province);
    setUbicacion(meta.municipality ? `${meta.municipality}, ${meta.province}` : meta.province);
    setFechaPrevista(meta.scheduledDate);
    setFechaFinAsignacion(meta.scheduledDate);
    if (!nuevoProyectoNombre) {
      setNuevoProyectoNombre(meta.title);
    }
    if (!nuevoClienteNombre && meta.client) {
      setNuevoClienteNombre(meta.client);
    }

    const osmLoc = await reverseGeocodeOSM(res.centroid.lat, res.centroid.lon);
    if (osmLoc.source === 'osm') {
      if (!template && !res.autoMeta.extractedFields.includes('Provincia (KML)')) {
        setProvince(osmLoc.province);
      }
      const locParts = [osmLoc.locality, osmLoc.municipality, osmLoc.province].filter(Boolean);
      const locLabel = locParts.join(', ');
      setOsmLocationTag(locLabel);
      setUbicacion(locLabel);
    }
  };

  useEffect(() => {
    setOriginPoint((prev) =>
      prev.source === 'empresa'
        ? { lat: baseLat, lon: baseLon, label: baseDireccion, source: 'empresa' }
        : prev
    );
  }, [baseLat, baseLon, baseDireccion]);

  useEffect(() => {
    if (!parsed) return;
    let active = true;
    setIsRouting(true);
    fetchOptimalRoutesOSM(
      parsed.centroid.lat,
      parsed.centroid.lon,
      originPoint.lat,
      originPoint.lon,
      activeReglas
    )
      .then((r) => {
        if (!active) return;
        setRoutes(r);
        if (r[0] && r[0].distanceOneWayKm > activeReglas.umbralHospedajeKm) {
          setIncludeLodging(true);
        } else {
          setIncludeLodging(false);
        }
      })
      .finally(() => {
        if (active) setIsRouting(false);
      });
    return () => {
      active = false;
    };
  }, [parsed, originPoint.lat, originPoint.lon, activeReglas]);

  const setPinOriginFromCoords = async (lat: number, lon: number) => {
    setOriginResults([]);
    setOriginPoint({
      lat,
      lon,
      label: `Pin (${lat.toFixed(5)}, ${lon.toFixed(5)})`,
      source: 'pin',
    });
    const geo = await reverseGeocodeOSM(lat, lon);
    const shortStreet = geo.displayAddress
      ? geo.displayAddress.split(',').slice(0, 2).join(',').trim()
      : '';
    const resolved = [shortStreet || geo.locality, geo.municipality || geo.province]
      .filter(Boolean)
      .join(' · ');
    if (resolved) {
      setOriginPoint((prev) =>
        prev.source === 'pin' &&
        Math.abs(prev.lat - lat) < 1e-6 &&
        Math.abs(prev.lon - lon) < 1e-6
          ? { ...prev, label: resolved }
          : prev
      );
    }
  };

  useEffect(() => {
    if (!isOpen || step !== 2 || !showOriginPinMap || !originMapRef.current) {
      if (originLeafletRef.current) {
        originLeafletRef.current.remove();
        originLeafletRef.current = null;
        originOverlayRef.current = null;
      }
      return;
    }

    if (!originLeafletRef.current) {
      const map = L.map(originMapRef.current, {
        center: [originPoint.lat, originPoint.lon],
        zoom: 11,
        zoomControl: true,
      });
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap',
      }).addTo(map);
      map.getContainer().style.cursor = 'crosshair';
      map.on('click', (e: L.LeafletMouseEvent) => {
        setPinOriginFromCoords(e.latlng.lat, e.latlng.lng);
      });
      originLeafletRef.current = map;
      originOverlayRef.current = L.featureGroup().addTo(map);
      setTimeout(() => map.invalidateSize(), 120);
    }

    const map = originLeafletRef.current;
    const overlay = originOverlayRef.current;
    if (!map || !overlay) return;

    overlay.clearLayers();
    if (activeRoute) {
      L.polyline(activeRoute.coordinates, {
        color: '#D97706',
        weight: 4,
      }).addTo(overlay);
    }

    const originIcon = L.divIcon({
      className: '',
      iconSize: [24, 24],
      iconAnchor: [12, 12],
      html: `<div style="width:24px;height:24px;border-radius:9999px;background:#0284C7;border:2px solid #FFFFFF;color:#FFFFFF;font-family:ui-monospace,monospace;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 5px rgba(15,41,66,0.4);">A</div>`,
    });

    const marker = L.marker([originPoint.lat, originPoint.lon], {
      draggable: true,
      icon: originIcon,
    }).addTo(overlay);

    marker.on('dragend', () => {
      const p = marker.getLatLng();
      setPinOriginFromCoords(p.lat, p.lng);
    });

    if (parsed) {
      L.circleMarker([parsed.centroid.lat, parsed.centroid.lon], {
        radius: 6,
        color: '#FFFFFF',
        weight: 2,
        fillColor: '#D97706',
        fillOpacity: 1,
      }).addTo(overlay);
    }

    const bounds = overlay.getBounds();
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [24, 24], maxZoom: 15 });
    }
  }, [isOpen, step, showOriginPinMap, originPoint, activeRoute, parsed]);

  useEffect(() => {
    if (isOpen && defaultProyectoId) {
      setProyectoId(defaultProyectoId);
      setModoProyecto('existente');
    }
  }, [isOpen, defaultProyectoId]);

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
      setParsed(null);
      setStep(1);
      setError(
        err instanceof Error ? err.message : 'No se pudo procesar el archivo KMZ/KML/GeoJSON.'
      );
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

  const buildInitialRouteViaticos = (
    targetProyectoId: string
  ): Array<Omit<Viatico, 'id' | 'empresaId' | 'estadoAprobacion' | 'version' | 'updatedAt'>> => {
    if (!attachRouteViaticos || !parsed) return [];
    const now = new Date();
    const dateIso = fechaPrevista || now.toISOString().slice(0, 10);
    const tsAST = formatSantoDomingoAST(now);
    const list: Array<
      Omit<Viatico, 'id' | 'empresaId' | 'estadoAprobacion' | 'version' | 'updatedAt'>
    > = [];

    if (routeBreakdown.fuelRD > 0) {
      list.push({
        creadoPorUsuarioId: creadoPorUsuario.id,
        creadoPorNombre: creadoPorUsuario.nombre,
        fechaIso: dateIso,
        timestampAST: tsAST,
        categoria: 'Combustible' as CategoriaViatico,
        comercio: `Combustible Ruta · ${activeRoute?.name || 'Traslado Campo'}`,
        montoRD: routeBreakdown.fuelRD,
        itbisRD: 0,
        metodo: 'GPS Ruta',
        distanceKm: routeBreakdown.roundTripKm,
        gpsCoords: {
          lat: parsed.centroid.lat,
          lon: parsed.centroid.lon,
          easting: parsed.centroid.easting,
          northing: parsed.centroid.northing,
        },
        repartos: [{ proyectoId: targetProyectoId, montoRD: routeBreakdown.fuelRD }],
        configVersion: activeReglas.version,
        tarifaUsadaRD: fuelPricePerGalRD,
        notas: `${routeBreakdown.roundTripKm} km ida y vuelta (${routeBreakdown.gallonsNeeded} gal)`,
        syncStatus: 'pending',
      });
    }

    if (routeBreakdown.tollsRD > 0) {
      list.push({
        creadoPorUsuarioId: creadoPorUsuario.id,
        creadoPorNombre: creadoPorUsuario.nombre,
        fechaIso: dateIso,
        timestampAST: tsAST,
        categoria: 'Peaje' as CategoriaViatico,
        comercio: `RD Vial — ${activeRoute?.tollNote || 'Peajes Ruta'}`,
        montoRD: routeBreakdown.tollsRD,
        itbisRD: 0,
        metodo: 'GPS Ruta',
        distanceKm: routeBreakdown.roundTripKm,
        gpsCoords: {
          lat: parsed.centroid.lat,
          lon: parsed.centroid.lon,
          easting: parsed.centroid.easting,
          northing: parsed.centroid.northing,
        },
        repartos: [{ proyectoId: targetProyectoId, montoRD: routeBreakdown.tollsRD }],
        configVersion: activeReglas.version,
        notas: 'Peajes ida y vuelta',
        syncStatus: 'pending',
      });
    }

    if (routeBreakdown.perDiemRD > 0) {
      list.push({
        creadoPorUsuarioId: creadoPorUsuario.id,
        creadoPorNombre: creadoPorUsuario.nombre,
        fechaIso: dateIso,
        timestampAST: tsAST,
        categoria: 'Dieta' as CategoriaViatico,
        comercio: `Dieta Cuadrilla (${routeBreakdown.fieldDays} día(s))`,
        montoRD: routeBreakdown.perDiemRD,
        itbisRD: 0,
        metodo: 'Dieta Automática',
        repartos: [{ proyectoId: targetProyectoId, montoRD: routeBreakdown.perDiemRD }],
        configVersion: activeReglas.version,
        notas: `Terreno ${terrain} · Servicios: ${selectedServiceIds.join(', ')}`,
        syncStatus: 'pending',
      });
    }

    return list;
  };

  const finalizeRuta = async (openMobileExpenseAfter: boolean) => {
    if (!parsed) {
      setError('Carga primero un archivo .KMZ, .KML o .GeoJSON.');
      setStep(1);
      return;
    }

    setError(null);
    setIsSaving(true);
    try {
      let targetProyectoId = proyectoId;
      if (modoProyecto === 'nuevo' || !targetProyectoId) {
        if (!nuevoProyectoNombre.trim()) {
          throw new Error('Indica el nombre del nuevo proyecto.');
        }
        const creado = await onCrearClienteYProyectoRapido({
          clienteIdExistente: clienteIdExistente || undefined,
          clienteNombre: nuevoClienteNombre.trim() || 'Cliente por confirmar',
          clienteRnc: nuevoClienteRnc.trim() || 'N/A',
          clienteContacto: nuevoClienteContacto.trim() || 'Contacto principal',
          proyectoNombre: nuevoProyectoNombre.trim(),
          codigoContrato: nuevoCodigoContrato.trim() || `AIA-${Date.now().toString().slice(-4)}`,
          presupuestoViaticosRD: routeBreakdown.totalViaticosRD,
          valorContratoRD: totalContractRD,
        });
        targetProyectoId = creado.id;
      }

      const finalParcelCode = parcelCode.trim() || parsed.autoMeta.parcelCode;
      const serviciosPayload: Array<
        Omit<Servicio, 'id' | 'empresaId' | 'rutaId' | 'version' | 'updatedAt' | 'syncStatus'>
      > = servicesSummary.items.map((item) => ({
        tipoServicioId: item.id,
        nombre: item.name,
        cotizacionRD: item.totalRD,
        configVersion: item.version,
        tarifaBaseUsadaRD: item.precioBaseRD,
        recargosUsadosRD: item.recargosRD,
        estado: estadoInicialServicio,
        notas: `${item.subtitle} · Terreno ${terrain}`,
      }));

      await onCreateRutaCompleta({
        proyectoId: targetProyectoId,
        ruta: {
          proyectoId: targetProyectoId,
          nombre: nombreRuta.trim() || parsed.documentName,
          codigoParcela: finalParcelCode,
          ubicacion: ubicacion.trim() || province || 'República Dominicana',
          provincia: province.trim() || parsed.autoMeta.province,
          fechaPrevista,
          kmzFileName: parsed.fileName,
          features: parsed.features,
          centroid: parsed.centroid,
          totalAreaM2: parsed.totalAreaM2,
          totalPerimeterM: parsed.totalPerimeterM,
          routeSummary: {
            routeName: activeRoute?.name || 'Ruta Directa',
            distanceOneWayKm:
              activeRoute?.distanceOneWayKm ?? parsed.estimatedViaticos.distanceFromBaseKm,
            durationMin: activeRoute?.durationMin ?? 35,
            tollsRD: routeBreakdown.tollsRD,
            fuelRD: routeBreakdown.fuelRD,
            vehicleLabel: activeVehicleConfig.label,
            configVersion: activeReglas.version,
            precioGalonUsadoRD: fuelPricePerGalRD,
            mantenimientoPorKmUsadoRD: activeVehicleConfig.maintenancePerKmRD,
          },
        },
        servicios: serviciosPayload,
        asignacionOpcional:
          programarAhora && cuadrillaId
            ? {
                fechaInicio: fechaPrevista,
                fechaFin: fechaFinAsignacion >= fechaPrevista ? fechaFinAsignacion : fechaPrevista,
                cuadrillaId,
                vehiculoIds: vehiculoId && vehiculos.some((v) => v.id === vehiculoId) ? [vehiculoId] : [],
                equipoIds: equipoId ? [equipoId] : [],
              }
            : undefined,
        viaticosIniciales: buildInitialRouteViaticos(targetProyectoId),
        openMobileExpenseAfter,
      });

      setParsed(null);
      setStep(1);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar la ruta KMZ.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#0F2942]/65 backdrop-blur-[2px] p-3 sm:p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="titulo-modal-kmz"
    >
      <div className="w-full max-w-3xl rounded-2xl border border-slate-200/90 bg-white shadow-2xl my-auto max-h-[94vh] flex flex-col overflow-hidden">
        {/* Header + 3-Step Flow Progress */}
        <div className="border-b border-slate-200/80 bg-[#F8FAFC] px-5 py-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 id="titulo-modal-kmz" className="text-base font-bold tracking-tight text-[#0F2942]">
                Nueva Ruta desde Archivo KMZ / KML / GeoJSON
              </h2>
              <p className="text-xs text-[#475569]">
                Importa geometría, suma servicios al proyecto, calcula ruta OSM y adjunta viáticos.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-[#475569] hover:bg-slate-200/70 shrink-0 transition-colors"
              aria-label="Cerrar modal"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {(
              [
                { num: 1, label: '1. Polígono y Proyecto' },
                { num: 2, label: '2. Servicios y Ruta' },
                { num: 3, label: '3. Cuadrilla y Viáticos' },
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
                  className={`min-h-[40px] rounded-xl border px-3 py-2 text-left text-xs font-semibold transition-all disabled:opacity-40 ${
                    isActive
                      ? 'border-[#0F2942] bg-[#0F2942] text-white shadow-sm'
                      : isDone
                      ? 'border-emerald-200 bg-emerald-50 text-[#15803D]'
                      : 'border-slate-200 bg-white text-[#475569]'
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
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-800">
              {error}
            </div>
          )}

          {/* STEP 1: KMZ/GeoJSON UPLOAD + PROYECTO TARGET */}
          {step === 1 && (
            <div className="space-y-4">
              {/* Proyecto selector / inline creator */}
              <div className="rounded-2xl border border-slate-200/70 bg-[#F8FAFC] p-4 space-y-3 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 font-bold text-[#0F2942]">
                    <Building2 className="h-3.5 w-3.5 text-[#0284C7]" />
                    Proyecto al que pertenece esta Ruta
                  </span>
                  <div className="inline-flex rounded-xl border border-slate-200 bg-[#F1F5F9] p-1">
                    <button
                      type="button"
                      disabled={proyectos.length === 0}
                      onClick={() => setModoProyecto('existente')}
                      className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold disabled:opacity-40 whitespace-nowrap transition-all ${
                        modoProyecto === 'existente'
                          ? 'bg-[#0F2942] text-white shadow-sm'
                          : 'text-[#475569]'
                      }`}
                    >
                      Proyecto existente
                    </button>
                    <button
                      type="button"
                      onClick={() => setModoProyecto('nuevo')}
                      className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap transition-all ${
                        modoProyecto === 'nuevo' ? 'bg-[#0F2942] text-white shadow-sm' : 'text-[#475569]'
                      }`}
                    >
                      + Nuevo proyecto
                    </button>
                  </div>
                </div>

                {modoProyecto === 'existente' ? (
                  <select
                    value={proyectoId}
                    onChange={(e) => setProyectoId(e.target.value)}
                    className="w-full min-h-[40px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-[#0F2942] focus:border-[#0284C7] focus:outline-none"
                  >
                    {proyectos.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.codigoContrato} — {p.nombre}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">
                        Nombre del Proyecto
                      </label>
                      <input
                        type="text"
                        value={nuevoProyectoNombre}
                        onChange={(e) => setNuevoProyectoNombre(e.target.value)}
                        placeholder="Ej. Deslinde Costa Este"
                        className="w-full min-h-[40px] rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs focus:border-[#0284C7] focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">
                        Código de Contrato
                      </label>
                      <input
                        type="text"
                        value={nuevoCodigoContrato}
                        onChange={(e) => setNuevoCodigoContrato(e.target.value)}
                        className="w-full min-h-[40px] rounded-xl border border-slate-200 bg-white px-3 py-1.5 font-mono text-xs focus:border-[#0284C7] focus:outline-none"
                      />
                    </div>
                    {clientes.length > 0 && (
                      <div>
                        <label className="block font-semibold text-slate-700 mb-1">
                          Cliente existente (opcional)
                        </label>
                        <select
                          value={clienteIdExistente}
                          onChange={(e) => setClienteIdExistente(e.target.value)}
                          className="w-full min-h-[40px] rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs focus:border-[#0284C7] focus:outline-none"
                        >
                          <option value="">-- Crear cliente nuevo --</option>
                          {clientes.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.nombre} ({c.rnc})
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                    {!clienteIdExistente && (
                      <>
                        <div>
                          <label className="block font-semibold text-slate-700 mb-1">
                            Nombre Nuevo Cliente
                          </label>
                          <input
                            type="text"
                            value={nuevoClienteNombre}
                            onChange={(e) => setNuevoClienteNombre(e.target.value)}
                            placeholder="Razón social o propietario"
                            className="w-full min-h-[40px] rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs focus:border-[#0284C7] focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="block font-semibold text-slate-700 mb-1">RNC / Cédula</label>
                          <input
                            type="text"
                            value={nuevoClienteRnc}
                            onChange={(e) => setNuevoClienteRnc(e.target.value)}
                            placeholder="1-31-00000-0"
                            className="w-full min-h-[40px] rounded-xl border border-slate-200 bg-white px-3 py-1.5 font-mono text-xs focus:border-[#0284C7] focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="block font-semibold text-slate-700 mb-1">Contacto</label>
                          <input
                            type="text"
                            value={nuevoClienteContacto}
                            onChange={(e) => setNuevoClienteContacto(e.target.value)}
                            placeholder="Nombre de contacto"
                            className="w-full min-h-[40px] rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs focus:border-[#0284C7] focus:outline-none"
                          />
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>

              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const f = e.dataTransfer.files?.[0];
                  if (f) handleFile(f);
                }}
                onClick={() => fileInputRef.current?.click()}
                className="cursor-pointer rounded-2xl border-2 border-dashed border-[#0284C7] bg-[#F8FAFC] p-5 text-center hover:bg-sky-50/70 transition-colors"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".kmz,.kml,.geojson,.json"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFile(f);
                    e.target.value = '';
                  }}
                />
                <UploadCloud className="mx-auto h-7 w-7 text-[#0284C7]" />
                <p className="mt-2 text-sm font-semibold text-[#0F2942]">
                  {isParsing
                    ? 'Procesando geometría, proyectando UTM 19N y consultando OpenStreetMap...'
                    : 'Arrastra tu archivo .KMZ, .KML o .GeoJSON aquí'}
                </p>
                <p className="mt-1 text-xs text-[#475569]">
                  Extrae polígonos/líneas, código parcelario, fecha, provincia y área automáticamente
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {SAMPLE_KMZ_TEMPLATES.map((tpl) => (
                  <div
                    key={tpl.key}
                    className="flex items-center justify-between gap-2 rounded-xl border border-slate-200/90 bg-white px-3.5 py-2.5"
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
                      className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-xl text-[#475569] hover:bg-slate-100 shrink-0 transition-colors"
                    >
                      <Download className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>

              {parsed && (
                <>
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 text-xs space-y-1.5">
                    <div className="flex items-center justify-between font-semibold text-[#15803D]">
                      <span className="inline-flex items-center gap-1.5">
                        <CheckCircle2 className="h-4 w-4" />
                        Archivo procesado: {parsed.fileName}
                      </span>
                      <span className="font-mono text-[11px] tabular-nums">
                        {formatArea(parsed.totalAreaM2, 'tareas')} ·{' '}
                        {formatPerimeter(parsed.totalPerimeterM)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[11px] text-emerald-800">
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
                      <label className="block font-semibold text-slate-700 mb-1.5">
                        Código Catastral / Parcela
                      </label>
                      <input
                        type="text"
                        value={parcelCode}
                        onChange={(e) => setParcelCode(e.target.value)}
                        className="w-full min-h-[40px] rounded-xl border border-slate-200 px-3 py-2 font-mono text-xs text-[#0F2942] focus:border-[#0284C7] focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1.5">
                        Nombre de la Ruta / Locación
                      </label>
                      <input
                        type="text"
                        value={nombreRuta}
                        onChange={(e) => setNombreRuta(e.target.value)}
                        className="w-full min-h-[40px] rounded-xl border border-slate-200 px-3 py-2 text-xs text-[#0F2942] focus:border-[#0284C7] focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1.5">
                        Ubicación / Sector
                      </label>
                      <input
                        type="text"
                        value={ubicacion}
                        onChange={(e) => setUbicacion(e.target.value)}
                        className="w-full min-h-[40px] rounded-xl border border-slate-200 px-3 py-2 text-xs text-[#0F2942] focus:border-[#0284C7] focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1.5">Provincia</label>
                      <input
                        type="text"
                        value={province}
                        onChange={(e) => setProvince(e.target.value)}
                        className="w-full min-h-[40px] rounded-xl border border-slate-200 px-3 py-2 text-xs text-[#0F2942] focus:border-[#0284C7] focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1.5">
                        Fecha Prevista de Campo
                      </label>
                      <input
                        type="date"
                        value={fechaPrevista}
                        onChange={(e) => {
                          setFechaPrevista(e.target.value);
                          setFechaFinAsignacion(e.target.value);
                        }}
                        className="w-full min-h-[40px] rounded-xl border border-slate-200 px-3 py-2 font-mono text-xs text-[#0F2942] focus:border-[#0284C7] focus:outline-none"
                      />
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* STEP 2: ADDITIVE SERVICES + OSM ROUTE VIATICOS */}
          {step === 2 && parsed && (
            <div className="space-y-5">
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[#0F2942]">
                    Servicios Técnicos Sumatorios ({selectedServiceIds.length} activos)
                  </h3>
                  <span className="font-mono text-xs font-bold text-[#0284C7] tabular-nums">
                    Subtotal servicios: {formatRD(servicesSummary.totalServicesRD)}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {activeServicios.map((svc) => {
                    const checked = selectedServiceIds.includes(svc.codigo);
                    return (
                      <button
                        key={svc.codigo}
                        type="button"
                        onClick={() =>
                          setSelectedServiceIds((prev) =>
                            prev.includes(svc.codigo)
                              ? prev.filter((x) => x !== svc.codigo)
                              : [...prev, svc.codigo]
                          )
                        }
                        className={`flex items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 text-left transition-colors min-h-[44px] ${
                          checked
                            ? 'border-[#0F2942] bg-[#0F2942] text-white shadow-sm'
                            : 'border-slate-200 bg-white text-[#0F2942] hover:bg-[#F8FAFC] hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span
                            className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                              checked
                                ? 'border-[#FBBF24] bg-[#FBBF24] text-[#0F2942]'
                                : 'border-slate-400 bg-white'
                            }`}
                          >
                            {checked && <Check className="h-3 w-3 stroke-[3]" />}
                          </span>
                          <div className="min-w-0">
                            <div className="text-xs font-bold">{svc.nombre}</div>
                            <div
                              className={`text-[11px] ${
                                checked ? 'text-slate-300' : 'text-[#475569]'
                              }`}
                            >
                              {svc.subtitulo}
                            </div>
                          </div>
                        </div>
                        <span
                          className={`font-mono text-xs font-bold tabular-nums whitespace-nowrap shrink-0 ${
                            checked ? 'text-[#FBBF24]' : 'text-[#0F2942]'
                          }`}
                        >
                          + {formatRD(svc.precioBaseRD, moneda).replace('.00', '')}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {activeServicios.some(
                  (s) => selectedServiceIds.includes(s.codigo) && s.recargoCorredorPorKmRD > 0
                ) && (
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200/70 bg-[#F8FAFC] px-3.5 py-2.5 text-xs">
                    <span className="font-semibold text-[#0F2942]">
                      Longitud corredor vial (km @{' '}
                      {formatRD(
                        activeServicios.find(
                          (s) =>
                            selectedServiceIds.includes(s.codigo) && s.recargoCorredorPorKmRD > 0
                        )?.recargoCorredorPorKmRD ?? 0,
                        moneda
                      )}
                      /km):
                    </span>
                    <input
                      type="number"
                      min={0}
                      step={0.5}
                      value={corridorKm}
                      onChange={(e) => setCorridorKm(Math.max(0, Number(e.target.value)))}
                      className="w-28 rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-[#0F2942] tabular-nums min-h-[40px] focus:border-[#0284C7] focus:outline-none"
                    />
                  </div>
                )}
              </div>

              {/* Terrain & Vehicle */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div>
                  <label className="block font-bold text-[#0F2942] mb-1.5">Topografía</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['Llano', 'Ondulado', 'Montañoso'] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setTerrain(t)}
                        className={`rounded-xl border px-2 py-2 font-semibold transition-colors min-h-[40px] whitespace-nowrap ${
                          terrain === t
                            ? 'border-[#0F2942] bg-[#0F2942] text-white shadow-sm'
                            : 'border-slate-200 bg-white text-slate-700 hover:bg-[#F8FAFC]'
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block font-bold text-[#0F2942] mb-1.5">
                    Vehículo de la Empresa
                  </label>
                  <select
                    value={vehiculoId}
                    onChange={(e) => {
                      const nextId = e.target.value;
                      setVehiculoId(nextId);
                      const vEmp = vehiculos.find((x) => x.id === nextId);
                      if (vEmp) {
                        setFuelPricePerGalRD(vEmp.precioGalonRD);
                        setKmPerGal(vEmp.kmPorGal);
                      } else {
                        const vCat = VEHICLE_CATALOG.find((x) => x.id === nextId);
                        if (vCat) {
                          setFuelPricePerGalRD(vCat.fuelPricePerGalRD);
                          setKmPerGal(vCat.kmPerGal);
                        }
                      }
                    }}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-[#0F2942] min-h-[40px] focus:border-[#0284C7] focus:outline-none"
                  >
                    {vehiculos.length > 0
                      ? vehiculos.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.etiqueta} ({v.placa}){v.estado !== 'disponible' ? ` [${v.estado}]` : ''}
                          </option>
                        ))
                      : VEHICLE_CATALOG.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.label}
                          </option>
                        ))}
                  </select>
                </div>
              </div>

              {/* Routes Comparison */}
              <div className="rounded-2xl border border-slate-200/70 bg-[#F8FAFC] p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="inline-flex items-center gap-1.5 font-bold text-[#0F2942]">
                    <Route className="h-4 w-4 text-[#0284C7]" />
                    Rutas OpenStreetMap (Ida y Vuelta)
                  </span>
                  <span className="font-mono text-[11px] font-semibold text-[#0284C7] tabular-nums">
                    {isRouting ? 'Calculando ruta...' : `${routeBreakdown.roundTripKm} km ida/vuelta`}
                  </span>
                </div>

                {/* Punto de Partida (calle o pin en mapa) */}
                <div className="rounded-xl border border-slate-200/90 bg-white p-3 space-y-2.5 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-[#0284C7] font-mono text-[10px] font-bold text-white">
                        A
                      </span>
                      <span className="font-bold text-[#0F2942]">Salida:</span>
                      <span className="text-slate-700 truncate">{originPoint.label}</span>
                    </div>
                    {originPoint.source !== 'empresa' && (
                      <button
                        type="button"
                        onClick={() => {
                          setOriginQuery('');
                          setOriginResults([]);
                          setOriginPoint({
                            lat: baseLat,
                            lon: baseLon,
                            label: baseDireccion,
                            source: 'empresa',
                          });
                        }}
                        className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
                      >
                        <RotateCcw className="h-3 w-3" />
                        Base
                      </button>
                    )}
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2">
                    <div className="flex-1 flex gap-2 min-w-0">
                      <div className="relative flex-1 min-w-0">
                        <Navigation className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                        <input
                          type="text"
                          value={originQuery}
                          onChange={(e) => setOriginQuery(e.target.value)}
                          onKeyDown={async (e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              if (!originQuery.trim()) return;
                              setIsSearchingOrigin(true);
                              const list = await searchAddressOSM(originQuery);
                              setOriginResults(list);
                              setIsSearchingOrigin(false);
                            }
                          }}
                          placeholder="Buscar calle o sector de partida..."
                          className="w-full rounded-xl border border-slate-200 bg-white pl-8 pr-3 py-2 text-xs text-[#0F2942] min-h-[40px] focus:border-[#0284C7] focus:outline-none"
                        />
                      </div>
                      <button
                        type="button"
                        disabled={isSearchingOrigin || !originQuery.trim()}
                        onClick={async () => {
                          if (!originQuery.trim()) return;
                          setIsSearchingOrigin(true);
                          const list = await searchAddressOSM(originQuery);
                          setOriginResults(list);
                          setIsSearchingOrigin(false);
                        }}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-[#0F2942] px-3 py-2 text-xs font-semibold text-white hover:bg-[#0284C7] disabled:opacity-50 whitespace-nowrap shrink-0 min-h-[40px] transition-colors"
                      >
                        <Search className="h-3.5 w-3.5" />
                        {isSearchingOrigin ? '...' : 'Calle'}
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => setShowOriginPinMap((prev) => !prev)}
                      className={`inline-flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold whitespace-nowrap shrink-0 min-h-[40px] transition-colors ${
                        showOriginPinMap
                          ? 'border-[#0F2942] bg-[#0F2942] text-white'
                          : 'border-[#0284C7] bg-white text-[#0284C7] hover:bg-sky-50'
                      }`}
                    >
                      <MapPin className="h-3.5 w-3.5" />
                      {showOriginPinMap ? 'Ocultar mapa pin' : 'Fijar pin en mapa'}
                    </button>
                  </div>

                  {originResults.length > 0 && (
                    <div className="rounded-xl border border-slate-200 divide-y divide-slate-200 max-h-36 overflow-y-auto bg-white">
                      {originResults.map((res, idx) => (
                        <button
                          key={`${res.lat}-${res.lon}-${idx}`}
                          type="button"
                          onClick={() => {
                            setOriginPoint({
                              lat: res.lat,
                              lon: res.lon,
                              label: res.label,
                              source: 'calle',
                            });
                            setOriginResults([]);
                          }}
                          className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left text-xs hover:bg-sky-50 transition-colors"
                        >
                          <span className="truncate text-[#0F2942]">{res.label}</span>
                          <span className="font-mono text-[10px] font-semibold text-[#0284C7] uppercase shrink-0">
                            {res.source}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}

                  {showOriginPinMap && (
                    <div className="relative overflow-hidden rounded-xl border border-slate-200">
                      <div className="pointer-events-none absolute top-2.5 left-2.5 right-2.5 z-[400] flex items-center justify-between gap-2">
                        <div className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-[#091A2C]/92 px-3 py-1.5 text-[11px] font-medium text-white shadow-lg backdrop-blur-md">
                          <MapPin className="h-3.5 w-3.5 shrink-0 text-[#38BDF8]" />
                          <span>Haz clic o arrastra el pin azul (A) para fijar salida</span>
                        </div>
                      </div>
                      <div
                        ref={originMapRef}
                        className="w-full h-[200px] z-0"
                      />
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {routes.map((r) => {
                    const b = computeRouteViaticos({
                      distanceOneWayKm: r.distanceOneWayKm,
                      oneWayTollRD: r.oneWayTollRD,
                      includeTolls,
                      includeLodging,
                      fuelPricePerGalRD,
                      kmPerGal,
                      maintenancePerKmRD: activeVehicleConfig.maintenancePerKmRD,
                      areaM2: parsed.totalAreaM2,
                      terrain,
                      serviceCount: selectedServiceIds.length,
                      reglasViaticos: activeReglas,
                      factoresTerreno: activeTerreno,
                    });
                    const active = r.id === activeRoute?.id;
                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => setSelectedRouteId(r.id)}
                        className={`rounded-xl border p-3.5 text-left transition-all ${
                          active
                            ? 'border-2 border-[#0F2942] bg-white shadow-sm'
                            : 'border-slate-200 bg-white/80 hover:bg-white hover:border-slate-300'
                        }`}
                      >
                        <div className="flex justify-between items-center gap-2 text-[11px]">
                          <span className="font-bold text-[#0284C7]">{r.badge}</span>
                          <span className="font-mono font-bold text-[#0F2942] tabular-nums">
                            {formatRD(b.totalViaticosRD)}
                          </span>
                        </div>
                        <div className="text-xs font-bold text-[#0F2942] mt-1">{r.name}</div>
                        <div className="font-mono text-[11px] text-[#475569] mt-0.5 tabular-nums">
                          {r.distanceOneWayKm} km ida · {r.tollNote}
                        </div>
                      </button>
                    );
                  })}
                </div>

                <div className="flex flex-wrap items-center gap-5 pt-1 text-xs text-slate-700">
                  <label className="inline-flex items-center gap-2 cursor-pointer min-h-[36px]">
                    <input
                      type="checkbox"
                      checked={includeTolls}
                      onChange={(e) => setIncludeTolls(e.target.checked)}
                      className="h-4 w-4 rounded accent-[#0F2942]"
                    />
                    Incluir peajes ida y vuelta
                  </label>
                  <label className="inline-flex items-center gap-2 cursor-pointer min-h-[36px]">
                    <input
                      type="checkbox"
                      checked={includeLodging}
                      onChange={(e) => setIncludeLodging(e.target.checked)}
                      className="h-4 w-4 rounded accent-[#0F2942]"
                    />
                    Pernocta / hospedaje cuadrilla
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: BRIGADE SCHEDULING (OPTIONAL) & ATTACH VIATICOS */}
          {step === 3 && parsed && (
            <div className="space-y-5">
              <div className="rounded-2xl border border-slate-200/90 bg-white p-4 space-y-4 text-xs">
                <label className="flex items-center gap-2.5 font-bold text-[#0F2942] cursor-pointer min-h-[36px]">
                  <input
                    type="checkbox"
                    checked={programarAhora}
                    onChange={(e) => setProgramarAhora(e.target.checked)}
                    className="h-4 w-4 rounded accent-[#0F2942]"
                  />
                  Programar asignación de cuadrilla ahora (con validación de rango y conflictos)
                </label>

                {programarAhora && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1.5">
                        Cuadrilla Asignada
                      </label>
                      <select
                        value={cuadrillaId}
                        onChange={(e) => setCuadrillaId(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-[#0F2942] min-h-[40px] focus:border-[#0284C7] focus:outline-none"
                      >
                        {cuadrillas.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.nombre}
                            {!c.activa ? ' [De baja]' : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1.5">
                        Equipo GNSS RTK
                      </label>
                      <select
                        value={equipoId}
                        onChange={(e) => setEquipoId(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-[#0F2942] min-h-[40px] focus:border-[#0284C7] focus:outline-none"
                      >
                        <option value="">Sin equipo asignado</option>
                        {equipos.map((eq) => (
                          <option key={eq.id} value={eq.id}>
                            {eq.nombre} ({eq.serial})
                            {eq.estado !== 'disponible' ? ` [${eq.estado}]` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1.5">
                        Fecha Fin de Campo
                      </label>
                      <input
                        type="date"
                        min={fechaPrevista}
                        value={fechaFinAsignacion}
                        onChange={(e) => setFechaFinAsignacion(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-[#0F2942] min-h-[40px] focus:border-[#0284C7] focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1.5">
                        Estado Inicial de los Servicios
                      </label>
                      <select
                        value={estadoInicialServicio}
                        onChange={(e) => setEstadoInicialServicio(e.target.value as EstadoServicio)}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-[#0F2942] min-h-[40px] focus:border-[#0284C7] focus:outline-none"
                      >
                        <option value="cotizado">Cotizado</option>
                        <option value="aprobado">Aprobado</option>
                        <option value="programado">Programado</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>

              {/* Financial Summary */}
              <div className="rounded-2xl border border-slate-200/70 bg-[#F8FAFC] p-4 space-y-2.5 text-xs">
                <div className="flex justify-between gap-4">
                  <span className="text-[#475569]">
                    Servicios Sumatorios (
                    {servicesSummary.items.map((i) => i.name).join(' + ') || 'Ninguno'})
                  </span>
                  <span className="font-mono font-semibold text-[#0F2942] tabular-nums whitespace-nowrap shrink-0">
                    {formatRD(servicesSummary.totalServicesRD)}
                  </span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-[#475569]">
                    Viáticos de Ruta ({activeRoute?.name || 'Ruta'} · {routeBreakdown.roundTripKm}{' '}
                    km)
                  </span>
                  <span className="font-mono font-semibold text-[#0284C7] tabular-nums whitespace-nowrap shrink-0">
                    {formatRD(routeBreakdown.totalViaticosRD)}
                  </span>
                </div>
                <div className="flex justify-between gap-4 border-t border-slate-200 pt-2.5 text-sm font-bold text-[#0F2942]">
                  <span>Inversión Total Estimada</span>
                  <span className="font-mono tabular-nums whitespace-nowrap shrink-0">
                    {formatRD(totalContractRD)}
                  </span>
                </div>
              </div>

              {/* Attach Viáticos Option */}
              <div className="rounded-2xl border border-sky-200 bg-sky-50/70 p-4 space-y-2">
                <label className="flex items-start gap-3 cursor-pointer text-xs">
                  <input
                    type="checkbox"
                    checked={attachRouteViaticos}
                    onChange={(e) => setAttachRouteViaticos(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded accent-[#0F2942]"
                  />
                  <div>
                    <div className="font-bold text-[#0F2942]">
                      Generar viáticos iniciales de ruta repartidos al proyecto
                    </div>
                    <p className="mt-1 text-[#475569] leading-relaxed">
                      Combustible (<span className="font-mono tabular-nums">{formatRD(routeBreakdown.fuelRD)}</span>), Peajes (
                      <span className="font-mono tabular-nums">{formatRD(routeBreakdown.tollsRD)}</span>) y Dieta (
                      <span className="font-mono tabular-nums">{formatRD(routeBreakdown.perDiemRD)}</span>) con método GPS Ruta.
                    </p>
                  </div>
                </label>
              </div>
            </div>
          )}
        </div>

        {/* Stepper Footer Actions */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200/80 px-6 py-4 bg-[#F8FAFC]">
          <div>
            {step > 1 && (
              <button
                type="button"
                onClick={() => setStep((s) => (s === 3 ? 2 : 1))}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 min-h-[40px] whitespace-nowrap transition-colors"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Paso anterior
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 min-h-[40px] whitespace-nowrap transition-colors"
            >
              Cancelar
            </button>

            {step < 3 ? (
              <button
                type="button"
                disabled={!parsed}
                onClick={() => {
                  if (!parsed) {
                    setError('Carga primero un archivo .KMZ, .KML o .GeoJSON.');
                    return;
                  }
                  setStep((s) => (s === 1 ? 2 : 3));
                }}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#0F2942] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0284C7] disabled:opacity-40 transition-colors min-h-[40px] whitespace-nowrap shadow-sm"
              >
                <span>
                  {step === 1 ? 'Continuar a servicios y ruta' : 'Continuar a cuadrilla y viáticos'}
                </span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            ) : (
              <>
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => finalizeRuta(false)}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[#0F2942] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0284C7] disabled:opacity-50 transition-colors min-h-[40px] whitespace-nowrap shadow-sm"
                >
                  <Receipt className="h-3.5 w-3.5" />
                  {isSaving ? 'Creando...' : 'Crear ruta KMZ'}
                </button>
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => finalizeRuta(true)}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[#0284C7] px-4 py-2 text-xs font-semibold text-white hover:bg-[#006398] disabled:opacity-50 transition-colors min-h-[40px] whitespace-nowrap shadow-sm"
                >
                  <Camera className="h-3.5 w-3.5" />
                  Crear ruta y adjuntar recibo
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
