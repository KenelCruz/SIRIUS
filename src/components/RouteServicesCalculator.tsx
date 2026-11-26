import React, { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  Car,
  Check,
  Compass,
  Download,
  Layers,
  LocateFixed,
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
import {
  calcularCotizacionServicioVigente,
  crearConfiguracionInicialEmpresa,
  obtenerFactoresTerrenoVigentes,
  obtenerReglasViaticosVigentes,
  obtenerServiciosVigentes,
  type ServicioCatalogoVigente,
} from '../domain';
import type {
  CategoriaViatico,
  Proyecto,
  ReglasViaticosVersion,
  RouteSummary,
  Ruta,
  TerrenoFactorVersion,
  Vehiculo,
  Viatico,
} from '../types/domain';
import {
  formatArea,
  formatPerimeter,
  formatRD,
  formatSantoDomingoAST,
  TAREA_IN_M2,
} from '../utils/geodesy';
import { parseKmzOrKmlFile, type ParsedKmzResult } from '../utils/kmzParser';
import {
  computeRouteViaticos,
  fetchOptimalRoutesOSM,
  SANTO_DOMINGO_ORIGIN,
  VEHICLE_CATALOG,
  type RouteAlternative,
  type TerrainType,
} from '../utils/routingEngine';

import {
  reverseGeocodeOSM,
  searchAddressOSM,
  type AddressSearchResult,
} from '../utils/osmGeocode';
import { RouteAlternativesSkeleton, RouteCalculatorSkeleton } from './Skeletons';

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
  serviciosVigentes?: ServicioCatalogoVigente[];
  factoresTerreno?: TerrenoFactorVersion | null;
  reglasViaticos?: ReglasViaticosVersion | null;
  moneda?: string;
  isLoading?: boolean;
  onSelectRuta: (rutaId: string) => void;
  onApplyToRuta: (payload: {
    rutaId: string;
    proyectoId: string;
    budgetViaticosRD: number;
    contractValueRD: number;
    serviciosPropuestos: Array<{
      tipoServicioId: string;
      nombre: string;
      cotizacionRD: number;
      configVersion?: number;
      tarifaBaseUsadaRD?: number;
      recargosUsadosRD?: number;
    }>;
    routeSummary: RouteSummary;
  }) => Promise<void>;
  onRegisterKmzFromCalculator: (parsed: ParsedKmzResult) => void;
  onLogRouteExpenses: (
    items: Array<Omit<Viatico, 'id' | 'empresaId' | 'estadoAprobacion' | 'version' | 'updatedAt'>>
  ) => Promise<void>;
  onOpenExpenseModal?: () => void;
}

