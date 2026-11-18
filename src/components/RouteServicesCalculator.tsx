import React, { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  Camera,
  Car,
  Check,
  Compass,
  Download,
  Layers,
  Map as MapIcon,
  MapPin,
  Mountain,
  Navigation,
  Receipt,
  RotateCcw,
  Route,
  Search,
  Send,
  UploadCloud,
  X,
} from 'lucide-react';
import { DwgPlanViewer } from './DwgPlanViewer';
import type { ParsedDwgPlan } from '../utils/dwgParser';
import type {
  CategoriaViatico,
  Proyecto,
  RouteSummary,
  Ruta,
  Vehiculo,
  Viatico,
} from '../types/domain';
import { formatRD, formatSantoDomingoAST, TAREA_IN_M2 } from '../utils/geodesy';
import { parseKmzOrKmlFile, type ParsedKmzResult } from '../utils/kmzParser';
import {
  computeRouteViaticos,
  fetchOptimalRoutesOSM,
  SANTO_DOMINGO_ORIGIN,
  SERVICE_CATALOG,
  TERRAIN_MULTIPLIER,
  VEHICLE_CATALOG,
  type RouteAlternative,
  type TerrainType,
} from '../utils/routingEngine';

import {
  reverseGeocodeOSM,
  searchAddressOSM,
  type AddressSearchResult,
} from '../utils/osmGeocode';

interface OriginPointState {
  lat: number;
  lon: number;
  label: string;
  source: 'empresa' | 'calle' | 'pin';
}

interface RouteServicesCalculatorProps {
  rutas: Ruta[];
  proyectos: Proyecto[];
  vehiculos: Vehiculo[];
  selectedRuta: Ruta | undefined;
  canEdit: boolean;
  creadoPorUsuario: { id: string; nombre: string };
  baseLat?: number;
  baseLon?: number;
  baseDireccion?: string;
  onSelectRuta: (rutaId: string) => void;
  onApplyToRuta: (payload: {
    rutaId: string;
    proyectoId: string;
    budgetViaticosRD: number;
    contractValueRD: number;
    serviciosPropuestos: Array<{ tipoServicioId: string; nombre: string; cotizacionRD: number }>;
    routeSummary: RouteSummary;
  }) => Promise<void>;
  onRegisterKmzFromCalculator: (parsed: ParsedKmzResult) => void;
  onLogRouteExpenses: (
    items: Array<Omit<Viatico, 'id' | 'empresaId' | 'estadoAprobacion' | 'version' | 'updatedAt'>>
  ) => Promise<void>;
  onOpenExpenseModal?: () => void;
}

const DOMINICAN_PROVINCES = [
  'Distrito Nacional',
  'Santo Domingo',
  'Santiago',
  'La Altagracia',
  'San Cristóbal',
  'San Pedro de Macorís',
  'La Vega',
  'Puerto Plata',
  'La Romana',
  'Duarte',
  'Monte Plata',
  'El Seibo',
  'Samaná',
  'Espaillat',
  'Monseñor Nouel',
  'Azua',
  'Barahona',
  'Peravia',
  'San Juan',
  'Valverde',
];

