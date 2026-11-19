import { haversineMeters } from './geodesy';
import {
  crearConfiguracionInicialEmpresa,
  obtenerCombustiblesVigentes,
  obtenerFactoresTerrenoVigentes,
  obtenerReglasViaticosVigentes,
  obtenerServiciosVigentes,
} from '../domain/configuracion';
import type {
  PeajesCorredorConfig,
  ReglasViaticosVersion,
  TerrenoFactorVersion,
} from '../types/domain';

export interface ServiceOption {
  id: string;
  name: string;
  subtitle: string;
  basePriceRD: number;
  perKmCorridorRD?: number;
}

const DEFAULT_CONFIG = crearConfiguracionInicialEmpresa('default');
const DEFAULT_SERVICIOS_VIGENTES = obtenerServiciosVigentes(DEFAULT_CONFIG, '2026-01-01');
const DEFAULT_TERRENO_VIGENTE = obtenerFactoresTerrenoVigentes(DEFAULT_CONFIG, '2026-01-01');
const DEFAULT_COMBUSTIBLES_VIGENTES = obtenerCombustiblesVigentes(DEFAULT_CONFIG, '2026-01-01');
export const DEFAULT_REGLAS_VIATICOS = obtenerReglasViaticosVigentes(DEFAULT_CONFIG, '2026-01-01');

export const SERVICE_CATALOG: ServiceOption[] = DEFAULT_SERVICIOS_VIGENTES.map((s) => ({
  id: s.codigo,
  name: s.nombre,
  subtitle: s.subtitulo,
  basePriceRD: s.precioBaseRD,
  ...(s.recargoCorredorPorKmRD > 0 ? { perKmCorridorRD: s.recargoCorredorPorKmRD } : {}),
}));

export type TerrainType = 'Llano' | 'Ondulado' | 'Montañoso';

export const TERRAIN_MULTIPLIER: Record<TerrainType, number> = {
  Llano: DEFAULT_TERRENO_VIGENTE.Llano,
  Ondulado: DEFAULT_TERRENO_VIGENTE.Ondulado,
  Montañoso: DEFAULT_TERRENO_VIGENTE.Montañoso,
};

export interface VehiclePreset {
  id: string;
  label: string;
  fuelName: string;
  fuelPricePerGalRD: number;
  kmPerGal: number;
  maintenancePerKmRD: number;
}

export const VEHICLE_CATALOG: VehiclePreset[] = [
  {
    id: 'hilux_diesel',
    label: 'Camioneta 4x4 Doble Cabina · Diésel Óptimo',
    fuelName: DEFAULT_COMBUSTIBLES_VIGENTES[0]?.nombre ?? 'Diésel Óptimo',
    fuelPricePerGalRD: DEFAULT_COMBUSTIBLES_VIGENTES[0]?.precioGalonRD ?? 239.1,
    kmPerGal: 32,
    maintenancePerKmRD: 15,
  },
  {
    id: 'pickup_regular',
    label: 'Pickup 4x2 Ligera · Gasolina Regular',
    fuelName: DEFAULT_COMBUSTIBLES_VIGENTES[1]?.nombre ?? 'Gasolina Regular',
    fuelPricePerGalRD: DEFAULT_COMBUSTIBLES_VIGENTES[1]?.precioGalonRD ?? 272.5,
    kmPerGal: 36,
    maintenancePerKmRD: 12,
  },
  {
    id: 'suv_premium',
    label: 'SUV Brigada Técnica · Gasolina Premium',
    fuelName: DEFAULT_COMBUSTIBLES_VIGENTES[2]?.nombre ?? 'Gasolina Premium',
    fuelPricePerGalRD: DEFAULT_COMBUSTIBLES_VIGENTES[2]?.precioGalonRD ?? 290.1,
    kmPerGal: 34,
    maintenancePerKmRD: 14,
  },
];

export const SANTO_DOMINGO_ORIGIN = {
  lat: 18.4861,
  lon: -69.9312,
  label: 'Base Santo Domingo (Av. 27 de Febrero)',
};

export interface RouteAlternative {
  id: 'economica' | 'rapida';
  badge: string;
  name: string;
  corridorDesc: string;
  distanceOneWayKm: number;
  durationMin: number;
  oneWayTollRD: number;
  tollNote: string;
  coordinates: [number, number][]; // [lat, lon] pairs for Leaflet
  source: 'osrm' | 'offline';
}