const DEFAULT_CFG_CALC = crearConfiguracionInicialEmpresa('default');
const DEFAULT_SERVICIOS_CALC = obtenerServiciosVigentes(DEFAULT_CFG_CALC);
const DEFAULT_TERRENO_CALC = obtenerFactoresTerrenoVigentes(DEFAULT_CFG_CALC);
const DEFAULT_REGLAS_CALC = obtenerReglasViaticosVigentes(DEFAULT_CFG_CALC);

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
  serviciosVigentes = DEFAULT_SERVICIOS_CALC,
  factoresTerreno,
  reglasViaticos,
  moneda = 'RD$',
  isLoading = false,
  onSelectRuta,
  onApplyToRuta,
  onRegisterKmzFromCalculator,
  onLogRouteExpenses,
  onOpenExpenseModal,
}) => {
  const activeServicios = useMemo(
    () => serviciosVigentes.filter((s) => s.activo),
    [serviciosVigentes]
  );
  const activeTerreno = factoresTerreno ?? DEFAULT_TERRENO_CALC;
  const activeReglas = reglasViaticos ?? DEFAULT_REGLAS_CALC;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileRef = useRef<L.TileLayer | null>(null);
  const routeOverlayRef = useRef<L.FeatureGroup | null>(null);
  const parcelOverlayRef = useRef<L.FeatureGroup | null>(null);

  const [activeStep, setActiveStep] = useState<'paso1' | 'paso2'>('paso1');
  const [visualizerFocus, setVisualizerFocus] = useState<'poligono' | 'ruta'>('poligono');
  const [uploadedKmz, setUploadedKmz] = useState<ParsedKmzResult | null>(null);
  const [kmzError, setKmzError] = useState<string | null>(null);
  const [parcelLocationLabel, setParcelLocationLabel] = useState<string>('');
  const [isLoadingParcelLocation, setIsLoadingParcelLocation] = useState<boolean>(false);

  // Servicios sumatorios (inicia vacío para que el usuario elija qué cotizar)
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
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
  const activePerimeterM = useMemo(() => {
    if (uploadedKmz) return uploadedKmz.totalPerimeterM;
    if (selectedRuta?.totalPerimeterM) return selectedRuta.totalPerimeterM;
    return activeFeatures.reduce((sum, f) => sum + (f.perimeterM || 0), 0);
  }, [uploadedKmz, selectedRuta, activeFeatures]);

  useEffect(() => {
    if (!uploadedKmz && selectedRuta) {
      setProvince(selectedRuta.provincia);
      setManualAreaM2(Math.round(selectedRuta.totalAreaM2));
    }
  }, [selectedRuta, uploadedKmz]);

  useEffect(() => {
    let active = true;
    setIsLoadingParcelLocation(true);
    reverseGeocodeOSM(activeCentroid.lat, activeCentroid.lon)
      .then((geo) => {
        if (!active) return;
        const shortStreet = geo.displayAddress
          ? geo.displayAddress.split(',').slice(0, 2).join(',').trim()
          : '';
        const composed = [
          shortStreet || geo.locality,
          geo.municipality || geo.province || province,
        ]
          .filter(Boolean)
          .join(' · ');
        setParcelLocationLabel(
          composed || `${activeCentroid.lat.toFixed(5)}, ${activeCentroid.lon.toFixed(5)}`
        );
      })
      .catch(() => {
        if (!active) return;
        setParcelLocationLabel(
          `${province} (${activeCentroid.lat.toFixed(5)}, ${activeCentroid.lon.toFixed(5)})`
        );
      })
      .finally(() => {
        if (active) setIsLoadingParcelLocation(false);
      });

    return () => {
      active = false;
    };
  }, [activeCentroid.lat, activeCentroid.lon, province]);

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
      originPoint.lon,
      activeReglas
    )
      .then((res) => {
        if (!active) return;
        setRoutes(res);
        const primary = res[0];
        if (primary && primary.distanceOneWayKm > activeReglas.umbralHospedajeKm) {
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
  }, [activeCentroid.lat, activeCentroid.lon, originPoint.lat, originPoint.lon, activeReglas]);

  const activeRoute = useMemo(
    () => routes.find((r) => r.id === selectedRouteId) ?? routes[0],
    [routes, selectedRouteId]
  );

  const effectiveOneWayKm =
    distanceOverrideKm !== null && distanceOverrideKm > 0
      ? distanceOverrideKm
      : activeRoute?.distanceOneWayKm ?? 12;

  const servicesCalculation = useMemo(() => {
    const items = activeServicios
      .filter((s) => selectedServiceIds.includes(s.codigo))
      .map((svc) => {
        const calc = calcularCotizacionServicioVigente({
          servicio: svc,
          areaM2: manualAreaM2,
          corridorKm,
          terrain,
          factoresTerreno: activeTerreno,
        });
        return {
          id: svc.codigo,
          name: svc.nombre,
          subtitle: svc.subtitulo,
          basePriceRD: svc.precioBaseRD,
          perKmCorridorRD: svc.recargoCorredorPorKmRD,
          version: svc.version,
          corridorExtra: calc.corridorExtraRD,
          areaSurcharge: calc.areaSurchargeRD,
          adjustedPriceRD: calc.totalRD,
        };
      });

    const totalServicesRD = items.reduce((sum, item) => sum + item.adjustedPriceRD, 0);
    return { items, totalServicesRD };
  }, [activeServicios, selectedServiceIds, corridorKm, terrain, manualAreaM2, activeTerreno]);

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
        reglasViaticos: activeReglas,
        factoresTerreno: activeTerreno,
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
    activeReglas,
    activeTerreno,
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
      reglasViaticos: activeReglas,
      factoresTerreno: activeTerreno,
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
    activeReglas,
    activeTerreno,
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
      center: [activeCentroid.lat, activeCentroid.lon],
      zoom: 16,
      zoomControl: true,
    });
    const routeOverlay = L.featureGroup().addTo(map);
    const parcelOverlay = L.featureGroup().addTo(map);

    mapRef.current = map;
    routeOverlayRef.current = routeOverlay;
    parcelOverlayRef.current = parcelOverlay;

    const timer = setTimeout(() => map.invalidateSize(), 150);

    return () => {
      clearTimeout(timer);
      map.remove();
      mapRef.current = null;
      tileRef.current = null;
      routeOverlayRef.current = null;
      parcelOverlayRef.current = null;
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

  const fitVisualizerToFocus = (
    map: L.Map,
    focus: 'poligono' | 'ruta',
    parcelGroup: L.FeatureGroup,
    routeGroup: L.FeatureGroup
  ) => {
    if (focus === 'poligono') {
      const pBounds = parcelGroup.getBounds();
      if (pBounds.isValid()) {
        const ne = pBounds.getNorthEast();
        const sw = pBounds.getSouthWest();
        if (Math.abs(ne.lat - sw.lat) < 1e-6 && Math.abs(ne.lng - sw.lng) < 1e-6) {
          map.setView([ne.lat, ne.lng], 16);
        } else {
          map.fitBounds(pBounds, { padding: [44, 44], maxZoom: 18 });
        }
      } else {
        map.setView([activeCentroid.lat, activeCentroid.lon], 16);
      }
      return;
    }

    const combined = L.featureGroup([...routeGroup.getLayers(), ...parcelGroup.getLayers()]);
    const rBounds = combined.getBounds();
    if (rBounds.isValid()) {
      map.fitBounds(rBounds, { padding: [36, 36], maxZoom: 15 });
    }
  };

  useEffect(() => {
    const map = mapRef.current;
    const routeOverlay = routeOverlayRef.current;
    const parcelOverlay = parcelOverlayRef.current;
    if (!map || !routeOverlay || !parcelOverlay) return;

    routeOverlay.clearLayers();
    parcelOverlay.clearLayers();

    let hasAreaOrLineFeature = false;

    activeFeatures.forEach((feat, fIdx) => {
      if (feat.geometryType === 'Polygon' && feat.points.length >= 3) {
        hasAreaOrLineFeature = true;
        const poly = L.polygon(
          feat.points.map((p) => [p.lat, p.lon] as [number, number]),
          {
            color: '#0284C7',
            weight: 3,
            opacity: 0.95,
            fillColor: '#0284C7',
            fillOpacity: visualizerFocus === 'poligono' ? 0.26 : 0.22,
          }
        ).addTo(parcelOverlay);

        poly.bindPopup(
          `<div style="font-family:Plus Jakarta Sans,sans-serif;font-size:12px;min-width:170px;">
            <div style="font-weight:700;color:#0F2942;margin-bottom:3px;">${feat.name}</div>
            <div><strong>Área:</strong> ${formatArea(feat.areaM2 || manualAreaM2, 'm2')} (${formatArea(
            feat.areaM2 || manualAreaM2,
            'tareas'
          )})</div>
            <div><strong>Perímetro:</strong> ${formatPerimeter(
              feat.perimeterM || activePerimeterM
            )}</div>
          </div>`
        );

        if (visualizerFocus === 'poligono' && fIdx === 0) {
          feat.points.forEach((pt, vIdx) => {
            const first = feat.points[0];
            const isClosingDuplicate =
              vIdx === feat.points.length - 1 &&
              feat.points.length > 3 &&
              Math.abs(pt.lat - first.lat) < 1e-6 &&
              Math.abs(pt.lon - first.lon) < 1e-6;
            if (isClosingDuplicate) return;

            const vertexMarker = L.circleMarker([pt.lat, pt.lon], {
              radius: 5,
              color: '#0F2942',
              weight: 2,
              fillColor: '#FFFFFF',
              fillOpacity: 1,
            }).addTo(parcelOverlay);

            vertexMarker.bindTooltip(`V${vIdx + 1}`, {
              permanent: feat.points.length <= 16,
              direction: 'top',
              offset: [0, -5],
              className: 'font-mono text-[10px] font-bold',
            });
          });
        }
      } else if (feat.geometryType === 'LineString' && feat.points.length >= 2) {
        hasAreaOrLineFeature = true;
        const line = L.polyline(
          feat.points.map((p) => [p.lat, p.lon] as [number, number]),
          {
            color: '#0284C7',
            weight: 3.5,
            opacity: 0.95,
          }
        ).addTo(parcelOverlay);
        line.bindPopup(
          `<div style="font-size:12px;"><strong>${feat.name}</strong><br/>Longitud: ${formatPerimeter(
            feat.perimeterM
          )}</div>`
        );

        if (visualizerFocus === 'poligono' && fIdx === 0) {
          feat.points.forEach((pt, vIdx) => {
            const vertexMarker = L.circleMarker([pt.lat, pt.lon], {
              radius: 4.5,
              color: '#0F2942',
              weight: 2,
              fillColor: '#FFFFFF',
              fillOpacity: 1,
            }).addTo(parcelOverlay);
            if (feat.points.length <= 16) {
              vertexMarker.bindTooltip(`V${vIdx + 1}`, {
                permanent: true,
                direction: 'top',
                offset: [0, -5],
                className: 'font-mono text-[10px] font-bold',
              });
            }
          });
        }
      } else if (feat.points.length >= 1) {
        feat.points.forEach((pt) => {
          L.circleMarker([pt.lat, pt.lon], {
            radius: 6,
            color: '#FFFFFF',
            weight: 2,
            fillColor: '#16A34A',
            fillOpacity: 1,
          })
            .bindTooltip(feat.name)
            .addTo(parcelOverlay);
        });
      }
    });

    if (visualizerFocus === 'poligono' && !hasAreaOrLineFeature) {
      L.circleMarker([activeCentroid.lat, activeCentroid.lon], {
        radius: 7,
        color: '#FFFFFF',
        weight: 2,
        fillColor: '#0284C7',
        fillOpacity: 1,
      })
        .bindPopup(
          `<strong>Ubicación Parcela:</strong> ${
            uploadedKmz?.autoMeta.title || selectedRuta?.nombre || 'Parcela'
          }`
        )
        .addTo(parcelOverlay);
    }

    if (visualizerFocus === 'ruta') {
      routes.forEach((r) => {
        if (r.id === activeRoute?.id) return;
        L.polyline(r.coordinates, {
          color: '#475569',
          weight: 3.5,
          dashArray: '6 6',
          opacity: 0.75,
        })
          .bindTooltip(`${r.name} (${r.distanceOneWayKm} km)`)
          .addTo(routeOverlay);
      });

      if (activeRoute) {
        L.polyline(activeRoute.coordinates, {
          color: '#D97706',
          weight: 5,
          opacity: 0.95,
        })
          .bindTooltip(`${activeRoute.name} · ${effectiveOneWayKm} km ida`)
          .addTo(routeOverlay);
      }

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
        .addTo(routeOverlay);

      originMarker.on('dragend', () => {
        const pos = originMarker.getLatLng();
        applyPinOrigin(pos.lat, pos.lng);
      });

      L.circleMarker([activeCentroid.lat, activeCentroid.lon], {
        radius: 6,
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
        .addTo(routeOverlay);
    }

    parcelOverlay.bringToFront();
    fitVisualizerToFocus(map, visualizerFocus, parcelOverlay, routeOverlay);
    setTimeout(() => map.invalidateSize(), 100);
  }, [
    visualizerFocus,
    routes,
    activeRoute,
    activeFeatures,
    activeCentroid,
    effectiveOneWayKm,
    uploadedKmz,
    selectedRuta,
    originPoint,
    manualAreaM2,
    activePerimeterM,
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
    setVisualizerFocus('ruta');
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
      setVisualizerFocus('poligono');
    } catch (err: unknown) {
      setUploadedKmz(null);
      setKmzError(
        err instanceof Error ? err.message : 'No se pudo leer el archivo KMZ/KML/GeoJSON.'
      );
    }
  };

  const handleStepChange = (nextStep: 'paso1' | 'paso2') => {
    setActiveStep(nextStep);
    setVisualizerFocus(nextStep === 'paso2' ? 'ruta' : 'poligono');
  };

  const handleRecenterMap = () => {
    if (!mapRef.current || !parcelOverlayRef.current || !routeOverlayRef.current) return;
    fitVisualizerToFocus(
      mapRef.current,
      visualizerFocus,
      parcelOverlayRef.current,
      routeOverlayRef.current
    );
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
            configVersion: item.version,
            tarifaBaseUsadaRD: item.basePriceRD,
            recargosUsadosRD: item.corridorExtra + item.areaSurcharge,
          })),
          routeSummary: {
            routeName: activeRoute?.name || 'Ruta Directa',
            distanceOneWayKm: effectiveOneWayKm,
            durationMin: activeRoute?.durationMin ?? Math.round(effectiveOneWayKm * 1.4),
            tollsRD: activeBreakdown.tollsRD,
            fuelRD: activeBreakdown.fuelRD,
            vehicleLabel: activeVehicle.label,
            configVersion: activeReglas.version,
            precioGalonUsadoRD: fuelPricePerGalRD,
            mantenimientoPorKmUsadoRD: activeVehicle.maintenancePerKmRD,
          },
        });
        const proyVinculado = proyectos.find((p) => p.id === selectedRuta.proyectoId);
        setApplyFeedback(
          `Guardado en proyecto ${proyVinculado?.codigoContrato || selectedRuta.proyectoId}: Presupuesto viáticos ${formatRD(
            activeBreakdown.totalViaticosRD,
            moneda
          )} y valor contrato ${formatRD(grandTotalRD, moneda)}.`
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
        configVersion: activeReglas.version,
        tarifaUsadaRD: fuelPricePerGalRD,
        notas: `${activeBreakdown.roundTripKm} km ida y vuelta · ${activeBreakdown.gallonsNeeded} gal @ ${formatRD(fuelPricePerGalRD, moneda)}`,
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
        configVersion: activeReglas.version,
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
        configVersion: activeReglas.version,
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

  if (isLoading && rutas.length === 0 && proyectos.length === 0) {
    return <RouteCalculatorSkeleton />;
  }

  const steps: Array<{
    id: 'paso1' | 'paso2';
    number: string;
    title: string;
    subtitle: string;
  }> = [
    {
      id: 'paso1',
      number: '1',
      title: 'Ruta y Servicios',
      subtitle:
        selectedServiceIds.length > 0
          ? `${selectedServiceIds.length} servicio(s) · ${province}`
          : `Parcela en ${province} · Elige servicios`,
    },
    {
      id: 'paso2',
      number: '2',
      title: 'Logística y Guardar',
      subtitle: `${activeBreakdown.roundTripKm} km · ${formatRD(grandTotalRD, moneda)}`,
    },
  ];

  const activeParcelTitle =
    uploadedKmz?.autoMeta.title ||
    selectedRuta?.nombre ||
    'Parcela / Ruta Seleccionada';
  const activeParcelCode =
    uploadedKmz?.fileName || selectedRuta?.codigoParcela || 'SIN-KMZ';

  return (
    <div className="space-y-5">
      {/* Persistent Summary Bar */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="rounded-2xl border border-slate-200/90 bg-white p-4">
          <div className="text-[11px] font-medium text-[#475569]">Área Neta</div>
          <div className="mt-1 font-mono text-lg font-bold text-[#0F2942] tabular-nums">
            {manualAreaM2.toLocaleString('en-US')} m²
          </div>
          <div className="mt-0.5 font-mono text-[11px] text-[#64748B] tabular-nums">
            {(manualAreaM2 / TAREA_IN_M2).toFixed(2)} tareas · {terrain}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200/90 bg-white p-4">
          <div className="text-[11px] font-medium text-[#475569]">Servicios elegidos</div>
          <div className="mt-1 font-mono text-lg font-bold text-[#0F2942] tabular-nums">
            {selectedServiceIds.length}{' '}
            <span className="text-xs font-semibold text-[#475569]">
              {selectedServiceIds.length === 1 ? 'servicio' : 'servicios'}
            </span>
          </div>
          <div className="mt-0.5 font-mono text-[11px] text-[#0284C7] tabular-nums">
            {formatRD(servicesCalculation.totalServicesRD, moneda)}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200/90 bg-white p-4">
          <div className="text-[11px] font-medium text-[#475569]">Distancia Logística</div>
          <div className="mt-1 font-mono text-lg font-bold text-[#0F2942] tabular-nums">
            {effectiveOneWayKm.toFixed(1)} km{' '}
            <span className="text-xs font-normal text-[#475569]">ida</span>
          </div>
          <div className="mt-0.5 font-mono text-[11px] text-[#64748B] tabular-nums">
            {activeBreakdown.roundTripKm} km ida/vuelta · {province}
          </div>
        </div>

        <div className="rounded-2xl bg-gradient-to-br from-[#0F2942] to-[#0284C7] p-4 text-white shadow-sm">
          <div className="text-[11px] font-medium text-sky-100">Inversión Estimada</div>
          <div className="mt-1 font-mono text-xl font-bold text-white tabular-nums">
            {formatRD(grandTotalRD, moneda)}
          </div>
          <div className="mt-0.5 text-[11px] text-sky-100/90">
            Servicios + Viáticos · {moneda}
          </div>
        </div>
      </div>

      {/* Stepper Bar (2 Pasos) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 rounded-2xl border border-slate-200/90 bg-white p-2">
        {steps.map((step) => {
          const isCurrent = activeStep === step.id;
          return (
            <button
              key={step.id}
              type="button"
              onClick={() => handleStepChange(step.id)}
              className={`flex items-center gap-3 rounded-xl px-4 py-3 text-left transition-colors ${
                isCurrent
                  ? 'bg-[#0F2942] text-white shadow-sm'
                  : 'bg-[#F8FAFC] text-[#0F2942] hover:bg-slate-100'
              }`}
            >
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg font-mono text-xs font-bold ${
                  isCurrent ? 'bg-[#0284C7] text-white' : 'bg-white border border-slate-200 text-[#0F2942]'
                }`}
              >
                {step.number}
              </span>
              <div className="min-w-0">
                <div className="text-xs font-bold truncate">{step.title}</div>
                <div
                  className={`text-[11px] truncate ${
                    isCurrent ? 'text-sky-100' : 'text-[#475569]'
                  }`}
                >
                  {step.subtitle}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Split Principal: Formulario Guiado (2 Pasos) + Visualizador Geográfico Siempre Visible */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* COLUMNA IZQUIERDA: FORMULARIO EN 2 PASOS */}
        <div className="lg:col-span-6 space-y-5 min-w-0">
          {activeStep === 'paso1' ? (
            <div className="space-y-5">
              {/* Parcela / Ruta y Parámetros de Terreno */}
              <div className="rounded-2xl border border-slate-200/90 bg-white p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-bold text-[#0F2942]">1. Parcela o Ruta</h2>
                  <span className="text-[11px] font-medium text-[#0284C7]">KMZ o registrada</span>
                </div>

                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const f = e.dataTransfer.files?.[0];
                    if (f) handleUploadKmz(f);
                  }}
                  onClick={() => fileInputRef.current?.click()}
                  className="cursor-pointer rounded-xl border border-dashed border-[#0284C7] bg-[#F8FAFC] p-4 text-center hover:bg-[#EFF6FF] transition-colors"
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
                    {uploadedKmz ? uploadedKmz.fileName : 'Arrastra o sube tu .KMZ / .KML / .GeoJSON'}
                  </div>
                  <div className="mt-0.5 text-[11px] text-[#475569]">
                    Actualiza el visualizador, área y provincia al instante
                  </div>
                </div>

                {kmzError && (
                  <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] text-rose-800">
                    {kmzError}
                  </div>
                )}

                <div>
                  <label className="block text-[11px] font-semibold text-[#475569] mb-1.5">
                    O selecciona una ruta existente:
                  </label>
                  <select
                    value={uploadedKmz ? '__uploaded__' : selectedRuta?.id ?? ''}
                    onChange={(e) => {
                      if (e.target.value !== '__uploaded__') {
                        setUploadedKmz(null);
                        setVisualizerFocus('poligono');
                        onSelectRuta(e.target.value);
                      }
                    }}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-[#0D1C2F] min-h-[42px] focus:border-[#0284C7] focus:outline-none"
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

                <div className="border-t border-slate-100 pt-4 space-y-3.5">
                  <div>
                    <div className="text-xs font-bold text-[#0F2942] mb-2">Topografía de Terreno</div>
                    <div className="grid grid-cols-3 gap-2">
                      {(['Llano', 'Ondulado', 'Montañoso'] as const).map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setTerrain(t)}
                          className={`rounded-xl border py-2 text-xs font-semibold transition-colors min-h-[40px] whitespace-nowrap shrink-0 ${
                            terrain === t
                              ? 'border-[#0F2942] bg-[#0F2942] text-white'
                              : 'border-slate-200 bg-white text-[#334155] hover:bg-[#F8FAFC]'
                          }`}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <label className="block font-semibold text-[#475569] mb-1.5">Provincia</label>
                      <select
                        value={province}
                        onChange={(e) => setProvince(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-[#0D1C2F] min-h-[40px] focus:border-[#0284C7] focus:outline-none"
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
                      <label className="block font-semibold text-[#475569] mb-1.5">Área (m²)</label>
                      <input
                        type="number"
                        min={100}
                        step={50}
                        value={manualAreaM2}
                        onChange={(e) => setManualAreaM2(Math.max(100, Number(e.target.value)))}
                        className="w-full rounded-xl border border-slate-200 px-3 py-2 font-mono text-xs text-[#0D1C2F] tabular-nums min-h-[40px] focus:border-[#0284C7] focus:outline-none"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Selección de Servicios (comienza sin ninguno preseleccionado) */}
              <div className="rounded-2xl border border-slate-200/90 bg-white p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-sm font-bold text-[#0F2942]">
                      2. Elige los Servicios a Cotizar
                    </h2>
                    <p className="text-xs text-[#475569]">
                      Selecciona uno o varios servicios para combinarlos en esta ruta.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {selectedServiceIds.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setSelectedServiceIds([])}
                        className="text-[11px] font-semibold text-[#475569] hover:text-[#DC2626] whitespace-nowrap"
                      >
                        Limpiar selección
                      </button>
                    )}
                    <span className="font-mono text-xs font-bold text-[#0284C7] tabular-nums">
                      {selectedServiceIds.length} seleccionado(s)
                    </span>
                  </div>
                </div>

                {selectedServiceIds.length === 0 && (
                  <div className="rounded-xl border border-sky-200 bg-sky-50/70 px-3.5 py-2.5 text-xs text-[#0F2942]">
                    Aún no has seleccionado ningún servicio. Marca abajo los trabajos que requiere el cliente.
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {activeServicios.map((svc) => {
                    const checked = selectedServiceIds.includes(svc.codigo);
                    return (
                      <button
                        key={svc.codigo}
                        type="button"
                        onClick={() => handleToggleService(svc.codigo)}
                        className={`flex items-center justify-between gap-2.5 rounded-xl border px-3.5 py-3 text-left transition-colors ${
                          checked
                            ? 'border-[#0F2942] bg-[#0F2942] text-white shadow-sm'
                            : 'border-slate-200/90 bg-[#F8FAFC]/70 text-[#0D1C2F] hover:border-[#0284C7] hover:bg-white'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span
                            className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border ${
                              checked
                                ? 'border-[#38BDF8] bg-[#0284C7] text-white'
                                : 'border-slate-400 bg-white'
                            }`}
                          >
                            {checked && <Check className="h-3 w-3 stroke-[3]" />}
                          </span>
                          <div className="min-w-0">
                            <div className="text-xs font-bold leading-tight truncate">
                              {svc.nombre}
                            </div>
                            <div
                              className={`text-[11px] truncate ${
                                checked ? 'text-[#CBD5E1]' : 'text-[#475569]'
                              }`}
                            >
                              {svc.subtitulo}
                            </div>
                          </div>
                        </div>
                        <span
                          className={`font-mono text-xs font-bold tabular-nums shrink-0 ${
                            checked ? 'text-[#38BDF8]' : 'text-[#0F2942]'
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
                  <div className="rounded-xl border border-slate-200/70 bg-[#F8FAFC] p-3.5 space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-[#0F2942]">
                        Longitud de corredor vial (km)
                      </span>
                      <span className="font-mono text-[#0284C7] font-semibold tabular-nums">
                        {formatRD(
                          activeServicios.find(
                            (s) =>
                              selectedServiceIds.includes(s.codigo) &&
                              s.recargoCorredorPorKmRD > 0
                          )?.recargoCorredorPorKmRD ?? 0,
                          moneda
                        )}{' '}
                        / km
                      </span>
                    </div>
                    <input
                      type="number"
                      min={0}
                      step={0.5}
                      value={corridorKm}
                      onChange={(e) => setCorridorKm(Math.max(0, Number(e.target.value)))}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-[#0D1C2F] min-h-[40px] focus:border-[#0284C7] focus:outline-none"
                    />
                  </div>
                )}

                <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs text-[#475569]">
                    Planos de arquitectura (.DWG / .DXF)
                    {dwgPlan ? ` · ${dwgPlan.fileName}` : ''}
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowDwgSection((prev) => !prev)}
                    className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                      showDwgSection
                        ? 'border-[#0284C7] bg-[#EFF6FF] text-[#0284C7]'
                        : 'border-slate-200 bg-white text-[#0F2942] hover:bg-[#F8FAFC]'
                    }`}
                  >
                    <Compass className="h-3.5 w-3.5" />
                    {showDwgSection ? 'Ocultar visor .DWG' : 'Adjuntar plano .DWG'}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => handleStepChange('paso2')}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#0F2942] px-5 py-2.5 text-xs font-bold text-white hover:bg-[#0284C7] transition-colors min-h-[44px] whitespace-nowrap"
                >
                  Continuar a Logística y Guardar
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              {/* Vehículo y Combustible */}
              <div className="rounded-2xl border border-slate-200/90 bg-white p-5 space-y-3.5 text-xs">
                <div className="flex items-center gap-2 font-bold text-[#0F2942]">
                  <Car className="h-4 w-4 text-[#0284C7]" />
                  <span>Vehículo y Parámetros de Consumo</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                  <div>
                    <label className="block font-semibold text-[#475569] mb-1.5">
                      Unidad seleccionada
                    </label>
                    <select
                      value={vehiculoId}
                      onChange={(e) => handleVehicleChange(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-[#0D1C2F] min-h-[40px] focus:border-[#0284C7] focus:outline-none"
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
                  <div>
                    <label className="block font-semibold text-[#475569] mb-1.5">
                      Precio combustible (RD$/gal)
                    </label>
                    <input
                      type="number"
                      min={50}
                      step={0.5}
                      value={fuelPricePerGalRD}
                      onChange={(e) => setFuelPricePerGalRD(Math.max(1, Number(e.target.value)))}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 font-mono text-xs text-[#0D1C2F] tabular-nums min-h-[40px] focus:border-[#0284C7] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-[#475569] mb-1.5">
                      Rendimiento (km/gal)
                    </label>
                    <input
                      type="number"
                      min={5}
                      step={1}
                      value={kmPerGal}
                      onChange={(e) => setKmPerGal(Math.max(5, Number(e.target.value)))}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 font-mono text-xs text-[#0D1C2F] tabular-nums min-h-[40px] focus:border-[#0284C7] focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Rutas OSRM, Punto de Partida y Desglose de Viáticos */}
              <div className="rounded-2xl border border-slate-200/90 bg-white p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="flex items-center gap-2 text-sm font-bold text-[#0F2942]">
                      <Route className="h-4 w-4 text-[#0284C7]" />
                      Rutas Óptimas y Viáticos (Ida y Vuelta)
                    </h3>
                    <p className="text-xs text-[#475569]">
                      Ajusta el punto de partida o fija un pin directamente en el visualizador.
                    </p>
                  </div>
                  <div className="font-mono text-xs font-semibold text-[#0284C7] tabular-nums">
                    {isLoadingRoutes
                      ? 'Calculando ruta vial...'
                      : `${activeBreakdown.roundTripKm} km · ${activeRoute?.durationMin ?? 25} min/vía`}
                  </div>
                </div>

                {/* Punto de Partida */}
                <div className="rounded-xl border border-slate-200/70 bg-[#F8FAFC] p-3.5 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-[#0284C7] font-mono text-[11px] font-bold text-white">
                        A
                      </span>
                      <div className="min-w-0">
                        <span className="font-bold text-[#0F2942]">Salida: </span>
                        <span className="text-[#334155] truncate">{originPoint.label}</span>
                        <span className="ml-1.5 font-mono text-[10px] font-semibold text-[#0284C7] uppercase">
                          ·{' '}
                          {originPoint.source === 'empresa'
                            ? 'Base'
                            : originPoint.source === 'calle'
                            ? 'Calle'
                            : 'Pin mapa'}
                        </span>
                      </div>
                    </div>

                    {originPoint.source !== 'empresa' && (
                      <button
                        type="button"
                        onClick={handleResetOriginToBase}
                        className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-[#334155] hover:bg-[#EFF4FF] whitespace-nowrap shrink-0"
                      >
                        <RotateCcw className="h-3 w-3" />
                        Restablecer base
                      </button>
                    )}
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2">
                    <form onSubmit={handleSearchOriginStreet} className="flex-1 flex gap-2 min-w-0">
                      <div className="relative flex-1 min-w-0">
                        <Navigation className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#64748B]" />
                        <input
                          type="text"
                          value={originSearchQuery}
                          onChange={(e) => setOriginSearchQuery(e.target.value)}
                          placeholder="Buscar calle o sector..."
                          className="w-full rounded-xl border border-slate-200 bg-white pl-8 pr-7 py-2 text-xs text-[#0D1C2F] placeholder:text-[#94A3B8] min-h-[40px] focus:border-[#0284C7] focus:outline-none"
                        />
                        {originSearchQuery && (
                          <button
                            type="button"
                            onClick={() => {
                              setOriginSearchQuery('');
                              setOriginSearchResults([]);
                              setOriginSearchError(null);
                            }}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#64748B] hover:text-[#0F2942]"
                            aria-label="Limpiar búsqueda de calle"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                      <button
                        type="submit"
                        disabled={isSearchingOrigin || !originSearchQuery.trim()}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-[#0F2942] px-3 py-2 text-xs font-semibold text-white hover:bg-[#0284C7] disabled:opacity-50 transition-colors min-h-[40px] whitespace-nowrap shrink-0"
                      >
                        <Search className="h-3.5 w-3.5" />
                        {isSearchingOrigin ? 'Buscando...' : 'Buscar'}
                      </button>
                    </form>

                    <button
                      type="button"
                      onClick={() => {
                        setIsPickingOriginPin((prev) => {
                          const next = !prev;
                          if (next) setVisualizerFocus('ruta');
                          return next;
                        });
                      }}
                      className={`inline-flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition-colors min-h-[40px] whitespace-nowrap shrink-0 ${
                        isPickingOriginPin
                          ? 'border-[#B45309] bg-amber-50 text-[#B45309]'
                          : 'border-[#0284C7] bg-white text-[#0284C7] hover:bg-[#EFF6FF]'
                      }`}
                    >
                      <MapPin className="h-3.5 w-3.5" />
                      {isPickingOriginPin ? 'Cancelar pin' : 'Fijar pin'}
                    </button>
                  </div>

                  {originSearchError && (
                    <div className="text-[11px] font-medium text-[#DC2626]">{originSearchError}</div>
                  )}

                  {originSearchResults.length > 0 && (
                    <div className="rounded-xl border border-slate-200 bg-white divide-y divide-slate-200 max-h-40 overflow-y-auto">
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

                {isLoadingRoutes && routes.length === 0 ? (
                  <RouteAlternativesSkeleton />
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                          className={`rounded-2xl border p-3.5 text-left transition-colors ${
                            isSelected
                              ? 'border-2 border-[#0F2942] bg-[#F8FAFC]'
                              : 'border-slate-200/90 bg-white hover:bg-[#F8FAFC]'
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
                              {formatRD(breakdown.totalViaticosRD, moneda)}
                            </span>
                          </div>
                          <div className="mt-1 text-xs font-bold text-[#0D1C2F]">{route.name}</div>
                          <div className="mt-1 font-mono text-[11px] text-[#334155] tabular-nums">
                            {route.distanceOneWayKm} km ida · {breakdown.roundTripKm} km i/v
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200/70 bg-[#F8FAFC] px-4 py-3 text-xs">
                  <div className="flex flex-wrap items-center gap-4">
                    <label className="inline-flex items-center gap-2 font-medium text-[#0D1C2F] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={includeTolls}
                        onChange={(e) => setIncludeTolls(e.target.checked)}
                        className="rounded-sm accent-[#0F2942]"
                      />
                      Incluir peajes
                    </label>

                    <label className="inline-flex items-center gap-2 font-medium text-[#0D1C2F] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={includeLodging}
                        onChange={(e) => setIncludeLodging(e.target.checked)}
                        className="rounded-sm accent-[#0F2942]"
                      />
                      Hospedaje cuadrilla
                    </label>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-[#475569]">Ajuste km ida:</span>
                    <input
                      type="number"
                      min={1}
                      step={0.5}
                      value={effectiveOneWayKm}
                      onChange={(e) => setDistanceOverrideKm(Math.max(1, Number(e.target.value)))}
                      className="w-20 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-xs text-[#0D1C2F] tabular-nums focus:border-[#0284C7] focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <div className="rounded-xl border border-slate-200/70 bg-[#F8FAFC] p-3">
                    <div className="text-[11px] font-medium text-[#475569]">Combustible</div>
                    <div className="mt-0.5 font-mono text-xs font-bold text-[#0F2942] tabular-nums">
                      {formatRD(activeBreakdown.fuelRD, moneda)}
                    </div>
                  </div>
                  <div className="rounded-xl border border-slate-200/70 bg-[#F8FAFC] p-3">
                    <div className="text-[11px] font-medium text-[#475569]">Peajes</div>
                    <div className="mt-0.5 font-mono text-xs font-bold text-[#0F2942] tabular-nums">
                      {formatRD(activeBreakdown.tollsRD, moneda)}
                    </div>
                  </div>
                  <div className="rounded-xl border border-slate-200/70 bg-[#F8FAFC] p-3">
                    <div className="text-[11px] font-medium text-[#475569]">Dieta</div>
                    <div className="mt-0.5 font-mono text-xs font-bold text-[#0F2942] tabular-nums">
                      {formatRD(activeBreakdown.perDiemRD, moneda)}
                    </div>
                  </div>
                  <div className="rounded-xl border border-slate-200/70 bg-[#F8FAFC] p-3">
                    <div className="text-[11px] font-medium text-[#475569]">Mantenimiento</div>
                    <div className="mt-0.5 font-mono text-xs font-bold text-[#0F2942] tabular-nums">
                      {formatRD(activeBreakdown.maintenanceRD, moneda)}
                    </div>
                  </div>
                </div>

                {includeLodging && (
                  <div className="flex items-center justify-between rounded-xl border border-sky-200 bg-[#EFF6FF] px-4 py-2.5 text-xs">
                    <span className="font-medium text-[#0F2942]">
                      Hospedaje / Pernocta ({activeBreakdown.fieldDays} noche(s))
                    </span>
                    <span className="font-mono font-bold text-[#0F2942] tabular-nums">
                      {formatRD(activeBreakdown.lodgingRD, moneda)}
                    </span>
                  </div>
                )}
              </div>

              {/* Resumen Consolidado y Guardado en Proyecto */}
              <div className="rounded-2xl border border-slate-200/90 bg-white p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3.5">
                  <div>
                    <h3 className="flex items-center gap-2 text-sm font-bold text-[#0F2942]">
                      <Layers className="h-4 w-4 text-[#0284C7]" />
                      Resumen y Guardar Cotización
                    </h3>
                    <p className="text-xs text-[#475569]">
                      {province} · {manualAreaM2.toLocaleString('en-US')} m² · Terreno {terrain}
                    </p>
                  </div>
                  <span className="font-mono text-lg font-bold text-[#0F2942] tabular-nums">
                    {formatRD(grandTotalRD, moneda)}
                  </span>
                </div>

                {servicesCalculation.items.length === 0 ? (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50/70 px-3.5 py-2.5 text-xs text-[#B45309]">
                    <span>Sin servicios seleccionados (solo se cotizan viáticos).</span>
                    <button
                      type="button"
                      onClick={() => setActiveStep('paso1')}
                      className="rounded-lg border border-amber-300 bg-white px-2.5 py-1 font-semibold text-[#0F2942] hover:bg-amber-50 whitespace-nowrap"
                    >
                      Elegir servicios
                    </button>
                  </div>
                ) : (
                  <div className="rounded-xl border border-slate-200/70 bg-[#F8FAFC] divide-y divide-slate-200/60">
                    {servicesCalculation.items.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between gap-2 px-3.5 py-2 text-xs"
                      >
                        <span className="text-[#334155] truncate">
                          <strong className="text-[#0F2942]">{item.name}</strong>
                          {item.corridorExtra > 0 ? ` (${corridorKm} km)` : ''}
                        </span>
                        <span className="font-mono font-semibold text-[#0D1C2F] tabular-nums shrink-0">
                          {formatRD(item.adjustedPriceRD, moneda)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {selectedRuta && !uploadedKmz && (() => {
                  const proyDestino = proyectos.find((p) => p.id === selectedRuta.proyectoId);
                  if (!proyDestino) return null;
                  return (
                    <div className="rounded-xl border border-slate-200/70 bg-[#F8FAFC] px-3.5 py-2.5 text-xs flex flex-wrap items-center justify-between gap-2">
                      <span className="text-[#334155] truncate">
                        Proyecto:{' '}
                        <strong className="font-mono text-[#0F2942]">{proyDestino.codigoContrato}</strong>{' '}
                        — {proyDestino.nombre}
                      </span>
                      <span className="font-mono text-[#0284C7] font-semibold tabular-nums shrink-0">
                        Viáticos: {formatRD(activeBreakdown.totalViaticosRD, moneda)}
                      </span>
                    </div>
                  );
                })()}

                {applyFeedback && (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs font-medium text-[#15803D]">
                    {applyFeedback}
                  </div>
                )}

                <div className="flex flex-col sm:flex-row flex-wrap gap-2.5">
                  {canEdit && (
                    <button
                      type="button"
                      disabled={isApplying || (!uploadedKmz && !selectedRuta)}
                      onClick={handleApplyCalculation}
                      className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-[#0F2942] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#0284C7] disabled:opacity-50 transition-colors min-h-[44px] whitespace-nowrap shrink-0"
                    >
                      <Send className="h-4 w-4" />
                      {uploadedKmz
                        ? 'Crear ruta KMZ'
                        : isApplying
                        ? 'Aplicando...'
                        : 'Actualizar ruta y servicios'}
                    </button>
                  )}

                  {selectedRuta && !uploadedKmz && (
                    <button
                      type="button"
                      onClick={handleLogAutomaticRouteExpenses}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#0284C7] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#006398] transition-colors min-h-[44px] whitespace-nowrap shrink-0"
                    >
                      <Receipt className="h-4 w-4" />
                      Registrar viáticos
                    </button>
                  )}

                  {selectedRuta && !uploadedKmz && onOpenExpenseModal && (
                    <button
                      type="button"
                      onClick={onOpenExpenseModal}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#0F2942] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#0284C7] transition-colors min-h-[44px] whitespace-nowrap shrink-0"
                    >
                      <Camera className="h-4 w-4" />
                      Adjuntar recibo
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={handleExportEstimateCsv}
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-[#334155] hover:bg-[#F8FAFC] min-h-[44px] whitespace-nowrap shrink-0 transition-colors"
                  >
                    <Download className="h-4 w-4" />
                    Exportar CSV
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => handleStepChange('paso1')}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-[#0F2942] hover:bg-slate-50 min-h-[44px] whitespace-nowrap"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Volver a Ruta y Servicios
                </button>
              </div>
            </div>
          )}
        </div>

        {/* COLUMNA DERECHA: VISUALIZADOR GEOGRÁFICO SIEMPRE VISIBLE */}
        <div className="lg:col-span-6 lg:sticky lg:top-20 space-y-4 min-w-0">
          <div className="rounded-2xl border border-slate-200/90 bg-white overflow-hidden shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2.5 bg-[#0F2942] px-4 py-3 text-white">
              <div className="min-w-0 flex-1">
                <div className="text-[10px] font-mono uppercase tracking-wider text-sky-300">
                  Visualizador Geográfico en Vivo
                </div>
                <div className="text-xs font-bold truncate">{activeParcelTitle}</div>
                <div className="mt-0.5 flex items-center gap-1 text-[11px] text-sky-100/90 truncate">
                  <MapPin className="h-3 w-3 text-sky-300 shrink-0" />
                  <span className="truncate">
                    {isLoadingParcelLocation
                      ? `Ubicando en ${province}...`
                      : parcelLocationLabel || province}
                  </span>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                <div
                  className="inline-flex rounded-xl bg-[#091A2C] p-0.5 shrink-0"
                  role="group"
                  aria-label="Enfoque del mapa"
                >
                  <button
                    type="button"
                    onClick={() => setVisualizerFocus('poligono')}
                    className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap shrink-0 transition-colors ${
                      visualizerFocus === 'poligono'
                        ? 'bg-[#0284C7] text-white'
                        : 'text-[#94A3B8] hover:text-white'
                    }`}
                  >
                    <Compass className="h-3 w-3" />
                    Polígono
                  </button>
                  <button
                    type="button"
                    onClick={() => setVisualizerFocus('ruta')}
                    className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap shrink-0 transition-colors ${
                      visualizerFocus === 'ruta'
                        ? 'bg-[#0284C7] text-white'
                        : 'text-[#94A3B8] hover:text-white'
                    }`}
                  >
                    <Route className="h-3 w-3" />
                    Ruta
                  </button>
                </div>

                <div
                  className="inline-flex rounded-xl bg-[#091A2C] p-0.5 shrink-0"
                  role="group"
                  aria-label="Estilo de mapa"
                >
                  <button
                    type="button"
                    onClick={() => setMapStyle('osm')}
                    className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap shrink-0 transition-colors ${
                      mapStyle === 'osm'
                        ? 'bg-[#0284C7] text-white'
                        : 'text-[#94A3B8] hover:text-white'
                    }`}
                  >
                    <MapIcon className="h-3 w-3" />
                    Vial
                  </button>
                  <button
                    type="button"
                    onClick={() => setMapStyle('topo')}
                    className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap shrink-0 transition-colors ${
                      mapStyle === 'topo'
                        ? 'bg-[#0284C7] text-white'
                        : 'text-[#94A3B8] hover:text-white'
                    }`}
                  >
                    <Mountain className="h-3 w-3" />
                    Topo
                  </button>
                </div>
              </div>
            </div>

            <div className="relative">
              <div ref={mapContainerRef} className="w-full h-[320px] sm:h-[380px] lg:h-[430px] z-0" />
              <button
                type="button"
                onClick={handleRecenterMap}
                className="absolute top-3 right-3 z-[400] inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white/95 backdrop-blur-sm px-2.5 py-1.5 text-[11px] font-semibold text-[#0F2942] shadow-md hover:bg-sky-50 whitespace-nowrap"
                title={
                  visualizerFocus === 'poligono'
                    ? 'Centrar en el polígono'
                    : 'Ajustar mapa a la ruta'
                }
              >
                <LocateFixed className="h-3.5 w-3.5 text-[#0284C7]" />
                {visualizerFocus === 'poligono' ? 'Centrar polígono' : 'Centrar ruta'}
              </button>
              {isPickingOriginPin && (
                <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[400] rounded-md border border-[#38BDF8]/60 bg-[#091A2C]/92 backdrop-blur-md px-3.5 py-2 text-xs font-semibold text-[#38BDF8] shadow-lg whitespace-nowrap">
                  Haz clic en el mapa para fijar el punto de partida (A)
                </div>
              )}
              <div className="absolute bottom-3 left-3 z-[400] rounded-md bg-[#091A2C]/92 backdrop-blur-md border border-white/15 px-3 py-1.5 font-mono text-[11px] font-semibold text-white shadow-lg tabular-nums">
                {visualizerFocus === 'poligono'
                  ? `${activeFeatures.length} geom. · ${formatArea(
                      manualAreaM2,
                      'tareas'
                    )} · ${formatPerimeter(activePerimeterM)}`
                  : `${effectiveOneWayKm.toFixed(1)} km ida · ${activeBreakdown.roundTripKm} km i/v`}
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 border-t border-slate-200/80 bg-[#F8FAFC] px-4 py-3 text-[11px]">
              <div className="min-w-0">
                <div className="text-[#64748B]">Parcela / KMZ</div>
                <div className="font-mono font-bold text-[#0F2942] truncate">{activeParcelCode}</div>
              </div>
              <div className="min-w-0">
                <div className="text-[#64748B]">Locación</div>
                <div
                  className="font-semibold text-[#0F2942] truncate"
                  title={parcelLocationLabel || province}
                >
                  {parcelLocationLabel || province}
                </div>
              </div>
              <div className="min-w-0">
                <div className="text-[#64748B]">Superficie · Perímetro</div>
                <div className="font-mono font-bold text-[#0284C7] tabular-nums truncate">
                  {manualAreaM2.toLocaleString('en-US')} m² · {formatPerimeter(activePerimeterM)}
                </div>
              </div>
              <div className="min-w-0">
                <div className="text-[#64748B]">Lat/Lon · UTM {activeCentroid.zone}</div>
                <div className="font-mono font-semibold text-[#0F2942] tabular-nums truncate">
                  {activeCentroid.lat.toFixed(4)}, {activeCentroid.lon.toFixed(4)}
                </div>
              </div>
            </div>
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
        </div>
      </div>
    </div>
  );
};