export const RouteServicesCalculator: React.FC<RouteServicesCalculatorProps> = ({
  rutas,
  proyectos,
  vehiculos,
  selectedRuta,
  canEdit,
  creadoPorUsuario,
  baseLat = SANTO_DOMINGO_ORIGIN.lat,
  baseLon = SANTO_DOMINGO_ORIGIN.lon,
  baseDireccion = 'Base Operativa (Santo Domingo)',
  onSelectRuta,
  onApplyToRuta,
  onRegisterKmzFromCalculator,
  onLogRouteExpenses,
  onOpenExpenseModal,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileRef = useRef<L.TileLayer | null>(null);
  const overlayRef = useRef<L.FeatureGroup | null>(null);

  const [uploadedKmz, setUploadedKmz] = useState<ParsedKmzResult | null>(null);
  const [kmzError, setKmzError] = useState<string | null>(null);

  // Servicios sumatorios
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>(['rtk', 'deslinde']);
  const [corridorKm, setCorridorKm] = useState<number>(1);
  const [terrain, setTerrain] = useState<TerrainType>('Llano');

  // Ubicación y superficie
  const [province, setProvince] = useState<string>(selectedRuta?.provincia || 'Santo Domingo');
  const [manualAreaM2, setManualAreaM2] = useState<number>(
    Math.round(selectedRuta?.totalAreaM2 || 2500)
  );

  // Vehículo y combustible (toma catálogo real de la empresa si existe)
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
  const [applyFeedback, setApplyFeedback] = useState<string | null>(null);
  const [isApplying, setIsApplying] = useState<boolean>(false);

  // Rutas OSRM
  const [routes, setRoutes] = useState<RouteAlternative[]>([]);
  const [selectedRouteId, setSelectedRouteId] = useState<'economica' | 'rapida'>('economica');
  const [distanceOverrideKm, setDistanceOverrideKm] = useState<number | null>(null);
  const [includeTolls, setIncludeTolls] = useState<boolean>(true);
  const [includeLodging, setIncludeLodging] = useState<boolean>(false);
  const [mapStyle, setMapStyle] = useState<'osm' | 'topo'>('osm');
  const [isLoadingRoutes, setIsLoadingRoutes] = useState<boolean>(false);

  // Punto de partida personalizado (empresa / calle / pin en mapa)
  const [originPoint, setOriginPoint] = useState<OriginPointState>({
    lat: baseLat,
    lon: baseLon,
    label: baseDireccion,
    source: 'empresa',
  });
  const [originSearchQuery, setOriginSearchQuery] = useState<string>('');
  const [originSearchResults, setOriginSearchResults] = useState<AddressSearchResult[]>([]);
  const [isSearchingOrigin, setIsSearchingOrigin] = useState<boolean>(false);
  const [originSearchError, setOriginSearchError] = useState<string | null>(null);
  const [isPickingOriginPin, setIsPickingOriginPin] = useState<boolean>(false);

  // Planos arquitectónicos .DWG / .DXF (para Arquitectura o de necesitarse)
  const [showDwgSection, setShowDwgSection] = useState<boolean>(false);
  const [dwgPlan, setDwgPlan] = useState<ParsedDwgPlan | null>(null);

  const activeVehicle = useMemo(() => {
    const vEmp = vehiculos.find((v) => v.id === vehiculoId);
    if (vEmp) {
      return {
        id: vEmp.id,
        label: `${vEmp.etiqueta} (${vEmp.placa})`,
        fuelName: vEmp.tipoCombustible,
        fuelPricePerGalRD: vEmp.precioGalonRD,
        kmPerGal: vEmp.kmPorGal,
        maintenancePerKmRD: vEmp.mantenimientoPorKmRD,
      };
    }
    return VEHICLE_CATALOG.find((v) => v.id === vehiculoId) ?? VEHICLE_CATALOG[0];
  }, [vehiculos, vehiculoId]);

  const activeCentroid = uploadedKmz?.centroid ??
    selectedRuta?.centroid ?? {
      lat: baseLat,
      lon: baseLon,
      elev: 14,
      easting: 401688,
      northing: 2044250,
      zone: '19Q',
    };

  const activeFeatures = uploadedKmz?.features ?? selectedRuta?.features ?? [];

  useEffect(() => {
    if (!uploadedKmz && selectedRuta) {
      setProvince(selectedRuta.provincia);
      setManualAreaM2(Math.round(selectedRuta.totalAreaM2));
    }
  }, [selectedRuta, uploadedKmz]);

  useEffect(() => {
    setOriginPoint((prev) =>
      prev.source === 'empresa'
        ? { lat: baseLat, lon: baseLon, label: baseDireccion, source: 'empresa' }
        : prev
    );
  }, [baseLat, baseLon, baseDireccion]);

  useEffect(() => {
    let active = true;
    setIsLoadingRoutes(true);
    setDistanceOverrideKm(null);

    fetchOptimalRoutesOSM(
      activeCentroid.lat,
      activeCentroid.lon,
      originPoint.lat,
      originPoint.lon
    )
      .then((res) => {
        if (!active) return;
        setRoutes(res);
        const primary = res[0];
        if (primary && primary.distanceOneWayKm > 105) {
          setIncludeLodging(true);
        } else {
          setIncludeLodging(false);
        }
      })
      .finally(() => {
        if (active) setIsLoadingRoutes(false);
      });

    return () => {
      active = false;
    };
  }, [activeCentroid.lat, activeCentroid.lon, originPoint.lat, originPoint.lon]);

  const activeRoute = useMemo(
    () => routes.find((r) => r.id === selectedRouteId) ?? routes[0],
    [routes, selectedRouteId]
  );

  const effectiveOneWayKm =
    distanceOverrideKm !== null && distanceOverrideKm > 0
      ? distanceOverrideKm
      : activeRoute?.distanceOneWayKm ?? 12;

  const servicesCalculation = useMemo(() => {
    const terrainMult = TERRAIN_MULTIPLIER[terrain];
    const items = SERVICE_CATALOG.filter((s) => selectedServiceIds.includes(s.id)).map((svc) => {
      const corridorExtra =
        svc.id === 'ingenieria' && svc.perKmCorridorRD
          ? Math.max(0, corridorKm) * svc.perKmCorridorRD
          : 0;
      const areaSurcharge =
        manualAreaM2 > 10000 ? Math.round(((manualAreaM2 - 10000) / 10000) * 3500) : 0;
      const rawSubtotal = svc.basePriceRD + corridorExtra + areaSurcharge;
      const adjusted = Math.round(rawSubtotal * terrainMult);
      return {
        ...svc,
        corridorExtra,
        adjustedPriceRD: adjusted,
      };
    });

    const totalServicesRD = items.reduce((sum, item) => sum + item.adjustedPriceRD, 0);
    return { items, totalServicesRD };
  }, [selectedServiceIds, corridorKm, terrain, manualAreaM2]);

  const routeComparison = useMemo(() => {
    return routes.map((r) => {
      const distKm =
        r.id === activeRoute?.id && distanceOverrideKm !== null
          ? distanceOverrideKm
          : r.distanceOneWayKm;
      const breakdown = computeRouteViaticos({
        distanceOneWayKm: distKm,
        oneWayTollRD: r.oneWayTollRD,
        includeTolls,
        includeLodging,
        fuelPricePerGalRD,
        kmPerGal,
        maintenancePerKmRD: activeVehicle.maintenancePerKmRD,
        areaM2: manualAreaM2,
        terrain,
        serviceCount: selectedServiceIds.length,
      });
      return {
        route: r,
        breakdown,
      };
    });
  }, [
    routes,
    activeRoute?.id,
    distanceOverrideKm,
    includeTolls,
    includeLodging,
    fuelPricePerGalRD,
    kmPerGal,
    activeVehicle.maintenancePerKmRD,
    manualAreaM2,
    terrain,
    selectedServiceIds.length,
  ]);

  const activeBreakdown = useMemo(() => {
    const match = routeComparison.find((rc) => rc.route.id === activeRoute?.id);
    if (match) return match.breakdown;
    return computeRouteViaticos({
      distanceOneWayKm: effectiveOneWayKm,
      oneWayTollRD: activeRoute?.oneWayTollRD ?? 0,
      includeTolls,
      includeLodging,
      fuelPricePerGalRD,
      kmPerGal,
      maintenancePerKmRD: activeVehicle.maintenancePerKmRD,
      areaM2: manualAreaM2,
      terrain,
      serviceCount: selectedServiceIds.length,
    });
  }, [
    routeComparison,
    activeRoute?.id,
    activeRoute?.oneWayTollRD,
    effectiveOneWayKm,
    includeTolls,
    includeLodging,
    fuelPricePerGalRD,
    kmPerGal,
    activeVehicle.maintenancePerKmRD,
    manualAreaM2,
    terrain,
    selectedServiceIds.length,
  ]);

  const grandTotalRD = servicesCalculation.totalServicesRD + activeBreakdown.totalViaticosRD;

  const applyPinOrigin = async (lat: number, lon: number) => {
    setIsPickingOriginPin(false);
    setOriginSearchResults([]);
    setOriginSearchError(null);
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
    const resolvedLabel = [shortStreet || geo.locality, geo.municipality || geo.province]
      .filter(Boolean)
      .join(' · ');
    if (resolvedLabel) {
      setOriginPoint((prev) =>
        prev.source === 'pin' &&
        Math.abs(prev.lat - lat) < 1e-6 &&
        Math.abs(prev.lon - lon) < 1e-6
          ? { ...prev, label: resolvedLabel }
          : prev
      );
    }
  };

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [originPoint.lat, originPoint.lon],
      zoom: 11,
      zoomControl: true,
    });
    const overlay = L.featureGroup().addTo(map);

    mapRef.current = map;
    overlayRef.current = overlay;

    const timer = setTimeout(() => map.invalidateSize(), 150);

    return () => {
      clearTimeout(timer);
      map.remove();
      mapRef.current = null;
      tileRef.current = null;
      overlayRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (tileRef.current) {
      map.removeLayer(tileRef.current);
      tileRef.current = null;
    }

    const url =
      mapStyle === 'topo'
        ? 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png'
        : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
    tileRef.current = L.tileLayer(url, {
      ...(mapStyle === 'topo' ? { maxNativeZoom: 17, maxZoom: 19 } : { maxZoom: 19 }),
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);
    tileRef.current.bringToBack();
    map.invalidateSize();
  }, [mapStyle]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    map.getContainer().style.cursor = isPickingOriginPin ? 'crosshair' : '';
    if (!isPickingOriginPin) return;

    const handleClick = (e: L.LeafletMouseEvent) => {
      applyPinOrigin(e.latlng.lat, e.latlng.lng);
    };

    map.on('click', handleClick);
    return () => {
      map.off('click', handleClick);
      if (mapRef.current) {
        mapRef.current.getContainer().style.cursor = '';
      }
    };
  }, [isPickingOriginPin]);

  useEffect(() => {
    const map = mapRef.current;
    const overlay = overlayRef.current;
    if (!map || !overlay) return;

    overlay.clearLayers();

    routes.forEach((r) => {
      if (r.id === activeRoute?.id) return;
      L.polyline(r.coordinates, {
        color: '#475569',
        weight: 3.5,
        dashArray: '6 6',
        opacity: 0.75,
      })
        .bindTooltip(`${r.name} (${r.distanceOneWayKm} km)`)
        .addTo(overlay);
    });

    if (activeRoute) {
      L.polyline(activeRoute.coordinates, {
        color: '#D97706',
        weight: 5,
        opacity: 0.95,
      })
        .bindTooltip(`${activeRoute.name} · ${effectiveOneWayKm} km ida`)
        .addTo(overlay);
    }

    activeFeatures.forEach((feat) => {
      if (feat.geometryType === 'Polygon' && feat.points.length >= 3) {
        L.polygon(
          feat.points.map((p) => [p.lat, p.lon] as [number, number]),
          {
            color: '#0284C7',
            weight: 2.5,
            fillColor: '#0284C7',
            fillOpacity: 0.25,
          }
        )
          .bindTooltip(feat.name)
          .addTo(overlay);
      } else if (feat.geometryType === 'LineString' && feat.points.length >= 2) {
        L.polyline(
          feat.points.map((p) => [p.lat, p.lon] as [number, number]),
          {
            color: '#0284C7',
            weight: 3,
            opacity: 0.9,
          }
        )
          .bindTooltip(feat.name)
          .addTo(overlay);
      } else if (feat.points.length >= 1) {
        feat.points.forEach((pt) => {
          L.circleMarker([pt.lat, pt.lon], {
            radius: 5,
            color: '#FFFFFF',
            weight: 1.5,
            fillColor: '#16A34A',
            fillOpacity: 1,
          })
            .bindTooltip(feat.name)
            .addTo(overlay);
        });
      }
    });

    const originIcon = L.divIcon({
      className: '',
      iconSize: [28, 28],
      iconAnchor: [14, 14],
      html: `<div style="width:28px;height:28px;border-radius:9999px;background:#0284C7;border:2.5px solid #FFFFFF;color:#FFFFFF;font-family:ui-monospace,monospace;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(15,41,66,0.45);cursor:grab;">A</div>`,
    });

    const originMarker = L.marker([originPoint.lat, originPoint.lon], {
      draggable: true,
      icon: originIcon,
    })
      .bindPopup(
        `<strong>Punto de Partida (${
          originPoint.source === 'empresa'
            ? 'Base'
            : originPoint.source === 'calle'
            ? 'Calle'
            : 'Pin mapa'
        })</strong><br/>${originPoint.label}<br/><span style="font-size:11px;color:#475569;">Arrastra este pin para mover el origen</span>`
      )
      .addTo(overlay);

    originMarker.on('dragend', () => {
      const pos = originMarker.getLatLng();
      applyPinOrigin(pos.lat, pos.lng);
    });

    L.circleMarker([activeCentroid.lat, activeCentroid.lon], {
      radius: 7,
      color: '#FFFFFF',
      weight: 2,
      fillColor: '#D97706',
      fillOpacity: 1,
    })
      .bindPopup(
        `<strong>Destino:</strong> ${
          uploadedKmz?.autoMeta.title || selectedRuta?.nombre || 'Parcela'
        }`
      )
      .addTo(overlay);

    const bounds = overlay.getBounds();
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [36, 36], maxZoom: 15 });
    }
    setTimeout(() => map.invalidateSize(), 100);
  }, [
    routes,
    activeRoute,
    activeFeatures,
    activeCentroid,
    effectiveOneWayKm,
    uploadedKmz,
    selectedRuta,
    originPoint,
  ]);

  const handleToggleService = (id: string) => {
    setSelectedServiceIds((prev) => {
      const adding = !prev.includes(id);
      if (id === 'arquitectura' && adding) {
        setShowDwgSection(true);
      }
      return adding ? [...prev, id] : prev.filter((item) => item !== id);
    });
  };

  const handleSearchOriginStreet = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = originSearchQuery.trim();
    if (!q) return;
    setIsSearchingOrigin(true);
    setOriginSearchError(null);
    try {
      const results = await searchAddressOSM(q);
      setOriginSearchResults(results);
      if (results.length === 0) {
        setOriginSearchError('No se encontraron direcciones en República Dominicana.');
      }
    } catch {
      setOriginSearchError('Error consultando el servicio de calles OpenStreetMap.');
    } finally {
      setIsSearchingOrigin(false);
    }
  };

  const handleSelectStreetOrigin = (result: AddressSearchResult) => {
    setIsPickingOriginPin(false);
    setOriginPoint({
      lat: result.lat,
      lon: result.lon,
      label: result.label,
      source: 'calle',
    });
    setOriginSearchResults([]);
    setOriginSearchError(null);
  };

  const handleResetOriginToBase = () => {
    setIsPickingOriginPin(false);
    setOriginSearchResults([]);
    setOriginSearchError(null);
    setOriginSearchQuery('');
    setOriginPoint({
      lat: baseLat,
      lon: baseLon,
      label: baseDireccion,
      source: 'empresa',
    });
  };

  const handleVehicleChange = (newId: string) => {
    setVehiculoId(newId);
    const vEmp = vehiculos.find((v) => v.id === newId);
    if (vEmp) {
      setFuelPricePerGalRD(vEmp.precioGalonRD);
      setKmPerGal(vEmp.kmPorGal);
      return;
    }
    const preset = VEHICLE_CATALOG.find((v) => v.id === newId);
    if (preset) {
      setFuelPricePerGalRD(preset.fuelPricePerGalRD);
      setKmPerGal(preset.kmPerGal);
    }
  };

  const handleUploadKmz = async (file: File) => {
    setKmzError(null);
    setApplyFeedback(null);
    try {
      const parsed = await parseKmzOrKmlFile(file);
      setUploadedKmz(parsed);
      setProvince(parsed.autoMeta.province);
      setManualAreaM2(Math.round(parsed.totalAreaM2));
    } catch (err: unknown) {
      setUploadedKmz(null);
      setKmzError(
        err instanceof Error ? err.message : 'No se pudo leer el archivo KMZ/KML/GeoJSON.'
      );
    }
  };

  const handleApplyCalculation = async () => {
    setApplyFeedback(null);
    if (uploadedKmz) {
      onRegisterKmzFromCalculator(uploadedKmz);
      return;
    }

    if (selectedRuta) {
      setIsApplying(true);
      try {
        await onApplyToRuta({
          rutaId: selectedRuta.id,
          proyectoId: selectedRuta.proyectoId,
          budgetViaticosRD: activeBreakdown.totalViaticosRD,
          contractValueRD: grandTotalRD,
          serviciosPropuestos: servicesCalculation.items.map((item) => ({
            tipoServicioId: item.id,
            nombre: item.name,
            cotizacionRD: item.adjustedPriceRD,
          })),
          routeSummary: {
            routeName: activeRoute?.name || 'Ruta Directa',
            distanceOneWayKm: effectiveOneWayKm,
            durationMin: activeRoute?.durationMin ?? Math.round(effectiveOneWayKm * 1.4),
            tollsRD: activeBreakdown.tollsRD,
            fuelRD: activeBreakdown.fuelRD,
            vehicleLabel: activeVehicle.label,
          },
        });
        const proyVinculado = proyectos.find((p) => p.id === selectedRuta.proyectoId);
        setApplyFeedback(
          `Guardado en proyecto ${proyVinculado?.codigoContrato || selectedRuta.proyectoId}: Presupuesto viáticos ${formatRD(
            activeBreakdown.totalViaticosRD
          )} y valor contrato ${formatRD(grandTotalRD)}.`
        );
      } finally {
        setIsApplying(false);
      }
    }
  };

  const handleLogAutomaticRouteExpenses = async () => {
    const target = selectedRuta;
    if (!target) return;
    const now = new Date();
    const dateIso = now.toISOString().slice(0, 10);
    const tsAST = formatSantoDomingoAST(now);

    const newItems: Array<
      Omit<Viatico, 'id' | 'empresaId' | 'estadoAprobacion' | 'version' | 'updatedAt'>
    > = [];

    if (activeBreakdown.fuelRD > 0) {
      newItems.push({
        creadoPorUsuarioId: creadoPorUsuario.id,
        creadoPorNombre: creadoPorUsuario.nombre,
        rutaId: target.id,
        fechaIso: dateIso,
        timestampAST: tsAST,
        categoria: 'Combustible' as CategoriaViatico,
        comercio: `Ruta ${activeRoute?.name || 'Campo'} (${activeVehicle.fuelName})`,
        montoRD: activeBreakdown.fuelRD,
        itbisRD: 0,
        metodo: 'GPS Ruta',
        distanceKm: activeBreakdown.roundTripKm,
        gpsCoords: {
          lat: activeCentroid.lat,
          lon: activeCentroid.lon,
          easting: activeCentroid.easting,
          northing: activeCentroid.northing,
        },
        repartos: [{ proyectoId: target.proyectoId, montoRD: activeBreakdown.fuelRD }],
        notas: `${activeBreakdown.roundTripKm} km ida y vuelta · ${activeBreakdown.gallonsNeeded} gal @ RD$ ${fuelPricePerGalRD}`,
        syncStatus: 'pending',
      });
    }

    if (activeBreakdown.tollsRD > 0) {
      newItems.push({
        creadoPorUsuarioId: creadoPorUsuario.id,
        creadoPorNombre: creadoPorUsuario.nombre,
        rutaId: target.id,
        fechaIso: dateIso,
        timestampAST: tsAST,
        categoria: 'Peaje' as CategoriaViatico,
        comercio: `RD Vial — ${activeRoute?.tollNote || 'Peajes Ruta'}`,
        montoRD: activeBreakdown.tollsRD,
        itbisRD: 0,
        metodo: 'GPS Ruta',
        distanceKm: activeBreakdown.roundTripKm,
        gpsCoords: {
          lat: activeCentroid.lat,
          lon: activeCentroid.lon,
          easting: activeCentroid.easting,
          northing: activeCentroid.northing,
        },
        repartos: [{ proyectoId: target.proyectoId, montoRD: activeBreakdown.tollsRD }],
        notas: `Peajes ida y vuelta (${activeRoute?.name || 'Ruta'})`,
        syncStatus: 'pending',
      });
    }

    if (activeBreakdown.perDiemRD > 0) {
      newItems.push({
        creadoPorUsuarioId: creadoPorUsuario.id,
        creadoPorNombre: creadoPorUsuario.nombre,
        rutaId: target.id,
        fechaIso: dateIso,
        timestampAST: tsAST,
        categoria: 'Dieta' as CategoriaViatico,
        comercio: `Dieta Cuadrilla (${activeBreakdown.fieldDays} día(s))`,
        montoRD: activeBreakdown.perDiemRD,
        itbisRD: 0,
        metodo: 'Dieta Automática',
        repartos: [{ proyectoId: target.proyectoId, montoRD: activeBreakdown.perDiemRD }],
        notas: `Cálculo automático para terreno ${terrain}`,
        syncStatus: 'pending',
      });
    }

    if (newItems.length > 0) {
      await onLogRouteExpenses(newItems);
    }
  };

  const handleExportEstimateCsv = () => {
    const lines = [
      'Concepto,Detalle,Monto_RD',
      ...servicesCalculation.items.map(
        (s) => `"Servicio: ${s.name}","${s.subtitle}",${s.adjustedPriceRD}`
      ),
      `"Combustible (ida y vuelta)","${activeBreakdown.roundTripKm} km / ${activeBreakdown.gallonsNeeded} gal",${activeBreakdown.fuelRD}`,
      `"Peajes (ida y vuelta)","${activeRoute?.tollNote || 'N/A'}",${activeBreakdown.tollsRD}`,
      `"Dieta y alimentacion","${activeBreakdown.fieldDays} dia(s)",${activeBreakdown.perDiemRD}`,
      `"Mantenimiento unidad","${activeBreakdown.roundTripKm} km x RD$ ${activeVehicle.maintenancePerKmRD}",${activeBreakdown.maintenanceRD}`,
      `"Hospedaje cuadrilla","${includeLodging ? 'Incluido' : 'No incluido'}",${activeBreakdown.lodgingRD}`,
      `"TOTAL PRESUPUESTADO","${province} · ${manualAreaM2} m2",${grandTotalRD}`,
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `estimacion_ruta_servicios_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
      {/* LEFT CONFIGURATION COLUMN */}
      <div className="lg:col-span-4 space-y-4">
        <div className="rounded-md border border-[#CBD5E1] bg-white p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold text-[#0F2942]">Cargar KMZ / KML / GeoJSON</h2>
            <span className="text-[11px] font-medium text-[#0284C7]">Detección auto</span>
          </div>

          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files?.[0];
              if (f) handleUploadKmz(f);
            }}
            onClick={() => fileInputRef.current?.click()}
            className="cursor-pointer rounded-sm border border-dashed border-[#0284C7] bg-[#F8FAFC] p-4 text-center hover:bg-[#EFF4FF] transition-colors"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".kmz,.kml,.geojson,.json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleUploadKmz(f);
                e.target.value = '';
              }}
            />
            <UploadCloud className="mx-auto h-6 w-6 text-[#0284C7]" />
            <div className="mt-1.5 text-xs font-semibold text-[#0F2942]">
              {uploadedKmz ? uploadedKmz.fileName : 'Arrastra tu .KMZ, .KML o .GeoJSON'}
            </div>
            <div className="mt-0.5 text-[11px] text-[#43474D]">
              O selecciona una ruta abajo para recalcular viáticos
            </div>
          </div>

          {kmzError && (
            <div className="rounded-sm border border-[#FCA5A5] bg-[#FEE2E2] px-2.5 py-1.5 text-[11px] text-[#93000A]">
              {kmzError}
            </div>
          )}

          <div>
            <label className="block text-[11px] font-semibold text-[#43474D] mb-1">
              O calcular sobre ruta registrada:
            </label>
            <select
              value={uploadedKmz ? '__uploaded__' : selectedRuta?.id ?? ''}
              onChange={(e) => {
                if (e.target.value !== '__uploaded__') {
                  setUploadedKmz(null);
                  onSelectRuta(e.target.value);
                }
              }}
              className="w-full rounded-sm border border-[#CBD5E1] bg-white px-2.5 py-2 text-xs text-[#0D1C2F]"
            >
              {uploadedKmz && (
                <option value="__uploaded__">Archivo: {uploadedKmz.fileName}</option>
              )}
              {rutas.map((r) => {
                const proy = proyectos.find((p) => p.id === r.proyectoId);
                return (
                  <option key={r.id} value={r.id}>
                    {r.codigoParcela} · {r.provincia} ({proy?.codigoContrato || r.nombre})
                  </option>
                );
              })}
            </select>
          </div>
        </div>

        {/* Additive Services Multi-Select */}
        <div className="rounded-md border border-[#CBD5E1] bg-white p-4 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-xs font-bold text-[#0F2942]">Tipo de Levantamiento / Servicio</h2>
            <span className="font-mono text-[11px] font-semibold text-[#0284C7]">
              {selectedServiceIds.length} servicio{selectedServiceIds.length === 1 ? '' : 's'}{' '}
              activo{selectedServiceIds.length === 1 ? '' : 's'}
            </span>
          </div>
          <p className="text-[11px] text-[#43474D]">
            Selección múltiple sumatoria para combinar servicios en la misma ruta.
          </p>

          <div className="space-y-2 pt-1">
            {SERVICE_CATALOG.map((svc) => {
              const checked = selectedServiceIds.includes(svc.id);
              return (
                <button
                  key={svc.id}
                  type="button"
                  onClick={() => handleToggleService(svc.id)}
                  className={`w-full flex items-center justify-between gap-2 rounded-sm border px-3 py-2.5 text-left transition-colors ${
                    checked
                      ? 'border-[#0F2942] bg-[#0F2942] text-white'
                      : 'border-[#CBD5E1] bg-white text-[#0D1C2F] hover:bg-[#F8FAFC]'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
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
                      <div className="text-xs font-bold leading-tight">{svc.name}</div>
                      <div
                        className={`text-[11px] ${
                          checked ? 'text-[#CBD5E1]' : 'text-[#43474D]'
                        }`}
                      >
                        {svc.subtitle}
                      </div>
                    </div>
                  </div>
                  <span
                    className={`font-mono text-xs font-bold tabular-nums shrink-0 ${
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
            <div className="rounded-sm border border-[#CBD5E1] bg-[#F8FAFC] p-3 space-y-1.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-semibold text-[#0F2942]">Longitud de corredor vial (km)</span>
                <span className="font-mono text-[#0284C7]">RD$ 10,000 / km</span>
              </div>
              <input
                type="number"
                min={0}
                step={0.5}
                value={corridorKm}
                onChange={(e) => setCorridorKm(Math.max(0, Number(e.target.value)))}
                className="w-full rounded-sm border border-[#CBD5E1] bg-white px-2.5 py-1.5 font-mono text-xs text-[#0D1C2F]"
              />
            </div>
          )}

          <div className="pt-1 border-t border-[#E2E8F0] flex items-center justify-between gap-2">
            <span className="text-[11px] text-[#43474D]">
              Planos de arquitectura (.DWG / .DXF)
              {dwgPlan ? ` · ${dwgPlan.fileName}` : ''}
            </span>
            <button
              type="button"
              onClick={() => setShowDwgSection((prev) => !prev)}
              className={`inline-flex items-center gap-1.5 rounded-sm border px-2.5 py-1 text-[11px] font-semibold transition-colors shrink-0 ${
                showDwgSection
                  ? 'border-[#0284C7] bg-[#EFF6FF] text-[#0284C7]'
                  : 'border-[#CBD5E1] bg-white text-[#0F2942] hover:bg-[#F8FAFC]'
              }`}
            >
              <Compass className="h-3.5 w-3.5" />
              {showDwgSection ? 'Ocultar visor .DWG' : 'Abrir visor .DWG'}
            </button>
          </div>
        </div>

        {/* Topography, Province & Area */}
        <div className="rounded-md border border-[#CBD5E1] bg-white p-4 space-y-3">
          <div>
            <div className="text-xs font-bold text-[#0F2942] mb-2">Topografía de Terreno</div>
            <div className="grid grid-cols-3 gap-1.5">
              {(['Llano', 'Ondulado', 'Montañoso'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTerrain(t)}
                  className={`rounded-sm border py-2 text-xs font-semibold transition-colors ${
                    terrain === t
                      ? 'border-[#0F2942] bg-[#0F2942] text-white'
                      : 'border-[#CBD5E1] bg-white text-[#334155] hover:bg-[#F8FAFC]'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5 text-xs">
            <div>
              <label className="block font-semibold text-[#43474D] mb-1">Provincia</label>
              <select
                value={province}
                onChange={(e) => setProvince(e.target.value)}
                className="w-full rounded-sm border border-[#CBD5E1] bg-white px-2.5 py-2 text-xs text-[#0D1C2F]"
              >
                {!DOMINICAN_PROVINCES.includes(province) && (
                  <option value={province}>{province}</option>
                )}
                {DOMINICAN_PROVINCES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-semibold text-[#43474D] mb-1">Área (m²)</label>
              <input
                type="number"
                min={100}
                step={50}
                value={manualAreaM2}
                onChange={(e) => setManualAreaM2(Math.max(100, Number(e.target.value)))}
                className="w-full rounded-sm border border-[#CBD5E1] px-2.5 py-2 font-mono text-xs text-[#0D1C2F]"
              />
            </div>
          </div>
        </div>

        {/* Vehicle & Fuel Consumption */}
        <div className="rounded-md border border-[#CBD5E1] bg-white p-4 space-y-3 text-xs">
          <div className="flex items-center gap-2 font-bold text-[#0F2942]">
            <Car className="h-4 w-4 text-[#0284C7]" />
            <span>Vehículo y Combustible</span>
          </div>

          <div>
            <label className="block font-semibold text-[#43474D] mb-1">Unidad seleccionada</label>
            <select
              value={vehiculoId}
              onChange={(e) => handleVehicleChange(e.target.value)}
              className="w-full rounded-sm border border-[#CBD5E1] bg-white px-2.5 py-2 text-xs text-[#0D1C2F]"
            >
              {vehiculos.length > 0
                ? vehiculos.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.etiqueta} ({v.placa})
                    </option>
                  ))
                : VEHICLE_CATALOG.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.label}
                    </option>
                  ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block font-semibold text-[#43474D] mb-1">Precio (RD$/gal)</label>
              <input
                type="number"
                min={50}
                step={0.5}
                value={fuelPricePerGalRD}
                onChange={(e) => setFuelPricePerGalRD(Math.max(1, Number(e.target.value)))}
                className="w-full rounded-sm border border-[#CBD5E1] px-2.5 py-2 font-mono text-xs text-[#0D1C2F]"
              />
            </div>
            <div>
              <label className="block font-semibold text-[#43474D] mb-1">Rendimiento (km/gal)</label>
              <input
                type="number"
                min={5}
                step={1}
                value={kmPerGal}
                onChange={(e) => setKmPerGal(Math.max(5, Number(e.target.value)))}
                className="w-full rounded-sm border border-[#CBD5E1] px-2.5 py-2 font-mono text-xs text-[#0D1C2F]"
              />
            </div>
          </div>
        </div>
      </div>

      {/* RIGHT ROUTE & ADDITIVE ESTIMATION COLUMN */}
      <div className="lg:col-span-8 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 rounded-md border border-[#CBD5E1] bg-white overflow-hidden divide-y sm:divide-y-0 sm:divide-x divide-[#E2E8F0]">
          <div className="p-4">
            <div className="text-xs font-medium text-[#43474D]">Área Neta</div>
            <div className="mt-1 font-mono text-xl font-bold text-[#0D1C2F] tabular-nums">
              {manualAreaM2.toLocaleString('en-US')} m²
            </div>
            <div className="mt-0.5 font-mono text-xs text-[#43474D] tabular-nums">
              {(manualAreaM2 / TAREA_IN_M2).toFixed(2)} tareas
            </div>
          </div>

          <div className="p-4">
            <div className="text-xs font-medium text-[#43474D]">Distancia Logística</div>
            <div className="mt-1 font-mono text-xl font-bold text-[#0D1C2F] tabular-nums">
              {effectiveOneWayKm.toFixed(1)} km{' '}
              <span className="text-xs font-normal text-[#43474D]">
                ({activeBreakdown.roundTripKm} km ida y vuelta)
              </span>
            </div>
            <div className="mt-0.5 text-xs text-[#43474D]">{province}</div>
          </div>

          <div className="p-4 bg-[#0F2942] text-white">
            <div className="text-xs font-medium text-[#CBD5E1]">Inversión Estimada</div>
            <div className="mt-1 font-mono text-2xl font-bold text-[#FBBF24] tabular-nums">
              {formatRD(grandTotalRD)}
            </div>
            <div className="mt-0.5 text-[11px] text-[#93CCFF]">
              Servicios + Viáticos · Moneda RD$
            </div>
          </div>
        </div>

        <div className="rounded-md border border-[#CBD5E1] bg-white p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="flex items-center gap-2 text-sm font-bold text-[#0F2942]">
                <Route className="h-4 w-4 text-[#0284C7]" />
                Cálculo de Rutas Óptimas y Viáticos (Ida y Vuelta)
              </h3>
              <p className="text-xs text-[#43474D]">
                Define el punto de partida por calle o pin en el mapa y compara rutas reales (OSRM), peajes y consumo.
              </p>
            </div>
            <div className="font-mono text-xs font-semibold text-[#0284C7] tabular-nums">
              {isLoadingRoutes
                ? 'Calculando ruta vial...'
                : `Ida y vuelta: ${activeBreakdown.roundTripKm} km · ${
                    activeRoute?.durationMin ?? 25
                  } min/vía`}
            </div>
          </div>

          {/* Punto de Partida (Calle o Pin en el Mapa) */}
          <div className="rounded-sm border border-[#CBD5E1] bg-[#F8FAFC] p-3 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2 min-w-0">
                <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-sm bg-[#0284C7] font-mono text-[11px] font-bold text-white">
                  A
                </span>
                <div className="min-w-0">
                  <span className="font-bold text-[#0F2942]">Punto de Partida: </span>
                  <span className="text-[#334155] truncate">{originPoint.label}</span>
                </div>
                <span className="rounded-sm border border-[#CBD5E1] bg-white px-1.5 py-0.5 font-mono text-[10px] font-semibold text-[#0F2942] whitespace-nowrap shrink-0">
                  {originPoint.source === 'empresa'
                    ? 'Base'
                    : originPoint.source === 'calle'
                    ? 'Calle'
                    : 'Pin mapa'}
                </span>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <span className="font-mono text-[11px] text-[#43474D] tabular-nums hidden sm:inline">
                  {originPoint.lat.toFixed(5)}, {originPoint.lon.toFixed(5)}
                </span>
                {originPoint.source !== 'empresa' && (
                  <button
                    type="button"
                    onClick={handleResetOriginToBase}
                    className="inline-flex items-center gap-1 rounded-sm border border-[#CBD5E1] bg-white px-2 py-1 text-[11px] font-semibold text-[#334155] hover:bg-[#EFF4FF] whitespace-nowrap shrink-0"
                  >
                    <RotateCcw className="h-3 w-3" />
                    Restablecer base
                  </button>
                )}
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <form onSubmit={handleSearchOriginStreet} className="flex-1 flex gap-1.5 min-w-0">
                <div className="relative flex-1 min-w-0">
                  <Navigation className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#64748B]" />
                  <input
                    type="text"
                    value={originSearchQuery}
                    onChange={(e) => setOriginSearchQuery(e.target.value)}
                    placeholder="Buscar calle o sector de salida (ej. Av. 27 de Febrero, Santiago)..."
                    className="w-full rounded-sm border border-[#CBD5E1] bg-white pl-8 pr-7 py-2 text-xs text-[#0D1C2F] placeholder:text-[#94A3B8]"
                  />
                  {originSearchQuery && (
                    <button
                      type="button"
                      onClick={() => {
                        setOriginSearchQuery('');
                        setOriginSearchResults([]);
                        setOriginSearchError(null);
                      }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-[#64748B] hover:text-[#0F2942]"
                      aria-label="Limpiar búsqueda de calle"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                <button
                  type="submit"
                  disabled={isSearchingOrigin || !originSearchQuery.trim()}
                  className="inline-flex items-center gap-1.5 rounded-sm bg-[#0F2942] px-3 py-2 text-xs font-semibold text-white hover:bg-[#0284C7] disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
                >
                  <Search className="h-3.5 w-3.5" />
                  {isSearchingOrigin ? 'Buscando...' : 'Buscar calle'}
                </button>
              </form>

              <button
                type="button"
                onClick={() => setIsPickingOriginPin((prev) => !prev)}
                className={`inline-flex items-center justify-center gap-1.5 rounded-sm border px-3 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                  isPickingOriginPin
                    ? 'border-[#D97706] bg-[#FEF3C7] text-[#92400E]'
                    : 'border-[#0284C7] bg-white text-[#0284C7] hover:bg-[#EFF6FF]'
                }`}
              >
                <MapPin className="h-3.5 w-3.5" />
                {isPickingOriginPin ? 'Haz clic en el mapa (Cancelar)' : 'Fijar pin en mapa'}
              </button>
            </div>

            {originSearchError && (
              <div className="text-[11px] font-medium text-[#B91C1C]">{originSearchError}</div>
            )}

            {originSearchResults.length > 0 && (
              <div className="rounded-sm border border-[#CBD5E1] bg-white divide-y divide-[#E2E8F0] max-h-44 overflow-y-auto">
                {originSearchResults.map((res, idx) => (
                  <button
                    key={`${res.lat}-${res.lon}-${idx}`}
                    type="button"
                    onClick={() => handleSelectStreetOrigin(res)}
                    className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left text-xs hover:bg-[#EFF6FF] transition-colors"
                  >
                    <span className="text-[#0D1C2F] truncate">{res.label}</span>
                    <span className="font-mono text-[10px] font-semibold text-[#0284C7] uppercase shrink-0">
                      {res.source}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {routeComparison.map(({ route, breakdown }) => {
              const isSelected = route.id === activeRoute?.id;
              return (
                <button
                  key={route.id}
                  type="button"
                  onClick={() => {
                    setSelectedRouteId(route.id);
                    setDistanceOverrideKm(null);
                  }}
                  className={`rounded-md border p-3.5 text-left transition-colors ${
                    isSelected
                      ? 'border-2 border-[#0F2942] bg-[#F8FAFC]'
                      : 'border-[#CBD5E1] bg-white hover:bg-[#F8FAFC]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`text-[11px] font-bold ${
                        route.id === 'economica' ? 'text-[#0284C7]' : 'text-[#6D28D9]'
                      }`}
                    >
                      {route.badge}
                    </span>
                    <span className="font-mono text-sm font-bold text-[#0F2942] tabular-nums">
                      {formatRD(breakdown.totalViaticosRD)}
                    </span>
                  </div>
                  <div className="mt-1 text-sm font-bold text-[#0D1C2F]">{route.name}</div>
                  <div className="text-[11px] text-[#43474D]">{route.corridorDesc}</div>
                  <div className="mt-2 font-mono text-[11px] text-[#334155] tabular-nums">
                    Ida: {route.distanceOneWayKm} km · Ida y vuelta: {breakdown.roundTripKm} km ·{' '}
                    {route.tollNote}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="rounded-md border border-[#CBD5E1] overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 bg-[#0F2942] px-3.5 py-2 text-white">
              <span className="text-xs font-semibold truncate">
                Trazado de Ruta Seleccionada · {activeRoute?.name || 'Corredor'}
              </span>
              <div className="inline-flex rounded-sm bg-[#091A2C] p-0.5">
                <button
                  type="button"
                  onClick={() => setMapStyle('osm')}
                  className={`inline-flex items-center gap-1 rounded-sm px-2.5 py-1 text-[11px] font-semibold ${
                    mapStyle === 'osm' ? 'bg-[#0284C7] text-white' : 'text-[#94A3B8]'
                  }`}
                >
                  <MapIcon className="h-3 w-3" />
                  Mapa Vial
                </button>
                <button
                  type="button"
                  onClick={() => setMapStyle('topo')}
                  className={`inline-flex items-center gap-1 rounded-sm px-2.5 py-1 text-[11px] font-semibold ${
                    mapStyle === 'topo' ? 'bg-[#0284C7] text-white' : 'text-[#94A3B8]'
                  }`}
                >
                  <Mountain className="h-3 w-3" />
                  Topográfico
                </button>
              </div>
            </div>

            <div className="relative">
              <div ref={mapContainerRef} className="w-full h-[260px] sm:h-[300px] z-0" />
              {isPickingOriginPin && (
                <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[400] rounded-sm border border-[#FBBF24] bg-[#0F2942]/95 px-3 py-1.5 text-xs font-semibold text-[#FBBF24] shadow-md whitespace-nowrap">
                  Haz clic en cualquier punto del mapa para fijar el punto de partida (A)
                </div>
              )}
              <div className="absolute bottom-3 left-3 z-[400] rounded-sm bg-[#0F2942]/95 px-3 py-1.5 font-mono text-[11px] font-semibold text-white shadow">
                {effectiveOneWayKm.toFixed(1)} km ida · {activeBreakdown.roundTripKm} km ida y vuelta
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 bg-[#0F2942] px-3.5 py-1.5 text-[11px] text-[#CBD5E1]">
              <div className="flex items-center gap-4">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#0284C7] border border-white inline-block" />{' '}
                  Origen (arrastrable)
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-1 w-4 bg-[#D97706] inline-block" /> Ruta activa
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-1 w-4 border-t-2 border-dashed border-[#94A3B8] inline-block" />{' '}
                  Ruta alterna
                </span>
              </div>
              <span className="font-mono text-[10px]">
                {activeRoute?.source === 'osrm'
                  ? 'Red vial OpenStreetMap (OSRM)'
                  : 'Cálculo geodésico local'}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-sm border border-[#E2E8F0] bg-[#F8FAFC] px-3.5 py-2.5 text-xs">
            <div className="flex flex-wrap items-center gap-4">
              <label className="inline-flex items-center gap-2 font-medium text-[#0D1C2F] cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeTolls}
                  onChange={(e) => setIncludeTolls(e.target.checked)}
                  className="rounded-sm accent-[#0F2942]"
                />
                Incluir peajes ida y vuelta
              </label>

              <label className="inline-flex items-center gap-2 font-medium text-[#0D1C2F] cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeLodging}
                  onChange={(e) => setIncludeLodging(e.target.checked)}
                  className="rounded-sm accent-[#0F2942]"
                />
                Pernocta / hospedaje cuadrilla
              </label>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[#43474D]">Ajustar distancia ida (km):</span>
              <input
                type="number"
                min={1}
                step={0.5}
                value={effectiveOneWayKm}
                onChange={(e) => setDistanceOverrideKm(Math.max(1, Number(e.target.value)))}
                className="w-20 rounded-sm border border-[#CBD5E1] bg-white px-2 py-1 font-mono text-xs text-[#0D1C2F]"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-sm border border-[#E2E8F0] bg-white p-3">
              <div className="text-[11px] font-medium text-[#43474D]">Combustible (ida y vuelta)</div>
              <div className="mt-1 font-mono text-sm font-bold text-[#0F2942] tabular-nums">
                {formatRD(activeBreakdown.fuelRD)}
              </div>
              <div className="mt-0.5 font-mono text-[11px] text-[#43474D] tabular-nums">
                {activeBreakdown.gallonsNeeded} gal · {kmPerGal} km/gal
              </div>
            </div>

            <div className="rounded-sm border border-[#E2E8F0] bg-white p-3">
              <div className="text-[11px] font-medium text-[#43474D]">Peajes (ida y vuelta)</div>
              <div className="mt-1 font-mono text-sm font-bold text-[#0F2942] tabular-nums">
                {formatRD(activeBreakdown.tollsRD)}
              </div>
              <div className="mt-0.5 text-[11px] text-[#43474D] truncate">
                {includeTolls ? activeRoute?.tollNote || 'RD Vial' : 'Excluidos'}
              </div>
            </div>

            <div className="rounded-sm border border-[#E2E8F0] bg-white p-3">
              <div className="text-[11px] font-medium text-[#43474D]">Dieta cuadrilla</div>
              <div className="mt-1 font-mono text-sm font-bold text-[#0F2942] tabular-nums">
                {formatRD(activeBreakdown.perDiemRD)}
              </div>
              <div className="mt-0.5 text-[11px] text-[#43474D]">
                {activeBreakdown.fieldDays} día(s) · {terrain}
              </div>
            </div>

            <div className="rounded-sm border border-[#E2E8F0] bg-white p-3">
              <div className="text-[11px] font-medium text-[#43474D]">Mantenimiento unidad</div>
              <div className="mt-1 font-mono text-sm font-bold text-[#0F2942] tabular-nums">
                {formatRD(activeBreakdown.maintenanceRD)}
              </div>
              <div className="mt-0.5 font-mono text-[11px] text-[#43474D] tabular-nums">
                {activeBreakdown.roundTripKm} km × RD$ {activeVehicle.maintenancePerKmRD}
              </div>
            </div>
          </div>

          {includeLodging && (
            <div className="flex items-center justify-between rounded-sm border border-[#FDE047] bg-[#FEF9C3]/60 px-3.5 py-2 text-xs">
              <span className="font-medium text-[#A16207]">
                Hospedaje / Pernocta de cuadrilla ({activeBreakdown.fieldDays} noche(s))
              </span>
              <span className="font-mono font-bold text-[#0F2942] tabular-nums">
                {formatRD(activeBreakdown.lodgingRD)}
              </span>
            </div>
          )}
        </div>

        {showDwgSection && (
          <DwgPlanViewer
            plan={dwgPlan}
            onPlanLoaded={setDwgPlan}
            compact
            title="Planos Arquitectónicos (.DWG / .DXF) · Soporte de Proyecto"
            subtitle="Carga planos AutoCAD para revisar plantas, capas constructivas y dimensiones junto con la ruta."
          />
        )}

        {/* Additive Services Summary & Actions */}
        <div className="rounded-md border border-[#CBD5E1] bg-white p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-2.5">
            <h3 className="flex items-center gap-2 text-xs font-bold text-[#0F2942]">
              <Layers className="h-4 w-4 text-[#0284C7]" />
              Servicios técnicos seleccionados (sumatoria)
            </h3>
            <span className="font-mono text-xs font-bold text-[#0F2942] tabular-nums">
              {formatRD(servicesCalculation.totalServicesRD)}
            </span>
          </div>

          {servicesCalculation.items.length === 0 ? (
            <p className="text-xs text-[#DC2626]">
              Selecciona al menos un servicio en el panel izquierdo para sumar honorarios técnicos.
            </p>
          ) : (
            <div className="space-y-1.5 text-xs">
              {servicesCalculation.items.map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-2">
                  <span className="text-[#334155]">
                    <strong>{item.name}</strong> · {item.subtitle}
                    {item.corridorExtra > 0 ? ` (${corridorKm} km corredor)` : ''}
                  </span>
                  <span className="font-mono font-semibold text-[#0D1C2F] tabular-nums">
                    {formatRD(item.adjustedPriceRD)}
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="border-t border-[#E2E8F0] pt-3 space-y-1.5 text-xs">
            <div className="flex justify-between">
              <span className="text-[#43474D]">
                1. Trabajos de Campo y Gabinete Técnico (factor terreno {terrain})
              </span>
              <span className="font-mono font-semibold tabular-nums">
                {formatRD(servicesCalculation.totalServicesRD)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#43474D]">
                2. Movilización, Ruta y Viáticos ({activeBreakdown.roundTripKm} km ida y vuelta)
              </span>
              <span className="font-mono font-semibold tabular-nums">
                {formatRD(activeBreakdown.totalViaticosRD)}
              </span>
            </div>
            <div className="flex items-baseline justify-between border-t border-[#CBD5E1] pt-2.5">
              <span className="text-sm font-bold text-[#0F2942]">Total Presupuestado:</span>
              <span className="font-mono text-xl font-bold text-[#0F2942] tabular-nums">
                {formatRD(grandTotalRD)}
              </span>
            </div>
          </div>

          {selectedRuta && !uploadedKmz && (() => {
            const proyDestino = proyectos.find((p) => p.id === selectedRuta.proyectoId);
            if (!proyDestino) return null;
            return (
              <div className="rounded-sm border border-[#CBD5E1] bg-[#F8FAFC] px-3 py-2 text-[11px] flex flex-wrap items-center justify-between gap-2">
                <span className="text-[#334155]">
                  Proyecto vinculado:{' '}
                  <strong className="font-mono text-[#0F2942]">{proyDestino.codigoContrato}</strong>{' '}
                  — {proyDestino.nombre}
                </span>
                <span className="font-mono text-[#0284C7] font-semibold">
                  Presup. actual viáticos: {formatRD(proyDestino.presupuestoViaticosRD)}
                </span>
              </div>
            );
          })()}

          {applyFeedback && (
            <div className="rounded-sm border border-[#86EFAC] bg-[#F0FDF4] px-3 py-2 text-xs font-medium text-[#15803D]">
              {applyFeedback}
            </div>
          )}

          <div className="flex flex-col sm:flex-row flex-wrap gap-2.5 pt-2">
            {canEdit && (
              <button
                type="button"
                disabled={isApplying || (!uploadedKmz && !selectedRuta)}
                onClick={handleApplyCalculation}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-sm bg-[#F59E0B] px-4 py-2.5 text-xs font-bold text-[#0F2942] hover:bg-[#D97706] hover:text-white disabled:opacity-50 transition-colors min-h-[44px]"
              >
                <Send className="h-4 w-4" />
                {uploadedKmz
                  ? 'Crear Ruta desde este KMZ'
                  : isApplying
                  ? 'Aplicando al proyecto...'
                  : 'Aplicar Presupuesto y Servicios a Ruta'}
              </button>
            )}

            {selectedRuta && !uploadedKmz && (
              <button
                type="button"
                onClick={handleLogAutomaticRouteExpenses}
                className="inline-flex items-center justify-center gap-2 rounded-sm bg-[#0284C7] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#006398] transition-colors min-h-[44px]"
              >
                <Receipt className="h-4 w-4" />
                Registrar Viáticos de Ruta
              </button>
            )}

            {selectedRuta && !uploadedKmz && onOpenExpenseModal && (
              <button
                type="button"
                onClick={onOpenExpenseModal}
                className="inline-flex items-center justify-center gap-2 rounded-sm bg-[#0F2942] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#1E3A8A] transition-colors min-h-[44px]"
              >
                <Camera className="h-4 w-4" />
                Adjuntar Recibo Móvil
              </button>
            )}

            <button
              type="button"
              onClick={handleExportEstimateCsv}
              className="inline-flex items-center justify-center gap-1.5 rounded-sm border border-[#CBD5E1] bg-white px-4 py-2.5 text-xs font-semibold text-[#334155] hover:bg-[#F1F5F9] min-h-[44px]"
            >
              <Download className="h-4 w-4" />
              CSV
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