function estimateCorridorTolls(
  destLat: number,
  destLon: number,
  distanceKm: number,
  mode: 'economica' | 'rapida',
  peajes: PeajesCorredorConfig = DEFAULT_REGLAS_VIATICOS.peajesCorredor,
  umbralDistanciaUrbanaKm: number = DEFAULT_REGLAS_VIATICOS.umbralDistanciaUrbanaKm
): { oneWayTollRD: number; tollNote: string; corridorDesc: string } {
  const isEast = destLon > -69.75;
  const isNorth = destLat > 18.72;
  const isSouthWest = destLon < -70.05 && destLat < 18.65;

  if (mode === 'economica') {
    if (distanceKm <= umbralDistanciaUrbanaKm) {
      return {
        oneWayTollRD: 0,
        tollNote: 'Sin peajes',
        corridorDesc: 'Av. 27 de Febrero / Vía Urbana Directa (sin peajes)',
      };
    }
    if (isEast) {
      return {
        oneWayTollRD: peajes.nacionalBaseRD,
        tollNote: `1 estación RD Vial (RD$ ${peajes.nacionalBaseRD}/vía)`,
        corridorDesc: 'Carretera Mella / Autovía del Este (tramo libre)',
      };
    }
    if (isNorth) {
      return {
        oneWayTollRD: peajes.nacionalBaseRD,
        tollNote: `Peaje Duarte (RD$ ${peajes.nacionalBaseRD}/vía)`,
        corridorDesc: 'Autopista Duarte · Tramo Nacional',
      };
    }
    return {
      oneWayTollRD: peajes.nacionalBaseRD,
      tollNote: `Peaje 6 de Noviembre (RD$ ${peajes.nacionalBaseRD}/vía)`,
      corridorDesc: 'Carretera Sánchez / Vía Regional',
    };
  }

  // Express / Ring Road route
  if (distanceKm <= umbralDistanciaUrbanaKm) {
    return {
      oneWayTollRD: peajes.urbanoExpresoRD,
      tollNote: `Peaje Circunvalación (RD$ ${peajes.urbanoExpresoRD}/vía)`,
      corridorDesc: 'Circunvalación Santo Domingo (tránsito fluido)',
    };
  }
  if (isEast) {
    const stations = destLon > -68.8 ? peajes.esteEstacionesLejos : peajes.esteEstacionesCerca;
    const totalEste = stations * peajes.estePorEstacionRD;
    return {
      oneWayTollRD: totalEste,
      tollNote: `${stations} peajes Autovía / Coral (RD$ ${totalEste}/vía)`,
      corridorDesc: 'Expreso Las Américas · Autovía del Este / Coral',
    };
  }
  if (isNorth) {
    return {
      oneWayTollRD: peajes.norteExpresoRD,
      tollNote: `Circunvalación + Peaje Duarte (RD$ ${peajes.norteExpresoRD}/vía)`,
      corridorDesc: 'Circunvalación Norte · Autopista Duarte Expresa',
    };
  }
  if (isSouthWest) {
    return {
      oneWayTollRD: peajes.suroesteExpresoRD,
      tollNote: `Circunvalación + 6 de Noviembre (RD$ ${peajes.suroesteExpresoRD}/vía)`,
      corridorDesc: 'Circunvalación · Autopista 6 de Noviembre',
    };
  }
  return {
    oneWayTollRD: peajes.otroExpresoRD,
    tollNote: `Peajes expresos (RD$ ${peajes.otroExpresoRD}/vía)`,
    corridorDesc: 'Corredor Expreso RD Vial',
  };
}

function buildOfflinePolyline(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
  bendFactor: number
): [number, number][] {
  const midLat = (lat1 + lat2) / 2 + (lon2 - lon1) * bendFactor;
  const midLon = (lon1 + lon2) / 2 - (lat2 - lat1) * bendFactor;
  return [
    [lat1, lon1],
    [(lat1 + midLat) / 2, (lon1 + midLon) / 2],
    [midLat, midLon],
    [(midLat + lat2) / 2, (midLon + lon2) / 2],
    [lat2, lon2],
  ];
}

export async function fetchOptimalRoutesOSM(
  destLat: number,
  destLon: number,
  originLat: number = SANTO_DOMINGO_ORIGIN.lat,
  originLon: number = SANTO_DOMINGO_ORIGIN.lon,
  reglasViaticos: ReglasViaticosVersion = DEFAULT_REGLAS_VIATICOS
): Promise<RouteAlternative[]> {
  const straightKm = Math.max(
    4,
    haversineMeters(originLat, originLon, destLat, destLon) / 1000
  );

  // Offline / fallback routes
  const fallbackDirectKm = Number((straightKm * 1.24).toFixed(1));
  const fallbackFastKm = Number((straightKm * 1.38 + (straightKm < 25 ? 8 : 2)).toFixed(1));

  const econToll = estimateCorridorTolls(
    destLat,
    destLon,
    fallbackDirectKm,
    'economica',
    reglasViaticos.peajesCorredor,
    reglasViaticos.umbralDistanciaUrbanaKm
  );
  const fastToll = estimateCorridorTolls(
    destLat,
    destLon,
    fallbackFastKm,
    'rapida',
    reglasViaticos.peajesCorredor,
    reglasViaticos.umbralDistanciaUrbanaKm
  );

  const fallbackRoutes: RouteAlternative[] = [
    {
      id: 'economica',
      badge: 'Menor peaje / Libre',
      name:
        fallbackDirectKm <= reglasViaticos.umbralDistanciaUrbanaKm
          ? 'Corredor Urbano Directo'
          : 'Ruta Nacional / Menor Peaje',
      corridorDesc: econToll.corridorDesc,
      distanceOneWayKm: fallbackDirectKm,
      durationMin: Math.round(fallbackDirectKm * 1.55),
      oneWayTollRD: econToll.oneWayTollRD,
      tollNote: econToll.tollNote,
      coordinates: buildOfflinePolyline(
        originLat,
        originLon,
        destLat,
        destLon,
        0.04
      ),
      source: 'offline',
    },
    {
      id: 'rapida',
      badge: 'Ruta más rápida',
      name: fallbackFastKm <= 35 ? 'Circunvalación Santo Domingo' : 'Autopista Expresa RD Vial',
      corridorDesc: fastToll.corridorDesc,
      distanceOneWayKm: fallbackFastKm,
      durationMin: Math.round(fallbackFastKm * 0.95),
      oneWayTollRD: fastToll.oneWayTollRD,
      tollNote: fastToll.tollNote,
      coordinates: buildOfflinePolyline(
        originLat,
        originLon,
        destLat,
        destLon,
        -0.09
      ),
      source: 'offline',
    },
  ];

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return fallbackRoutes;
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4500);
    const url = `https://router.project-osrm.org/route/v1/driving/${originLon},${originLat};${destLon},${destLat}?alternatives=true&overview=full&geometries=geojson`;
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);

    if (!res.ok) return fallbackRoutes;
    const data = await res.json();
    const routes = Array.isArray(data?.routes) ? data.routes : [];
    if (routes.length === 0) return fallbackRoutes;

    const r0 = routes[0];
    const r1 = routes[1] ?? null;

    const d0Km = Number((r0.distance / 1000).toFixed(1));
    const t0Min = Math.max(8, Math.round(r0.duration / 60));
    const coords0: [number, number][] = (r0.geometry?.coordinates || []).map(
      ([lon, lat]: [number, number]) => [lat, lon]
    );

    // If OSRM returns a second alternative, use it; otherwise derive ring-road comparison
    const d1Km = r1 ? Number((r1.distance / 1000).toFixed(1)) : Number((d0Km * 1.15 + 4).toFixed(1));
    const t1Min = r1 ? Math.max(8, Math.round(r1.duration / 60)) : Math.max(8, Math.round(t0Min * 0.85));
    const coords1: [number, number][] = r1
      ? (r1.geometry?.coordinates || []).map(([lon, lat]: [number, number]) => [lat, lon])
      : buildOfflinePolyline(
          originLat,
          originLon,
          destLat,
          destLon,
          -0.08
        );

    const toll0 = estimateCorridorTolls(
      destLat,
      destLon,
      d0Km,
      'economica',
      reglasViaticos.peajesCorredor,
      reglasViaticos.umbralDistanciaUrbanaKm
    );
    const toll1 = estimateCorridorTolls(
      destLat,
      destLon,
      d1Km,
      'rapida',
      reglasViaticos.peajesCorredor,
      reglasViaticos.umbralDistanciaUrbanaKm
    );

    return [
      {
        id: 'economica',
        badge: 'Menor peaje / Libre',
        name:
          d0Km <= reglasViaticos.umbralDistanciaUrbanaKm
            ? 'Corredor Urbano Directo'
            : 'Ruta OSRM Menor Peaje',
        corridorDesc: toll0.corridorDesc,
        distanceOneWayKm: d0Km,
        durationMin: t0Min,
        oneWayTollRD: toll0.oneWayTollRD,
        tollNote: toll0.tollNote,
        coordinates: coords0.length >= 2 ? coords0 : fallbackRoutes[0].coordinates,
        source: 'osrm',
      },
      {
        id: 'rapida',
        badge: 'Ruta más rápida',
        name: d1Km <= 35 ? 'Circunvalación Santo Domingo' : 'Corredor Expreso OSRM',
        corridorDesc: toll1.corridorDesc,
        distanceOneWayKm: d1Km,
        durationMin: t1Min,
        oneWayTollRD: toll1.oneWayTollRD,
        tollNote: toll1.tollNote,
        coordinates: coords1.length >= 2 ? coords1 : fallbackRoutes[1].coordinates,
        source: 'osrm',
      },
    ];
  } catch {
    return fallbackRoutes;
  }
}

export interface ViaticosRouteBreakdown {
  roundTripKm: number;
  gallonsNeeded: number;
  fuelRD: number;
  tollsRD: number;
  perDiemRD: number;
  maintenanceRD: number;
  lodgingRD: number;
  totalViaticosRD: number;
  fieldDays: number;
}

export function computeRouteViaticos(params: {
  distanceOneWayKm: number;
  oneWayTollRD: number;
  includeTolls: boolean;
  includeLodging: boolean;
  fuelPricePerGalRD: number;
  kmPerGal: number;
  maintenancePerKmRD: number;
  areaM2: number;
  terrain: TerrainType;
  serviceCount: number;
  reglasViaticos?: ReglasViaticosVersion;
  factoresTerreno?: TerrenoFactorVersion;
}): ViaticosRouteBreakdown {
  const reglas = params.reglasViaticos ?? DEFAULT_REGLAS_VIATICOS;
  const factores = params.factoresTerreno ?? DEFAULT_TERRENO_VIGENTE;

  const roundTripKm = Number((params.distanceOneWayKm * 2).toFixed(1));
  const safeKmPerGal = Math.max(5, params.kmPerGal);
  const gallonsNeeded = Number((roundTripKm / safeKmPerGal).toFixed(2));
  const fuelRD = Math.round(gallonsNeeded * params.fuelPricePerGalRD);
  const tollsRD = params.includeTolls ? Math.round(params.oneWayTollRD * 2) : 0;

  const hectares = params.areaM2 / 10000;
  const terrainFactor = factores[params.terrain] ?? 1.0;
  const serviceComplexity = Math.max(0, params.serviceCount - 1) * 0.35;
  const fieldDays = Math.max(
    1,
    Math.min(7, Math.ceil((hectares / 18 + 0.5 + serviceComplexity) * terrainFactor))
  );

  const perDiemRate =
    params.distanceOneWayKm < reglas.umbralDistanciaUrbanaKm && fieldDays === 1
      ? reglas.dietaUrbanaRD
      : reglas.dietaCampoRD;
  const perDiemRD = fieldDays * perDiemRate;
  const maintenanceRD = Math.round(roundTripKm * params.maintenancePerKmRD);
  const lodgingRD = params.includeLodging ? Math.max(1, fieldDays) * reglas.hospedajePorNocheRD : 0;

  return {
    roundTripKm,
    gallonsNeeded,
    fuelRD,
    tollsRD,
    perDiemRD,
    maintenanceRD,
    lodgingRD,
    totalViaticosRD: fuelRD + tollsRD + perDiemRD + maintenanceRD + lodgingRD,
    fieldDays,
  };
}

